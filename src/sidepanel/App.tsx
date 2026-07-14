import { useEffect, useState } from 'react';
import { CareerProfile, Settings, activeCreds } from '../lib/types';
import { getProfile, getSettings, onProfileChange, updateProfile } from '../lib/storage';
import SettingsView from './Settings';
import ProfileSetup from './ProfileSetup';
import Generator from './Generator';
import QuickCopyView from './QuickCopy';
import ResumePanel from './ResumePanel';

type View = 'generate' | 'resume' | 'profile' | 'quickcopy' | 'settings';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [view, setView] = useState<View>('generate');
  // Profile-view work state lives up here so it survives view switches: an
  // in-flight ingest keeps its busy flag (preventing a second concurrent
  // model call after remount) and unsaved brain-dump text isn't discarded.
  const [profileBusy, setProfileBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [dumpDraft, setDumpDraft] = useState<string | null>(null);
  // The Resume view appears only while a generated resume session exists.
  const [hasResume, setHasResume] = useState(false);

  useEffect(() => {
    chrome.storage.session
      .get('pendingResume')
      .then((r) => setHasResume(r.pendingResume !== undefined));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.pendingResume) {
        setHasResume(changes.pendingResume.newValue !== undefined);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings());
      let p = await getProfile();
      // One-time migration: the standalone notes list was retired in 0.2.0 —
      // fold any stored notes into the brain-dump narrative so nothing is lost
      // and everything stays visible/editable under Profile → Brain-dump.
      if (p.notes.length) {
        p = await updateProfile((latest) => ({
          ...latest,
          narrative: [latest.narrative.trim(), ...latest.notes.map((n) => n.content)]
            .filter(Boolean)
            .join('\n\n'),
          notes: [],
        }));
      }
      setProfile(p);
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
  } else if (view === 'resume' && hasResume) {
    body = <ResumePanel profile={profile} settings={settings} />;
  } else if (view === 'quickcopy') {
    body = <QuickCopyView />;
  } else if (view === 'profile' || needsProfile) {
    body = (
      <ProfileSetup
        profile={profile}
        settings={settings}
        onChange={setProfile}
        busy={profileBusy}
        onBusyChange={setProfileBusy}
        docBusy={docBusy}
        onDocBusyChange={setDocBusy}
        dumpDraft={dumpDraft}
        onDumpDraftChange={setDumpDraft}
      />
    );
  } else {
    body = <Generator profile={profile} settings={settings} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center border-b border-slate-200 bg-white px-4 py-3">
        {needsKey ? (
          // Nav is hidden until a key exists — show the brand instead of an
          // empty strip.
          <h1 className="text-sm font-bold tracking-tight">Career Copilot</h1>
        ) : (
          // gap-0.5 + px-1.5 buttons: measured to keep all five buttons
          // (incl. the conditional Resume tab) on one line at 360px.
          <nav aria-label="Career Copilot" className="flex w-full items-center gap-0.5 text-xs">
            <NavButton active={view === 'generate' && !needsProfile} onClick={() => setView('generate')} disabled={needsProfile}>
              Generate
            </NavButton>
            {hasResume && (
              <NavButton active={view === 'resume'} onClick={() => setView('resume')}>
                Resume
              </NavButton>
            )}
            <NavButton active={view === 'profile' || needsProfile} onClick={() => setView('profile')}>
              Profile
            </NavButton>
            <NavButton active={view === 'quickcopy'} onClick={() => setView('quickcopy')}>
              Quick Copy
            </NavButton>
            <span className="ml-auto">
              <NavButton active={view === 'settings'} onClick={() => setView('settings')}>
                Settings
              </NavButton>
            </span>
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
      aria-current={active ? 'page' : undefined}
      className={`whitespace-nowrap rounded-md px-1.5 py-1 font-medium ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}
