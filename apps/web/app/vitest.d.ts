import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { Assertions } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> extends Assertions, TestingLibraryMatchers<T, void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}

// Global type declarations
declare global {
  interface Window {
    Sentry?: {
      init: (config: {
        dsn?: string;
        environment?: string;
        release?: string;
        tracesSampleRate?: number;
      }) => void;
      captureException: (
        error: Error,
        context?: { extra?: unknown; tags?: Record<string, unknown> }
      ) => void;
    };
  }
}

export {};
