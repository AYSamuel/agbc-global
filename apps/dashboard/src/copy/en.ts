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
    title: 'You are signed in',
    roleLabel: 'Role',
    branchLabel: 'Branch you moderate',
    emailLabel: 'Signed in as',
    roles: {
      leader: 'Branch leader',
      admin: 'Ministry admin',
    },
    adminScope: 'All branches',
    // The honest statement of what this screen is, rather than pretending it is a home page.
    comingNext:
      'The moderation queue arrives next. Nothing else is here yet, on purpose: this screen exists so the sign-in and permission checks behind it can be proven before anything valuable sits on top of them.',
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
