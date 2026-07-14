import { beforeEach, describe, expect, it } from 'vitest';

// In-memory stand-in for chrome.storage.local, installed before the module
// under test is imported.
const store = new Map<string, unknown>();
(globalThis as any).chrome = {
  storage: {
    local: {
      async get(keys: string | string[]) {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.map((k) => [k, store.get(k)]));
      },
      async set(items: Record<string, unknown>) {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
      async remove(key: string) {
        store.delete(key);
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
  getProfileBackups,
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
  it('stamps snapshots with a reason and restores by id, reversibly', async () => {
    const before = emptyProfile();
    before.narrative = 'BEFORE';
    await saveProfile(before);
    await backupProfile('import');
    await updateProfile((p) => ({ ...p, narrative: 'AFTER-BAD-MERGE' }));

    const backups = await getProfileBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe('import');
    expect(backups[0].savedAt).toBeTruthy();
    expect(await hasProfileBackup()).toBe(true);

    const restored = await restoreProfileBackup(backups[0].id);
    expect(restored?.narrative).toBe('BEFORE');
    expect((await getProfile()).narrative).toBe('BEFORE');

    // The replaced profile was pushed as a new 'restore' backup — restoring
    // it undoes the restore.
    const after = await getProfileBackups();
    expect(after[0].reason).toBe('restore');
    const undone = await restoreProfileBackup(after[0].id);
    expect(undone?.narrative).toBe('AFTER-BAD-MERGE');
  });

  it('keeps at most 5 backups, newest first', async () => {
    for (let i = 0; i < 7; i++) {
      await updateProfile((p) => ({ ...p, narrative: `v${i}` }));
      await backupProfile('brain-dump');
    }
    const backups = await getProfileBackups();
    expect(backups).toHaveLength(5);
    expect(backups[0].profile.narrative).toBe('v6');
    expect(backups[4].profile.narrative).toBe('v2');
  });

  it('migrates the legacy single-slot backup into the list once', async () => {
    const legacy = emptyProfile();
    legacy.narrative = 'LEGACY';
    store.set('careerProfileBackup', legacy);

    const backups = await getProfileBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe('unknown');
    expect(backups[0].profile.narrative).toBe('LEGACY');
    expect(store.has('careerProfileBackup')).toBe(false);
    expect(await hasProfileBackup()).toBe(true);
  });

  it('returns null for an unknown id and when there are no backups', async () => {
    expect(await restoreProfileBackup('nope')).toBeNull();
  });

  it('does not re-migrate the legacy slot once the list exists (racing reader)', async () => {
    await updateProfile((p) => ({ ...p, narrative: 'real content' }));
    await backupProfile('import'); // the list now exists
    const legacy = emptyProfile();
    legacy.narrative = 'LEGACY-LEFTOVER';
    store.set('careerProfileBackup', legacy); // simulates a racing reader's view

    const backups = await getProfileBackups();
    expect(backups).toHaveLength(1); // leftover cleared, not folded in again
    expect(backups[0].reason).toBe('import');
    expect(store.has('careerProfileBackup')).toBe(false);
  });

  it('skips backups of an empty profile — a snapshot of nothing helps no one', async () => {
    expect(await backupProfile('import')).toBe(false);
    expect(await getProfileBackups()).toHaveLength(0);
    expect(await hasProfileBackup()).toBe(false);

    // ...and restore does not push an empty current profile onto the list.
    await updateProfile((p) => ({ ...p, narrative: 'CONTENT' }));
    expect(await backupProfile('clear')).toBe(true);
    await saveProfile(emptyProfile()); // the "clear" happened
    const backups = await getProfileBackups();
    await restoreProfileBackup(backups[0].id);
    expect((await getProfile()).narrative).toBe('CONTENT');
    // Only the original snapshot remains; no 'restore' entry for the blank.
    const after = await getProfileBackups();
    expect(after).toHaveLength(1);
    expect(after[0].reason).toBe('clear');
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
