import { CareerProfile, JobContext, GenerationKind, emptyProfile } from '../types';

export const MAX_OUTPUT_TOKENS = 8000;
// Transcribing a long PDF (e.g. an interview transcript) needs far more output
// room than a draft does.
export const PDF_TEXT_MAX_TOKENS = 16000;

export interface GenerateArgs {
  kind: GenerationKind;
  profile: CareerProfile;
  job: JobContext;
  // For question_answer: the question. For cover_letter: optional steering.
  instruction?: string;
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

// A provider knows how to turn raw career input into a structured profile and
// how to stream a tailored draft. Both Anthropic and OpenAI implement this; the
// rest of the app is provider-agnostic.
export interface LLMProvider {
  ingestText(text: string, base?: CareerProfile): Promise<CareerProfile>;
  ingestPdf(base64: string, base?: CareerProfile): Promise<CareerProfile>;
  // Extract the plain text of a supporting document so it can be stored and fed
  // into generation context (without parsing it into the structured profile).
  // `truncated` is true when the model ran out of output room mid-document.
  pdfToText(base64: string): Promise<{ text: string; truncated: boolean }>;
  generate(args: GenerateArgs): Promise<string>;
}

export const PDF_TO_TEXT_PROMPT =
  'Output the full text content of this document verbatim. No commentary, no summary, no markdown fences.';

export type ExtractedProfile = Record<string, unknown>;

// Turn a model's schema-validated extraction into a full CareerProfile, minting
// stable ids and preserving anything we want to keep from a prior profile
// (narrative, preferences). Shared across providers.
export function toProfile(extracted: ExtractedProfile, base?: CareerProfile): CareerProfile {
  const profile = base ?? emptyProfile();
  const id = () => crypto.randomUUID();
  const e = extracted as any;
  return {
    ...profile,
    basics: { links: [], ...e.basics, name: e.basics?.name ?? profile.basics.name },
    experience: (e.experience ?? []).map((x: any) => ({ id: id(), ...x })),
    education: (e.education ?? []).map((x: any) => ({ id: id(), ...x })),
    projects: (e.projects ?? []).map((x: any) => ({ id: id(), ...x })),
    skills: e.skills ?? [],
    certifications: (e.certifications ?? []).map((x: any) => ({ id: id(), ...x })),
    updatedAt: new Date().toISOString(),
  };
}
