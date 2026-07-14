import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      // crxjs only auto-discovers pages the manifest references; the resume
      // page is opened via chrome.runtime.getURL and needs an explicit input.
      input: { resume: 'src/resume/index.html' },
    },
  },
  // CRXJS needs a stable port for HMR in the extension context.
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
