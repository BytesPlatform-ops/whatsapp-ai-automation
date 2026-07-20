import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Frontend unit/component tests for Pixie Lab (Content Creator wizard, API client,
// wizard-state logic). jsdom + React Testing Library. Kept scoped to the wizard
// surface so it doesn't try to run the whole app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/pixie-lab/**/*.test.{ts,tsx}',
      'components/pixie-lab/content/**/*.test.{ts,tsx}',
    ],
    css: false,
  },
});
