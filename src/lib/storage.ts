import { CareerProfile, QuickCopy, Settings, activeCreds, emptyProfile } from './types';

// Thin async wrappers over chrome.storage.local. Everything lives on the user's
// machine — the API key and the career profile never leave the browser except
// in direct calls to the Anthropic API.

const PROFILE_KEY = 'careerProfile';
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
