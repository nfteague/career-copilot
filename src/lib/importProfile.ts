import {
  CareerProfile,
  DEFAULT_PREFERENCES,
  DocCategory,
  Preferences,
  ResumeSectionKey,
  ResumeStyle,
  emptyProfile,
} from './types';

// Parse + normalize a candidate profile JSON string (the Review tab's export
// shape). Returns null when the text is not recognizably a Career Copilot
// profile export. Defensive throughout and never throws — this feeds a file
// picker, and users will occasionally hand it the wrong file.

const TONES: Preferences['tone'][] = ['professional', 'warm', 'direct', 'enthusiastic'];
const LENGTHS: Preferences['length'][] = ['concise', 'standard', 'detailed'];
const CATEGORIES: DocCategory[] = ['cover_letter', 'writing_sample', 'other'];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const objArr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
// Keep a valid existing id (so export → import round-trips preserve them),
// mint one otherwise.
const withId = <T extends Obj>(x: T): T & { id: string } => ({
  ...x,
  id: typeof x.id === 'string' && x.id ? x.id : crypto.randomUUID(),
});

const RESUME_SECTIONS: readonly ResumeSectionKey[] = [
  'summary',
  'experience',
  'projects',
  'education',
  'certifications',
  'skills',
];

const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;

// Validate an imported resumeStyle; anything malformed is dropped whole (the
// renderer would rather fall back to a built-in template than half a style).
function parseResumeStyle(v: unknown): ResumeStyle | undefined {
  if (!isObj(v)) return undefined;
  const font = oneOf(v.font, ['sans', 'serif', 'mixed'] as const);
  const headerAlign = oneOf(v.headerAlign, ['left', 'center'] as const);
  const density = oneOf(v.density, ['comfortable', 'compact'] as const);
  const sectionCase = oneOf(v.sectionCase, ['uppercase', 'title'] as const);
  const divider = oneOf(v.divider, ['line', 'none'] as const);
  if (!font || !headerAlign || !density || !sectionCase || !divider) return undefined;
  return {
    font,
    headerAlign,
    density,
    sectionCase,
    divider,
    accent: str(v.accent),
    sectionOrder: strArr(v.sectionOrder).filter((s): s is ResumeSectionKey =>
      (RESUME_SECTIONS as readonly string[]).includes(s),
    ),
  };
}

export function parseProfileJson(text: string): CareerProfile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  // Recognition heuristic — guards against picking an arbitrary JSON file
  // (e.g. an interview transcript meant for the Documents tab).
  if (!['basics', 'experience', 'narrative', 'skills'].some((k) => k in parsed)) return null;

  const empty = emptyProfile();
  const p = parsed as Obj;
  const basicsIn = isObj(p.basics) ? p.basics : {};
  const prefsIn = isObj(p.preferences) ? p.preferences : {};

  const notes = objArr(p.notes).filter((n) => str(n.content).trim());
  // Pre-0.2.0 exports carry standalone notes; fold them into the narrative,
  // matching the one-time migration in App.tsx, so nothing imports invisibly.
  const narrative = [str(p.narrative).trim(), ...notes.map((n) => str(n.content))]
    .filter(Boolean)
    .join('\n\n');

  const resumeIn = isObj(p.resume) ? p.resume : undefined;
  const resume =
    resumeIn && typeof resumeIn.filename === 'string' && typeof resumeIn.uploadedAt === 'string'
      ? { filename: resumeIn.filename, uploadedAt: resumeIn.uploadedAt }
      : undefined;

  return {
    ...empty,
    ...p, // unknown top-level keys from future versions pass through untouched
    basics: {
      ...empty.basics,
      ...basicsIn,
      name: str(basicsIn.name),
      links: objArr(basicsIn.links)
        .filter((l) => typeof l.label === 'string' && typeof l.url === 'string')
        .map((l) => ({ ...l, label: l.label as string, url: l.url as string })),
    },
    experience: objArr(p.experience).map((x) =>
      withId({
        ...x,
        company: str(x.company),
        title: str(x.title),
        highlights: strArr(x.highlights),
        skills: strArr(x.skills),
      }),
    ),
    education: objArr(p.education).map((x) => withId({ ...x, institution: str(x.institution) })),
    projects: objArr(p.projects).map((x) =>
      withId({
        ...x,
        name: str(x.name),
        highlights: strArr(x.highlights),
        technologies: strArr(x.technologies),
      }),
    ),
    skills: strArr(p.skills),
    certifications: objArr(p.certifications).map((x) => withId({ ...x, name: str(x.name) })),
    supportingDocs: objArr(p.supportingDocs)
      .filter((d) => typeof d.content === 'string')
      .map((d) =>
        withId({
          ...d,
          label: str(d.label),
          content: d.content as string,
          addedAt: str(d.addedAt),
          category: CATEGORIES.includes(d.category as DocCategory)
            ? (d.category as DocCategory)
            : undefined,
          kind:
            d.kind === 'voice' ? ('voice' as const) : d.kind === 'context' ? ('context' as const) : undefined,
        }),
      ),
    notes: [], // folded into narrative above
    qa: objArr(p.qa)
      .filter((q) => typeof q.question === 'string' && typeof q.answer === 'string')
      .map((q) =>
        withId({ ...q, question: q.question as string, answer: q.answer as string, addedAt: str(q.addedAt) }),
      ),
    narrative,
    preferences: {
      tone: TONES.includes(prefsIn.tone as Preferences['tone'])
        ? (prefsIn.tone as Preferences['tone'])
        : DEFAULT_PREFERENCES.tone,
      length: LENGTHS.includes(prefsIn.length as Preferences['length'])
        ? (prefsIn.length as Preferences['length'])
        : DEFAULT_PREFERENCES.length,
      ...(str(prefsIn.customInstructions).trim()
        ? { customInstructions: prefsIn.customInstructions as string }
        : {}),
    },
    resume,
    resumeStyle: parseResumeStyle(p.resumeStyle),
    updatedAt: new Date().toISOString(),
  };
}
