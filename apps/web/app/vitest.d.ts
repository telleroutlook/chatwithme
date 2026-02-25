import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { Assertions } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> extends Assertions, TestingLibraryMatchers<T, void> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
