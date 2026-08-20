import i18n from '@/i18n';

import { renderNotification, tintForType } from '../render';

// The row-narration contract (W3.3 slice 5): the app renders the SAME template
// keys the server renders at send time (_shared/pushTemplates.ts), so these
// tests pin the client half of that agreement: key resolution, params,
// plurals per language, and the generic fallback that keeps a typo from
// blanking a member's log.

const t = i18n.getFixedT(null, null);

afterEach(async () => {
  await i18n.changeLanguage('en');
});

test('a template row renders from its key, params interpolated', () => {
  const rendered = renderNotification(
    t,
    {
      templateKey: 'service.starts_soon',
      params: { branch: 'AGBC Lighthouse Berlin' },
      title: null,
      body: null,
    },
    'en-GB',
  );
  expect(rendered.title).toBe('Service starts in 1 hour');
  expect(rendered.body).toBe('AGBC Lighthouse Berlin');
});

test('the Glory batch pluralizes on count', () => {
  const one = renderNotification(
    t,
    {
      templateKey: 'testimony.glory_batch',
      params: { count: 1 },
      title: null,
      body: null,
    },
    'en-GB',
  );
  const many = renderNotification(
    t,
    {
      templateKey: 'testimony.glory_batch',
      params: { count: 3 },
      title: null,
      body: null,
    },
    'en-GB',
  );
  expect(one.title).toBe('1 person said Glory');
  expect(many.title).toBe('3 people said Glory');
});

test('German gets its own words and its own plural rules', async () => {
  await i18n.changeLanguage('de');
  const de = i18n.getFixedT(null, null);
  const many = renderNotification(
    de,
    {
      templateKey: 'testimony.glory_batch',
      params: { count: 3 },
      title: null,
      body: null,
    },
    'de-DE',
  );
  expect(many.title).toBe('3 Personen haben Ehre gesagt');
});

test('an unknown key falls back to the generic line, never the raw key', () => {
  const rendered = renderNotification(
    t,
    {
      templateKey: 'future.something_new',
      params: null,
      title: null,
      body: null,
    },
    'en-GB',
  );
  expect(rendered.title).toBe('AGBC Global');
  expect(rendered.body).toBe('You have a new notification');
});

test('a pre-rendered broadcast row passes straight through', () => {
  const rendered = renderNotification(
    t,
    {
      templateKey: null,
      params: null,
      title: 'Global Grace Gathering',
      body: 'All branches, this Sunday.',
    },
    'en-GB',
  );
  expect(rendered).toEqual({
    title: 'Global Grace Gathering',
    body: 'All branches, this Sunday.',
  });
});

test('a broadcast row with nothing to say still says something', () => {
  const rendered = renderNotification(
    t,
    {
      templateKey: null,
      params: null,
      title: null,
      body: null,
    },
    'en-GB',
  );
  expect(rendered.title).toBe('AGBC Global');
});

test('an event notice puts its start into words, in the reader locale', async () => {
  // The server writes `when` as the raw wall clock precisely so this side can do it
  // (docs/spec/15's localization rule). A row written once is read correctly by a Berlin
  // member in German and a Glasgow member in English.
  const row = {
    templateKey: 'event.moved',
    params: { event: 'Night of Worship', when: '2026-09-05T20:30:00' },
    title: null,
    body: null,
  };

  const en = renderNotification(t, row, 'en-GB');
  expect(en.title).toBe('Night of Worship has moved');
  expect(en.body).toContain('20:30');
  expect(en.body).not.toContain('2026-09-05');

  await i18n.changeLanguage('de');
  const de = renderNotification(i18n.getFixedT(null, null), row, 'de-DE');
  expect(de.title).toBe('Night of Worship wurde verlegt');
  // The event's own wall clock, never converted into the reader's zone: docs/spec/02
  // stores it that way so a change in the zone's law cannot move a church service.
  expect(de.body).toContain('20:30');
});

test('an unusable start leaves the sentence readable', () => {
  const rendered = renderNotification(
    t,
    {
      templateKey: 'event.cancelled',
      params: { event: 'Night of Worship', when: 'nonsense' },
      title: null,
      body: null,
    },
    'en-GB',
  );
  expect(rendered.title).toBe('Night of Worship is cancelled');
  expect(rendered.body).toBe('Tap to see what else is on');
});

test('every notification type resolves to a disc tint', () => {
  expect(tintForType('prayer')).toBe('pray');
  expect(tintForType('testimony_glory')).toBe('glory');
  expect(tintForType('moderation')).toBe('txn');
  expect(tintForType('registration')).toBe('txn');
  expect(tintForType('purchase')).toBe('txn');
  expect(tintForType('rsvp_reminder')).toBe('txn');
  // A change to an event you RSVP'd to answers something you did (docs/spec/15's tiers),
  // which is what the blue disc means; the postings stay with the church's other news.
  expect(tintForType('event_change')).toBe('txn');
  expect(tintForType('event')).toBe('plain');
  expect(tintForType('service_reminder')).toBe('plain');
  expect(tintForType('ministry')).toBe('plain');
  expect(tintForType('branch')).toBe('plain');
  // A type a later migration adds must degrade, not crash.
  expect(tintForType('something_new')).toBe('plain');
});
