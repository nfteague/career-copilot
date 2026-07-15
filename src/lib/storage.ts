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
  openai: { apiKey: '', model: 'gpt-5.6-sol' },
};

// OpenAI models removed from the picker roll forward to the closest current
// equivalent on read, so a stored choice from an older build never leaves the
// Settings dropdown blank (both retired options were the cheaper tier).
const RETIRED_OPENAI_MODELS: Record<string, string> = {
  'gpt-4.1': 'gpt-5.6-terra',
  'gpt-5.4-mini': 'gpt-5.6-terra',
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

// Version history, Google-Docs style: a bounded, newest-first list of profile
// versions recorded when qualifying actions happen (import, resume upload,
// brain-dump structuring), plus a pointer to the version the live profile is
// based on ("Current"). Restoring moves the pointer; it never mints entries —
// except that unsaved manual edits are checkpointed once before being
// replaced, which cannot compound (after a restore the live profile equals a
// version, so the next restore checkpoints nothing).
const BACKUPS_KEY = 'careerProfileBackups';
const MAX_BACKUPS = 20;

export type BackupReason =
  | 'resume-upload'
  | 'brain-dump'
  | 'import'
  | 'clear'
  | 'edits'
  | 'restore' // legacy entries from the pre-history model
  | 'unknown';

export interface ProfileBackup {
  id: string;
  savedAt: string; // ISO; '' when unknown (a migrated pre-list backup)
  reason: BackupReason;
  profile: CareerProfile;
}

export interface BackupHistory {
  versions: ProfileBackup[]; // newest first
  currentId: string | null; // the version the live profile is based on
}

const normalizeStored = (p: CareerProfile): CareerProfile => ({ ...emptyProfile(), ...p });
// Content equality, ignoring the save timestamp.
const sameProfile = (a: CareerProfile, b: CareerProfile): boolean =>
  JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });

// Read + normalize the history. Older builds stored a bare array (no Current
// pointer) or a single snapshot slot; blank snapshots are filtered out.
export async function getBackupHistory(): Promise<BackupHistory> {
  const stored = await chrome.storage.local.get([BACKUPS_KEY, BACKUP_KEY]);
  const raw = stored[BACKUPS_KEY] as BackupHistory | ProfileBackup[] | undefined;
  const history: BackupHistory = Array.isArray(raw)
    ? { versions: raw, currentId: null }
    : (raw ?? { versions: [], currentId: null });
  history.versions = history.versions.filter(
    (b) => !isProfileEmpty(normalizeStored(b.profile)),
  );

  const legacy = stored[BACKUP_KEY] as CareerProfile | undefined;
  if (legacy) {
    // Fold the legacy slot in only when the history has never been written —
    // idempotent when two panel windows race (the loser just clears the slot).
    if (stored[BACKUPS_KEY] === undefined) {
      const entry: ProfileBackup = {
        id: crypto.randomUUID(),
        savedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : '',
        reason: 'unknown',
        profile: normalizeStored(legacy),
      };
      history.versions = [...history.versions, entry]
        .filter((b) => !isProfileEmpty(normalizeStored(b.profile)))
        .slice(0, MAX_BACKUPS);
      await chrome.storage.local.set({ [BACKUPS_KEY]: history });
    }
    await chrome.storage.local.remove(BACKUP_KEY);
  }
  return history;
}

export async function hasProfileBackup(): Promise<boolean> {
  return (await getBackupHistory()).versions.length > 0;
}

// Record the live profile as the newest version and point Current at it.
// Skips blanks and exact duplicates of the current version, so re-running an
// action that changed nothing (or checkpointing un-drifted state) is a no-op.
export async function recordVersion(reason: BackupReason): Promise<boolean> {
  const live = await getProfile();
  if (isProfileEmpty(live)) return false;
  const history = await getBackupHistory();
  const current = history.versions.find((v) => v.id === history.currentId);
  if (current && sameProfile(normalizeStored(current.profile), live)) return false;
  const entry: ProfileBackup = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    reason,
    profile: live,
  };
  await chrome.storage.local.set({
    [BACKUPS_KEY]: {
      versions: [entry, ...history.versions].slice(0, MAX_BACKUPS),
      currentId: entry.id,
    } satisfies BackupHistory,
  });
  return true;
}

// Point Current somewhere else (null = the live profile matches no version,
// e.g. right after clearing all data).
export async function setCurrentVersionId(id: string | null): Promise<void> {
  const history = await getBackupHistory();
  await chrome.storage.local.set({ [BACKUPS_KEY]: { ...history, currentId: id } });
}

// Apply the selected version and move Current to it. Unsaved manual edits are
// checkpointed once (reason 'edits') before being replaced.
export async function restoreVersion(id: string): Promise<CareerProfile | null> {
  const history = await getBackupHistory();
  const target = history.versions.find((v) => v.id === id);
  if (!target) return null;

  const live = await getProfile();
  const current = history.versions.find((v) => v.id === history.currentId);
  let versions = history.versions;
  // Checkpoint drift — unless the live profile already matches the current
  // version, or the target itself (no pointer yet on migrated histories).
  if (
    !isProfileEmpty(live) &&
    !(current && sameProfile(normalizeStored(current.profile), live)) &&
    !sameProfile(normalizeStored(target.profile), live)
  ) {
    versions = [
      {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        reason: 'edits' as const,
        profile: live,
      },
      ...versions,
    ].slice(0, MAX_BACKUPS);
    // The cap must never evict the version being restored.
    if (!versions.some((v) => v.id === id)) versions[versions.length - 1] = target;
  }

  const restored = normalizeStored(target.profile);
  await chrome.storage.local.set({
    [PROFILE_KEY]: restored,
    [BACKUPS_KEY]: { versions, currentId: id } satisfies BackupHistory,
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

  const openai = { ...DEFAULT_SETTINGS.openai, ...stored.openai };
  openai.model = RETIRED_OPENAI_MODELS[openai.model] ?? openai.model;
  return {
    provider: stored.provider ?? DEFAULT_SETTINGS.provider,
    anthropic: { ...DEFAULT_SETTINGS.anthropic, ...stored.anthropic },
    openai,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function hasApiKey(): Promise<boolean> {
  return activeCreds(await getSettings()).apiKey.trim().length > 0;
}

// The template last chosen on the tailored-resume page ('' = never chosen;
// the page defaults to the user's own extracted style when one exists).
const RESUME_TEMPLATE_KEY = 'resumeTemplate';

export async function getResumeTemplateChoice(): Promise<string> {
  return (
    ((await chrome.storage.local.get(RESUME_TEMPLATE_KEY))[RESUME_TEMPLATE_KEY] as
      | string
      | undefined) ?? ''
  );
}

export async function saveResumeTemplateChoice(id: string): Promise<void> {
  await chrome.storage.local.set({ [RESUME_TEMPLATE_KEY]: id });
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
