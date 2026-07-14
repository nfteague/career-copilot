import { useEffect, useRef, useState } from 'react';
import { Settings, Provider, activeCreds } from '../lib/types';
import { getProfile, saveSettings, updateProfile } from '../lib/storage';
import { checkCredentials } from '../lib/providers';

const MODELS: Record<Provider, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (best quality)' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster / cheaper)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (legacy)' },
  ],
  openai: [
    { value: 'gpt-5.5', label: 'GPT-5.5 (best quality)' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini (faster / cheaper)' },
    { value: 'gpt-4.1', label: 'GPT-4.1 (legacy)' },
  ],
};

const PROVIDER_META: Record<Provider, { label: string; keyHint: string; keyPlaceholder: string }> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    keyHint: 'Get one at console.anthropic.com → API Keys.',
    keyPlaceholder: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    keyHint: 'Get one at platform.openai.com → API keys.',
    keyPlaceholder: 'sk-...',
  },
};

export default function SettingsView({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [s, setS] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [keyWarning, setKeyWarning] = useState('');
  // Standing output requirements live on the profile's preferences (they
  // export/import with it) but are edited here alongside the model choice.
  // They auto-save (debounced) — the Save button below is for credentials,
  // whose save doubles as a key check.
  const [outputRules, setOutputRules] = useState('');
  const [rulesSaved, setRulesSaved] = useState(false);
  const rulesTimer = useRef<number | undefined>(undefined);
  const pendingRules = useRef<string | null>(null);

  async function persistRules(value: string) {
    pendingRules.current = null;
    await updateProfile((p) => ({
      ...p,
      preferences: { ...p.preferences, customInstructions: value.trim() || undefined },
    }));
  }

  function onRulesChange(value: string) {
    setOutputRules(value);
    setRulesSaved(false);
    pendingRules.current = value;
    window.clearTimeout(rulesTimer.current);
    rulesTimer.current = window.setTimeout(async () => {
      rulesTimer.current = undefined;
      await persistRules(value);
      setRulesSaved(true);
    }, 500);
  }

  useEffect(() => {
    getProfile().then((p) => setOutputRules(p.preferences.customInstructions ?? ''));
    return () => {
      // Flush a pending debounce so switching views can't drop typed rules.
      window.clearTimeout(rulesTimer.current);
      if (pendingRules.current !== null) void persistRules(pendingRules.current);
    };
  }, []);

  const provider = s.provider;
  const creds = s[provider];
  const meta = PROVIDER_META[provider];

  function update(patch: Partial<Settings>) {
    setS((prev) => ({ ...prev, ...patch }));
  }
  function updateCreds(patch: Partial<Settings['anthropic']>) {
    setS((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
  }

  async function save() {
    const next: Settings = {
      ...s,
      [provider]: { ...creds, apiKey: creds.apiKey.trim() },
    };
    // Save first (never trap the user behind a network check), then verify the
    // key with a free call and surface the result.
    await saveSettings(next);
    onSaved(next);
    setKeyWarning('');
    if (activeCreds(next).apiKey) {
      setChecking(true);
      const problem = await checkCredentials(next);
      setChecking(false);
      if (problem) {
        setKeyWarning(`Saved, but the key check failed: ${problem}`);
        return;
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="mt-1 text-xs text-slate-500">
          Your API key is stored only in this browser and used to call the provider directly. It
          never goes to any other server.
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Provider</span>
        <select
          value={provider}
          onChange={(e) => update({ provider: e.target.value as Provider })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_META[p].label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">{meta.label} API key</span>
        <input
          type="password"
          value={creds.apiKey}
          onChange={(e) => updateCreds({ apiKey: e.target.value })}
          placeholder={meta.keyPlaceholder}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-slate-500">{meta.keyHint}</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Model</span>
        <select
          value={creds.model}
          onChange={(e) => updateCreds({ model: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {MODELS[provider].map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Output requirements</span>
        <textarea
          value={outputRules}
          onChange={(e) => onRulesChange(e.target.value)}
          rows={3}
          placeholder={'e.g. "Never use em dashes." "Always mention I\'m open to relocation."'}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>Rules every draft must follow — applied on top of tone and length.</span>
          {rulesSaved && <span role="status">Saved ✓</span>}
        </span>
      </label>

      <button
        onClick={save}
        disabled={checking}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {checking ? 'Checking key…' : saved ? 'Saved ✓ — key works' : 'Save'}
      </button>

      {keyWarning && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {keyWarning}
        </p>
      )}

      <p className="text-xs text-slate-400">
        Keys are kept per provider — switching back doesn't lose the other one.
      </p>
    </div>
  );
}
