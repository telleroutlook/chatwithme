import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { Assertions } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> extends Assertions, TestingLibraryMatchers<T, void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
