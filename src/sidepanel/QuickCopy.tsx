import { useEffect, useState } from 'react';
import { QuickCopy } from '../lib/types';
import { getQuickCopies, saveQuickCopies, onQuickCopiesChange } from '../lib/storage';

export default function QuickCopyView() {
  const [items, setItems] = useState<QuickCopy[]>([]);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    getQuickCopies().then(setItems);
    return onQuickCopiesChange(setItems);
  }, []);

  async function persist(next: QuickCopy[]) {
    setItems(next);
    await saveQuickCopies(next);
  }

  async function add() {
    if (!label.trim() || !value.trim()) return;
    await persist([...items, { id: crypto.randomUUID(), label: label.trim(), value: value.trim() }]);
    setLabel('');
    setValue('');
  }

  async function copy(item: QuickCopy) {
    await navigator.clipboard.writeText(item.value);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Quick Copy</h2>
        <p className="mt-1 text-xs text-slate-500">
          One-click copy for things you paste into applications a lot — your email, portfolio link,
          a stock answer.
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <button
                onClick={() => copy(item)}
                title={item.value}
                className="flex-1 truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
              >
                {copiedId === item.id ? 'Copied ✓' : item.label}
              </button>
              <button
                onClick={() => persist(items.filter((x) => x.id !== item.id))}
                title="Delete"
                aria-label={`Delete ${item.label}`}
                className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
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
                  className="h-4 w-4"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create a new quick-copy button — label, value, and add each on their own row. */}
      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Label"
          placeholder="Label (e.g. Portfolio URL)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          aria-label="Value to copy"
          placeholder="Value to copy"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          disabled={!label.trim() || !value.trim()}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
