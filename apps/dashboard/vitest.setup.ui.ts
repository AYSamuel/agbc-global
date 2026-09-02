import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * `findBy*` waits on ITS OWN clock, not Vitest's.
 *
 * Both projects set `testTimeout: 20_000`, which says nothing about RTL: every `findBy*`
 * and `waitFor` gives up after its own default of 1000ms. That is the mechanism behind
 * #184, and it took until 2026-09-02 to see it, because the failure does not look like a
 * timeout at all. It reads "Unable to find an element with the text ...", which is exactly
 * what a wrong assertion looks like, so two real sightings were filed as mysteries.
 *
 * Five seconds, and it weakens nothing: `findBy*` polls and returns the instant the element
 * appears, so an unloaded run is exactly as fast as before and a test that is genuinely
 * wrong still fails, five seconds later. What it buys is a loaded runner (the full
 * workspace suite, or CI) no longer reporting "this element does not exist" about an
 * element that was merely late.
 */
configure({ asyncUtilTimeout: 5_000 });

// RTL only auto-cleans when Vitest globals are on; they are not (explicit imports
// everywhere else in this repo), so unmount between tests or the next render finds
// two copies of every element.
afterEach(() => {
  cleanup();
});
