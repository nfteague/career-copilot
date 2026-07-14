import { useEffect, useState } from 'react';
import {
  CareerProfile,
  DocCategory,
  QAPair,
  Settings,
  SupportingDoc,
  docCategory,
  emptyProfile,
  isProfileEmpty,
} from '../lib/types';
import {
  BackupHistory,
  BackupReason,
  saveProfile,
  updateProfile,
  getBackupHistory,
  hasProfileBackup,
  recordVersion,
  restoreVersion,
  setCurrentVersionId,
} from '../lib/storage';
import { getProvider } from '../lib/providers';
import { friendlyError } from '../lib/errors';
import { MAX_DOC_CHARS } from '../lib/prompts';
import { DOCX_MIME, docxToText, isDocxFile, isLegacyDocFile } from '../lib/docx';
import { parseProfileJson } from '../lib/importProfile';
import { fileToBase64 } from './tabContext';
import ProfileEditor from './ProfileEditor';

// Reject absurdly large uploads before reading them; a real resume or
// supporting document is a fraction of this.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const RESUME_ACCEPT = `application/pdf,.pdf,.docx,${DOCX_MIME}`;

type Tab = 'docs' | 'braindump' | 'questions' | 'review';

const TAB_LABELS: Record<Tab, string> = {
  docs: 'Documents',
  braindump: 'Brain-dump',
  questions: 'Questions',
  review: 'Review',
};

