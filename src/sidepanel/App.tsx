import { useEffect, useState } from 'react';
import { CareerProfile, Settings, activeCreds } from '../lib/types';
import { getProfile, getSettings, onProfileChange } from '../lib/storage';
import SettingsView from './Settings';
import ProfileSetup from './ProfileSetup';
import Generator from './Generator';
import QuickCopyView from './QuickCopy';

type View = 'generate' | 'profile' | 'quickcopy' | 'settings';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [view, setView] = useState<View>('generate');

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      setProfile(await getProfile());
    })();
    return onProfileChange(setProfile);
  }, []);

  if (!settings || !profile) {
    return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  }

  const needsKey = activeCreds(settings).apiKey.trim().length === 0;
  const needsProfile = profile.experience.length === 0 && profile.narrative.trim().length === 0;

  // Decide what to actually render: hard gates override the chosen tab.
  let body: JSX.Element;
  if (needsKey) {
    body = <SettingsView settings={settings} onSaved={setSettings} />;
  } else if (view === 'settings') {
    body = <SettingsView settings={settings} onSaved={setSettings} />;
  } else if (view === 'quickcopy') {
    body = <QuickCopyView />;
  } else if (view === 'profile' || needsProfile) {
    body = <ProfileSetup profile={profile} settings={settings} onChange={setProfile} />;
  } else {
    body = <Generator profile={profile} settings={settings} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-sm font-bold tracking-tight">Career Copilot</h1>
        {!needsKey && (
          <nav className="flex gap-1 text-xs">
            <NavButton active={view === 'generate' && !needsProfile} onClick={() => setView('generate')} disabled={needsProfile}>
              Generate
            </NavButton>
            <NavButton active={view === 'profile' || needsProfile} onClick={() => setView('profile')}>
              Profile
            </NavButton>
            <NavButton active={view === 'quickcopy'} onClick={() => setView('quickcopy')}>
              Quick Copy
            </NavButton>
            <NavButton active={view === 'settings'} onClick={() => setView('settings')}>
              Settings
            </NavButton>
          </nav>
        )}
      </header>

      {needsProfile && !needsKey && view === 'generate' && (
        <div className="bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Set up your career profile first — it's what every draft is built from.
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4">{body}</main>
    </div>
  );
}

function NavButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 font-medium ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}
