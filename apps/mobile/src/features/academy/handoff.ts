import type { CourseHandoffError, CourseHandoffResponse } from '@agbc/shared';

import { supabase } from '@/lib/supabase';
import { localizedWebsiteUrl } from '@/lib/websiteUrl';
import { openExternal } from '@/lib/openExternal';

// Register (docs/spec/13, ADR 0017 decision 7): the app registers nobody. The
// button opens the WEBSITE's course page in the in-app browser exactly as GIVE
// does, and (decided 2026-08-10) mints the handoff token NOW and appends it,
// even though the website ignores it until agbc-website#42 ships behind the
// prod ALTER: minting costs nothing today, the already_registered refusal is a
// useful guard, and the handoff then goes live later without an app release.
//
// The URL base is a module constant rather than server config: the /courses/
// route is covered by ADR 0017's coordination rule (nothing on either side
// changes shape without a coordinated change in Desktop/agbc), unlike bank
// details, which change without releases and so live in giving_config.
const WEBSITE_COURSE_BASE = 'https://www.agbcglobal.com/courses';

/** The website page for a course, in the reader's language. */
export function courseWebsiteUrl(slug: string, language: string): string {
  return localizedWebsiteUrl(`${WEBSITE_COURSE_BASE}/${slug}`, language);
}

/** The URL the browser opens: the page, plus the token when one was minted. */
export function courseRegisterUrl(
  slug: string,
  language: string,
  token: string | null,
): string {
  const base = courseWebsiteUrl(slug, language);
  // The param name is the contract with agbc-website#42; the token is opaque
  // and carries no personal data (ADR 0017: profile_id is never in the URL).
  const query = token === null ? '' : `?token=${token}`;
  // #register is the course page's registration-form section (Desktop/agbc
  // courses/[slug].astro): Register lands on the form, not the page top
  // (Ayo, 2026-08-10).
  return `${base}${query}#register`;
}

export type RegisterOutcome =
  /** The browser opened (with or without a token). */
  | 'opened'
  /** The mint refused: this member already holds a live registration. */
  | 'already_registered'
  /**
   * Nothing on the device would take the URL. Added 2026-09-05: this used to
   * be indistinguishable from 'opened', because the open was a floating
   * `void` that reported its rejection to Sentry and the member not at all.
   */
  | 'could_not_open';

/**
 * The member's Register tap: mint, then open. EVERY failure of the mint
 * (offline, rate limited, not configured) degrades silently to a plain open,
 * because the handoff only makes linking exact; the website works without it
 * and the email match still links the row (ADR 0017 decision 8). The one
 * refusal that changes the screen is already_registered: opening a checkout
 * for a course the member already holds is the exact harm ADR 0017 exists to
 * prevent, so the caller refetches and shows the registered state instead.
 */
export async function openCourseRegistration(
  slug: string,
  language: string,
): Promise<RegisterOutcome> {
  let token: string | null = null;
  try {
    // The SDK types this response's error loosely; pin it (the contact.tsx
    // pattern) and narrow by instance below.
    const { data, error } =
      (await supabase.functions.invoke<CourseHandoffResponse>(
        'course-handoff',
        { body: { courseSlug: slug } },
      )) as { data: CourseHandoffResponse | null; error: unknown };
    if (error) {
      const code = await machineCode(error);
      if (code === 'already_registered') return 'already_registered';
      // not_open and every transport/server failure: plain open below.
    } else if (data?.ok && typeof data.token === 'string') {
      token = data.token;
    }
  } catch {
    // No network reaches the same honest place: the browser's own error page.
  }
  const opened = await openExternal(courseRegisterUrl(slug, language, token));
  return opened ? 'opened' : 'could_not_open';
}

/** supabase-js hangs the raw Response off the error as `context` (photo.ts). */
async function machineCode(error: unknown): Promise<CourseHandoffError | null> {
  const context: unknown = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body.error === 'string'
      ? (body.error as CourseHandoffError)
      : null;
  } catch {
    return null; // Not JSON, or already consumed.
  }
}