export default function ProfileSetup({
  profile,
  settings,
  onChange,
  busy,
  onBusyChange,
  docBusy,
  onDocBusyChange,
  dumpDraft,
  onDumpDraftChange,
}: {
  profile: CareerProfile;
  settings: Settings;
  onChange: (p: CareerProfile) => void;
  // The busy flags and the unsaved brain-dump draft live in App so they
  // survive this view unmounting (top-nav switches) while an ingest keeps
  // running in the background.
  busy: boolean;
  onBusyChange: (b: boolean) => void;
  docBusy: boolean;
  onDocBusyChange: (b: boolean) => void;
  dumpDraft: string | null;
  onDumpDraftChange: (d: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>(profile.experience.length ? 'review' : 'docs');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  // Sub-view of Review listing the backup snapshots.
  const [showBackups, setShowBackups] = useState(false);
  // One combined flag so the two provider-calling surfaces (resume ingest,
  // doc transcription) can never run concurrently.
  const anyBusy = busy || docBusy;

  useEffect(() => {
    hasProfileBackup().then(setCanUndo);
  }, []);

  async function ingest(
    fn: () => Promise<CareerProfile>,
    opts: { narrative?: boolean; resume?: boolean; reason: BackupReason },
  ): Promise<boolean> {
    const startTab = tab;
    const owns = opts;
    onBusyChange(true);
    setError('');
    setNotice('');
    try {
      const next = await fn();
      // Checkpoint unsaved edits (manual or mid-flight) as a version first —
      // model-driven merges can drop data, and this keeps them undoable.
      const checkpointed = await recordVersion('edits');
      // The extraction ran against a snapshot of the profile; docs, answers,
      // or narrative context may have been saved elsewhere (Generator, other
      // tabs, another window's panel) while the model call was in flight.
      // Re-read everything user-curated at save time — a call site only
      // writes the fields it explicitly owns.
      const merged = await updateProfile((latest) => ({
        ...next,
        supportingDocs: latest.supportingDocs,
        notes: latest.notes,
        qa: latest.qa,
        preferences: latest.preferences,
        ...(owns.narrative ? {} : { narrative: latest.narrative }),
        ...(owns.resume ? {} : { resume: latest.resume, resumeStyle: latest.resumeStyle }),
      }));
      // Record the merged result as the new Current version.
      const versioned = await recordVersion(opts.reason);
      if (checkpointed || versioned) setCanUndo(true);
      onChange(merged);
      // Only jump to Review if the user is still where they started — don't
      // yank them (and any in-progress form state) off a tab they moved to.
      setTab((current) => (current === startTab ? 'review' : current));
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      onBusyChange(false);
    }
  }

  async function restoreBackup(id: string) {
    const restored = await restoreVersion(id);
    if (restored) {
      // A pending brain-dump draft belongs to the profile being swapped out.
      onDumpDraftChange(null);
      onChange(restored);
      setShowBackups(false);
      setNotice('Profile restored.');
    }
  }

  async function onResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setNotice(''); // a stale success banner shouldn't outlive new validation errors
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is too large.');
      return;
    }
    if (isLegacyDocFile(file)) {
      setError("Legacy .doc files aren't supported — save it as .docx or PDF first.");
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf && !isDocxFile(file)) {
      setError('Please upload a PDF or DOCX file.');
      return;
    }
    const marker = { resume: { filename: file.name, uploadedAt: new Date().toISOString() } };
    // Merge onto the existing profile so narrative/preferences survive
    // re-ingest, and record which resume was read. PDFs go to the model
    // directly; DOCX is extracted to text locally and structured via the
    // same text-ingestion path the brain-dump uses.
    if (isPdf) {
      const base64 = await fileToBase64(file);
      await ingest(
        async () => {
          const provider = await getProvider(settings);
          // Style extraction rides along in parallel — it captures the visual
          // design as renderer tokens for "match my resume" on the tailored
          // resume page. Its failure must never fail the content ingest.
          const [extracted, style] = await Promise.all([
            provider.ingestPdf(base64, profile),
            provider.extractResumeStyle(base64).catch(() => undefined),
          ]);
          return { ...extracted, ...marker, ...(style ? { resumeStyle: style } : {}) };
        },
        { resume: true, reason: 'resume-upload' },
      );
    } else {
      await ingest(async () => {
        const text = await docxToText(file);
        if (!text) throw new Error('That document appears to be empty.');
        return {
          ...(await (await getProvider(settings)).ingestText(text, profile)),
          ...marker,
        };
      }, { resume: true, reason: 'resume-upload' });
    }
  }

  async function updatePartial(patch: Partial<CareerProfile>) {
    onChange(await updateProfile((p) => ({ ...p, ...patch })));
  }

  async function clearAll() {
    // Version the pre-clear state (skipped if blank or already versioned).
    const versioned = await recordVersion('clear');
    const fresh = emptyProfile();
    await saveProfile(fresh);
    // The live profile now matches no version — no Current badge.
    await setCurrentVersionId(null);
    if (versioned) setCanUndo(true);
    onChange(fresh);
    setTab('docs');
  }

  function exportProfile() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'career-copilot-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const IMPORT_REJECT =
    "That file doesn't look like a Career Copilot profile export. If it's a transcript or other document, add it under the Documents tab instead.";

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setNotice('');
    // A legit export is well under 1 MB; a large file is a wrong pick.
    if (file.size > 5 * 1024 * 1024) {
      setError(IMPORT_REJECT);
      return;
    }
    let imported: CareerProfile | null = null;
    try {
      imported = parseProfileJson(await file.text());
    } catch {
      /* unreadable file → same rejection below */
    }
    if (!imported) {
      setError(IMPORT_REJECT);
      return;
    }
    setError('');
    const hadContent = !isProfileEmpty(profile);
    // Import REPLACES the profile wholesale. Checkpoint unsaved edits first
    // (a no-op when the previous state is blank or already versioned), then
    // record the imported profile as the new Current version.
    await recordVersion('edits');
    await saveProfile(imported);
    const versioned = await recordVersion('import');
    if (versioned) setCanUndo(true);
    // A pending brain-dump draft belongs to the replaced profile — drop it so
    // it can't mask (or later overwrite) the imported narrative.
    onDumpDraftChange(null);
    onChange(imported);
    setNotice(
      hadContent
        ? 'Profile imported — the previous profile is under "Version history."'
        : 'Profile imported.',
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
        {(['docs', 'braindump', 'questions', 'review'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setShowBackups(false);
            }}
            aria-pressed={tab === t}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              tab === t ? 'bg-white shadow-sm' : 'text-slate-500'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {notice}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-slate-500">
          Reading and structuring… this takes a few seconds.
        </p>
      )}

      {tab === 'docs' && (
        <div className="space-y-5">
          <ResumeSection profile={profile} busy={anyBusy} onFile={onResumeFile} onChange={onChange} />
          <DocumentsTab
            profile={profile}
            settings={settings}
            onChange={onChange}
            busy={anyBusy}
            onBusyChange={onDocBusyChange}
          />
          {profile.experience.length === 0 && profile.supportingDocs.length === 0 && (
            <p className="text-xs text-slate-500">
              Moving from another machine?{' '}
              <button
                onClick={() => setTab('review')}
                className="underline hover:text-slate-800"
              >
                Import your profile export
              </button>{' '}
              under Review.
            </p>
          )}
        </div>
      )}

      {tab === 'braindump' && (
        <BrainDumpTab
          profile={profile}
          settings={settings}
          busy={anyBusy}
          ingest={ingest}
          onChange={onChange}
          draft={dumpDraft}
          onDraftChange={onDumpDraftChange}
        />
      )}

      {tab === 'questions' && <QuestionsTab profile={profile} onChange={onChange} />}

      {tab === 'review' && showBackups && (
        <BackupsView busy={anyBusy} onRestore={restoreBackup} onBack={() => setShowBackups(false)} />
      )}

      {tab === 'review' && !showBackups && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <button
              onClick={exportProfile}
              className="font-medium text-slate-500 underline hover:text-slate-800"
            >
              Export profile (JSON)
            </button>
            <label
              className={`rounded font-medium underline focus-within:ring-2 focus-within:ring-slate-400 ${
                anyBusy ? 'text-slate-300' : 'cursor-pointer text-slate-500 hover:text-slate-800'
              }`}
            >
              Import profile (JSON)
              <input
                type="file"
                accept=".json,application/json"
                onChange={onImportFile}
                disabled={anyBusy}
                className="sr-only"
              />
            </label>
            {canUndo && (
              <button
                onClick={() => setShowBackups(true)}
                title="Versions saved when you import, upload a resume, or structure a brain-dump"
                className="font-medium text-slate-500 underline hover:text-slate-800"
              >
                Version history
              </button>
            )}
          </div>
          {/* Structured edits can't be merged with an in-flight extraction —
              disable them (natively, via fieldset) while one runs. */}
          <fieldset disabled={anyBusy} className="min-w-0">
            <ProfileEditor profile={profile} onUpdate={updatePartial} onClear={clearAll} />
          </fieldset>
        </div>
      )}
    </div>
  );
}

