import { Preferences } from '../lib/types';

// Tone + length controls for generated drafts. Shared so it can live wherever
// it's most useful — currently on the Generate tab, persisted as the default.
export default function PreferencesEditor({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (p: Preferences) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="text-sm font-medium">Tone</span>
        <select
          value={prefs.tone}
          onChange={(e) => onChange({ ...prefs, tone: e.target.value as Preferences['tone'] })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="professional">Professional</option>
          <option value="warm">Warm</option>
          <option value="direct">Direct</option>
          <option value="enthusiastic">Enthusiastic</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Length</span>
        <select
          value={prefs.length}
          onChange={(e) => onChange({ ...prefs, length: e.target.value as Preferences['length'] })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="concise">Concise</option>
          <option value="standard">Standard</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>
    </div>
  );
}
