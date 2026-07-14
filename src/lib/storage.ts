import {
  CareerProfile,
  QuickCopy,
  Settings,
  activeCreds,
  emptyProfile,
  isProfileEmpty,
} from './types';

// Thin async wrappers over chrome.storage.local. Everything lives on the user's
// machine — the API key and the career profile never leave the browser except
// in direct calls to the Anthropic API.

const PROFILE_KEY = 'careerProfile';
const BACKUP_KEY = 'careerProfileBackup';
const SETTINGS_KEY = 'settings';
const QUICKCOPY_KEY = 'quickCopies';

const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  anthropic: { apiKey: '', model: 'claude-opus-4-8' },
  openai: { apiKey: '', model: 'gpt-5.5' },
};

export async function getProfile(): Promise<CareerProfile> {
  const stored = (await chrome.storage.local.get(PROFILE_KEY))[PROFILE_KEY] as
    | CareerProfile
    | undefined;
  // Merge over an empty profile so fields added in later versions (e.g.
  // supportingDocs) are always present on profiles saved by older builds.
  return stored ? { ...emptyProfile(), ...stored } : emptyProfile();
}

export async function saveProfile(profile: CareerProfile): Promise<void> {
  profile.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

// Read-modify-write against the LATEST stored profile. All partial updates
// (notes, docs, prefs, field edits) should go through this rather than
// spreading a possibly-stale prop, so two surfaces can't clobber each other.
export async function updateProfile(
  fn: (latest: CareerProfile) => CareerProfile,
): Promise<CareerProfile> {
  const next = fn(await getProfile());
  next.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [PROFILE_KEY]: next });
  return next;
}

// Safety net around destructive operations (ingest merges, imports, clear-all):
// a bounded, newest-first list of snapshots, each stamped with when and why it
// was taken. Small enough to stay well inside the chrome.storage.local quota.
const BACKUPS_KEY = 'careerProfileBackups';
const MAX_BACKUPS = 5;

export type BackupReason =
  | 'resume-upload'
  | 'brain-dump'
  | 'import'
  | 'clear'
  | 'restore'
  | 'unknown';

export interface ProfileBackup {
  id: string;
  savedAt: string; // ISO; '' when unknown (a migrated pre-list backup)
  reason: BackupReason;
  profile: CareerProfile;
}

// Read the backup list, folding the legacy single-slot backup in once.
export async function getProfileBackups(): Promise<ProfileBackup[]> {
  const stored = await chrome.storage.local.get([BACKUPS_KEY, BACKUP_KEY]);
  const list = (stored[BACKUPS_KEY] as ProfileBackup[] | undefined) ?? [];
  const legacy = stored[BACKUP_KEY] as CareerProfile | undefined;
  if (!legacy) return list;
  // Fold the legacy slot in only when the list has never been written — this
  // keeps the migration idempotent when two panel windows race through it
  // (the loser just clears the already-migrated slot).
  if (stored[BACKUPS_KEY] !== undefined) {
    await chrome.storage.local.remove(BACKUP_KEY);
    return list;
  }
  const migrated = [
    ...list,
    {
      id: crypto.randomUUID(),
      savedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : '',
      reason: 'unknown' as const,
      profile: { ...emptyProfile(), ...legacy },
    },
  ].slice(0, MAX_BACKUPS);
  await chrome.storage.local.set({ [BACKUPS_KEY]: migrated });
  await chrome.storage.local.remove(BACKUP_KEY);
  return migrated;
}

// Returns whether a snapshot was actually taken — a backup of an empty
// profile helps no one, so blanks are skipped.
export async function backupProfile(reason: BackupReason): Promise<boolean> {
  const current = await getProfile();
  if (isProfileEmpty(current)) return false;
  const backups = await getProfileBackups();
  const entry: ProfileBackup = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    reason,
    profile: current,
  };
  await chrome.storage.local.set({ [BACKUPS_KEY]: [entry, ...backups].slice(0, MAX_BACKUPS) });
  return true;
}

export async function hasProfileBackup(): Promise<boolean> {
  return (await getProfileBackups()).length > 0;
}

// Apply the selected backup. Non-destructive: the current profile is pushed
// onto the list first (reason 'restore'), so any restore is itself undoable
// from the same view.
export async function restoreProfileBackup(id: string): Promise<CareerProfile | null> {
  const backups = await getProfileBackups();
  const target = backups.find((b) => b.id === id);
  if (!target) return null;
  const current = await getProfile();
  // Same rule as backupProfile: don't save a snapshot of nothing.
  const withCurrent = isProfileEmpty(current)
    ? backups
    : [
        {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          reason: 'restore' as const,
          profile: current,
        },
        ...backups,
      ];
  const restored = { ...emptyProfile(), ...target.profile };
  await chrome.storage.local.set({
    [PROFILE_KEY]: restored,
    [BACKUPS_KEY]: withCurrent.slice(0, MAX_BACKUPS),
  });
  return restored;
}

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as
    | (Partial<Settings> & { apiKey?: string; model?: string })
    | undefined;
  if (!stored) return structuredClone(DEFAULT_SETTINGS);

  // Migrate the legacy flat { apiKey, model } shape into the Anthropic slot.
  if (stored.apiKey !== undefined && stored.provider === undefined) {
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      anthropic: {
        apiKey: stored.apiKey ?? '',
        model: stored.model ?? DEFAULT_SETTINGS.anthropic.model,
      },
    };
  }

  return {
    provider: stored.provider ?? DEFAULT_SETTINGS.provider,
    anthropic: { ...DEFAULT_SETTINGS.anthropic, ...stored.anthropic },
    openai: { ...DEFAULT_SETTINGS.openai, ...stored.openai },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function hasApiKey(): Promise<boolean> {
  return activeCreds(await getSettings()).apiKey.trim().length > 0;
}

export async function getQuickCopies(): Promise<QuickCopy[]> {
  const stored = (await chrome.storage.local.get(QUICKCOPY_KEY))[QUICKCOPY_KEY] as
    | QuickCopy[]
    | undefined;
  return stored ?? [];
}

export async function saveQuickCopies(items: QuickCopy[]): Promise<void> {
  await chrome.storage.local.set({ [QUICKCOPY_KEY]: items });
}

export function onQuickCopiesChange(cb: (items: QuickCopy[]) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[QUICKCOPY_KEY]) {
      cb((changes[QUICKCOPY_KEY].newValue as QuickCopy[]) ?? []);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// Subscribe to profile changes so multiple surfaces stay in sync.
export function onProfileChange(cb: (profile: CareerProfile) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[PROFILE_KEY]) {
      cb((changes[PROFILE_KEY].newValue as CareerProfile) ?? emptyProfile());
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
