import { describe, expect, test } from 'vitest';

import { sharedSentryOptions } from './sentryOptions';

// The dashboard's crash-report scrubbing (docs/spec/20, `21` §6.1; ADR 0020).
//
// This is a guard test, and the thing it guards against is a DEFAULT. Sentry v10 moved PII
// control into `dataCollection`, whose categories default to collecting: cookies (this app
// authenticates by cookie), request and response bodies (a moderation body is somebody's
// testimony), query params, DB query data, and stack-frame locals. So an upgrade that adds a
// category, or an edit that trims this object, has to fail here rather than in a report
// nobody reads until it holds an Art. 9 disclosure.

describe('shared Sentry options', () => {
  test('every data-collection category that could carry content is off', () => {
    const { dataCollection } = sharedSentryOptions();

    expect(dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  test('no tracing, so no session of a leader reading the queue is recorded', () => {
    expect(sharedSentryOptions().tracesSampleRate).toBe(0);
  });

  test('a fresh object per runtime, so one init cannot mutate another', () => {
    const first = sharedSentryOptions();
    const second = sharedSentryOptions();

    expect(first).not.toBe(second);
    expect(first.dataCollection).not.toBe(second.dataCollection);
  });
});
