import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Two projects because the two halves of this app need different globals, and running
// server code inside jsdom is how you end up debugging a browser shim instead of your
// own bug: `server` runs the Supabase clients, authorize() and the route handlers in
// plain Node, `ui` renders components in jsdom. Split by file extension, so nothing has
// to be remembered per file: .test.ts is server, .test.tsx is UI.
//
// The server project talks to the REAL local Supabase stack (src/test/localStack.ts).
// Mocking Supabase Auth here would only prove the mock: the whole point of these tests
// is that authorize() meets real JWTs, real aal claims and real profiles rows.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          globalSetup: ['./vitest.globalSetup.server.ts'],
          // Minting users and signing them in costs real round trips to the local
          // stack; the default 5s is tight once a file sets up several callers.
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          globalSetup: ['./vitest.globalSetup.server.ts'],
          setupFiles: ['./vitest.setup.ui.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
