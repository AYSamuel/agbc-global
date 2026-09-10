import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';
import type { Registration } from '@/server/registrations';

import { RegistrationCard } from './RegistrationCard';

/**
 * What the row SAYS, which the server probes cannot check (#164).
 *
 * The Server Action is stubbed: it is a network boundary this file has no business crossing,
 * and what the routine actually does is proven in `server/registrations.test.ts` against a
 * real database and in pgTAP `052` beneath it. What is left, and what only a render can
 * answer, is whether the right words and the right controls are on the card.
 *
 * The assertion this file exists for is the negative one: **no amount, in any view**. It is
 * the rule most easily lost to a later edit, because a screen that leaks it looks completely
 * normal.
 */
vi.mock('./actions', () => ({ setAsideAction: vi.fn() }));

const NOW = Date.parse('2026-08-31T12:00:00Z');

const WAITING: Registration = {
  id: 'reg-1',
  fullName: 'Adebayo Ogunlesi',
  email: 'bayo.ogunlesi@example.com',
  courseName: 'Grace Reset',
  courseSlug: 'grace-reset',
  // What the website actually posts: a stable English label with the duration interpolated
  // per course (Desktop/agbc's RegistrationForm.astro). Not `part_time`, which is a key of
  // our own catalogue's `formats` object and has never appeared in this column.
  format: 'Part-time (4 weeks)',
  branch: 'AGBC Lighthouse Berlin',
  createdAt: '2026-08-29T09:00:00Z',
  setAsideAt: null,
  linkedAt: null,
  linkMethod: null,
  member: null,
};

const UNCATALOGUED: Registration = {
  ...WAITING,
  id: 'reg-2',
  fullName: 'G. Achebe',
  email: 'office@achebefamily.example.com',
  courseName: null,
  courseSlug: 'leadership-intensive',
  branch: null,
};

const ASIDE: Registration = {
  ...WAITING,
  id: 'reg-3',
  setAsideAt: '2026-08-31T08:00:00Z',
};

const LINKED: Registration = {
  ...WAITING,
  id: 'reg-4',
  linkedAt: '2026-08-31T10:00:00Z',
  linkMethod: 'leader',
  member: { id: 'member-1', displayName: 'Ade Ogunlesi' },
};

const AUTO_MATCHED: Registration = {
  ...LINKED,
  id: 'reg-5',
  linkMethod: 'email_auto',
};

test('a waiting row shows the four facts and offers both ways forward', async () => {
  const { container } = render(
    <RegistrationCard registration={WAITING} view="waiting" now={NOW} />,
  );

  expect(screen.getByText('Adebayo Ogunlesi')).toBeVisible();
  expect(screen.getByText('bayo.ogunlesi@example.com')).toBeVisible();
  expect(screen.getByText('Grace Reset')).toBeVisible();
  expect(screen.getByText('29 August')).toBeVisible();
  expect(screen.getByText('AGBC Lighthouse Berlin')).toBeVisible();
  // Shown as the website wrote it. There is nothing to map (see `format.ts`).
  expect(screen.getByText('Part-time (4 weeks)')).toBeVisible();

  expect(
    screen.getByRole('link', { name: 'Find their account' }),
  ).toHaveAttribute('href', '/academy/reg-1/link');
  expect(screen.getByRole('button', { name: 'No app account' })).toBeVisible();

  await expectNoA11yViolations(container);
});

test('the amount is nowhere on any of the three views', () => {
  // `amount` is not in the loader's column list, so it cannot be in the props; this is the
  // assertion that keeps a future edit from adding it back to the type and then to a row.
  for (const view of ['waiting', 'aside', 'linked'] as const) {
    const registration =
      view === 'waiting' ? WAITING : view === 'aside' ? ASIDE : LINKED;
    const { container, unmount } = render(
      <RegistrationCard registration={registration} view={view} now={NOW} />,
    );

    expect(container.textContent).not.toMatch(/£|\$|€|\d+\.\d{2}/);
    unmount();
  }
});

test('a row whose course is not ours says so, and names no branch it does not have', () => {
  render(
    <RegistrationCard registration={UNCATALOGUED} view="waiting" now={NOW} />,
  );

  // The website sells things our catalogue does not carry, so the slug is the only name this
  // row has. Saying that out loud is what stops it reading as a bug.
  expect(screen.getByText('leadership-intensive')).toBeVisible();
  expect(screen.getByText('Not a course in our catalogue')).toBeVisible();
  expect(screen.getByText('No branch given')).toBeVisible();
});

