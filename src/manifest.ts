import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Career Copilot',
  version: '0.1.0',
  description:
    'Drafts tailored cover letters and answers job-application questions from your full career history.',
  // The side panel is the primary surface.
  side_panel: { default_path: 'src/sidepanel/index.html' },
  action: { default_title: 'Open Career Copilot' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  // scripting + host access let us inject the job detector into the active tab
  // on demand (panel open / re-detect) from the side panel. activeTab proved
  // unreliable for panel-initiated injection — the gesture isn't tied to the
  // target tab — so we use broad host access to read job pages on any site.
  permissions: ['storage', 'sidePanel', 'scripting'],
  host_permissions: ['http://*/*', 'https://*/*'],
});
