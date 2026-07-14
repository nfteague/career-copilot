import { useEffect, useRef, useState } from 'react';
import { CareerProfile, JobContext, ResumeSectionKey, Settings } from '../lib/types';
import {
  EMPTY_HIDDEN,
  HiddenResumeParts,
  PendingResume,
  applyHidden,
} from '../lib/tailoredResume';
import { getProvider } from '../lib/providers';
import { friendlyError } from '../lib/errors';

const SECTION_LABELS: Record<ResumeSectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  skills: 'Skills',
  languages: 'Languages',
};

// Side-panel companion to the printable resume tab: structural toggles and
// the AI-revision loop. Every change here is written to the shared session
// handoff; the tab listens and rebuilds (replacing in-page text edits).
export default function ResumePanel({
  profile,
  settings,
}: {
  profile: CareerProfile;
  settings: Settings;
}) {
  const [pending, setPending] = useState<PendingResume | null>(null);
  const [reviseText, setReviseText] = useState('');
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState('');
  const reviseRef = useRef<HTMLTextAreaElement>(null);

  // Adding content the AI didn't select needs a model call — so the "+"
  // affordances seed the revise box (cost stays visible and deliberate)
  // instead of pretending a checkbox can conjure bullets instantly.
  function seedRevision(text: string) {
    setReviseText(text);
    reviseRef.current?.focus();
  }

  useEffect(() => {
    chrome.storage.session
      .get('pendingResume')
      .then((r) => setPending((r.pendingResume as PendingResume | undefined) ?? null));
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'session' && changes.pendingResume) {
        setPending((changes.pendingResume.newValue as PendingResume | undefined) ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (!pending) {
    return (
      <p className="text-sm text-slate-600">
        No resume yet — generate one from the Generate tab, then fine-tune it here.
      </p>
    );
  }

  const { resume } = pending;
  const hidden = pending.hidden ?? EMPTY_HIDDEN;
  // Profile entries the AI didn't put on this resume — addable via a seeded
  // revision (matched loosely; the model may rephrase names). Roles should
  // always be present per the prompt rules, so addableRoles is defensive.
  const usedProjectNames = new Set(resume.projects.map((p) => p.name.trim().toLowerCase()));
  const addableProjects = profile.projects.filter(
    (p) => p.name.trim() && !usedProjectNames.has(p.name.trim().toLowerCase()),
  );
  const roleKey = (title: string, company: string) =>
    `${title} — ${company}`.trim().toLowerCase();
  const usedRoles = new Set(resume.experience.map((e) => roleKey(e.title, e.company)));
  const addableRoles = profile.experience.filter(
    (e) => (e.title.trim() || e.company.trim()) && !usedRoles.has(roleKey(e.title, e.company)),
  );

  async function write(next: PendingResume) {
    setPending(next);
    await chrome.storage.session.set({ pendingResume: next });
  }

  function withHidden(patch: Partial<HiddenResumeParts>) {
    return write({ ...pending!, hidden: { ...hidden, ...patch } });
  }

  const toggle = (list: number[], i: number) =>
    list.includes(i) ? list.filter((x) => x !== i) : [...list, i];

  function tailoredPresent(key: ResumeSectionKey): boolean {
    if (key === 'summary') return resume.summary.trim().length > 0;
    return (resume[key] ?? []).length > 0;
  }

  // A section row also shows when it has addable profile entries, so the
  // "＋ add" affordances live under their related section.
  function sectionPresent(key: ResumeSectionKey): boolean {
    if (key === 'experience' && addableRoles.length > 0) return true;
    if (key === 'projects' && addableProjects.length > 0) return true;
    return tailoredPresent(key);
  }

  async function openTab() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/resume/index.html') });
  }

  async function revise() {
    const instruction = reviseText.trim();
    if (!instruction || revising) return;
    setRevising(true);
    setError('');
    try {
      const provider = await getProvider(settings);
      const job: JobContext = {
        url: '',
        source: '',
        company: pending!.company,
        role: pending!.role,
        jobDescription: pending!.jobDescription,
        questions: [],
      };
      // Iterate on what the user actually sees — hidden parts stay out, and
      // the revision becomes the new baseline (hidden resets).
      const next = await provider.tailorResume(profile, job, {
        revision: { previous: applyHidden(resume, hidden), instruction },
      });
      await write({ ...pending!, resume: next, hidden: EMPTY_HIDDEN });
      setReviseText('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRevising(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Tailored resume
          {(pending.company || pending.role) && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {[pending.role, pending.company].filter(Boolean).join(' · ')}
            </span>
          )}
        </h2>
        <button
          onClick={openTab}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
        >
          Open resume
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Changes here rebuild the resume page — text you edited directly on the page is replaced.
      </p>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</h3>
        {(Object.keys(SECTION_LABELS) as ResumeSectionKey[])
          .filter(sectionPresent)
          .map((key) => {
            const sectionOn = !hidden.sections.includes(key);
            return (
              <div key={key} className="space-y-1">
                {tailoredPresent(key) ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={sectionOn}
                      onChange={() =>
                        withHidden({
                          sections: sectionOn
                            ? [...hidden.sections, key]
                            : hidden.sections.filter((s) => s !== key),
                        })
                      }
                    />
                    {SECTION_LABELS[key]}
                  </label>
                ) : (
                  // Nothing from this section made the resume — no checkbox
                  // to toggle, just a home for the "＋ add" rows below.
                  <span className="flex items-center gap-2 text-sm text-slate-400">
                    {SECTION_LABELS[key]}
                  </span>
                )}
                {key === 'experience' && sectionOn && (
                  <div className="ml-6 space-y-1">
                    {resume.experience.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!hidden.experience.includes(i)}
                            onChange={() =>
                              withHidden({ experience: toggle(hidden.experience, i) })
                            }
                          />
                          <span className="min-w-0 truncate">
                            {e.title} — {e.company}
                          </span>
                        </label>
                        {e.bullets.length === 0 && (
                          <button
                            onClick={() =>
                              seedRevision(
                                `Give the "${e.title} — ${e.company}" role 1-2 bullets tailored to this job.`,
                              )
                            }
                            title="This role has no bullets — ask the AI to write some (fills the revision box below)"
                            className="shrink-0 text-xs font-medium text-slate-400 underline hover:text-slate-700"
                          >
                            + bullets
                          </button>
                        )}
                      </div>
                    ))}
                    {addableRoles.map((e) => (
                      <button
                        key={e.id}
                        onClick={() =>
                          seedRevision(
                            `Add the "${e.title} — ${e.company}" role from my profile with dates and 1-2 tailored bullets.`,
                          )
                        }
                        title="Not on this resume — ask the AI to add it (fills the revision box below)"
                        className="flex w-full items-center gap-2 text-left text-sm text-slate-400 hover:text-slate-700"
                      >
                        <span aria-hidden="true">＋</span>
                        <span className="min-w-0 truncate">
                          {e.title} — {e.company}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {key === 'projects' && sectionOn && (
                  <div className="ml-6 space-y-1">
                    {resume.projects.map((p, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={!hidden.projects.includes(i)}
                          onChange={() => withHidden({ projects: toggle(hidden.projects, i) })}
                        />
                        <span className="min-w-0 truncate">{p.name}</span>
                      </label>
                    ))}
                    {addableProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() =>
                          seedRevision(
                            `Add the project "${p.name}" with 1-2 bullets tailored to this job.`,
                          )
                        }
                        title="Not on this resume — ask the AI to add it (fills the revision box below)"
                        className="flex w-full items-center gap-2 text-left text-sm text-slate-400 hover:text-slate-700"
                      >
                        <span aria-hidden="true">＋</span>
                        <span className="min-w-0 truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Revise with AI
        </h3>
        <textarea
          ref={reviseRef}
          value={reviseText}
          onChange={(e) => setReviseText(e.target.value)}
          disabled={revising}
          rows={3}
          aria-label="Revision request"
          placeholder='e.g. "More technical", "lead with the data work", "tighten to fewer bullets"'
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={revise}
          disabled={revising || !reviseText.trim()}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {revising ? 'Revising…' : 'Revise resume'}
        </button>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
