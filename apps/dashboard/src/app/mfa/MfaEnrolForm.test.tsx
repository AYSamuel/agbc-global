import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { copy } from '@/copy/en';

import { MfaEnrolForm } from './MfaEnrolForm';

/**
 * The enrolment QR has to be SCANNABLE, which is not the same as present (2026-09-12).
 *
 * This screen passed every check it had for six weeks while its QR could not be read by
 * Google Authenticator at three separate enrolments, because nothing here asserted the one
 * property that matters. Supabase returns the code as an SVG of black modules with NO
 * background of its own, so it takes the colour underneath it, and on this dashboard's dark
 * card that was black on dark navy. A real decoder, given the rendered pixels, failed on the
 * dark card and succeeded on white at the same size.
 *
 * So the assertion below is deliberately about the BACKGROUND rather than about the image
 * existing. It is shallow, and it is the shape of the actual defect: the fix is one class,
 * and the way it regresses is somebody tidying a stray-looking colour back to a themed one.
 * `scan-bg` is fixed light in both themes for that reason, and the token carries the why.
 */
const enroll = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      mfa: {
        listFactors: () => Promise.resolve({ data: { all: [] }, error: null }),
        unenroll: () => Promise.resolve({ error: null }),
        enroll: enroll as unknown,
      },
    },
  }),
}));

enroll.mockResolvedValue({
  data: {
    id: 'factor-1',
    totp: {
      // Shape only. A real one is a 360 KB SVG of black rects on transparency.
      qr_code:
        'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
      secret: 'JBSWY3DPEHPK3PXP',
    },
  },
  error: null,
});

test('the QR sits on a fixed light surface, never a themed one', async () => {
  render(<MfaEnrolForm next="/" />);

  const qr = await waitFor(() => screen.getByAltText(copy.mfa.qrAlt));

  // The bug, stated as an assertion: a themed card colour here is dark in dark mode, and a
  // scanner cannot read black on dark navy.
  expect(qr.className).toContain('bg-scan-bg');
  expect(qr.className).not.toContain('bg-card');

  // The quiet zone the QR spec wants. A code drawn flush to its edge is one many scanners
  // refuse even when the contrast is right.
  expect(qr.className).toMatch(/\bp-\d/);
});

test('the typed setup key is offered too, because the QR is not always usable', async () => {
  render(<MfaEnrolForm next="/" />);

  // The manual key is what every enrolment on this project has actually used, and it is the
  // only path for a reader who cannot see, or whose authenticator is on this same device.
  expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeVisible();
});
