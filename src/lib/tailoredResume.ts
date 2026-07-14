import { ResumeSectionKey, ResumeStyle, TailoredResume } from './types';

// The tailored-resume handoff shared through chrome.storage.session between
// the Generator (writer), the side panel's Resume view (iteration controls),
// and the printable resume tab (renderer).

export interface HiddenResumeParts {
  sections: ResumeSectionKey[];
  // Indices into the resume's arrays. Stable between revisions because a
  // revision clears `hidden` (the model bakes the visible state in).
  experience: number[];
  projects: number[];
}

export interface PendingResume {
  resume: TailoredResume;
  // Design tokens extracted from the user's own uploaded resume, if any.
  matchStyle: ResumeStyle | null;
  // Feed the tab title → Chrome's default Save-as-PDF filename.
  company?: string;
  role?: string;
  // Lets "Revise with AI" re-tailor against the same job.
  jobDescription?: string;
  // Parts the user toggled off in the side panel.
  hidden?: HiddenResumeParts;
}

export const EMPTY_HIDDEN: HiddenResumeParts = { sections: [], experience: [], projects: [] };

// The resume as the user currently sees it — hidden parts removed. Used by
// the renderer, and as the base draft for AI revisions.
export function applyHidden(resume: TailoredResume, hidden?: HiddenResumeParts): TailoredResume {
  if (!hidden) return resume;
  const sections = new Set(hidden.sections);
  const experience = new Set(hidden.experience);
  const projects = new Set(hidden.projects);
  return {
    ...resume,
    summary: sections.has('summary') ? '' : resume.summary,
    experience: sections.has('experience')
      ? []
      : resume.experience.filter((_, i) => !experience.has(i)),
    projects: sections.has('projects') ? [] : resume.projects.filter((_, i) => !projects.has(i)),
    education: sections.has('education') ? [] : resume.education,
    certifications: sections.has('certifications') ? [] : resume.certifications,
    skills: sections.has('skills') ? [] : resume.skills,
    languages: sections.has('languages') ? [] : (resume.languages ?? []),
  };
}
