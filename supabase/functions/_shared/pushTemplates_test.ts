import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import {
  formatWhen,
  renderTemplate,
  SUPPORTED_LANGUAGES,
  TEMPLATE_CATALOGUE,
  TEMPLATE_KEYS,
} from './pushTemplates.ts';
import { allowedByPrefs, CHANNELS, ROUTING, routeFor } from './pushChannels.ts';

Deno.test('every template carries all four languages, title and body', () => {
  // The gap this closes: a key added in EN only renders English on a German lock screen
  // and nobody notices until a member says so.
  for (const key of TEMPLATE_KEYS) {
    const template = TEMPLATE_CATALOGUE[key];
    for (const language of SUPPORTED_LANGUAGES) {
      assertNotEquals(template.title[language], undefined, `${key}.title.${language}`);
      assertNotEquals(template.body[language], undefined, `${key}.body.${language}`);
    }
  }
});

Deno.test('a notification renders in the recipient language, not ours', () => {
  const de = renderTemplate('prayer.someone_prayed', {}, 'de');
  assertEquals(de.title, 'Jemand hat mit dir gebetet');
  const nl = renderTemplate('prayer.someone_prayed', {}, 'nl');
  assertEquals(nl.title, 'Iemand heeft met je gebeden');
});

Deno.test('plurals follow each language rule, not English', () => {
  assertEquals(renderTemplate('testimony.glory_batch', { count: 1 }, 'en').title,
    '1 person said Glory');
  assertEquals(renderTemplate('testimony.glory_batch', { count: 3 }, 'en').title,
    '3 people said Glory');
  // French treats 0 and 1 as `one`; English does not. Hard-coding `count === 1` would be
  // wrong here and right in EN, which is exactly the bug Intl.PluralRules removes.
  assertEquals(renderTemplate('testimony.glory_batch', { count: 0 }, 'fr').title,
    '0 personne a dit Gloire');
  assertEquals(renderTemplate('testimony.glory_batch', { count: 0 }, 'en').title,
    '0 people said Glory');
});

Deno.test('an unknown key or language degrades instead of throwing', () => {
  // A fan-out must not die on a typo: the member gets a usable line and the log gets a
  // warning.
  const unknown = renderTemplate('nope.not_a_key', {}, 'de');
  assertEquals(unknown.title, 'AGBC Global');
  assertEquals(unknown.body, 'Du hast eine neue Benachrichtigung');

  // An unsupported language falls back to English rather than rendering nothing.
  const es = renderTemplate('prayer.someone_prayed', {}, 'es');
  assertEquals(es.title, 'Someone prayed with you');
});

Deno.test('a missing param leaves no placeholder on the lock screen', () => {
  const rendered = renderTemplate('service.starts_soon', {}, 'en');
  assertEquals(rendered.title, 'Service starts in 1 hour');
  // Body was "{branch}" with nothing to fill it: the member must never see literal braces.
  assertEquals(/[{}]/.test(rendered.body), false);
  assertNotEquals(rendered.body, '');
});

Deno.test('params interpolate where they are supplied', () => {
  const rendered = renderTemplate(
    'service.starts_soon',
    { branch: 'AGBC Lighthouse Berlin' },
    'de',
  );
  assertEquals(rendered.body, 'AGBC Lighthouse Berlin');
});

Deno.test('the moderation template never says rejected and never carries the reason', () => {
  // docs/spec/09 + 20260803140000: the reason can be safeguarding-sensitive and must not
  // reach a lock screen, and the copy invites the author back rather than judging them.
  // A distinctive sentinel, not a single letter: "next" contains an x, so `'x'` asserted
  // nothing and failed on the copy rather than on a leak.
  const REASON = 'SAFEGUARDING-SENTINEL-9f3a';
  for (const language of SUPPORTED_LANGUAGES) {
    const rendered = renderTemplate(
      'moderation.changes_needed',
      { reason: REASON },
      language,
    );
    assertEquals(/reject/i.test(rendered.title + rendered.body), false);
    assertEquals((rendered.title + rendered.body).includes(REASON), false);
  }
});

