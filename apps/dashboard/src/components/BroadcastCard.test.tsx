import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BroadcastRow } from '@/server/broadcasts';
import { expectNoA11yViolations } from '@/test/a11y';

import { BroadcastCard } from './BroadcastCard';

function broadcast(overrides: Partial<BroadcastRow> = {}): BroadcastRow {
  return {
    id: 'b-1',
    authorId: 'leader-1',
    authorName: 'Grace Bello',
    scope: 'branch',
    branchId: 'branch-1',
    branchName: 'AGBC Glasgow',
    title: 'Night of Worship moves to 7pm',
    body: 'Friday night now starts at 7pm, same room.',
    bodyDe: null,
    bodyNl: null,
    bodyFr: null,
    link: null,
    status: 'pending_approval',
    reviewNote: null,
    recipientCount: 128,
    approvedByName: null,
    sentAt: null,
    updatedAt: '2026-08-19T10:00:00Z',
    ...overrides,
  };
}

describe('BroadcastCard', () => {
  it('offers the actions to an admin reviewing somebody else’s broadcast', () => {
    render(
      <BroadcastCard
        broadcast={broadcast()}
        viewerId="admin-1"
        canApprove
        actions={<button type="button">Approve and send</button>}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Approve and send' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Another admin has to release/)).toBeNull();
  });

  // The rule this whole item is built around, seen from the screen.
  it('refuses an admin their OWN broadcast, in words rather than a greyed button', () => {
    render(
      <BroadcastCard
        broadcast={broadcast({ authorId: 'admin-1', authorName: 'Pastor AY' })}
        viewerId="admin-1"
        canApprove
        otherApprovers={['Pastor Tolu']}
        actions={<button type="button">Approve and send</button>}
      />,
    );

    expect(
      screen.getByText('Another admin has to release this one'),
    ).toBeInTheDocument();
    // Named, because with two admins that IS the answer to "so who does release it".
    expect(screen.getByText(/Pastor Tolu can\./)).toBeInTheDocument();
    // And the control is GONE rather than disabled: a greyed button with no sentence
    // beside it reads as a bug the reader goes looking for.
    expect(
      screen.queryByRole('button', { name: 'Approve and send' }),
    ).toBeNull();
  });

  it('falls back to a plain refusal when there is nobody else to name', () => {
    render(
      <BroadcastCard
        broadcast={broadcast({ authorId: 'admin-1' })}
        viewerId="admin-1"
        canApprove
        actions={<button type="button">Approve and send</button>}
      />,
    );

    expect(
      screen.getByText('You wrote it, so you cannot approve it.'),
    ).toBeInTheDocument();
  });

  it('shows a leader their own waiting broadcast without an approval control', () => {
    render(
      <BroadcastCard
        broadcast={broadcast()}
        viewerId="leader-1"
        canApprove={false}
      />,
    );

    expect(screen.getByText('You wrote this')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the reason when it was sent back', () => {
    render(
      <BroadcastCard
        broadcast={broadcast({
          status: 'rejected',
          reviewNote: 'Please name the venue.',
        })}
        viewerId="leader-1"
        canApprove={false}
      />,
    );

    expect(screen.getByText('Please name the venue.')).toBeInTheDocument();
  });

  it('names the ministry rather than a branch when the scope is ministry', () => {
    render(
      <BroadcastCard
        broadcast={broadcast({
          scope: 'ministry',
          branchName: null,
          recipientCount: 604,
        })}
        viewerId="admin-1"
        canApprove
      />,
    );

    expect(screen.getByText('Whole ministry')).toBeInTheDocument();
    expect(screen.getByText('604 people')).toBeInTheDocument();
  });

  it('counts one recipient in the singular', () => {
    render(
      <BroadcastCard
        broadcast={broadcast({ recipientCount: 1 })}
        viewerId="admin-1"
        canApprove
      />,
    );
    expect(screen.getByText('1 person')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <BroadcastCard
        broadcast={broadcast()}
        viewerId="admin-1"
        canApprove
        actions={<button type="button">Approve and send</button>}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
