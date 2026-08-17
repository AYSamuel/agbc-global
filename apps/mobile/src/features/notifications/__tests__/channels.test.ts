import { CHANNEL_IDS, CHANNEL_SPECS } from '../channels';

// THIS TEST IS HALF OF A PAIR. The server names the same six channel ids in
// `supabase/functions/_shared/pushChannels.ts`, and its deno test asserts the same
// literals. The two files cannot import each other (pnpm workspace vs Deno import map),
// so the ids are duplicated and these two tests are the only thing holding them in step.
//
// The failure they exist to prevent is silent: a channel the SERVER names that the APP
// never created makes Android drop the notification on API 26+, with no error anywhere.

describe('the six channels', () => {
  it('are exactly these ids, spelled exactly this way', () => {
    // Literals on purpose: reading them from the source under test would assert nothing.
    expect(Object.values(CHANNEL_IDS).sort()).toEqual(
      [
        'branch',
        'ministry',
        'prayer',
        'service_reminders',
        'testimony',
        'transactional',
      ].sort(),
    );
  });

  it('has one spec per id, and no duplicates', () => {
    expect(CHANNEL_SPECS).toHaveLength(6);
    expect(new Set(CHANNEL_SPECS.map((c) => c.id)).size).toBe(6);
  });

  it('interrupts for service reminders and nothing else', () => {
    // Decided with Ayo 2026-08-15, and effectively immutable: Android fixes a channel's
    // importance at creation and remembers it even across deletion. A reminder seen after
    // the service started has failed; everything else can wait in the shade.
    const interrupting = CHANNEL_SPECS.filter((c) => c.interrupts).map(
      (c) => c.id,
    );
    expect(interrupting).toEqual(['service_reminders']);
  });

  it('names a translation key for every channel', () => {
    // The names show in Android's own settings, so a missing key would render the raw
    // key string there rather than a name.
    // Partial on purpose: a missing key is exactly what this asserts against, so the
    // type must admit that it could be absent.
    const en = require('@/i18n/locales/en/notifications.json') as {
      channels: Partial<Record<string, { name: string; description: string }>>;
    };
    for (const spec of CHANNEL_SPECS) {
      expect(en.channels[spec.key]?.name).toBeTruthy();
      expect(en.channels[spec.key]?.description).toBeTruthy();
    }
  });
});
