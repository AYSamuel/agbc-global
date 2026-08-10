import {
  courseRegisterUrl,
  courseWebsiteUrl,
  openCourseRegistration,
} from '../handoff';

// The Register handoff (ADR 0017 decision 7; decided 2026-08-10: mint NOW,
// degrade to a plain open). What is asserted is the promise the screen makes:
// the browser ALWAYS opens except on the one refusal that means "you already
// hold this place", and no failure of the mint ever blocks a registration.

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args) as unknown,
    },
  },
}));

const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => {
    mockOpenBrowser(...args);
    return Promise.resolve({ type: 'dismiss' });
  },
}));

function refusal(code: string) {
  return {
    data: null,
    error: {
      context: new Response(JSON.stringify({ error: code }), { status: 409 }),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the URL (agbc-website#42 contract)', () => {
  test('English at the root, other locales prefixed (the GIVE rule)', () => {
    expect(courseWebsiteUrl('grace-reset', 'en')).toBe(
      'https://www.agbcglobal.com/courses/grace-reset',
    );
    expect(courseWebsiteUrl('grace-reset', 'de')).toBe(
      'https://www.agbcglobal.com/de/courses/grace-reset',
    );
  });

  test('the token rides as ?token=, and every open lands on the form section', () => {
    expect(courseRegisterUrl('grace-reset', 'en', 'ab'.repeat(32))).toBe(
      `https://www.agbcglobal.com/courses/grace-reset?token=${'ab'.repeat(32)}#register`,
    );
    expect(courseRegisterUrl('grace-reset', 'en', null)).toBe(
      'https://www.agbcglobal.com/courses/grace-reset#register',
    );
  });
});

describe('openCourseRegistration', () => {
  test('a minted token opens the website with it', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, token: 'ab'.repeat(32) },
      error: null,
    });
    const outcome = await openCourseRegistration('grace-reset', 'en');
    expect(outcome).toBe('opened');
    expect(mockInvoke).toHaveBeenCalledWith('course-handoff', {
      body: { courseSlug: 'grace-reset' },
    });
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      `https://www.agbcglobal.com/courses/grace-reset?token=${'ab'.repeat(32)}#register`,
    );
  });

  test('already_registered refuses the browser: the screen shows the place instead', async () => {
    mockInvoke.mockResolvedValue(refusal('already_registered'));
    const outcome = await openCourseRegistration('grace-reset', 'en');
    expect(outcome).toBe('already_registered');
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  test('any other mint failure degrades to a plain open', async () => {
    mockInvoke.mockResolvedValue(refusal('rate_limited'));
    const outcome = await openCourseRegistration('grace-reset', 'en');
    expect(outcome).toBe('opened');
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://www.agbcglobal.com/courses/grace-reset#register',
    );
  });

  test('no network degrades to a plain open too', async () => {
    mockInvoke.mockRejectedValue(new TypeError('Network request failed'));
    const outcome = await openCourseRegistration('grace-reset', 'de');
    expect(outcome).toBe('opened');
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://www.agbcglobal.com/de/courses/grace-reset#register',
    );
  });
});
