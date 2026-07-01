import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the crx plugin there expects a real
// extension build and has no business running during unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
