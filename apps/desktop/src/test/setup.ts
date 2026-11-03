import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

// Keep the ApiStatusIndicator from opening a real socket during unit tests.
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error('offline (test)')),
) as unknown as typeof fetch;

// Vitest does not enable RTL auto-cleanup without globals; unmount between tests explicitly.
afterEach(() => cleanup());
