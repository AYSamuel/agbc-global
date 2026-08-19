import { foregroundBehaviour } from '../foreground';

/**
 * What arrives while the app is open (docs/spec/15).
 *
 * The bug this closes was invisible from every other angle: the push is delivered, Expo's
 * receipt says ok, FCM hands it over, and the member sees nothing, because no handler was
 * ever set and expo-notifications shows nothing in the foreground by default. So these
 * assert the DECISION rather than the mechanics, category by category.
 */
describe('foregroundBehaviour', () => {
  it('lets a service reminder interrupt, with sound', () => {
    // The one category `15` says interrupts, and the only channel created at
    // IMPORTANCE_HIGH. A member reading the app an hour before the service is exactly
    // who needs to see it.
    expect(foregroundBehaviour('service_reminder')).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    });
  });

  it('banners news from the church, but does not make a noise', () => {
    // They were not looking for it, so a banner is right; they are already holding the
    // phone, so a sound is not.
    for (const type of ['ministry', 'branch', 'event']) {
      expect(foregroundBehaviour(type)).toEqual({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      });
    }
  });

  it('keeps activity out of the way, because the screen already shows it', () => {
    for (const type of ['prayer', 'testimony_glory']) {
      expect(foregroundBehaviour(type)).toMatchObject({
        shouldShowBanner: false,
        shouldShowList: true,
      });
    }
  });

  it('keeps confirmations out of the way too', () => {
    // Each answers something the member just did, and the screen usually reflects it.
    for (const type of [
      'moderation',
      'rsvp_reminder',
      'registration',
      'purchase',
    ]) {
      expect(foregroundBehaviour(type)).toMatchObject({
        shouldShowBanner: false,
        shouldShowList: true,
      });
    }
  });

  it('never drops anything from the tray, whatever the category', () => {
    // The banner is the only thing in question. Nothing is ever silently lost.
    const types = [
      'service_reminder',
      'ministry',
      'branch',
      'event',
      'prayer',
      'testimony_glory',
      'moderation',
      'rsvp_reminder',
      'registration',
      'purchase',
      'something_a_later_migration_adds',
    ];
    for (const type of types) {
      expect(foregroundBehaviour(type).shouldShowList).toBe(true);
    }
  });

  it('falls to the quiet end for a type it does not know', () => {
    // The handler has three seconds to answer or the notification is discarded, so this
    // must be total. A type added by a later migration is quiet rather than absent.
    expect(foregroundBehaviour('unknown')).toMatchObject({
      shouldShowBanner: false,
      shouldShowList: true,
    });
  });

  it('does not set the deprecated shouldShowAlert', () => {
    // expo-notifications 57 replaced it with the banner/list pair; sending both is how a
    // handler written from memory of the old API quietly does the wrong thing.
    expect(foregroundBehaviour('ministry')).not.toHaveProperty(
      'shouldShowAlert',
    );
  });
});
