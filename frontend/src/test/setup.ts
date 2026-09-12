// Global test setup: registers jest-dom matchers on Vitest's `expect`
// and augments its types (e.g. `toBeInTheDocument`).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest runs without global test hooks, so React Testing Library's automatic
// cleanup is not registered. Unmount rendered trees after each test to keep the
// shared jsdom document isolated between tests.
afterEach(() => {
  cleanup();
});
