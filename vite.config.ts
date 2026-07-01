import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // CRXJS needs a stable port for HMR in the extension context.
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
