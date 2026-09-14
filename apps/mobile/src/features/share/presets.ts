import type { BranchDetail } from '@/features/church/queries';
import { eventImageUrl } from '@/features/events/image';
import {
  eventDateParts,
  formatEventDay,
  formatEventTime,
} from '@/features/events/format';
import type { EventListItem } from '@/features/events/queries';
import {
  branchShareText,
  eventShareText,
  sermonShareText,
  testimonyShareText,
} from '@/features/family/share';
import type {
  PrayerFeedItem,
  TestimonyFeedItem,
} from '@/features/family/queries';
import { joinMeta } from '@/features/family/format';
import { sermonArtworkUrl } from '@/features/watch/artwork';
import type { SermonSummary } from '@/features/watch/queries';

import type {
  BranchShareContent,
  BranchShareRow,
  EventShareContent,
  PrayerShareContent,
  SermonShareContent,
  TestimonyShareContent,
} from './content';

/**
 * What each Family surface hands the share sheet (W4.15 slice 2): the card's facts and
 * the words the text buttons send. Three feed renderers and two detail screens share a
 * testimony, so the mapping lives once here rather than five times at the call sites,
 * and the WORDS stay exactly what those sites sent before this item: the text route is
 * the old behaviour, kept.
 */
export function testimonyShare(
  item: Pick<TestimonyFeedItem, 'id' | 'body' | 'author_name' | 'image_path'>,
  branchName: string | null,
  appName: string,
): { content: TestimonyShareContent; fallbackText: string } {
  return {
    content: {
      kind: 'testimony',
      id: item.id,
      body: item.body,
      authorName: item.author_name,
      branchName,
      photoPath: item.image_path,
    },
    fallbackText: testimonyShareText(
      item.body,
      joinMeta([item.author_name, branchName]),
      appName,
    ),
  };
}

export function prayerShare(
  prayer: Pick<PrayerFeedItem, 'id' | 'body' | 'author_name' | 'is_anonymous'>,
  branchName: string | null,
  appName: string,
): { content: PrayerShareContent; fallbackText: string } {
  return {
    content: {
      kind: 'prayer',
      id: prayer.id,
      body: prayer.body,
      authorName: prayer.author_name,
      branchName,
      anonymous: prayer.is_anonymous,
    },
    // The words PRAYER-DETAIL has always sent: the request and its branch, never a name.
    fallbackText: testimonyShareText(prayer.body, branchName, appName),
  };
}

/**
 * The event (W4.15 slice 3). The words are formatted HERE, in the sharer's locale, with
 * the formatters EVENT-DETAIL already runs for its own eyebrow, so the card and the
 * screen can never disagree about what day it is.
 */
export function eventShare(
  event: Pick<
    EventListItem,
    'id' | 'title' | 'starts_at_local' | 'location' | 'image_path'
  >,
  branchName: string | null,
  locale: string,
  appName: string,
): { content: EventShareContent; fallbackText: string } {
  const parts = eventDateParts(event.starts_at_local, locale);
  const day = formatEventDay(event.starts_at_local, locale);
  const time = formatEventTime(event.starts_at_local, locale);
  return {
    content: {
      kind: 'event',
      id: event.id,
      title: event.title,
      day: parts?.day ?? '',
      month: parts?.month ?? '',
      when: `${day} · ${time}`,
      place: joinMeta([branchName, event.location || null]) || null,
      imageUrl: eventImageUrl(event.image_path),
    },
    fallbackText: eventShareText(
      event.title,
      day,
      time,
      event.location || null,
      appName,
    ),
  };
}

/**
 * The message (W4.15 slice 3). `durationLabel` is the player's own "38 min", already
 * translated by the caller; `dateLine` is what the player's eyebrow shows when a message
 * has no series (the published date), so the `.b` line reads "38 min · Grace Series" or
 * "38 min · 12 Sep 2026". The frame drew a branch name there, and a message has none
 * in the data (`sermons` is not branch-scoped), so the line carries what the player
 * carries.
 */
export function sermonShare(
  sermon: Pick<
    SermonSummary,
    | 'id'
    | 'title'
    | 'speaker'
    | 'youtube_id'
    | 'artwork_path'
    | 'thumbnail_url'
    | 'series'
  >,
  durationLabel: string | null,
  dateLine: string,
): { content: SermonShareContent; fallbackText: string } {
  return {
    content: {
      kind: 'sermon',
      id: sermon.id,
      title: sermon.title,
      speaker: sermon.speaker,
      meta: joinMeta([durationLabel, sermon.series ?? dateLine]) || null,
      imageUrl: sermonArtworkUrl(sermon),
    },
    fallbackText: sermonShareText(sermon.title, sermon.youtube_id),
  };
}

/**
 * The branch (W4.15 slice 3). The rows are the branch's own `service_times` strings and
 * its address, untranslated: `02` stores what the branch wrote. The Sunday line is bold
 * because it is the one a stranger came for.
 */
export function branchShare(
  branch: Pick<
    BranchDetail,
    'id' | 'name' | 'city' | 'country' | 'service_times' | 'address'
  >,
  appName: string,
): { content: BranchShareContent; fallbackText: string } {
  const sunday = branch.service_times.sunday ?? null;
  const address = [branch.address?.line1, branch.address?.line2]
    .filter(Boolean)
    .join(', ');
  const rows: BranchShareRow[] = [];
  if (sunday) rows.push({ icon: 'clock', text: sunday, strong: true });
  if (branch.service_times.midweek) {
    rows.push({
      icon: 'clock',
      text: branch.service_times.midweek,
      strong: false,
    });
  }
  rows.push({
    icon: 'pin',
    text: address === '' ? `${branch.city}, ${branch.country}` : address,
    strong: false,
  });
  return {
    content: { kind: 'branch', id: branch.id, name: branch.name, rows },
    fallbackText: branchShareText(
      branch.name,
      branch.city,
      branch.country,
      sunday,
      appName,
    ),
  };
}
