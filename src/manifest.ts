import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Career Copilot',
  version: '0.1.0',
  // chrome.sidePanel requires 114; everything else is older.
  minimum_chrome_version: '114',
  description:
    'Drafts tailored cover letters and answers job-application questions from your full career history.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  // The side panel is the primary surface.
  side_panel: { default_path: 'src/sidepanel/index.html' },
  action: { default_title: 'Open Career Copilot', default_icon: 'icons/icon-32.png' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  // scripting + host access let us inject the job detector into the active tab
  // on demand from the side panel. Host access is OPTIONAL: nothing is granted
  // at install; the "Get Job" button requests it on first use (activeTab proved
  // unreliable for panel-initiated injection — the gesture isn't tied to the
  // target tab — so once granted we use broad access to read job pages).
  permissions: ['storage', 'sidePanel', 'scripting'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
});
