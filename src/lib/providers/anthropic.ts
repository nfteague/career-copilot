import Anthropic from '@anthropic-ai/sdk';
import {
  CareerProfile,
  JobContext,
  ResumeStyle,
  TailoredResumeResult,
} from '../types';
import {
  PROFILE_EXTRACTION_SCHEMA,
  RESUME_STYLE_SCHEMA,
  TAILORED_RESUME_SCHEMA,
} from '../profileSchema';
import {
  PROFILE_EXTRACTION_SYSTEM,
  RESUME_STYLE_EXTRACTION_SYSTEM,
  ResumeRevision,
  buildMergePreamble,
  buildGenerationSystem,
  buildGenerationUserPrompt,
  buildResumeTailoringPrompts,
} from '../prompts';
import {
  GenerateArgs,
  LLMProvider,
  MAX_OUTPUT_TOKENS,
  PDF_TEXT_MAX_TOKENS,
  PDF_TO_TEXT_PROMPT,
  TAILOR_MAX_OUTPUT_TOKENS,
  ExtractedProfile,
  toProfile,
  toTailoredResult,
} from './shared';

// dangerouslyAllowBrowser is intentional: the user's OWN key, stored locally,
// calling Anthropic directly. The SDK adds the browser-access header so the
// extension-origin request is accepted.
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  private async extract(content: Anthropic.MessageParam['content']): Promise<ExtractedProfile> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: PROFILE_EXTRACTION_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: PROFILE_EXTRACTION_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('No structured output returned.');
    return JSON.parse(block.text) as ExtractedProfile;
  }

  async ingestText(text: string, base?: CareerProfile): Promise<CareerProfile> {
    const extracted = await this.extract([
      {
        type: 'text',
        text: `${buildMergePreamble(base)}Extract a structured career profile from the following:\n\n${text}`,
      },
    ]);
    return toProfile(extracted, base);
  }

  async ingestPdf(base64: string, base?: CareerProfile): Promise<CareerProfile> {
    const extracted = await this.extract([
      {
        type: 'text',
        text: `${buildMergePreamble(base)}Extract a structured career profile from this resume.`,
      },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    ]);
    return toProfile(extracted, base);
  }

  async pdfToText(base64: string): Promise<{ text: string; truncated: boolean }> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: PDF_TEXT_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PDF_TO_TEXT_PROMPT },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          ],
        },
      ],
    });
    const block = res.content.find((b) => b.type === 'text');
    return {
      text: block && block.type === 'text' ? block.text : '',
      truncated: res.stop_reason === 'max_tokens',
    };
  }

  async tailorResume(
    profile: CareerProfile,
    job: JobContext,
    opts: { signal?: AbortSignal; revision?: ResumeRevision } = {},
  ): Promise<TailoredResumeResult> {
    const { system, user } = buildResumeTailoringPrompts(profile, job, opts.revision);
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: TAILOR_MAX_OUTPUT_TOKENS,
        // Selection strategy (company read, differentiator, JD coverage) needs
        // deliberation before the constrained JSON — without thinking the
        // model pattern-matches on the role title.
        thinking: { type: 'adaptive' },
        system,
        output_config: { format: { type: 'json_schema', schema: TAILORED_RESUME_SCHEMA } },
        messages: [{ role: 'user', content: user }],
      },
      { signal: opts.signal },
    );
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('No structured output returned.');
    return toTailoredResult(block.text);
  }

  async extractResumeStyle(base64: string, signal?: AbortSignal): Promise<ResumeStyle> {
    const res = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 1000,
        system: RESUME_STYLE_EXTRACTION_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: RESUME_STYLE_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the visual design of this resume.' },
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
            ],
          },
        ],
      },
      { signal },
    );
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('No structured output returned.');
    return JSON.parse(block.text) as ResumeStyle;
  }

  async generate(args: GenerateArgs): Promise<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: 'adaptive' },
        system: buildGenerationSystem(args.kind, args.profile),
        messages: [
          {
            role: 'user',
            content: buildGenerationUserPrompt(args.kind, args.profile, args.job, args.instruction),
          },
        ],
      },
      { signal: args.signal },
    );
    stream.on('text', args.onText);
    const final = await stream.finalMessage();
    const block = final.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }
}
