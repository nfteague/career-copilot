import { useState } from 'react';
import {
  CareerProfile,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  Certification,
  Note,
} from '../lib/types';

// Full edit/delete surface for the structured profile. Edits persist
// immediately via onUpdate (whole-profile patch), matching the rest of the app.

const id = () => crypto.randomUUID();
const blankExperience = (): ExperienceEntry => ({ id: id(), company: '', title: '', highlights: [], skills: [] });
const blankProject = (): ProjectEntry => ({ id: id(), name: '', highlights: [], technologies: [] });
const blankEducation = (): EducationEntry => ({ id: id(), institution: '' });
const blankCert = (): Certification => ({ id: id(), name: '' });

export default function ProfileEditor({
  profile,
  onUpdate,
  onClear,
}: {
  profile: CareerProfile;
  onUpdate: (patch: Partial<CareerProfile>) => void;
  onClear: () => void;
}) {
  const { basics, experience, projects, education, skills, certifications } = profile;

  const setExp = (xs: ExperienceEntry[]) => onUpdate({ experience: xs });
  const patchExp = (i: number, p: Partial<ExperienceEntry>) =>
    setExp(experience.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const setProj = (xs: ProjectEntry[]) => onUpdate({ projects: xs });
  const patchProj = (i: number, p: Partial<ProjectEntry>) =>
    setProj(projects.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const setEdu = (xs: EducationEntry[]) => onUpdate({ education: xs });
  const patchEdu = (i: number, p: Partial<EducationEntry>) =>
    setEdu(education.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const setCert = (xs: Certification[]) => onUpdate({ certifications: xs });
  const patchCert = (i: number, p: Partial<Certification>) =>
    setCert(certifications.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="space-y-5">
      <Text
        label="Name"
        value={basics.name}
        onChange={(v) => onUpdate({ basics: { ...basics, name: v } })}
      />
      <Text
        label="Headline"
        value={basics.headline ?? ''}
        placeholder="Senior Product Designer"
        onChange={(v) => onUpdate({ basics: { ...basics, headline: v } })}
      />

      {/* Experience */}
      <section className="space-y-2">
        <SectionHeader title="Experience" onAdd={() => setExp([...experience, blankExperience()])} />
        {experience.length === 0 && <Empty />}
        {experience.map((e, i) => (
          <Card key={e.id} onRemove={() => setExp(experience.filter((_, j) => j !== i))}>
            <Row>
              <Text label="Title" value={e.title} onChange={(v) => patchExp(i, { title: v })} />
              <Text label="Company" value={e.company} onChange={(v) => patchExp(i, { company: v })} />
            </Row>
            <Row>
              <Text label="Start" value={e.startDate ?? ''} onChange={(v) => patchExp(i, { startDate: v })} />
              <Text
                label="End"
                value={e.current ? '' : e.endDate ?? ''}
                placeholder={e.current ? 'Present' : ''}
                onChange={(v) => patchExp(i, { endDate: v })}
              />
            </Row>
            <Check label="Current role" checked={!!e.current} onChange={(c) => patchExp(i, { current: c })} />
            <Text label="Location" value={e.location ?? ''} onChange={(v) => patchExp(i, { location: v })} />
            <TextArea label="Summary" value={e.summary ?? ''} onChange={(v) => patchExp(i, { summary: v })} />
            <StringList label="Highlights" items={e.highlights} onChange={(xs) => patchExp(i, { highlights: xs })} />
            <Csv label="Skills used" items={e.skills} onCommit={(xs) => patchExp(i, { skills: xs })} />
          </Card>
        ))}
      </section>

      {/* Projects */}
      <section className="space-y-2">
        <SectionHeader title="Projects" onAdd={() => setProj([...projects, blankProject()])} />
        {projects.length === 0 && <Empty />}
        {projects.map((p, i) => (
          <Card key={p.id} onRemove={() => setProj(projects.filter((_, j) => j !== i))}>
            <Row>
              <Text label="Name" value={p.name} onChange={(v) => patchProj(i, { name: v })} />
              <Text label="Role" value={p.role ?? ''} onChange={(v) => patchProj(i, { role: v })} />
            </Row>
            <TextArea label="Description" value={p.description ?? ''} onChange={(v) => patchProj(i, { description: v })} />
            <StringList label="Highlights" items={p.highlights} onChange={(xs) => patchProj(i, { highlights: xs })} />
            <Csv label="Technologies" items={p.technologies} onCommit={(xs) => patchProj(i, { technologies: xs })} />
            <Text label="Link" value={p.link ?? ''} onChange={(v) => patchProj(i, { link: v })} />
          </Card>
        ))}
      </section>

      {/* Education */}
      <section className="space-y-2">
        <SectionHeader title="Education" onAdd={() => setEdu([...education, blankEducation()])} />
        {education.length === 0 && <Empty />}
        {education.map((ed, i) => (
          <Card key={ed.id} onRemove={() => setEdu(education.filter((_, j) => j !== i))}>
            <Text label="Institution" value={ed.institution} onChange={(v) => patchEdu(i, { institution: v })} />
            <Row>
              <Text label="Degree" value={ed.degree ?? ''} onChange={(v) => patchEdu(i, { degree: v })} />
              <Text label="Field" value={ed.field ?? ''} onChange={(v) => patchEdu(i, { field: v })} />
            </Row>
            <Row>
              <Text label="Start" value={ed.startDate ?? ''} onChange={(v) => patchEdu(i, { startDate: v })} />
              <Text label="End" value={ed.endDate ?? ''} onChange={(v) => patchEdu(i, { endDate: v })} />
            </Row>
            <TextArea label="Details" value={ed.details ?? ''} onChange={(v) => patchEdu(i, { details: v })} />
          </Card>
        ))}
      </section>

      {/* Skills */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Skills</h3>
        <SkillChips skills={skills} onChange={(xs) => onUpdate({ skills: xs })} />
      </section>

      {/* Certifications */}
      <section className="space-y-2">
        <SectionHeader title="Certifications" onAdd={() => setCert([...certifications, blankCert()])} />
        {certifications.length === 0 && <Empty />}
        {certifications.map((c, i) => (
          <Card key={c.id} onRemove={() => setCert(certifications.filter((_, j) => j !== i))}>
            <Text label="Name" value={c.name} onChange={(v) => patchCert(i, { name: v })} />
            <Row>
              <Text label="Issuer" value={c.issuer ?? ''} onChange={(v) => patchCert(i, { issuer: v })} />
              <Text label="Date" value={c.date ?? ''} onChange={(v) => patchCert(i, { date: v })} />
            </Row>
          </Card>
        ))}
      </section>

      {/* Notes / collected context */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Notes &amp; collected context</h3>
        <p className="text-xs text-slate-500">
          Answers you've given the assistant and extra context you've added — used on every draft.
          Edit or prune anytime.
        </p>
        <NotesEditor notes={profile.notes} onChange={(xs) => onUpdate({ notes: xs })} />
      </section>

      {/* Narrative */}
      <label className="block">
        <span className="text-sm font-semibold">Your own words</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          Motivations, context behind moves, what you care about — things resumes omit. Used on every draft.
        </span>
        <textarea
          value={profile.narrative}
          onChange={(e) => onUpdate({ narrative: e.target.value })}
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="border-t border-slate-200 pt-4">
        <ClearAll onClear={onClear} />
      </div>
    </div>
  );
}

// ---- primitives ------------------------------------------------------------

function Text({
  label,
  value,
  placeholder,
  onChange,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      {label && <span className="text-xs font-medium text-slate-600">{label}</span>}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

// Comma-separated list edited as plain text, committed on blur — avoids the
// "can't type a comma" problem you get splitting on every keystroke.
function Csv({
  label,
  items,
  onCommit,
}: {
  label: string;
  items: string[];
  onCommit: (xs: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        // Uncontrolled: re-mounts (resetting) only when the entry id changes.
        defaultValue={items.join(', ')}
        placeholder="comma, separated"
        onBlur={(e) => onCommit(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function StringList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (xs: string[]) => void;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1 space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="px-1 text-slate-400 hover:text-red-600"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ''])}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          + add
        </button>
      </div>
    </div>
  );
}

function SkillChips({ skills, onChange }: { skills: string[]; onChange: (xs: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !skills.includes(v)) onChange([...skills, v]);
    setInput('');
  };
  return (
    <div>
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skills.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
            >
              {s}
              <button
                onClick={() => onChange(skills.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-600"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          aria-label="Add a skill"
          placeholder="Add a skill, press Enter"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button onClick={add} className="rounded-md border border-slate-300 px-3 text-sm">
          Add
        </button>
      </div>
    </div>
  );
}

function NotesEditor({ notes, onChange }: { notes: Note[]; onChange: (xs: Note[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...notes, { id: crypto.randomUUID(), content: v, addedAt: new Date().toISOString() }]);
    setText('');
  };
  return (
    <div className="space-y-2">
      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <span className="text-sm text-slate-700">{n.content}</span>
              <button
                onClick={() => onChange(notes.filter((x) => x.id !== n.id))}
                className="shrink-0 text-xs text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label="New note"
        placeholder="Add a fact, story, or preference to use on every draft…"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        onClick={add}
        disabled={!text.trim()}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
      >
        Add note
      </button>
    </div>
  );
}

function Card({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex justify-end">
        <button onClick={onRemove} className="text-xs text-slate-400 hover:text-red-600">
          Delete
        </button>
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      <button onClick={onAdd} className="text-xs font-medium text-slate-600 hover:text-slate-900">
        + Add
      </button>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-slate-400">None yet.</p>;
}

function ClearAll({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-600 hover:underline">
        Clear all data
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-700">Delete your entire profile? This can't be undone.</span>
      <button
        onClick={onClear}
        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
      >
        Yes, clear
      </button>
      <button onClick={() => setConfirming(false)} className="text-xs text-slate-500">
        Cancel
      </button>
    </div>
  );
}
