import { useEffect, useState } from 'react';
import { CareerProfile, Settings, SupportingDoc, emptyProfile } from '../lib/types';
import {
  saveProfile,
  updateProfile,
  backupProfile,
  hasProfileBackup,
  restoreProfileBackup,
} from '../lib/storage';
import { getProvider } from '../lib/providers';
import { friendlyError } from '../lib/errors';
import { MAX_DOC_CHARS } from '../lib/prompts';
import { fileToBase64 } from './tabContext';
import ProfileEditor from './ProfileEditor';

type Tab = 'upload' | 'braindump' | 'docs' | 'review';

const TAB_LABELS: Record<Tab, string> = {
  upload: 'Upload resume',
  braindump: 'Brain-dump',
  docs: 'Documents',
  review: 'Review',
};

export default function ProfileSetup({
  profile,
  settings,
  onChange,
}: {
  profile: CareerProfile;
  settings: Settings;
  onChange: (p: CareerProfile) => void;
}) {
  const [tab, setTab] = useState<Tab>(profile.experience.length ? 'review' : 'upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dump, setDump] = useState('');
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    hasProfileBackup().then(setCanUndo);
  }, []);

  async function ingest(fn: () => Promise<CareerProfile>) {
    setBusy(true);
    setError('');
    try {
      const next = await fn();
      // Snapshot the pre-ingest profile first — model-driven merges can drop
      // data, and this makes every import undoable.
      await backupProfile();
      await saveProfile(next);
      setCanUndo(true);
      onChange(next);
      setTab('review');
      setDump('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const restored = await restoreProfileBackup();
    if (restored) onChange(restored);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF. (DOCX support is coming — for now, paste the text instead.)');
      return;
    }
    const base64 = await fileToBase64(file);
    // Merge onto the existing profile so narrative/preferences survive re-ingest.
    await ingest(() => getProvider(settings).ingestPdf(base64, profile));
  }

  async function updatePartial(patch: Partial<CareerProfile>) {
    onChange(await updateProfile((p) => ({ ...p, ...patch })));
  }

  async function clearAll() {
    await backupProfile(); // clearing everything must be undoable too
    const fresh = emptyProfile();
    await saveProfile(fresh);
    setCanUndo(true);
    onChange(fresh);
    setTab('upload');
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

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
        {(['upload', 'braindump', 'docs', 'review'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              tab === t ? 'bg-white shadow-sm' : 'text-slate-500'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {busy && <p className="text-xs text-slate-500">Reading and structuring… this takes a few seconds.</p>}

      {tab === 'upload' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Upload your resume (PDF). We extract it into a structured profile you can edit.
          </p>
          <input
            type="file"
            accept="application/pdf"
            onChange={onFile}
            disabled={busy}
            className="block w-full text-sm"
          />
        </div>
      )}

      {tab === 'braindump' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Paste anything — old resume text, notes, accomplishments, context resumes leave out.
            We'll structure it.
          </p>
          <textarea
            value={dump}
            onChange={(e) => setDump(e.target.value)}
            rows={10}
            placeholder="At Acme I led the payments rewrite that cut checkout failures 30%…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            disabled={busy || !dump.trim()}
            onClick={() => ingest(() => getProvider(settings).ingestText(dump, profile))}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Structure this
          </button>
        </div>
      )}

      {tab === 'docs' && (
        <DocumentsTab profile={profile} settings={settings} onChange={onChange} />
      )}

      {tab === 'review' && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={exportProfile}
              className="font-medium text-slate-500 underline hover:text-slate-800"
            >
              Export profile (JSON)
            </button>
            {canUndo && (
              <button
                onClick={undo}
                title="Swap back to the profile as it was before the last import or clear"
                className="font-medium text-slate-500 underline hover:text-slate-800"
              >
                Restore previous version
              </button>
            )}
          </div>
          <ProfileEditor profile={profile} onUpdate={updatePartial} onClear={clearAll} />
        </div>
      )}
    </div>
  );
}

function newDoc(label: string, content: string): SupportingDoc {
  return { id: crypto.randomUUID(), label: label.trim(), content, addedAt: new Date().toISOString() };
}

function DocumentsTab({
  profile,
  settings,
  onChange,
}: {
  profile: CareerProfile;
  settings: Settings;
  onChange: (p: CareerProfile) => void;
}) {
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function addDoc(doc: SupportingDoc) {
    onChange(await updateProfile((p) => ({ ...p, supportingDocs: [...p.supportingDocs, doc] })));
  }

  async function removeDoc(id: string) {
    onChange(
      await updateProfile((p) => ({
        ...p,
        supportingDocs: p.supportingDocs.filter((x) => x.id !== id),
      })),
    );
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
    await addDoc(newDoc(label, content));
    setNotice(sizeNotice(content.length));
    setLabel('');
    setBody('');
  }

  async function addFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!label.trim()) {
      setError('Add a label first, then choose the file.');
      return;
    }
    const name = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let content: string;
      let truncNote = '';
      if (isPdf) {
        // PDFs need the model to read them into text.
        const res = await getProvider(settings).pdfToText(await fileToBase64(file));
        content = res.text;
        if (res.truncated) {
          truncNote =
            'That PDF was longer than the model could transcribe in one pass — the beginning was captured. Consider splitting it and uploading the rest separately.';
        }
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
      await addDoc(newDoc(label, content));
      setNotice(truncNote || sizeNotice(content.length));
      setLabel('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Attach extra material with your own label — writing samples, case studies, an interview
        transcript, a past cover letter. Paste text, or upload a PDF or text file (TXT, MD, JSON,
        CSV). These inform every draft but aren't parsed into your profile.
      </p>

      {profile.supportingDocs.length > 0 && (
        <ul className="space-y-2">
          {profile.supportingDocs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <span className="text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {d.content.length.toLocaleString()} chars
                </span>
              </span>
              <button
                onClick={() => removeDoc(d.id)}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}
      {busy && <p className="text-xs text-slate-500">Reading document…</p>}

      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Marketing case study)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
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
          <label className="cursor-pointer text-sm text-slate-600 hover:text-slate-900">
            or upload a file
            <input
              type="file"
              accept=".pdf,.txt,.md,.json,.csv,application/pdf,application/json,text/plain,text/markdown,text/csv"
              onChange={addFile}
              disabled={busy}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

