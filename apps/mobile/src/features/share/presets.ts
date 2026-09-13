import type {
  PrayerFeedItem,
  TestimonyFeedItem,
} from '@/features/family/queries';
import { joinMeta } from '@/features/family/format';
import { testimonyShareText } from '@/features/family/share';

import type { PrayerShareContent, TestimonyShareContent } from './content';

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
