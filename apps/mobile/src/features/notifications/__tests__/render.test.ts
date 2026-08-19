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
  const rendered = renderNotification(t, {
    templateKey: 'service.starts_soon',
    params: { branch: 'AGBC Lighthouse Berlin' },
    title: null,
    body: null,
  });
  expect(rendered.title).toBe('Service starts in 1 hour');
  expect(rendered.body).toBe('AGBC Lighthouse Berlin');
});

test('the Glory batch pluralizes on count', () => {
  const one = renderNotification(t, {
    templateKey: 'testimony.glory_batch',
    params: { count: 1 },
    title: null,
    body: null,
  });
  const many = renderNotification(t, {
    templateKey: 'testimony.glory_batch',
    params: { count: 3 },
    title: null,
    body: null,
  });
  expect(one.title).toBe('1 person said Glory');
  expect(many.title).toBe('3 people said Glory');
});

test('German gets its own words and its own plural rules', async () => {
  await i18n.changeLanguage('de');
  const de = i18n.getFixedT(null, null);
  const many = renderNotification(de, {
    templateKey: 'testimony.glory_batch',
    params: { count: 3 },
    title: null,
    body: null,
  });
  expect(many.title).toBe('3 Personen haben Ehre gesagt');
});

test('an unknown key falls back to the generic line, never the raw key', () => {
  const rendered = renderNotification(t, {
    templateKey: 'future.something_new',
    params: null,
    title: null,
    body: null,
  });
  expect(rendered.title).toBe('AGBC Global');
  expect(rendered.body).toBe('You have a new notification');
});

test('a pre-rendered broadcast row passes straight through', () => {
  const rendered = renderNotification(t, {
    templateKey: null,
    params: null,
    title: 'Global Grace Gathering',
    body: 'All branches, this Sunday.',
  });
  expect(rendered).toEqual({
    title: 'Global Grace Gathering',
    body: 'All branches, this Sunday.',
  });
});

test('a broadcast row with nothing to say still says something', () => {
  const rendered = renderNotification(t, {
    templateKey: null,
    params: null,
    title: null,
    body: null,
  });
  expect(rendered.title).toBe('AGBC Global');
});

test('every notification type resolves to a disc tint', () => {
  expect(tintForType('prayer')).toBe('pray');
  expect(tintForType('testimony_glory')).toBe('glory');
  expect(tintForType('moderation')).toBe('txn');
  expect(tintForType('registration')).toBe('txn');
  expect(tintForType('purchase')).toBe('txn');
  expect(tintForType('rsvp_reminder')).toBe('txn');
  expect(tintForType('service_reminder')).toBe('plain');
  expect(tintForType('ministry')).toBe('plain');
  expect(tintForType('branch')).toBe('plain');
  // A type a later migration adds must degrade, not crash.
  expect(tintForType('something_new')).toBe('plain');
});
