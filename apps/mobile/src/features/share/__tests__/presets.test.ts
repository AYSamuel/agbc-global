import {
  branchShare,
  eventShare,
  prayerShare,
  sermonShare,
  testimonyShare,
} from '../presets';

/**
 * The mapping five call sites share (W4.15 slice 2). What matters here is that the WORDS
 * are exactly what those sites sent before this item, because the text route is the old
 * behaviour kept, and that the card gets facts rather than presentation.
 */

describe('testimonyShare', () => {
  const item = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    body: 'God provided a job after 8 months of waiting.',
    author_name: 'Sarah O.',
    image_path: 'members/sarah/1.jpg',
  };

  it('hands the card the facts and the text route its old words', () => {
    const share = testimonyShare(item, 'AGBC Glasgow', 'AGBC Global');

    expect(share.content).toEqual({
      kind: 'testimony',
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      body: item.body,
      authorName: 'Sarah O.',
      branchName: 'AGBC Glasgow',
      photoPath: 'members/sarah/1.jpg',
    });
    expect(share.fallbackText).toBe(
      '“God provided a job after 8 months of waiting.”\nSarah O. · AGBC Glasgow · AGBC Global',
    );
  });

  it('keeps a missing name out of the words rather than printing a blank', () => {
    const share = testimonyShare(
      { ...item, author_name: null },
      'AGBC Glasgow',
      'AGBC Global',
    );
    expect(share.content.authorName).toBeNull();
    expect(share.fallbackText).toBe(
      '“God provided a job after 8 months of waiting.”\nAGBC Glasgow · AGBC Global',
    );
  });
});

describe('prayerShare', () => {
  it('passes anonymity as a fact, and never puts a name in the words', () => {
    const share = prayerShare(
      {
        id: 'bbbbbbbb-0000-4000-8000-000000000002',
        body: 'Pray for me.',
        author_name: null,
        is_anonymous: true,
      },
      'AGBC Emmen',
      'AGBC Global',
    );
    expect(share.content).toEqual({
      kind: 'prayer',
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      body: 'Pray for me.',
      authorName: null,
      branchName: 'AGBC Emmen',
      anonymous: true,
    });
    // PRAYER-DETAIL has always sent the request and its branch, no author.
    expect(share.fallbackText).toBe('“Pray for me.”\nAGBC Emmen · AGBC Global');
  });
});

describe('eventShare (slice 3)', () => {
  const event = {
    id: 'cccccccc-0000-4000-8000-000000000003',
    title: 'Night of Worship',
    starts_at_local: '2026-08-24T19:00:00',
    location: 'Prinzenstr. 84',
    image_path: null,
  };

  it("formats the date block and the when line in the sharer's locale, and keeps the old words", () => {
    const share = eventShare(
      event,
      'AGBC Lighthouse Berlin',
      'en-GB',
      'AGBC Global',
    );
    expect(share.content).toEqual({
      kind: 'event',
      id: event.id,
      title: 'Night of Worship',
      day: '24',
      month: 'Aug',
      when: 'Monday · 19:00',
      place: 'AGBC Lighthouse Berlin · Prinzenstr. 84',
      imageUrl: null,
    });
    // EVENT-DETAIL's words, unchanged.
    expect(share.fallbackText).toBe(
      'Night of Worship · Monday 19:00 · Prinzenstr. 84 · AGBC Global',
    );
  });

  it('builds the public picture URL from the path, and drops a missing venue', () => {
    const previous = process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co/';
    try {
      const share = eventShare(
        { ...event, location: '', image_path: 'aaaa.jpg' },
        null,
        'en-GB',
        'AGBC Global',
      );
      expect(share.content.imageUrl).toBe(
        'https://x.supabase.co/storage/v1/object/public/event-images/aaaa.jpg',
      );
      expect(share.content.place).toBeNull();
      expect(share.fallbackText).toBe(
        'Night of Worship · Monday 19:00 · AGBC Global',
      );
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = previous;
    }
  });
});

describe('sermonShare (slice 3)', () => {
  const sermon = {
    id: 'dddddddd-0000-4000-8000-000000000004',
    title: 'Grace for the Journey',
    speaker: 'Pastor Esther Olayinka',
    youtube_id: 'abc123',
    artwork_path: null,
    thumbnail_url: 'https://i.ytimg.com/vi/abc123/hq.jpg',
    series: 'Grace Series',
  };

  it("follows the artwork rule and keeps the player's words", () => {
    const share = sermonShare(sermon, '38 min', '12 Sep 2026');
    expect(share.content).toEqual({
      kind: 'sermon',
      id: sermon.id,
      title: 'Grace for the Journey',
      speaker: 'Pastor Esther Olayinka',
      meta: '38 min · Grace Series',
      imageUrl: 'https://i.ytimg.com/vi/abc123/hq.jpg',
    });
    expect(share.fallbackText).toBe(
      'Grace for the Journey\nhttps://www.youtube.com/watch?v=abc123',
    );
  });

  it('falls back to the date when there is no series, and to the title alone without YouTube', () => {
    const share = sermonShare(
      { ...sermon, series: null, youtube_id: null, thumbnail_url: '' },
      null,
      '12 Sep 2026',
    );
    expect(share.content.meta).toBe('12 Sep 2026');
    expect(share.content.imageUrl).toBeNull();
    expect(share.fallbackText).toBe('Grace for the Journey');
  });
});

describe('branchShare (slice 3)', () => {
  const branch = {
    id: 'eeeeeeee-0000-4000-8000-000000000005',
    name: 'AGBC Lighthouse Berlin',
    city: 'Berlin',
    country: 'Germany',
    service_times: {
      sunday: 'Sundays 11:00 AM',
      midweek: 'Mittwochs 19:00 Uhr',
    },
    address: { line1: 'Oudenarder Str. 16', line2: '13347 Berlin' },
  };

  it("lists the branch's own times, bold Sunday first, then the address, and keeps the old words", () => {
    const share = branchShare(branch, 'AGBC Global');
    expect(share.content).toEqual({
      kind: 'branch',
      id: branch.id,
      name: 'AGBC Lighthouse Berlin',
      rows: [
        { icon: 'clock', text: 'Sundays 11:00 AM', strong: true },
        { icon: 'clock', text: 'Mittwochs 19:00 Uhr', strong: false },
        {
          icon: 'pin',
          text: 'Oudenarder Str. 16, 13347 Berlin',
          strong: false,
        },
      ],
    });
    // BRANCH-INFO's words, unchanged.
    expect(share.fallbackText).toBe(
      'AGBC Lighthouse Berlin · Berlin, Germany · Sundays 11:00 AM · AGBC Global',
    );
  });

  it('falls back to the city when there is no address, and to no rows when there are no times', () => {
    const share = branchShare(
      { ...branch, service_times: {}, address: null },
      'AGBC Global',
    );
    expect(share.content.rows).toEqual([
      { icon: 'pin', text: 'Berlin, Germany', strong: false },
    ]);
    expect(share.fallbackText).toBe(
      'AGBC Lighthouse Berlin · Berlin, Germany · AGBC Global',
    );
  });
});