// ---- Resume ----------------------------------------------------------------

// The resume file isn't stored — it's read once into the structured profile.
// This section shows which resume was last read and offers replace/remove of
// that record (removing never touches the extracted data; Review owns that).
function ResumeSection({
  profile,
  busy,
  onFile,
  onChange,
}: {
  profile: CareerProfile;
  busy: boolean;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChange: (p: CareerProfile) => void;
}) {
  const [notice, setNotice] = useState('');
  const meta = profile.resume;

  async function removeRecord() {
    onChange(await updateProfile((p) => ({ ...p, resume: undefined })));
    setNotice('Removed. The extracted profile data is still in Review — edit or clear it there.');
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Resume</h3>
      {meta ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium" title={meta.filename}>
              {meta.filename}
            </span>
            <span className="text-xs text-slate-400">
              uploaded {new Date(meta.uploadedAt).toLocaleDateString()}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <label
              className={`rounded text-xs font-medium underline focus-within:ring-2 focus-within:ring-slate-400 ${
                busy ? 'text-slate-300' : 'cursor-pointer text-slate-500 hover:text-slate-800'
              }`}
            >
              Replace
              <input
                type="file"
                accept={RESUME_ACCEPT}
                onChange={onFile}
                disabled={busy}
                className="sr-only"
              />
            </label>
            <button
              onClick={removeRecord}
              disabled={busy}
              aria-label="Remove resume record"
              className="text-xs text-slate-400 hover:text-red-600"
            >
              Remove
            </button>
          </span>
        </div>
      ) : (
        <input
          type="file"
          accept={RESUME_ACCEPT}
          onChange={onFile}
          disabled={busy}
          aria-label="Upload resume (PDF or DOCX)"
          className="block w-full text-sm"
        />
      )}
      <p className="text-xs text-slate-500">
        Reading a resume (PDF or DOCX) updates the Experience, Education, and Skills in Review —
        existing entries are kept, new ones added.
      </p>
      {!meta && (
        <p className="text-xs text-slate-500">
          Tip: no resume handy? On your LinkedIn profile, <strong>More → Save to PDF</strong>{' '}
          downloads a resume-style PDF that works here.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notice}
        </p>
      )}
    </section>
  );
}

