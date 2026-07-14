import { useEffect, useRef, useState } from 'react';
import { CareerProfile, JobContext, Settings, GenerationKind, Preferences } from '../lib/types';
import { getProvider } from '../lib/providers';
import { updateProfile } from '../lib/storage';
import { NEEDS_INFO_MARKER, NeedsInfo, parseNeedsInfo } from '../lib/prompts';
import { friendlyError } from '../lib/errors';
import { getActiveJobContext, hasPageAccess, requestPageAccess } from './tabContext';
import PreferencesEditor from './PreferencesEditor';

const EMPTY_JOB: JobContext = { url: '', source: '', questions: [] };

export default function Generator({
  profile,
  settings,
}: {
  profile: CareerProfile;
  settings: Settings;
}) {
  // 'setup' = pick role + what to generate; 'result' = loading then the draft.
  const [step, setStep] = useState<'setup' | 'result'>('setup');

  const [job, setJob] = useState<JobContext>(EMPTY_JOB);
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState('');
  const [kind, setKind] = useState<GenerationKind>('cover_letter');
  const [question, setQuestion] = useState('');
  const [instruction, setInstruction] = useState('');

  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [needsInfo, setNeedsInfo] = useState<NeedsInfo | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Result-step reprompt / added-context box.
  const [refine, setRefine] = useState('');
  const [saveRefine, setSaveRefine] = useState(false);
  // Tailored-resume action (setup step; opens the print page in a new tab).
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState('');
  // Voice settings live here, persisted back to the profile as the default.
  const [prefs, setPrefs] = useState<Preferences>(profile.preferences);
  const abortRef = useRef<AbortController | null>(null);

  // Generator only owns tone/length — always merge over the latest stored
  // preferences so a snapshot can't wipe customInstructions set in Settings.
  const ownedPrefs = (base: Preferences): Preferences => ({
    ...base,
    tone: prefs.tone,
    length: prefs.length,
  });
  const withPrefs = (p: CareerProfile): CareerProfile => ({
    ...p,
    preferences: ownedPrefs(p.preferences),
  });

  async function updatePrefs(next: Preferences) {
    setPrefs(next);
    await updateProfile((p) => ({
      ...p,
      preferences: { ...p.preferences, tone: next.tone, length: next.length },
    }));
  }

  async function refreshJob() {
    setDetecting(true);
    setDetectNote('');
    const detected = await getActiveJobContext();
    setDetecting(false);
    if (!detected) {
      setDetectNote(
        "Can't read this tab. Open the panel from the job posting's tab (click the toolbar icon there), then re-detect.",
      );
      return;
    }
    setJob(detected);
    const found = [detected.company, detected.role, detected.jobDescription].filter(Boolean).length;
    setDetectNote(found ? '' : 'No job details found on this page — fill them in below.');
  }

  // "Get Job" — the user gesture that requests page access the first time,
  // then reads the current tab. Once granted, detection runs automatically.
  async function getJob() {
    if (!(await hasPageAccess()) && !(await requestPageAccess())) {
      setDetectNote(
        'Career Copilot needs permission to read the page to pull the job in automatically. You can also fill the details in manually.',
      );
      return;
    }
    await refreshJob();
  }

  // Auto-detect on open only when the user has already granted page access.
  useEffect(() => {
    hasPageAccess().then((granted) => {
      if (granted) refreshJob();
    });
  }, []);

  // Generate against a profile snapshot. `force` skips the sufficiency gate.
  async function runWith(p: CareerProfile, force = false) {
    abortRef.current?.abort(); // never let two runs stream into the same output
    setBusy(true);
    setError('');
    setOutput('');
    setNeedsInfo(null);
    const controller = new AbortController();
    abortRef.current = controller;

    const baseInstruction = kind === 'question_answer' ? question : instruction;
    const parts = [baseInstruction.trim()];
    if (refine.trim()) {
      parts.push(`Additional context / refinement from the candidate: ${refine.trim()}`);
    }
    if (force) {
      parts.push(
        '(Do not ask for more information — write the strongest possible draft strictly from the material provided, without inventing specifics.)',
      );
    }
    const instr = parts.filter(Boolean).join('\n\n');

    let buffer = '';
    let mode: 'unknown' | 'draft' | 'needs' = 'unknown';
    try {
      const provider = await getProvider(settings);
      await provider.generate({
        kind,
        profile: p,
        job,
        instruction: instr,
        onText: (delta) => {
          buffer += delta;
          if (mode === 'unknown') {
            const lead = buffer.trimStart();
            if (lead.length >= NEEDS_INFO_MARKER.length || lead.includes('\n')) {
              mode = lead.startsWith(NEEDS_INFO_MARKER) ? 'needs' : 'draft';
            }
          }
          if (mode === 'draft') setOutput(buffer);
        },
        signal: controller.signal,
      });
      const ni = force ? null : parseNeedsInfo(buffer);
      if (ni) {
        setNeedsInfo(ni);
        setAnswers({});
        setOutput('');
      } else if (!force && buffer.trimStart().startsWith(NEEDS_INFO_MARKER)) {
        // The model asked for more info but the body was unparseable — never
        // show the raw marker as if it were the draft.
        setOutput('');
        setError('The model wanted more context but the response couldn’t be read. Try generating again.');
      } else {
        setOutput(buffer);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(friendlyError(e));
      }
    } finally {
      if (abortRef.current === controller) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  function startGenerate() {
    setRefine('');
    setSaveRefine(false);
    setStep('result');
    runWith(withPrefs(profile));
  }

  // Tailor a resume to this job and open it in the print page. Non-streaming
  // structured call; the artifact itself isn't stored (regenerating is cheap).
  async function makeResume() {
    setResumeBusy(true);
    setResumeError('');
    try {
      const provider = await getProvider(settings);
      const tailored = await provider.tailorResume(withPrefs(profile), job);
      await chrome.storage.session.set({
        // matchStyle carries the design tokens extracted from the user's own
        // uploaded resume, when they exist — the page offers them as a template.
        pendingResume: { resume: tailored, matchStyle: profile.resumeStyle ?? null },
      });
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/resume/index.html') });
    } catch (e) {
      setResumeError(friendlyError(e));
    } finally {
      setResumeBusy(false);
    }
  }

  // Save the candidate's answers to the assistant's questions as reusable Q&A
  // pairs (visible under Profile → Questions), then regenerate.
  async function addAnswersAndRegenerate(pairs: { question: string; answer: string }[]) {
    const next = await updateProfile((p) => ({
      ...p,
      preferences: ownedPrefs(p.preferences),
      qa: [
        ...p.qa,
        ...pairs.map((x) => ({
          id: crypto.randomUUID(),
          question: x.question,
          answer: x.answer,
          addedAt: new Date().toISOString(),
        })),
      ],
    }));
    runWith(next);
  }

  function submitAnswers() {
    if (!needsInfo) return;
    const pairs = needsInfo.questions
      .map((q, i) => (answers[i]?.trim() ? { question: q, answer: answers[i].trim() } : null))
      .filter((x): x is { question: string; answer: string } => x !== null);
    if (!pairs.length) return;
    setNeedsInfo(null);
    setAnswers({});
    addAnswersAndRegenerate(pairs);
  }

  async function regenerate() {
    const text = refine.trim();
    let p: CareerProfile = withPrefs(profile);
    if (text && saveRefine) {
      // Saved context lives in the brain-dump narrative (Profile → Brain-dump).
      p = await updateProfile((latest) => ({
        ...latest,
        preferences: ownedPrefs(latest.preferences),
        narrative: latest.narrative.trim() ? `${latest.narrative.trimEnd()}\n\n${text}` : text,
      }));
      setRefine('');
      setSaveRefine(false);
    }
    runWith(p);
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function back() {
    abortRef.current?.abort();
    setBusy(false);
    setNeedsInfo(null);
    setResumeError('');
    setStep('setup');
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const canGenerate =
    (!!job.company || !!job.role || !!job.jobDescription) &&
    (kind === 'cover_letter' || question.trim().length > 0);

  if (step === 'setup') {
    return (
      <div className="space-y-4">
        <JobEditor
          job={job}
          detecting={detecting}
          note={detectNote}
          onChange={setJob}
          onGetJob={getJob}
        />

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
          <button
            onClick={() => setKind('cover_letter')}
            aria-pressed={kind === 'cover_letter'}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              kind === 'cover_letter' ? 'bg-white shadow-sm' : 'text-slate-500'
            }`}
          >
            Cover letter
          </button>
          <button
            onClick={() => setKind('question_answer')}
            aria-pressed={kind === 'question_answer'}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              kind === 'question_answer' ? 'bg-white shadow-sm' : 'text-slate-500'
            }`}
          >
            Answer a question
          </button>
        </div>

        {kind === 'cover_letter' ? (
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            aria-label="Optional steering for the cover letter"
            placeholder="Optional: emphasize my startup experience…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        ) : (
          <div className="space-y-2">
            {job.questions.length > 0 && (
              <select
                value=""
                aria-label="Questions detected on this page"
                onChange={(e) => e.target.value && setQuestion(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">
                  {job.questions.length} question(s) detected on this page — pick one…
                </option>
                {job.questions.map((q, i) => (
                  <option key={i} value={q}>
                    {q.slice(0, 80)}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              aria-label="Application question"
              placeholder="Paste or type the application question…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Voice — applies to every draft
          </span>
          <PreferencesEditor prefs={prefs} onChange={updatePrefs} />
        </div>

        <button
          onClick={startGenerate}
          disabled={!canGenerate}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {kind === 'cover_letter' ? 'Generate cover letter' : 'Generate answer'}
        </button>

        <button
          onClick={makeResume}
          disabled={resumeBusy || !job.jobDescription?.trim()}
          title={
            job.jobDescription?.trim()
              ? 'Select and rephrase your profile into a one-page resume for this job, opened as a printable page'
              : 'Needs a job description — use “Get Job” or paste one above'
          }
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
        >
          {resumeBusy && <Spinner />}
          {resumeBusy ? 'Tailoring resume…' : 'Tailored resume'}
        </button>
        {!job.jobDescription?.trim() && (
          <p className="text-xs text-slate-400">
            Tailored resume needs a job description — use “Get Job” or paste one.
          </p>
        )}
        {resumeError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {resumeError}
          </p>
        )}
      </div>
    );
  }

  // step === 'result'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={back} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← New
        </button>
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Spinner />
            Generating…
            <button
              onClick={stop}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium hover:bg-slate-100"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {busy && !output && !needsInfo && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white py-12 text-sm text-slate-500">
          <Spinner />
          Working…
        </div>
      )}

      {needsInfo && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              A few details would make this much stronger
            </p>
            {needsInfo.reason && <p className="mt-0.5 text-xs text-amber-800">{needsInfo.reason}</p>}
            <p className="mt-0.5 text-xs text-amber-800">
              Your answers are saved under Profile → Questions and reused on future drafts.
            </p>
          </div>
          {needsInfo.questions.map((q, i) => (
            <label key={i} className="block">
              <span className="text-sm text-slate-800">{q}</span>
              <textarea
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              onClick={submitAnswers}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              Answer &amp; generate
            </button>
            <button
              onClick={() => runWith(withPrefs(profile), true)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
            >
              Draft anyway
            </button>
          </div>
        </div>
      )}

      {output && (
        <div className="space-y-2">
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={16}
            aria-label="Generated draft"
            className="w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed"
          />
          <button
            onClick={copy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      )}

      {output && !busy && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <span className="text-xs font-medium text-slate-600">
            Reprompt or add context, then regenerate
          </span>
          <textarea
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            rows={3}
            aria-label="Reprompt or additional context"
            placeholder="e.g. “Make it more concise,” or “I also led the payments migration that cut failures 30%.”"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={saveRefine}
              onChange={(e) => setSaveRefine(e.target.checked)}
            />
            Also save this context to my brain-dump for future drafts
          </label>
          <button
            onClick={regenerate}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

function JobEditor({
  job,
  detecting,
  note,
  onChange,
  onGetJob,
}: {
  job: JobContext;
  detecting: boolean;
  note: string;
  onChange: (j: JobContext) => void;
  onGetJob: () => void;
}) {
  // When nothing is detected yet, a wall of blank inputs is confusing — show a
  // single "Get Job" action (which also requests page access on first use)
  // with a manual-entry escape hatch instead.
  const [manual, setManual] = useState(false);
  const hasDetails = !!job.company || !!job.role || !!job.jobDescription;

  if (!hasDetails && !manual) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Target role
        </span>
        <p className="mt-2 text-sm text-slate-600">
          On the job posting's tab? Pull the company, role, and description straight from the page.
        </p>
        <button
          onClick={onGetJob}
          disabled={detecting}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {detecting && <Spinner />}
          {detecting ? 'Reading the page…' : 'Get Job'}
        </button>
        {note && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {note}
        </p>
      )}
        <button
          onClick={() => setManual(true)}
          className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-800"
        >
          or enter the details manually
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Target role
        </span>
        <button
          onClick={onGetJob}
          disabled={detecting}
          title="Re-detect from the current page"
          aria-label="Re-detect job details from the current page"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 ${detecting ? 'animate-spin' : ''}`}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={job.company ?? ''}
          onChange={(e) => onChange({ ...job, company: e.target.value })}
          aria-label="Company"
          placeholder="Company"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          value={job.role ?? ''}
          onChange={(e) => onChange({ ...job, role: e.target.value })}
          aria-label="Role"
          placeholder="Role"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <textarea
        value={job.jobDescription ?? ''}
        onChange={(e) => onChange({ ...job, jobDescription: e.target.value })}
        rows={3}
        aria-label="Job description"
        placeholder="Job description (auto-detected, or paste it)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {note && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {note}
        </p>
      )}
    </div>
  );
}
