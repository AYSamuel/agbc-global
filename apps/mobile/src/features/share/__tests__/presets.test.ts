import { prayerShare, testimonyShare } from '../presets';

/**
 * The mapping five call sites share (W4.15 slice 2). What matters here is that the WORDS
 * are exactly what those sites sent before this item, because the text route is the old
 * behaviour kept, and that the card gets facts rather than presentation.
 */

describe('testimonyShare', () => {
  const item = {
    body: 'God provided a job after 8 months of waiting.',
    author_name: 'Sarah O.',
    image_path: 'members/sarah/1.jpg',
  };

  it('hands the card the facts and the text route its old words', () => {
    const share = testimonyShare(item, 'AGBC Glasgow', 'AGBC Global');

    expect(share.content).toEqual({
      kind: 'testimony',
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
      { body: 'Pray for me.', author_name: null, is_anonymous: true },
      'AGBC Emmen',
      'AGBC Global',
    );
    expect(share.content).toEqual({
      kind: 'prayer',
      body: 'Pray for me.',
      authorName: null,
      branchName: 'AGBC Emmen',
      anonymous: true,
    });
    // PRAYER-DETAIL has always sent the request and its branch, no author.
    expect(share.fallbackText).toBe('“Pray for me.”\nAGBC Emmen · AGBC Global');
  });
});
