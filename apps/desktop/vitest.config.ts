import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Unit-test config for the desktop *renderer* (React in jsdom). The main/preload processes are
 * validated by the electron-vite build + typecheck; a full Electron runtime smoke is a manual/CI
 * concern (see docs/development/environment-setup.md).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
