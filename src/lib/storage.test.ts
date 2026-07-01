import { beforeEach, describe, expect, it } from 'vitest';

// In-memory stand-in for chrome.storage.local, installed before the module
// under test is imported.
const store = new Map<string, unknown>();
(globalThis as any).chrome = {
  storage: {
    local: {
      async get(key: string) {
        return { [key]: store.get(key) };
      },
      async set(items: Record<string, unknown>) {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

const {
  getProfile,
  saveProfile,
  updateProfile,
  backupProfile,
  hasProfileBackup,
  restoreProfileBackup,
  getSettings,
} = await import('./storage');
const { emptyProfile } = await import('./types');

beforeEach(() => store.clear());

describe('getProfile', () => {
  it('returns an empty profile when nothing is stored', async () => {
    const p = await getProfile();
    expect(p.experience).toEqual([]);
    expect(p.notes).toEqual([]);
  });

  it('backfills fields added after a profile was saved (forward compat)', async () => {
    const legacy = emptyProfile() as any;
    delete legacy.notes;
    delete legacy.supportingDocs;
    store.set('careerProfile', legacy);
    const p = await getProfile();
    expect(p.notes).toEqual([]);
    expect(p.supportingDocs).toEqual([]);
  });
});

describe('updateProfile', () => {
  it('applies the update against the latest stored profile, not a stale copy', async () => {
    const base = emptyProfile();
    base.narrative = 'original';
    await saveProfile(base);
    // A write lands from another surface...
    await updateProfile((p) => ({ ...p, skills: ['sql'] }));
    // ...and a second updater still sees it.
    const next = await updateProfile((p) => ({ ...p, narrative: 'edited' }));
    expect(next.skills).toEqual(['sql']);
    expect(next.narrative).toBe('edited');
  });
});

describe('backup / restore', () => {
  it('snapshots and restores, swapping so restore is reversible', async () => {
    const before = emptyProfile();
    before.narrative = 'BEFORE';
    await saveProfile(before);
    await backupProfile();

    await updateProfile((p) => ({ ...p, narrative: 'AFTER-BAD-MERGE' }));
    expect(await hasProfileBackup()).toBe(true);

    const restored = await restoreProfileBackup();
    expect(restored?.narrative).toBe('BEFORE');
    expect((await getProfile()).narrative).toBe('BEFORE');

    // Restoring again undoes the restore.
    const swappedBack = await restoreProfileBackup();
    expect(swappedBack?.narrative).toBe('AFTER-BAD-MERGE');
  });

  it('returns null when there is no backup', async () => {
    expect(await restoreProfileBackup()).toBeNull();
  });
});

describe('getSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const s = await getSettings();
    expect(s.provider).toBe('anthropic');
    expect(s.anthropic.apiKey).toBe('');
    expect(s.openai.model).toBeTruthy();
  });

  it('migrates the legacy flat { apiKey, model } shape into the anthropic slot', async () => {
    store.set('settings', { apiKey: 'sk-ant-old', model: 'claude-3-opus' });
    const s = await getSettings();
    expect(s.provider).toBe('anthropic');
    expect(s.anthropic).toEqual({ apiKey: 'sk-ant-old', model: 'claude-3-opus' });
  });

  it('fills missing provider slots with defaults', async () => {
    store.set('settings', { provider: 'openai', openai: { apiKey: 'sk-x', model: 'gpt-5.5' } });
    const s = await getSettings();
    expect(s.provider).toBe('openai');
    expect(s.openai.apiKey).toBe('sk-x');
    expect(s.anthropic.apiKey).toBe('');
    expect(s.anthropic.model).toBeTruthy();
  });
});
