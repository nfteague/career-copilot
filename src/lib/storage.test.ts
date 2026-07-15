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
  getBackupHistory,
  hasProfileBackup,
  recordVersion,
  restoreVersion,
  setCurrentVersionId,
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

describe('version history', () => {
  async function importProfileNamed(name: string) {
    const p = emptyProfile();
    p.basics.name = name;
    await saveProfile(p);
    await recordVersion('import');
  }

  it('two imports → two versions with Current on the latest; restore moves the badge', async () => {
    await importProfileNamed('Profile A');
    await importProfileNamed('Profile B');

    let h = await getBackupHistory();
    expect(h.versions).toHaveLength(2);
    expect(h.versions[0].profile.basics.name).toBe('Profile B');
    expect(h.currentId).toBe(h.versions[0].id); // Current on the latest

    // Restoring A moves the badge to A without minting new entries.
    const idA = h.versions[1].id;
    const restored = await restoreVersion(idA);
    expect(restored?.basics.name).toBe('Profile A');
    expect((await getProfile()).basics.name).toBe('Profile A');
    h = await getBackupHistory();
    expect(h.versions).toHaveLength(2);
    expect(h.currentId).toBe(idA);
  });

  it('checkpoints unsaved manual edits once before a restore replaces them', async () => {
    await importProfileNamed('Profile A');
    await importProfileNamed('Profile B');
    // Manual drift after the last version.
    await updateProfile((p) => ({ ...p, narrative: 'hand-written edits' }));

    let h = await getBackupHistory();
    const idA = h.versions[1].id;
    await restoreVersion(idA);

    h = await getBackupHistory();
    expect(h.versions).toHaveLength(3);
    expect(h.versions[0].reason).toBe('edits');
    expect(h.versions[0].profile.narrative).toBe('hand-written edits');
    expect(h.currentId).toBe(idA);

    // Restoring again checkpoints nothing — live equals a version now.
    const idB = h.versions.find((v) => v.profile.basics.name === 'Profile B')!.id;
    await restoreVersion(idB);
    expect((await getBackupHistory()).versions).toHaveLength(3);
  });

  it('skips blanks and exact duplicates of the current version', async () => {
    expect(await recordVersion('import')).toBe(false); // blank profile
    await importProfileNamed('Profile A');
    expect(await recordVersion('brain-dump')).toBe(false); // unchanged content
    expect((await getBackupHistory()).versions).toHaveLength(1);
  });

  it('caps the history at 20, newest first', async () => {
    for (let i = 0; i < 23; i++) {
      await updateProfile((p) => ({ ...p, narrative: `v${i}` }));
      await recordVersion('brain-dump');
    }
    const h = await getBackupHistory();
    expect(h.versions).toHaveLength(20);
    expect(h.versions[0].profile.narrative).toBe('v22');
    expect(h.versions[19].profile.narrative).toBe('v3');
    expect(h.currentId).toBe(h.versions[0].id);
  });

  it('never evicts the version being restored when the checkpoint hits the cap', async () => {
    for (let i = 0; i < 20; i++) {
      await updateProfile((p) => ({ ...p, narrative: `v${i}` }));
      await recordVersion('brain-dump');
    }
    const h = await getBackupHistory();
    const oldest = h.versions[19];
    await updateProfile((p) => ({ ...p, narrative: 'drift' })); // forces a checkpoint
    const restored = await restoreVersion(oldest.id);
    expect(restored?.narrative).toBe('v0');
    const after = await getBackupHistory();
    expect(after.versions).toHaveLength(20);
    expect(after.versions.some((v) => v.id === oldest.id)).toBe(true);
    expect(after.currentId).toBe(oldest.id);
  });

  it('setCurrentVersionId(null) removes the Current pointer (clear-all)', async () => {
    await importProfileNamed('Profile A');
    await setCurrentVersionId(null);
    const h = await getBackupHistory();
    expect(h.versions).toHaveLength(1);
    expect(h.currentId).toBeNull();
  });

  it('normalizes the pre-history bare-array shape and filters blank snapshots', async () => {
    const blank = { id: 'b1', savedAt: 'x', reason: 'import', profile: emptyProfile() };
    const real = emptyProfile();
    real.narrative = 'REAL';
    store.set('careerProfileBackups', [
      blank,
      { id: 'b2', savedAt: 'y', reason: 'import', profile: real },
    ]);
    const h = await getBackupHistory();
    expect(h.versions).toHaveLength(1);
    expect(h.versions[0].id).toBe('b2');
    expect(h.currentId).toBeNull();
  });

  it('migrates the legacy single-slot backup once, idempotently', async () => {
    const legacy = emptyProfile();
    legacy.narrative = 'LEGACY';
    store.set('careerProfileBackup', legacy);

    let h = await getBackupHistory();
    expect(h.versions).toHaveLength(1);
    expect(h.versions[0].reason).toBe('unknown');
    expect(store.has('careerProfileBackup')).toBe(false);
    expect(await hasProfileBackup()).toBe(true);

    // A racing reader's leftover slot is cleared, not folded in again.
    store.set('careerProfileBackup', legacy);
    h = await getBackupHistory();
    expect(h.versions).toHaveLength(1);
    expect(store.has('careerProfileBackup')).toBe(false);
  });

  it('returns null for an unknown id', async () => {
    expect(await restoreVersion('nope')).toBeNull();
  });

  it('does not checkpoint when live already equals the restore target (migrated history, no pointer)', async () => {
    const real = emptyProfile();
    real.narrative = 'SAME';
    await saveProfile(real);
    // Pre-history array shape: content matches live but currentId is null.
    store.set('careerProfileBackups', [
      { id: 'b1', savedAt: 'x', reason: 'import', profile: real },
    ]);
    await restoreVersion('b1');
    const h = await getBackupHistory();
    expect(h.versions).toHaveLength(1); // no duplicate "Manual edits" row
    expect(h.currentId).toBe('b1');
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

  it('rolls retired OpenAI models forward and keeps current ones as-is', async () => {
    store.set('settings', { provider: 'openai', openai: { apiKey: 'sk-x', model: 'gpt-4.1' } });
    expect((await getSettings()).openai.model).toBe('gpt-5.6-terra');

    store.set('settings', {
      provider: 'openai',
      openai: { apiKey: 'sk-x', model: 'gpt-5.4-mini' },
    });
    expect((await getSettings()).openai.model).toBe('gpt-5.6-terra');

    store.set('settings', { provider: 'openai', openai: { apiKey: 'sk-x', model: 'gpt-5.5' } });
    expect((await getSettings()).openai.model).toBe('gpt-5.5');
  });
});
