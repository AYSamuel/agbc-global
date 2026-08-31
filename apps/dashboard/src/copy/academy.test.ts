import { describe, expect, test } from 'vitest';

import { copy } from './en';

/**
 * The Academy sentences that were WRONG rather than merely awkward (#164 review).
 *
 * Copy is normally asserted through the component that renders it, and most of it should be.
 * These four are here instead, as their own file, because of what they have in common: each
 * read perfectly and said something untrue, none of them could be caught by rendering (a
 * false sentence renders exactly as well as a true one), and each was found only by driving
 * the running dashboard and checking a claim against the mechanism behind it.
 *
 * So the assertions are shaped around the FALSE version rather than the true one. Asserting
 * the new wording would pass again the moment somebody rewrote it back; asserting the absence
 * of the specific untrue claim is the regression test, and it is the reason each of these
 * carries the mechanism that makes the claim false in its comment.
 */
describe('sentences that used to be untrue', () => {
  /**
   * "unlink that registration first and come back."
   *
   * `unlink_registration` deliberately does NOT un-prove the address, and the unlink screen
   * says so in bold. Only the member holding a proven address may remove it (`profile_emails`
   * has a delete policy for its owner and none for an admin), and no screen offers that, so
   * following the old instruction returned the admin to the identical wall with nothing
   * changed. Proven live: linked, unlinked, retried, refused again with the owner holding
   * zero registrations.
   */
  test('the refusal no longer sends an admin round a loop that cannot end', () => {
    const named = copy.academy.ringThemBody('Folake Ogunleye');
    const anonymous = copy.academy.ringThemBody(null);

    for (const sentence of [named, anonymous]) {
      expect(sentence).not.toMatch(/unlink that registration/i);
      expect(sentence).not.toMatch(/come back/i);
      // It has to say the thing that IS true: this screen cannot move the address.
      expect(sentence).toMatch(/nothing on this screen can move it/i);
    }

    // And it names the person to ring when it can, which is the only reason the screen looks
    // one up at all.
    expect(named).toContain('Folake Ogunleye');
  });

  /**
   * "…and it opens marriage-course."
   *
   * `course_id` is resolved from the website's slug at insert, so a payment for something we
   * do not carry has none, and `activity-notices` sends those to the Academy index because
   * `/course/null` is not a route (`activity-notices/core.ts`, ACADEMY_DEEP_LINK). The old
   * sentence promised the raw slug either way: a course that does not exist, opening a screen
   * the notification would never open.
   */
  test('the confirm promises the Academy when the course is not one we carry', () => {
    const known = copy.academy.confirm.toldBody('Grace Reset', true);
    const unknown = copy.academy.confirm.toldBody('marriage-course', false);

    expect(known).toContain('it opens Grace Reset');
    expect(unknown).not.toMatch(/it opens marriage-course/i);
    expect(unknown).toMatch(/opens the Academy rather than a course/i);
  });

  /**
   * "N people match “q” · closest first."
   *
   * Two claims, both false. `searchMembers` orders by `display_name` on the name road and does
   * not order at all on the address road, so nothing is "closest"; and the count was the
   * length AFTER the eight-row cap, so forty matches were reported as eight people matching.
   */
  test('the results label claims neither a ranking nor a total it does not have', () => {
    const one = copy.academy.link.resultsLabel(1, 'Ade', false);
    const some = copy.academy.link.resultsLabel(3, 'Ade', false);
    const capped = copy.academy.link.resultsLabel(8, 'Ade', true);

    for (const label of [one, some, capped]) {
      expect(label).not.toMatch(/closest first/i);
    }

    expect(one).toContain('1 person matches');
    expect(some).toContain('3 people match');
    expect(capped).toMatch(/There are more/i);
    expect(capped).not.toMatch(/8 people match/i);
  });

  /**
   * "No member's name or sign-in address matches “q”."
   *
   * Only ever one road is driven: a query with an `@` is matched against addresses exactly and
   * never against names, and a query without one against names only. Found by searching a
   * fragment present in every member's address and being told no address matched it.
   */
  test('the empty search says which of the two things was actually searched', () => {
    const byName = copy.academy.link.noResultsBody('dev.', false);
    const byAddress = copy.academy.link.noResultsBody('ade@nope.test', true);

    expect(byName).toMatch(/no member’s name contains/i);
    expect(byName).toMatch(/addresses are not searched/i);

    expect(byAddress).toMatch(/nobody signs in with/i);
    expect(byAddress).toMatch(/has to match exactly/i);
    expect(byAddress).not.toMatch(/name contains/i);
  });

  /**
   * "That did not go through. Try again."
   *
   * What the double-booking wall said until `20260831150000`, about an attempt that was not
   * faulty and that no number of retries could change.
   */
  test('a second payment is told what it is, not told to try again', () => {
    expect(copy.academy.outcome.alreadyEnrolled).not.toMatch(/try again/i);
    expect(copy.academy.outcome.alreadyEnrolled).toMatch(
      /already has a place on that course/i,
    );
  });

  /**
   * The leader's refusal used to be the People screen's, which ends "What is yours is deciding
   * who joins your branch" and is about nothing on this page.
   */
  test('the leader refusal is about registrations rather than about roles', () => {
    expect(copy.academy.leaderRefusedBody).not.toContain(
      copy.refused.notAdminBody,
    );
    expect(copy.academy.leaderRefusedBody).not.toMatch(
      /who joins your branch/i,
    );
    expect(copy.academy.leaderRefusedBody).toMatch(/belongs to no branch/i);
  });

  /**
   * The refusal names the MEMBER the admin chose, never the payer. The build fixed that once
   * and then kept a fallback to the payer's name for a missing `?member=`, which put the same
   * bug back on the same sentence.
   */
  test('the refusal drops the name rather than printing the payer’s', () => {
    const withMember = copy.academy.takenBody('Tobi Adewale', 'Folake');
    const without = copy.academy.takenBody(null, 'Folake');

    expect(withMember).toContain('Tobi Adewale');
    expect(without).toContain('the member you chose');
    expect(copy.academy.signinBody(null)).toContain('the member you chose');
  });
});
