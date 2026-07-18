import { expect, test } from 'vitest';

// First-wire test: proves the Vitest harness runs from the workspace root (W0.5).
// Real tests arrive with the first dashboard logic (W2.7).
test('vitest harness runs', () => {
  expect(true).toBe(true);
});
