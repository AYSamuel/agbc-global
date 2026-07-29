import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL only auto-cleans when Vitest globals are on; they are not (explicit imports
// everywhere else in this repo), so unmount between tests or the next render finds
// two copies of every element.
afterEach(() => {
  cleanup();
});
