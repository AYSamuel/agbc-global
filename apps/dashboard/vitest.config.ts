import { defineConfig } from 'vitest/config';

// Node environment: plain unit tests only for now. jsdom + component testing arrive
// when the first interactive dashboard surface does (W2.7).
export default defineConfig({
  test: {},
});
