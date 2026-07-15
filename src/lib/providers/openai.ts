import OpenAI from 'openai';
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

// As with Anthropic, this is the user's own key, stored locally, calling OpenAI
// directly — dangerouslyAllowBrowser is the intended configuration here.
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  // OpenAI's structured-output mode: response_format json_schema with strict
  // validation. The schema is the same one Anthropic uses.
  private async extract(userContent: unknown): Promise<ExtractedProfile> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'career_profile', strict: true, schema: PROFILE_EXTRACTION_SCHEMA },
      },
      messages: [
        { role: 'system', content: PROFILE_EXTRACTION_SYSTEM },
        { role: 'user', content: userContent as any },
      ],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('No structured output returned.');
    return JSON.parse(text) as ExtractedProfile;
  }

  async ingestText(text: string, base?: CareerProfile): Promise<CareerProfile> {
    const extracted = await this.extract(
      `${buildMergePreamble(base)}Extract a structured career profile from the following:\n\n${text}`,
    );
    return toProfile(extracted, base);
  }

  async ingestPdf(base64: string, base?: CareerProfile): Promise<CareerProfile> {
    // Chat Completions accepts inline PDFs as a "file" content part on
    // multimodal models (the GPT-5 family).
    const extracted = await this.extract([
      {
        type: 'text',
        text: `${buildMergePreamble(base)}Extract a structured career profile from this resume.`,
      },
      {
        type: 'file',
        file: { filename: 'resume.pdf', file_data: `data:application/pdf;base64,${base64}` },
      },
    ]);
    return toProfile(extracted, base);
  }

  async pdfToText(base64: string): Promise<{ text: string; truncated: boolean }> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: PDF_TEXT_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PDF_TO_TEXT_PROMPT },
            {
              type: 'file',
              file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` },
            },
          ] as any,
        },
      ],
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      truncated: res.choices[0]?.finish_reason === 'length',
    };
  }

  async tailorResume(
    profile: CareerProfile,
    job: JobContext,
    opts: { signal?: AbortSignal; revision?: ResumeRevision } = {},
  ): Promise<TailoredResumeResult> {
    const { system, user } = buildResumeTailoringPrompts(profile, job, opts.revision);
    const res = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: TAILOR_MAX_OUTPUT_TOKENS,
        // Selection strategy (company read, differentiator, JD coverage)
        // needs deliberation before the constrained JSON. reasoning_effort
        // only exists on the reasoning (GPT-5.x) models — the legacy GPT-4.x
        // option rejects it.
        ...(this.model.startsWith('gpt-5') ? { reasoning_effort: 'high' as const } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'tailored_resume', strict: true, schema: TAILORED_RESUME_SCHEMA },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { signal: opts.signal },
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('No structured output returned.');
    return toTailoredResult(text);
  }

  async extractResumeStyle(base64: string, signal?: AbortSignal): Promise<ResumeStyle> {
    const res = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: 1000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'resume_style', strict: true, schema: RESUME_STYLE_SCHEMA },
        },
        messages: [
          { role: 'system', content: RESUME_STYLE_EXTRACTION_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the visual design of this resume.' },
              {
                type: 'file',
                file: { filename: 'resume.pdf', file_data: `data:application/pdf;base64,${base64}` },
              },
            ] as any,
          },
        ],
      },
      { signal },
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('No structured output returned.');
    return JSON.parse(text) as ResumeStyle;
  }

  async generate(args: GenerateArgs): Promise<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        messages: [
          { role: 'system', content: buildGenerationSystem(args.kind, args.profile) },
          {
            role: 'user',
            content: buildGenerationUserPrompt(args.kind, args.profile, args.job, args.instruction),
          },
        ],
      },
      { signal: args.signal },
    );

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        full += delta;
        args.onText(delta);
      }
    }
    return full;
  }
}