Deno.test('every routed type maps to one of the six channels', () => {
  const six = new Set(Object.values(CHANNELS));
  assertEquals(six.size, 6);
  for (const [type, routing] of Object.entries(ROUTING)) {
    assertEquals(six.has(routing.channel), true, `${type} -> ${routing.channel}`);
  }
});

Deno.test('the routed types are exactly the database CHECK values', () => {
  // Kept in step with notifications_type_known in 20260816120000. A type added there and
  // not here would send with no channel and Android would drop it silently.
  const fromMigration = [
    'prayer', 'testimony_glory', 'event', 'ministry', 'branch', 'service_reminder',
    'moderation', 'rsvp_reminder', 'registration', 'purchase', 'event_change',
  ].sort();
  assertEquals(Object.keys(ROUTING).sort(), fromMigration);
});

Deno.test('transactional notifications cannot be switched off', () => {
  for (const type of [
    'moderation',
    'rsvp_reminder',
    'registration',
    'purchase',
    'event_change',
  ]) {
    assertEquals(routeFor(type).pref, null);
    assertEquals(allowedByPrefs(type, { ministry_announcements: false }), true);
  }
});

Deno.test('a pref set to false suppresses its category and nothing else', () => {
  assertEquals(allowedByPrefs('ministry', { ministry_announcements: false }), false);
  assertEquals(allowedByPrefs('prayer', { ministry_announcements: false }), true);
  assertEquals(allowedByPrefs('prayer', { prayer_activity: false }), false);
});

Deno.test('an absent prefs row means the column defaults, which are all true', () => {
  // docs/spec/02: fan-out treats an absent row as the defaults. Reading absent as "no"
  // would silence every member who has never opened settings.
  assertEquals(allowedByPrefs('ministry', null), true);
  assertEquals(allowedByPrefs('prayer', undefined), true);
  assertEquals(allowedByPrefs('ministry', {}), true);
});

Deno.test('an event start is rendered in the reader own language, not ours', () => {
  // The param is a wall clock and the words around it are chosen per recipient (docs/spec/15
  // localization rule). Formatting it when the ENTRY is built would freeze one language for
  // everyone on the send, which is exactly the bug this convention exists to prevent.
  const en = renderTemplate(
    'event.moved',
    { event: 'Night of Worship', when: '2026-09-05T19:00:00' },
    'en',
  );
  const de = renderTemplate(
    'event.moved',
    { event: 'Night of Worship', when: '2026-09-05T19:00:00' },
    'de',
  );
  assertEquals(en.title, 'Night of Worship has moved');
  assertEquals(de.title, 'Night of Worship wurde verlegt');
  assertNotEquals(en.body, de.body);
  // The date itself, not the raw timestamp.
  assertEquals(en.body.includes('2026-09-05T19:00:00'), false);
  assertEquals(de.body.startsWith('Jetzt '), true);
});

Deno.test('the zone is never converted: a wall clock prints the hour it says', () => {
  // docs/spec/02 stores an event as wall clock + zone precisely so it survives a change in
  // the zone law; printing it in the READER local time would move church times around.
  const nine = formatWhen('2026-09-05T09:00:00', 'en');
  assertEquals(nine.includes('9:00'), true);
  const evening = formatWhen('2026-09-05T19:00:00', 'de');
  assertEquals(evening.includes('19:00'), true);
});

Deno.test('an unusable start leaves the sentence readable', () => {
  assertEquals(formatWhen('not a timestamp', 'en'), '');
  const rendered = renderTemplate(
    'event.cancelled',
    { event: 'Night of Worship', when: 'not a timestamp' },
    'en',
  );
  assertEquals(rendered.title, 'Night of Worship is cancelled');
  assertEquals(rendered.body, 'Tap to see what else is on');
});
