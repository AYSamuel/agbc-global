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
    // And on the count, so a badge is not conveyed by a bare number alone.
    waiting: (count: number) =>
      `${String(count)} ${count === 1 ? 'person is' : 'people are'} waiting on you`,
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

  people: {
    title: 'People',
    scope: 'Roles and branch moves',
    // The rule sits where the work happens, like the queue's safeguarding note. It is
    // shown before a lookup and drops away afterwards, per the approved frames: by then
    // it has been read, and the answer is what matters.
    guideTitle: 'Exact email address only.',
    guide:
      'There is no member list and no partial search, so no one can sweep for which addresses belong to the ministry. Handing out a role asks for a fresh code from your authenticator.',
    emailLabel: 'Email address',
    emailHint: 'Type the address exactly as they sign in with it.',
    find: 'Find',
    finding: 'Looking…',
    lookAgain: 'Look again',
    findSomeoneElse: 'Find someone else',
    personLabel: 'This person',
    memberSince: (year: string) => `Member since ${year}`,
    roleLabel: 'Role',
    // Short forms, for the segmented control and the current-role pill. The long forms
    // in `identity.roles` name a job ("Branch leader"); these name a choice.
    roleNames: { member: 'Member', leader: 'Leader', admin: 'Admin' },
    branchLabel: 'Branch they will lead',
    branchHint: 'A leader moderates this branch and nothing else.',
    codeLabel: 'Code from your authenticator',
    codeHint:
      'Handing out authority is the irreversible act here, so it is asked for every time.',
    grants: { member: 'a member', leader: 'a leader', admin: 'an admin' },
    submit: (name: string, grant: string) => `Make ${name} ${grant}`,
    submitting: 'Saving…',
    cancel: 'Cancel',

    // The branch this change would leave with nobody leading it. A warning and not a
    // refusal: the database allows it, and a ministry that cannot demote its only leader
    // is worse off than one that is briefly without one. It says so out loud.
    leaderlessTitle: (branch: string) => `${branch} would have no leader`,
    leaderless: (branch: string) =>
      `Nobody would be left to review ${branch}'s testimonies and prayers, and its branch requests would wait for an admin. You can still do this.`,

    // What the lookup found, said plainly (reversed 2026-07-31: this surface is reached
    // only by an admin who can already read every profile, so a uniform refusal would
    // protect nobody and hide a typo).
    noAccountTitle: (email: string) => `No account for ${email}`,
    noAccount:
      'Nobody has signed in with that address yet. Check the spelling, or ask them to open the app and sign in once, then look again.',
    closedTitle: 'That account has been closed',
    closed:
      'A closed account cannot hold a role, so there is nothing to change here.',
    notOnboardedTitle: 'They have not finished joining yet',
    notOnboarded:
      'They have signed in, but have not finished the welcome in the app. Ask them to finish it, then look again: a branch given now would be overwritten when they do.',
    yourselfTitle: 'You cannot change your own role',
    yourself:
      'A role change is never self-service, admins included. Ask another ministry admin if yours needs to change.',
    invalidTitle: 'That does not look like an email address',
    invalid: 'Check the spelling and look again.',
    goneTitle: 'That account is no longer there',
    gone: 'It was closed or removed while this page was open, so nothing was changed. Look them up again.',

    // Assignment refusals. Each one names what happened and what to do next.
    badCodeTitle: 'That code did not work',
    badCode:
      'Codes change every 30 seconds: open your authenticator app and try the current one. Nothing was changed.',
    noFactorTitle: 'Your account has no authenticator',
    noFactor:
      'Roles are handed out with a fresh code, so this needs an authenticator app on your account. Set one up, then come back.',
    lastAdminTitle: 'The last ministry admin cannot be demoted',
    lastAdmin:
      'Somebody has to be able to hand out roles. Make someone else an admin first, then change this one.',
    archivedBranchTitle: 'That branch has been archived',
    archivedBranch:
      'Nobody is assigned into an archived branch, and leading one is authority over nothing. Pick a branch that is still active.',
    noBranchTitle: 'That branch no longer exists',
    noBranch: 'Look them up again and pick from the list.',
    refusedTitle: 'That is not yours to change',
    refused:
      'Only a ministry admin assigns roles, and your own role may have changed since this page loaded.',
    offlineTitle: 'You appear to be offline',
    offline: 'Check your connection and try again. Nothing was changed.',
    failedTitle: 'Something went wrong',
    failed:
      'Nothing was changed. Try again, and tell Ayo if it keeps happening.',

    // Done. Named rather than generic, because the admin needs to know which of the three
    // things they just did, and what it means for the person.
    doneTitle: 'Done',
    done: {
      member: (name: string) =>
        `${name} is a member now. They no longer moderate anything.`,
      leader: (name: string, branch: string) =>
        `${name} leads ${branch} now. They can sign in to the dashboard and start clearing that branch's queue.`,
      admin: (name: string) =>
        `${name} is a ministry admin now: every branch's queue, and roles too.`,
    },
    // No error entry here on purpose: a screen that cannot load at all is the segment
    // error boundary's job (`app/error.tsx`), which is where the queue leaves it too.
  },

  requests: {
    title: 'Branch requests',
    scopeJoining: (branch: string) => `Joining ${branch}`,
    allBranches: 'All branches',
    stats: {
      waiting: 'Waiting on you',
      joined: 'Joined this year',
      left: 'Left this year',
    },
    // The rule where the decision is made, like the queue's safeguarding note.
    guideTitle: (branch: string) => `You decide who joins ${branch}.`,
    guide:
      'The branch someone is leaving is told afterwards and cannot block them. Approving takes effect immediately, so approve when you know they are actually gathering with you.',
    waitingLabel: 'Waiting for you · oldest first',
    wantsToJoin: 'Wants to join',
    approve: 'Approve',
    refuseOpen: 'Refuse with a reason',

    refusingLabel: (name: string) => `Refusing ${name}`,
    noteLabel: 'Why, for the ministry record',
    notePlaceholder: 'Required. Written for whoever reviews this later.',
    // Said before they write it, not after: the note's whole shape depends on knowing who
    // will read it, and that the person it is about never will.
    privateTitle: (name: string) =>
      `${name} will not see this, and will not see your name`,
    private: (branch: string) =>
      `They are told only that it was not approved, and pointed at ${branch}'s contact address. The note is kept for 7 years and can be read by an admin. You will not be able to read it back.`,
    refuseSubmit: 'Refuse this request',
    cancel: 'Cancel',

    emptyTitle: 'Nobody is waiting',
    emptyBody: (branch: string) => `Requests to join ${branch} appear here.`,
    leftLabel: (branch: string) => `Members who left ${branch}`,
    leftPill: 'Left',
    // Read-only, and after the fact. Said out loud so the absence of buttons reads as a
    // decision rather than as something missing.
    leftNote:
      'You are told after the fact and cannot block someone leaving. Refused requests never appear here.',

    outcome: {
      approved: 'Approved. They are in your branch now.',
      refused:
        'Refused, and your note is in the ministry record. They are told only that it was not approved.',
      alreadyDecided:
        'That request had already been decided, so nothing changed. The queue below is up to date.',
      notYours:
        'That is not yours to decide. It may belong to another branch, or your role may have changed since this page loaded.',
      leaderFirst:
        'The branch being joined has 48 hours to decide this first. It becomes yours to decide after that.',
      reasonRequired:
        'A refusal needs a reason for the ministry record, so nothing was changed.',
      gone: 'That request is no longer there. It may have been cancelled.',
      failed: 'Something went wrong and nothing was changed. Try again.',
    },
  },

  refused: {
    notAdminTitle: 'Roles are handed out by a ministry admin',
    notAdminBody:
      'This part of People is not yours, and nothing is wrong with your account. Your branch’s queue is where your work is, under Moderation.',
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