// ---- Version history ----------------------------------------------------------

const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  'resume-upload': 'Resume upload',
  'brain-dump': 'Brain-dump',
  import: 'Profile import',
  clear: 'Before clearing all data',
  edits: 'Manual edits',
  restore: 'Earlier version', // legacy entries from the pre-history model
  unknown: 'Earlier version',
};

function backupWhen(savedAt: string): string {
  if (!savedAt) return '';
  return new Date(savedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// One-line fingerprint so similar-looking snapshots can be told apart.
function backupFingerprint(p: CareerProfile): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const stats = [
    n(p.experience.length, 'role'),
    n(p.supportingDocs.length, 'doc'),
    n(p.qa.length, 'question'),
  ].join(' · ');
  return [p.basics.name, stats].filter(Boolean).join(' — ');
}

function BackupsView({
  busy,
  onRestore,
  onBack,
}: {
  busy: boolean;
  onRestore: (id: string) => void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<BackupHistory | null>(null);

  // Re-fetch when an in-flight ingest finishes so its fresh version appears
  // without leaving and re-entering the view.
  useEffect(() => {
    if (!busy) getBackupHistory().then(setHistory);
  }, [busy]);

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
      >
        ← Back to Review
      </button>
      <p className="text-sm text-slate-600">
        A version is saved whenever you import a profile, upload a resume, or structure a
        brain-dump. Restoring switches back to that version — edits you haven't versioned are
        saved as "Manual edits" first.
      </p>
      {history === null ? (
        <p role="status" className="text-xs text-slate-500">
          Loading…
        </p>
      ) : history.versions.length === 0 ? (
        <p className="text-xs text-slate-400">No versions yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.versions.map((b) => {
            const isCurrent = b.id === history.currentId;
            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">
                    {BACKUP_REASON_LABELS[b.reason] ?? BACKUP_REASON_LABELS.unknown}
                    {isCurrent && (
                      <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        Current
                      </span>
                    )}
                    {backupWhen(b.savedAt) && (
                      <span className="ml-1.5 text-xs font-normal text-slate-400">
                        {backupWhen(b.savedAt)}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {backupFingerprint(b.profile)}
                  </span>
                </span>
                {!isCurrent && (
                  <button
                    onClick={() => onRestore(b.id)}
                    disabled={busy}
                    aria-label={`Restore version: ${
                      BACKUP_REASON_LABELS[b.reason] ?? 'earlier version'
                    }${backupWhen(b.savedAt) ? `, ${backupWhen(b.savedAt)}` : ''}`}
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
                  >
                    Restore
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---- Supporting documents ---------------------------------------------------

function newDoc(label: string, content: string, category: DocCategory): SupportingDoc {
  return {
    id: crypto.randomUUID(),
    label: label.trim(),
    content,
    addedAt: new Date().toISOString(),
    category,
  };
}

const DOC_GROUPS: { cat: DocCategory; title: string; voice: boolean }[] = [
  { cat: 'cover_letter', title: 'Past cover letters', voice: true },
  { cat: 'writing_sample', title: 'Writing samples', voice: true },
  { cat: 'other', title: 'Additional materials', voice: false },
];

function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: DocCategory;
  onChange: (c: DocCategory) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DocCategory)}
      disabled={disabled}
      aria-label="Document category"
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    >
      <option value="other">Other material — facts &amp; context</option>
      <option value="cover_letter">Past cover letter — drafts match its voice</option>
      <option value="writing_sample">Writing sample — drafts match its voice</option>
    </select>
  );
}

function DocumentsTab({
  profile,
  settings,
  onChange,
  busy,
  onBusyChange,
}: {
  profile: CareerProfile;
  settings: Settings;
  onChange: (p: CareerProfile) => void;
  // Combined flag from the parent (also true during a resume/brain-dump
  // ingest); onBusyChange reports this tab's own file reads back up so the
  // two provider-calling surfaces can't run concurrently.
  busy: boolean;
  onBusyChange: (b: boolean) => void;
}) {
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<DocCategory>('other');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<DocCategory>('other');

  async function addDoc(doc: SupportingDoc) {
    onChange(await updateProfile((p) => ({ ...p, supportingDocs: [...p.supportingDocs, doc] })));
  }

  async function removeDoc(id: string) {
    if (editingId === id) setEditingId(null);
    onChange(
      await updateProfile((p) => ({
        ...p,
        supportingDocs: p.supportingDocs.filter((x) => x.id !== id),
      })),
    );
  }

  function startEdit(d: SupportingDoc) {
    setEditingId(d.id);
    setEditLabel(d.label);
    setEditBody(d.content);
    setEditCategory(docCategory(d));
  }

  async function saveEdit() {
    if (!editLabel.trim() || !editBody.trim()) return;
    onChange(
      await updateProfile((p) => ({
        ...p,
        supportingDocs: p.supportingDocs.map((x) =>
          x.id === editingId
            ? // `kind` is the deprecated voice flag; category supersedes it.
              { ...x, label: editLabel.trim(), content: editBody, category: editCategory, kind: undefined }
            : x,
        ),
      })),
    );
    setNotice(sizeNotice(editBody.length));
    setEditingId(null);
  }

  // Warn at add time — when the user can still act on it — rather than
  // silently truncating at generation time.
  function sizeNotice(length: number): string {
    return length > MAX_DOC_CHARS
      ? `This document is ${length.toLocaleString()} characters — only the first ${MAX_DOC_CHARS.toLocaleString()} are included when drafting. Consider trimming it to the parts that matter.`
      : '';
  }

  async function addText() {
    if (!label.trim() || !body.trim()) return;
    const content = body.trim();
    await addDoc(newDoc(label, content, category));
    setNotice(sizeNotice(content.length));
    setLabel('');
    setBody('');
    setCategory('other');
  }

  async function addFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!label.trim()) {
      setError('Add a label first, then choose the file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is too large.');
      return;
    }
    if (isLegacyDocFile(file)) {
      setError("Legacy .doc files aren't supported — save it as .docx or PDF first.");
      return;
    }
    const name = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    setReading(true);
    onBusyChange(true);
    setError('');
    setNotice('');
    try {
      let content: string;
      let truncNote = '';
      if (isPdf) {
        // PDFs need the model to read them into text.
        const provider = await getProvider(settings);
        const res = await provider.pdfToText(await fileToBase64(file));
        content = res.text;
        if (res.truncated) {
          truncNote =
            'That PDF was longer than the model could transcribe in one pass — the beginning was captured. Consider splitting it and uploading the rest separately.';
        }
      } else if (isDocxFile(file)) {
        // Extracted locally — cheaper and faster than the PDF transcription path.
        content = await docxToText(file);
      } else {
        // Text-based files (JSON transcripts, TXT, MD, CSV) are stored as-is.
        content = await file.text();
        if (name.endsWith('.json')) {
          // Pretty-print valid JSON for readability; keep raw if it doesn't parse.
          try {
            content = JSON.stringify(JSON.parse(content), null, 2);
          } catch {
            /* keep raw */
          }
        }
      }
      if (!content.trim()) {
        setError('That file appears to be empty.');
        return;
      }
      await addDoc(newDoc(label, content, category));
      setNotice(truncNote || sizeNotice(content.length));
      setLabel('');
      setCategory('other');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setReading(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Supporting documents</h3>
      <p className="text-sm text-slate-600">
        Extra material that informs every draft — cover letters and writing samples also shape
        its voice. Paste text or upload a file (PDF, DOCX, TXT, MD, JSON, CSV).
      </p>

      {DOC_GROUPS.map(({ cat, title, voice }) => {
        const docs = profile.supportingDocs.filter((d) => docCategory(d) === cat);
        if (!docs.length) return null;
        return (
          <div key={cat} className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {title}
              {voice && (
                <span className="ml-1.5 font-normal normal-case text-slate-400">
                  drafts match their voice
                </span>
              )}
            </h4>
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="space-y-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  {editingId === d.id ? (
                    <>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        aria-label="Document label"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <CategorySelect value={editCategory} onChange={setEditCategory} />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        aria-label="Document text"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={saveEdit}
                          disabled={!editLabel.trim() || !editBody.trim()}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{d.label}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {d.content.length.toLocaleString()} chars
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <button
                          onClick={() => startEdit(d)}
                          aria-label={`Edit ${d.label}`}
                          className="text-xs text-slate-400 hover:text-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeDoc(d.id)}
                          aria-label={`Remove ${d.label}`}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notice}
        </p>
      )}
      {reading && (
        <p role="status" className="text-xs text-slate-500">
          Reading document…
        </p>
      )}

      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
          aria-label="Document label"
          placeholder="Label (e.g. Marketing case study)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <CategorySelect value={category} onChange={setCategory} disabled={busy} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          rows={4}
          aria-label="Document text"
          placeholder="Paste the document text…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            disabled={busy || !label.trim() || !body.trim()}
            onClick={addText}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Add text
          </button>
          <label className="cursor-pointer rounded text-sm text-slate-600 focus-within:ring-2 focus-within:ring-slate-400 hover:text-slate-900">
            or upload a file
            <input
              type="file"
              accept={`.pdf,.docx,.txt,.md,.json,.csv,application/pdf,${DOCX_MIME},application/json,text/plain,text/markdown,text/csv`}
              onChange={addFile}
              disabled={busy}
              className="sr-only"
            />
          </label>
        </div>
      </div>
    </section>
  );
}

// ---- Brain-dump ---------------------------------------------------------------

// The brain-dump IS the stored narrative — editable in place, fed verbatim
// into every draft. "Save & structure" additionally pulls new facts into the
// structured profile.
function BrainDumpTab({
  profile,
  settings,
  busy,
  ingest,
  onChange,
  draft,
  onDraftChange,
}: {
  profile: CareerProfile;
  settings: Settings;
  busy: boolean;
  ingest: (
    fn: () => Promise<CareerProfile>,
    opts: { narrative?: boolean; resume?: boolean; reason: BackupReason },
  ) => Promise<boolean>;
  onChange: (p: CareerProfile) => void;
  // Unsaved edits live in App (null = no edits) so navigation doesn't
  // discard typed text.
  draft: string | null;
  onDraftChange: (d: string | null) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const text = draft ?? profile.narrative;
  const dirty = draft !== null && draft !== profile.narrative;

  // Same warn-at-save pattern as supporting docs: the narrative is capped at
  // MAX_DOC_CHARS in the prompt, so tell the user while they can still act.
  function sizeNotice(length: number): string {
    return length > MAX_DOC_CHARS
      ? `Your brain-dump is ${length.toLocaleString()} characters — only the first ${MAX_DOC_CHARS.toLocaleString()} are included when drafting. Consider trimming it to the parts that matter.`
      : '';
  }

  async function save() {
    onChange(await updateProfile((p) => ({ ...p, narrative: text })));
    onDraftChange(null);
    setNotice(sizeNotice(text.length));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveAndStructure() {
    setNotice(sizeNotice(text.length));
    const ok = await ingest(
      async () => ({
        ...(await (await getProvider(settings)).ingestText(text, profile)),
        narrative: text,
      }),
      { narrative: true, reason: 'brain-dump' },
    );
    if (ok) onDraftChange(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Your own words — motivations, context behind moves, soft wins, things resumes leave out.
        This goes into every draft verbatim. Edit it anytime.
      </p>
      <textarea
        value={text}
        onChange={(e) => onDraftChange(e.target.value)}
        disabled={busy}
        rows={12}
        aria-label="Brain-dump text"
        placeholder="At Acme I led the payments rewrite that cut checkout failures 30%…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={busy || !dirty}
          onClick={save}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
        >
          Save
        </button>
        <button
          disabled={busy || !text.trim()}
          onClick={saveAndStructure}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Save &amp; structure
        </button>
        {saved && (
          <span role="status" className="text-xs text-slate-500">
            Saved ✓
          </span>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notice}
        </p>
      )}
      <p className="text-xs text-slate-500">
        “Save &amp; structure” also updates Experience, Projects, and Skills in Review from what
        you wrote — existing entries are kept, new ones added.
      </p>
    </div>
  );
}

// ---- Questions ---------------------------------------------------------------

function QuestionsTab({
  profile,
  onChange,
}: {
  profile: CareerProfile;
  onChange: (p: CareerProfile) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  async function add() {
    if (!question.trim() || !answer.trim()) return;
    onChange(
      await updateProfile((p) => ({
        ...p,
        qa: [
          ...p.qa,
          {
            id: crypto.randomUUID(),
            question: question.trim(),
            answer: answer.trim(),
            addedAt: new Date().toISOString(),
          },
        ],
      })),
    );
    setQuestion('');
    setAnswer('');
  }

  function startEdit(q: QAPair) {
    setEditingId(q.id);
    setEditQuestion(q.question);
    setEditAnswer(q.answer);
  }

  async function saveEdit() {
    if (!editQuestion.trim() || !editAnswer.trim()) return;
    onChange(
      await updateProfile((p) => ({
        ...p,
        qa: p.qa.map((x) =>
          x.id === editingId
            ? { ...x, question: editQuestion.trim(), answer: editAnswer.trim() }
            : x,
        ),
      })),
    );
    setEditingId(null);
  }

  async function remove(id: string) {
    if (editingId === id) setEditingId(null);
    onChange(await updateProfile((p) => ({ ...p, qa: p.qa.filter((x) => x.id !== id) })));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Application questions you've answered, in your words — added here by you, or saved when
        the assistant asks for more detail while drafting. They ground future drafts: when a
        similar question comes up, your best past material gets reused.
      </p>

      {profile.qa.length > 0 && (
        <ul className="space-y-2">
          {profile.qa.map((q) => (
            <li key={q.id} className="space-y-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              {editingId === q.id ? (
                <>
                  <input
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    aria-label="Question"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={editAnswer}
                    onChange={(e) => setEditAnswer(e.target.value)}
                    rows={4}
                    aria-label="Your answer"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveEdit}
                      disabled={!editQuestion.trim() || !editAnswer.trim()}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{q.question}</p>
                  <p className="whitespace-pre-wrap text-xs text-slate-600">{q.answer}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => startEdit(q)}
                      aria-label={`Edit question: ${q.question}`}
                      className="text-xs text-slate-400 hover:text-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(q.id)}
                      aria-label={`Remove question: ${q.question}`}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Question"
          placeholder="Question (e.g. Why do you want to work here?)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          aria-label="Your answer"
          placeholder="Your answer…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={!question.trim() || !answer.trim()}
          onClick={add}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Add question &amp; answer
        </button>
      </div>
    </div>
  );
}
