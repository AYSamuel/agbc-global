import { scrubBreadcrumb, scrubEvent } from '../sentry';

// What crash reporting refuses to send (docs/spec/20, ADR 0020). Crash reports are NOT
// consent-gated, so scrubbing is the whole of the protection, which makes these the
// assertions that carry it. Both functions are pure and ours, so they are tested directly
// rather than through a mocked Sentry init, which would only prove an option was passed.

describe('scrubEvent', () => {
  test('drops the user record, which is where the email would be', () => {
    const event = scrubEvent({
      user: { email: 'tolu@example.com', ip_address: '81.2.69.142' },
    });

    expect(event.user).toBeUndefined();
  });

  test('keeps the request path but not its query string', () => {
    // PostgREST puts filters in the query string, so this is where ids and, worse, an
    // `email=eq.` lookup would ride along.
    const event = scrubEvent({
      request: {
        url: 'https://db.example.com/rest/v1/profiles?email=eq.tolu%40example.com',
        query_string: 'email=eq.tolu%40example.com',
        headers: { Authorization: 'Bearer secret-token' },
      },
    });

    expect(event.request?.url).toBe('https://db.example.com/rest/v1/profiles');
    expect(event.request?.query_string).toBeUndefined();
    // Headers carry the access token; a crash report is not the place for it.
    expect(event.request?.headers).toBeUndefined();
  });

  test('leaves an event with nothing sensitive alone', () => {
    const event = scrubEvent({
      request: { url: 'https://db.example.com/rest/v1/branches' },
    });

    expect(event.request?.url).toBe('https://db.example.com/rest/v1/branches');
  });
});

describe('scrubBreadcrumb', () => {
  test('drops console breadcrumbs entirely', () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        data: { arguments: ['posting testimony: God provided a job'] },
      }),
    ).toBeNull();
  });

  test('strips the query string from an http breadcrumb', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://db.example.com/rest/v1/testimonies?select=body' },
    });

    expect(breadcrumb?.data?.url).toBe(
      'https://db.example.com/rest/v1/testimonies',
    );
  });

  test('keeps a navigation breadcrumb, which is the useful kind', () => {
    const breadcrumb = scrubBreadcrumb({ category: 'navigation' });

    expect(breadcrumb).not.toBeNull();
    expect(breadcrumb?.category).toBe('navigation');
  });
});