test('a set-aside row says WHEN and never who, and offers the undo', async () => {
  const { container } = render(
    <RegistrationCard registration={ASIDE} view="aside" now={NOW} />,
  );

  expect(screen.getByText('Set aside 31 August')).toBeVisible();
  expect(screen.getByText('Registered 29 August')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Bring it back' })).toBeVisible();

  // `set_aside_by` is outside the column grant, so there is no name to draw even if a
  // future edit wanted one.
  expect(container.textContent).not.toMatch(/by [A-Z]/);

  await expectNoA11yViolations(container);
});

test('a linked row names both sides and opens the confirm, not the act', async () => {
  const { container } = render(
    <RegistrationCard registration={LINKED} view="linked" now={NOW} />,
  );

  expect(screen.getByText('Linked by hand')).toBeVisible();
  expect(screen.getByText('Adebayo Ogunlesi')).toBeVisible();
  expect(screen.getByText('Ade Ogunlesi')).toBeVisible();

  // A LINK to the confirm rather than a destructive button in the list: the VERSES rule, and
  // the person being detached is not on screen here to see.
  const unlink = screen.getByRole('link', { name: 'Unlink' });
  expect(unlink).toHaveAttribute('href', '/academy/reg-4/unlink');
  expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();

  await expectNoA11yViolations(container);
});

test('unlink is offered on an auto-matched row too', () => {
  // Load-bearing rather than lax: a wrong hand-link PROVES the address, so the next payment
  // attaches to the wrong member automatically, as `email_auto`. If unlink were restricted
  // to rows a human linked, the one error this tool can cause would be the one it cannot
  // repair.
  render(
    <RegistrationCard registration={AUTO_MATCHED} view="linked" now={NOW} />,
  );

  expect(screen.getByText('Matched on the address')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Unlink' })).toHaveAttribute(
    'href',
    '/academy/reg-5/unlink',
  );
});

test('a date from another year carries its year', () => {
  // The queue is exactly where old rows accumulate (the permanent residents this feature
  // gives a way to set aside), so "3 July" on a two-year-old payment would read as recent.
  render(
    <RegistrationCard
      registration={{ ...WAITING, createdAt: '2024-07-03T09:00:00Z' }}
      view="waiting"
      now={NOW}
    />,
  );

  expect(screen.getByText('3 July 2024')).toBeVisible();
});

/**
 * THE DATE SAYS WHICH DATE IT IS.
 *
 * The same corner of the same card means "registered" on the waiting view and "linked" on the
 * linked one, and it was drawn bare on both, so one row read 26 August under Waiting and 31
 * August under Linked with nothing to say why. Asserted from both sides of the same row,
 * because a single-view assertion cannot see that the meaning changed.
 */
test('the linked date says it is the linked date, and the waiting one is untouched', () => {
  const { unmount } = render(
    <RegistrationCard registration={LINKED} view="linked" now={NOW} />,
  );
  expect(screen.getByText('Linked 31 August')).toBeVisible();
  // The registration date is 29 August; it must not be what this view shows.
  expect(screen.queryByText('29 August')).toBeNull();
  unmount();

  render(<RegistrationCard registration={LINKED} view="waiting" now={NOW} />);
  expect(screen.getByText('29 August')).toBeVisible();
});

/**
 * The member's own mark, on the one row where a member is actually known.
 *
 * The card withheld it everywhere on an argument that only covers the unmatched views: a
 * waiting row must not assert an account the whole screen is asking about. A linked row HAS
 * one, and the approved frame always drew the disc there.
 *
 * `aria-hidden` is asserted with it: the name it abbreviates is right beside it, so
 * announcing "AO" first would read the person twice.
 */
test('a linked row carries the member’s initials, and an unmatched row carries none', () => {
  const { unmount } = render(
    <RegistrationCard registration={LINKED} view="linked" now={NOW} />,
  );
  const disc = screen.getByText('AO');
  expect(disc).toBeVisible();
  expect(disc).toHaveAttribute('aria-hidden', 'true');
  unmount();

  // The payer on the waiting row is "Adebayo Ogunlesi", whose initials are ALSO "AO", so this
  // is the assertion that matters: not merely that the member's disc is absent, but that the
  // card draws no disc for the payer either. An initials disc is the app's mark of a member,
  // and the whole premise of this view is that nobody knows who this payer is.
  render(<RegistrationCard registration={WAITING} view="waiting" now={NOW} />);
  expect(screen.queryByText('AO')).toBeNull();
});
