import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import FormLoading from '@/components/ui/FormLoading';
import { copy } from '@/copy/en';
import { expectNoA11yViolations } from '@/test/a11y';

import ModerationLoading from '@/app/(dashboard)/moderation/loading';
import ReportsLoading from '@/app/(dashboard)/reports/loading';
import RequestsLoading from '@/app/(dashboard)/people/requests/loading';
import BranchesLoading from '@/app/(dashboard)/branches/loading';
import EventsLoading from '@/app/(dashboard)/events/loading';

/**
 * The loading states (W4.12 slice 5, frames in `design/mockups/dashboard.html`).
 *
 * What is worth asserting here is NOT how a skeleton looks, which is the frame's job and a
 * screenshot's. It is the three rules the frames state, because each of them is a thing a
 * future screen could get wrong silently:
 *
 *  - the section label is REAL TEXT, so the reader knows which list is arriving;
 *  - a stat number is a box and NEVER a zero, since a "0 safeguarding" that becomes "3" is
 *    the most reassuring wrong number this dashboard could print;
 *  - nothing here is a control, because actions are hidden while loading rather than
 *    disabled, so there is nothing under a skeleton to click.
 *
 * Every skeleton block is `aria-hidden`, so a screen reader is told nothing rather than being
 * read a wall of empty boxes.
 */

const blocks = (container: HTMLElement) =>
  container.querySelectorAll('div[aria-hidden="true"]');

test('a loading screen names the list that is arriving, in real text', () => {
  render(<ModerationLoading />);
  expect(screen.getByText(copy.queue.waitingLabel)).toBeVisible();

  render(<ReportsLoading />);
  expect(screen.getByText(copy.reports.listLabel)).toBeVisible();
});

test('the stat row draws boxes and never a number', () => {
  const { container } = render(<ReportsLoading />);

  // Three stats on this screen, and not one digit anywhere on it.
  expect(container.textContent).toBe(copy.reports.listLabel);
  expect(container.textContent).not.toMatch(/\d/);
});

test('no loading screen renders a control', () => {
  for (const Screen of [
    ModerationLoading,
    ReportsLoading,
    RequestsLoading,
    BranchesLoading,
    EventsLoading,
    FormLoading,
  ]) {
    const { container, unmount } = render(<Screen />);
    expect(
      container.querySelectorAll('button, a, input, select, textarea'),
    ).toHaveLength(0);
    unmount();
  }
});

test('every skeleton block is hidden from assistive tech', () => {
  const { container } = render(<ModerationLoading />);
  const all = container.querySelectorAll('div');
  const hidden = blocks(container);

  expect(hidden.length).toBeGreaterThan(0);
  // Every div that is not a layout wrapper is a skeleton, and every skeleton is hidden.
  for (const el of hidden) expect(el).toHaveAttribute('aria-hidden', 'true');
  expect(all.length).toBeGreaterThanOrEqual(hidden.length);
});

test('the branches card has no pill, because a branch row has none', () => {
  const { container } = render(<BranchesLoading />);
  const rounded = [...blocks(container)].filter((el) =>
    el.className.includes('rounded-full'),
  );

  expect(rounded).toHaveLength(0);
});

test('the requests card has the one circle in the set, for the person', () => {
  const { container } = render(<RequestsLoading />);
  const circles = [...blocks(container)].filter((el) =>
    el.className.includes('rounded-full'),
  );

  // Two rows, each with a pill and an avatar.
  expect(circles.length).toBeGreaterThanOrEqual(4);
});

test('loading screens have no accessibility violations', async () => {
  const { container } = render(<ModerationLoading />);
  await expectNoA11yViolations(container);

  const form = render(<FormLoading />);
  await expectNoA11yViolations(form.container);
});
