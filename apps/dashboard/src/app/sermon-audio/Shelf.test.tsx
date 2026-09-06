import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { copy } from '@/copy/en';
import type { Shelf as ShelfData, ShelfRow } from '@/server/sermonAudio';
import { expectNoA11yViolations } from '@/test/a11y';

import { Shelf } from './Shelf';

/**
 * The shelf's rendering decisions (frame: `SERMON-AUDIO · the shelf`, redrawn for W4.9
 * slice 1): the format rule leads the page, every row carries exactly one affordance with
 * an accessible name that says WHICH message it opens, and empty means two different
 * things depending on whether a filter is hiding rows.
 */

function row(overrides: Partial<ShelfRow> = {}): ShelfRow {
  return {
    id: 'row-1',
    title: 'The Grace That Finds You',
    speaker: 'Pastor Olayinka',
    series: null,
    youtubeId: 'yt-1',
    audioPath: null,
    artworkPath: null,
    thumbnailUrl: 'https://i.ytimg.com/vi/yt-1/hqdefault.jpg',
    durationSec: 2820,
    publishedAt: '2026-08-09T11:00:00Z',
    kind: 'video',
    ...overrides,
  };
}

function shelf(rows: ShelfRow[], counts?: Partial<ShelfData>): ShelfData {
  return { rows, withAudio: 31, withoutAudio: 3, audioOnly: 2, ...counts };
}

test('the format rule leads the page, before the counts, and says MP3 and 50 MB', async () => {
  const { container } = render(<Shelf shelf={shelf([row()])} filter="all" />);

  const guide = screen.getByText(copy.sermonAudio.guideTitle);
  const counts = screen.getByText(copy.sermonAudio.statsLabel);
  // Order is the decision (frame approved 2026-09-06): the rule is the first thing an
  // uploader reads, not a note halfway down under the numbers.
  expect(
    guide.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(copy.sermonAudio.guide).toMatch(/MP3/);
  expect(copy.sermonAudio.guide).toMatch(/50 MB/);
  expect(copy.sermonAudio.guide).not.toMatch(/150 MB/);
  // No command line for a non-technical uploader (Ayo, at frame approval).
  expect(copy.sermonAudio.guide).not.toMatch(/ffmpeg/);

  // The old red banner is gone: the missing message is a row, not a headline.
  expect(screen.queryByText(/has no audio yet/)).not.toBeInTheDocument();

  await expectNoA11yViolations(container);
});

describe('one affordance per row, named for its message', () => {
  test('a message without audio offers Add audio', () => {
    render(<Shelf shelf={shelf([row()])} filter="all" />);

    expect(screen.getByText(copy.sermonAudio.noAudioPill)).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: copy.sermonAudio.rowAddFor('The Grace That Finds You'),
    });
    expect(link).toHaveAttribute('href', '/sermon-audio/row-1');
    // The YouTube duration is the row's context while there is no audio yet.
    expect(
      screen.getByText(new RegExp(copy.sermonAudio.minutesOnYouTube(47))),
    ).toBeInTheDocument();
  });

  test('a message with audio offers Manage, wearing the green pill', () => {
    render(
      <Shelf
        shelf={shelf([
          row({ id: 'row-2', audioPath: 'aaaa.mp3', durationSec: 2520 }),
        ])}
        filter="all"
      />,
    );

    expect(
      screen.getByText(copy.sermonAudio.audioPill(42)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: copy.sermonAudio.rowManageFor('The Grace That Finds You'),
      }),
    ).toHaveAttribute('href', '/sermon-audio/row-2');
  });

  test('an audio-only message says it was never on YouTube', () => {
    render(
      <Shelf
        shelf={shelf([
          row({
            id: 'row-3',
            youtubeId: null,
            audioPath: 'bbbb.mp3',
            durationSec: 2280,
          }),
        ])}
        filter="all"
      />,
    );

    // Scoped to the row: "Audio only" is also a filter tab and a stat label.
    const card = screen.getByRole('article');
    expect(
      within(card).getByText(copy.sermonAudio.kind.audioOnly),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(new RegExp(copy.sermonAudio.neverOnYouTube)),
    ).toBeInTheDocument();
  });
});

describe('empty is two different facts', () => {
  test('an unfiltered empty shelf is the pre-sync state, door open', async () => {
    const { container } = render(<Shelf shelf={shelf([])} filter="all" />);

    expect(screen.getByText(copy.sermonAudio.emptyTitle)).toBeInTheDocument();
    // Two doors to the same place: the page-level action and the empty state's own.
    expect(
      screen.getAllByRole('link', { name: copy.sermonAudio.addAudioOnly }),
    ).toHaveLength(2);

    await expectNoA11yViolations(container);
  });

  test('a filtered empty view just says the filter is why', () => {
    render(<Shelf shelf={shelf([])} filter="with" />);

    expect(screen.getByText(copy.sermonAudio.filterEmpty)).toBeInTheDocument();
    expect(
      screen.queryByText(copy.sermonAudio.emptyTitle),
    ).not.toBeInTheDocument();
  });
});

test('an outcome in the URL is announced, not just printed', () => {
  render(<Shelf shelf={shelf([row()])} filter="all" outcome="saved" />);

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent(copy.sermonAudio.outcome.saved);
});
