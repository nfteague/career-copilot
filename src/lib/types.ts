// The single normalized representation of a user's career history. All three
// intake paths (resume upload, manual form, freeform brain-dump) produce this
// shape, and generation reads from it. Keep it small enough to fit comfortably
// in a single model context — a whole career is tens of thousands of tokens.

export interface Link {
  label: string;
  url: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate?: string; // free text, e.g. "2021-03" or "Mar 2021"
  endDate?: string; // free text, or empty when current
  current?: boolean;
  summary?: string;
  highlights: string[]; // accomplishments, ideally quantified
  skills: string[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  details?: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  role?: string;
  description?: string;
  highlights: string[];
  technologies: string[];
  link?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
}

// Extra material the candidate attaches with their own label — writing samples,
// case studies, past cover letters, performance reviews. Stored as text and
// fed into the generation context, but not parsed into the structured fields.
export type DocCategory = 'cover_letter' | 'writing_sample' | 'other';

export interface SupportingDoc {
  id: string;
  label: string;
  content: string;
  addedAt: string;
  // Groups the doc in the Documents tab. Cover letters and writing samples are
  // also voice samples whose style generation mirrors. undefined === 'other'
  // (docs stored before this field existed).
  category?: DocCategory;
  // Deprecated pre-0.2.0 voice flag, superseded by category — read only via
  // docCategory().
  kind?: 'context' | 'voice';
}

// Effective category, mapping docs stored before `category` existed.
export function docCategory(d: SupportingDoc): DocCategory {
  return d.category ?? (d.kind === 'voice' ? 'writing_sample' : 'other');
}

// An application question the candidate has answered before, in their own
// words — reusable grounded material for future drafts.
export interface QAPair {
  id: string;
  question: string;
  answer: string;
  addedAt: string;
}

// Record of the resume last read into the structured profile. The file itself
// isn't kept — extraction is one-way into the structured fields.
export interface ResumeMeta {
  filename: string;
  uploadedAt: string;
}

// Deprecated (0.2.0): the standalone notes list was retired. Answers to the
// assistant's questions are QAPairs now; volunteered context goes to the
// narrative. Stored notes are folded into the narrative on load (App.tsx);
// the field remains for stored-data compatibility.
export interface Note {
  id: string;
  content: string;
  addedAt: string;
}

export interface Basics {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string; // e.g. "Senior Product Designer"
  summary?: string;
  links: Link[];
}

export interface Preferences {
  tone: 'professional' | 'warm' | 'direct' | 'enthusiastic';
  length: 'concise' | 'standard' | 'detailed';
  // Standing output requirements the user sets in Settings ("Always …",
  // "Never …"), applied to every draft on top of tone and length.
  customInstructions?: string;
}

export interface CareerProfile {
  basics: Basics;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  skills: string[];
  certifications: Certification[];
  supportingDocs: SupportingDoc[];
  notes: Note[];
  qa: QAPair[];
  resume?: ResumeMeta;
  // Freeform brain-dump: things resumes omit (motivations, context behind
  // moves, soft wins, what the person actually cares about). Fed to the model
  // verbatim alongside the structured data.
  narrative: string;
  preferences: Preferences;
  updatedAt: string; // ISO timestamp
}

// What the content script extracts from the page the user is on.
export interface JobContext {
  url: string;
  source: string; // hostname or detected ATS, e.g. "greenhouse", "linkedin"
  company?: string;
  role?: string;
  jobDescription?: string;
  // Free-text application questions detected on the page.
  questions: string[];
}

export type GenerationKind = 'cover_letter' | 'question_answer';

// A saved snippet the user can one-click copy while filling out applications.
export interface QuickCopy {
  id: string;
  label: string;
  value: string;
}

export type Provider = 'anthropic' | 'openai';

export interface ProviderCreds {
  apiKey: string;
  model: string;
}

export interface Settings {
  provider: Provider;
  anthropic: ProviderCreds;
  openai: ProviderCreds;
}

// Credentials for the currently selected provider.
export function activeCreds(s: Settings): ProviderCreds {
  return s[s.provider];
}

export const DEFAULT_PREFERENCES: Preferences = {
  tone: 'professional',
  length: 'standard',
};

// True when the profile holds nothing a user would miss — used to skip
// pointless backups of a blank profile.
export function isProfileEmpty(p: CareerProfile): boolean {
  const b = p.basics;
  return (
    p.experience.length === 0 &&
    p.education.length === 0 &&
    p.projects.length === 0 &&
    p.skills.length === 0 &&
    p.certifications.length === 0 &&
    p.supportingDocs.length === 0 &&
    p.notes.length === 0 &&
    p.qa.length === 0 &&
    !p.narrative.trim() &&
    !p.resume &&
    !b.name.trim() &&
    !(b.headline ?? '').trim() &&
    !(b.summary ?? '').trim() &&
    !(b.email ?? '').trim() &&
    !(b.phone ?? '').trim() &&
    !(b.location ?? '').trim() &&
    b.links.length === 0
  );
}

export function emptyProfile(): CareerProfile {
  return {
    basics: { name: '', links: [] },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
    supportingDocs: [],
    notes: [],
    qa: [],
    narrative: '',
    preferences: { ...DEFAULT_PREFERENCES },
    updatedAt: new Date().toISOString(),
  };
}
