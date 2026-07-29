/**
 * Every user-facing string in the dashboard, in one place.
 *
 * No i18next here, deliberately. The app ships in EN/DE/NL/FR because members read it;
 * the dashboard is a staff tool and nothing in `16`, `17` or `22` asks for it to be
 * translated (the multilingual part of a leader's job is the CONTENT they compose, which
 * carries its own per-language fields). What still applies is the rule underneath the
 * i18n convention: no literal copy inside components, so wording changes are one edit
 * and a second language stays a swap of this module rather than a rewrite.
 *
 * Grace-framed: a refusal explains and offers the way forward, and never scolds.
 */
export const copy = {
  app: {
    name: 'AGBC Dashboard',
    description: 'Leader dashboard for Amazing Grace Bible Church',
    skipToContent: 'Skip to main content',
    signOut: 'Sign out',
  },

  signIn: {
    title: 'Sign in',
    intro: 'Use the same email address you use in the AGBC app.',
    emailLabel: 'Email address',
    sendCode: 'Email me a code',
    sending: 'Sending…',
    // Uniform whether or not the address has an account: an honest hint here would let
    // anyone test which addresses belong to the ministry (~/.claude/standards/security.md).
    codeSent: (email: string) =>
      `If ${email} has an AGBC account, a six-digit code is on its way. It expires in 10 minutes.`,
    codeLabel: 'Six-digit code',
    verify: 'Continue',
    verifying: 'Checking…',
    useAnotherEmail: 'Use a different address',
    resend: 'Send a new code',
    errors: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'That does not look like an email address.',
      codeRequired: 'Enter the six-digit code from your email.',
      codeInvalid:
        'That code did not work. It may have expired: ask for a new one.',
      // Deliberately vague for the same reason as codeSent.
      sendFailed: 'We could not send a code just now. Try again in a moment.',
      offline: 'You appear to be offline. Check your connection and try again.',
    },
  },

  mfa: {
    enrolTitle: 'Set up your authenticator',
    enrolIntro:
      'The dashboard can approve and publish content for the whole ministry, so it asks for a second factor. Scan this with an authenticator app, then enter the code it shows.',
    qrAlt: 'QR code for setting up two-factor authentication',
    secretLabel: 'Or type this key into your app',
    challengeTitle: 'Enter your code',
    challengeIntro: 'Open your authenticator app and enter the six-digit code.',
    staleIntro:
      'It has been a while since you last confirmed this device. Enter the six-digit code from your authenticator app to carry on.',
    codeLabel: 'Six-digit code',
    confirm: 'Confirm',
    confirming: 'Checking…',
    errors: {
      codeRequired: 'Enter the six-digit code from your authenticator app.',
      codeInvalid:
        'That code did not work. Codes change every 30 seconds: try the current one.',
      enrolFailed:
        'We could not start the setup just now. Try again in a moment.',
      offline: 'You appear to be offline. Check your connection and try again.',
    },
  },

  identity: {
    // Slice 1 rendered a whole identity screen from this block. The queue replaced it and
    // the rail now carries the identity, so all that survives is the role label, used in
    // the rail and on the refusals. The rest was deleted rather than left to rot.
    roles: {
      leader: 'Branch leader',
      admin: 'Ministry admin',
    },
  },

  nav: {
    label: 'Sections',
    brand: 'AGBC',
    signedInAs: 'Signed in as',
    moderation: 'Moderation',
    reports: 'Reports',
    verses: 'Daily verses',
    people: 'People',
    later: 'Later',
    broadcasts: 'Broadcasts',
    events: 'Events',
    branches: 'Branches',
    library: 'Library & courses',
    insights: 'Insights',
    // Screen-reader text on the dimmed rows, so "Phase B" is not conveyed by dimming alone.
    notYet: (phase: string) => `not built yet, arrives in Phase ${phase}`,
  },

  queue: {
    title: 'Moderation queue',
    allBranches: 'All branches',
    stats: {
      toReview: 'To review',
      overdue: 'Waiting over 48h',
      testimonies: 'Testimonies',
    },
    filters: {
      all: 'All',
      testimonies: 'Testimonies',
      prayers: 'Prayers',
    },
    // The safeguarding guideline lives where the decision is made (17 §1, 20), not in a
    // wiki nobody opens at the moment they are about to approve something.
    safeguardingTitle: 'Before you approve:',
    safeguarding:
      'anything disclosing abuse or self-harm is not approved here. Route it to the branch lead pastor through the church safeguarding process. Photos showing identifiable children without known consent are rejected.',
    waitingLabel: 'Waiting for review',
    kind: { testimony: 'Testimony', prayer: 'Prayer' },
    anonymous: 'Shared anonymously',
    answeredPrayer: 'Answered prayer',
    photoAlt: 'Photo attached to this testimony',
    consent: (version: string) => `Consent ${version}`,
    waitingDays: (days: number) =>
      `Waiting ${String(days)} ${days === 1 ? 'day' : 'days'}`,
    // Slice 2 is read-only on purpose: scoping is provable before anything can act.
    readOnly:
      'Reviewing only for now. Approve, reject and remove arrive in the next slice, once the branch scoping above is proven.',
    actions: {
      approve: 'Approve',
      reject: 'Reject with reason',
      rejectOpen: 'Reject with reason',
      rejectSubmit: 'Send this back to the author',
      rejectLabel: 'What should they change? The author sees this.',
      remove: 'Remove',
      removeOpen: 'Remove',
      removeSubmit: 'Remove permanently',
      removeLabel:
        'Why is this being removed? Kept for the ministry record only, never shown to the author.',
      // The confirm step, and the reason it exists: this is the one decision a leader
      // cannot take back themselves.
      removeWarning:
        'Removing is not reversible by you. Only a ministry admin can bring this back, so use Reject if you want the author to fix it and try again.',
      cancel: 'Cancel',
    },
    outcome: {
      approved: 'Approved. It is live in the app feed now.',
      rejected: 'Sent back to the author with your reason.',
      removed: 'Removed. Only a ministry admin can restore it.',
      // The honest failure: send them back to read what changed rather than swallowing it.
      contentChanged:
        'That post changed while you were reading it, so nothing was decided. The queue below shows the author’s new words: please read them and decide again.',
      refused:
        'That is not yours to decide. It may belong to another branch, or your role may have changed since this page loaded.',
      restoreNeedsAdmin:
        'Removed content can only be restored by a ministry admin.',
      missingReason: 'A reason is required, so nothing was changed.',
      failed: 'Something went wrong and nothing was changed. Try again.',
    },
    emptyTitle: 'Nothing waiting',
    emptyBody: (branch: string) =>
      `${branch} is fully reviewed. New testimonies and prayers land here as soon as members post them.`,
    errorTitle: 'We could not load the queue',
    errorBody:
      'That is on us, not you. Nothing has been approved or rejected in the meantime.',
  },

  refused: {
    notStaffTitle: 'This dashboard is for branch leaders',
    notStaffBody:
      'Your AGBC account is in good standing, it simply does not moderate a branch. If that is a mistake, ask your branch leader or a ministry admin to update your role.',
    noProfileTitle: 'Finish setting up in the app first',
    noProfileBody:
      'This address has signed in, but there is no AGBC profile attached to it yet. Open the AGBC app, complete the short welcome, then come back.',
    accountClosedTitle: 'This account is closed',
    accountClosedBody:
      'Get in touch with a ministry admin if you believe this account should still be active.',
  },

  errors: {
    unexpectedTitle: 'Something went wrong',
    unexpectedBody:
      'That is on us, not you. Try again, and tell Ayo if it keeps happening.',
    retry: 'Try again',
  },
} as const;
