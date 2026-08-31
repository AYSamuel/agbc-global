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
  format: 'part_time',
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
