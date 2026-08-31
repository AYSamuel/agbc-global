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
 *
 * Nothing unused lives here. Three `errorTitle`/`errorBody` pairs were deleted on
 * 2026-08-04 after the reports inbox nearly added a fourth: a page that cannot load at all
 * is the segment error boundary's job (`app/error.tsx`, which reads `errors.*`), so those
 * strings had never been rendered by anything. A file that claims to be every string in
 * the product is only useful while that is true in both directions.
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
    sermonAudio: 'Sermon audio',
    people: 'People',
    later: 'Later',
    broadcasts: 'Broadcasts',
    events: 'Events',
    branches: 'Branches',
    academy: 'Academy',
    // Books and devotional content, and NOT courses: Academy above owns those. The app makes
    // the same split, and names both sides of it ("Grace Academy" against "My Library").
    library: 'Library',
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
  },

  reports: {
    title: 'Reports',
    allBranches: 'All branches',
    stats: {
      open: 'Open',
      safeguarding: 'Safeguarding',
      resolved: 'Resolved this month',
    },
    // Same placement as the queue's safeguarding note and the verses one: the rule sits
    // where the decision is made. This one says the quiet part out loud, that a report is
    // a member's alarm and not a finding of fact.
    guideTitle: 'A report is not a verdict.',
    guide:
      'Read the post before the reasons. Anything describing abuse, self-harm or a child at risk is flagged and routed to the branch lead pastor through the church safeguarding process, whatever you decide about the post itself.',
    listLabel: 'Reported · first report first',
    // The member's own wording, not a staff paraphrase. The four reasons are already
    // written plainly in the app (`family.json`), and a leader who says "private details"
    // while the reporter was shown the same three words is reading the same screen they
    // are. Keyed by what the database stores, so the copy moves without a migration.
    reasons: {
      at_risk: 'Someone may be at risk',
      private_details: 'Private details about someone',
      hurtful: 'Hurtful or abusive',
      not_for_this_space: 'Not for this space',
    } as Record<string, string | undefined>,
    // A reason code added to the app before this file knows about it renders as something
    // rather than as an empty row.
    unknownReason: 'Another reason',
    reportCount: (count: number) =>
      `${String(count)} ${count === 1 ? 'report' : 'reports'}`,
    // Read out before each reason, where the visible badge is a bare number in a box and
    // says nothing on its own. The colon is deliberate: it is a prefix to the reason that
    // follows it, not a sentence.
    reasonCount: (count: number) =>
      `${String(count)} ${count === 1 ? 'report' : 'reports'}:`,
    firstReported: (when: string) => `First reported ${when}`,
    posted: (when: string) => `Posted ${when}`,
    anonymous: 'Shared anonymously',
    kind: { testimony: 'Testimony', prayer: 'Prayer' },
    safeguardingPill: 'Safeguarding',
    // Said on the flagged card, where the missing Dismiss button would otherwise read as
    // an oversight. It is a rule, and rules are better stated than inferred.
    flagged:
      'Flagged for safeguarding. This stays open until the safeguarding process closes it, and neither dismissing nor removing the post will close it.',
    // The post's own state, for the case the frame does not show: reports can outlive a
    // decision on the content, so a card may be sitting on something already gone.
    contentStatus: {
      pending: 'Still waiting for review',
      approved: 'Live in the feed',
      rejected: 'Sent back to the author',
      removed: 'Already removed',
    },
    actions: {
      dismiss: 'Dismiss reports',
      flag: 'Flag safeguarding',
      reject: 'Reject with reason',
      remove: 'Remove',
    },
    outcome: {
      dismissed:
        'Reports closed, and the post is untouched. Nobody is told their report was dismissed.',
      flagged:
        'Flagged. Tell the branch lead pastor through the safeguarding process: this screen does not notify anybody.',
      rejected: 'Sent back to the author, and the reports are closed.',
      removed:
        'Removed, and the reports are closed. Only a ministry admin can restore it.',
      // The rule, met head on. Not a failure: the leader did the right thing and the
      // answer is still no.
      safeguardingStaysOpen:
        'That report is flagged for safeguarding, so it stays open until the safeguarding process closes it. Nothing else was changed.',
      contentChanged:
        'That post changed while you were reading it, so nothing was decided. Read the author’s new words below and decide again.',
      refused:
        'That is not yours to decide. It may belong to another branch, or your role may have changed since this page loaded.',
      missingReason: 'A reason is required, so nothing was changed.',
      failed: 'Something went wrong and nothing was changed. Try again.',
    },
    // Deliberately not congratulatory. An empty moderation queue means a leader is on top
    // of their work; an empty reports list means nothing has gone wrong, which is not an
    // achievement to praise anybody for.
    emptyTitle: 'Nothing reported',
    emptyBody: (branch: string) =>
      `When a member reports a testimony or a prayer in ${branch}, it appears here with what they told us. Reports about content in other branches go to their leaders.`,
    emptyBodyAll:
      'When a member reports a testimony or a prayer, it appears here with what they told us.',
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
    // An admin is the 48-hour fallback approver, so their People screen has to reach the
    // queue they are the fallback for.
    toRequests: 'Branch requests waiting',
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

  verses: {
    title: 'Daily verses',
    scope: 'Every branch · four languages',
    depthLabel: 'Days queued ahead',
    // Read out on a language under the floor. The frame flags those cards in red and
    // nothing else, which is a fact carried by colour alone; this says it in words for
    // anyone who cannot see the colour (`05` accessibility contract).
    depthLow: 'running out',
    // Named for what a reader would call them, not for the ISO codes the table stores.
    // Typed as possibly-missing on purpose: the lookup key is a language code out of the
    // database, and a fifth language added there before this file knows about it should
    // render as its code rather than as nothing (see `nameOf` in verses/format.ts).
    languageNames: {
      en: 'English',
      de: 'German',
      nl: 'Dutch',
      fr: 'French',
    } as Record<string, string | undefined>,
    // The banner that appears the moment any language drops under the 14-day floor. It
    // names the DATE rather than the count, because "runs out on 14 August" is a thing a
    // person can act on and "12 days" is a number they will discount.
    runningOutTitle: (language: string, date: string) =>
      `${language} runs out on ${date}`,
    runningOutBody: (language: string, date: string) =>
      `After that, ${language} members keep seeing the verse from ${date} rather than an empty card, so no one will tell you it has stopped.`,
    runningOutAction: (language: string) => `Import ${language}`,
    // The worse case: not running out, already out. Split into a title and a body of its
    // own rather than borrowing the guide's sentence, which sits three inches below and
    // would print the same words twice on one screen (seen 2026-08-02, in the browser).
    emptyLanguage: (language: string) => `${language} has no verses at all`,
    emptyLanguageBody: (language: string) =>
      `${language} members are seeing nothing on Home today, and there is nothing older for the app to fall back on. A quarter is 90 days.`,
    // The guide, in the place the decision is made (17 §1's pattern, borrowed here because
    // the fact is just as invisible as a safeguarding one).
    guideTitle: 'A missing day is invisible to members.',
    guide:
      'The app shows the most recent verse on or before today in their own language, so a gap repeats yesterday instead of showing nothing. Keep every language above 14 days.',
    importAction: 'Import a batch',
    addAction: 'Add one verse',
    filterAll: 'All',
    scheduledLabel: 'Scheduled · soonest first',
    today: 'Today',
    edit: 'Edit',
    // Several hundred rows carry that link, so its accessible name has to say WHICH day it
    // opens rather than leaving a screen-reader user a list of identical "Edit"s. It keeps
    // the visible word first, which is what WCAG's label-in-name rule asks for.
    editOn: (date: string, language: string) => `Edit ${date} ${language}`,
    emptyTitle: 'No verses scheduled yet',
    emptyBody:
      'Members are seeing nothing on Home until the first day is queued. A quarter is 90 days in each of the four languages.',
    notAdminTitle: 'The verse schedule is kept by a ministry admin',
    notAdminBody:
      'One verse goes out to every branch each day, so it is set centrally rather than per branch. Nothing is wrong with your account.',
    notAdminAction: 'Go to your queue',

    import: {
      title: 'Import a batch',
      scope: 'Daily verses',
      guideTitle: 'A quarter is 90 days in each language.',
      guide:
        'Paste one language at a time or all four together; the language column decides. Nothing is saved until you have seen what it will do.',
      pasteLabel: 'Paste from your spreadsheet',
      pasteHint:
        'Five columns, in any order, with a header row: date, language, reference, text, translation. Tabs or commas both work. Translation defaults to WEB when the column is missing.',
      // The frame's own placeholder: a header row and one example, tab separated, which is
      // exactly what a spreadsheet selection pastes as.
      pastePlaceholder:
        'date\tlanguage\treference\ttext\ttranslation\n2026-08-14\tde\tPsalm 23,1\tDer HERR ist mein Hirte…\tWEB',
      check: 'Check this batch',
      checking: 'Checking…',
      cancel: 'Cancel',
      previewTitle: 'Check this batch',
      previewScope: (rows: number) =>
        `${String(rows)} ${rows === 1 ? 'row' : 'rows'} pasted · nothing saved yet`,
      statNew: 'New days',
      statExisting: 'Already scheduled',
      statInvalid: 'Cannot be read',
      conflictLabel: (existing: number) =>
        existing === 1
          ? 'The day you already have'
          : `The ${String(existing)} days you already have`,
      keep: 'Keep what is there',
      replace: 'Replace them',
      conflictHint:
        'Keeping is the safe answer. Replace only if this paste is the correction, since it overwrites verses already queued for those days.',
      problemsLabel: 'Rows that cannot be read · these are skipped either way',
      problemRow: (line: number) => `Row ${String(line)}`,
      apply: (count: number) =>
        `Import ${String(count)} ${count === 1 ? 'verse' : 'verses'}`,
      applying: 'Importing…',
      back: 'Back to the paste',
      nothingToImport: 'Nothing in that paste can be imported.',
      // The normal shape of a re-paste: a corrected spreadsheet whose days are all queued
      // already. Not an error, and it names the choice that makes it do something.
      allExisting:
        'Every one of those days is already scheduled, so keeping what is there would change nothing. Choose “Replace them” if this paste is the correction.',
      emptyPaste: 'Paste some rows first.',
      offline:
        'You appear to be offline. Check your connection and try again. Nothing was saved.',
      // Reason codes come from the database as stable identifiers; the English lives here.
      reasons: {
        date_missing: 'No date given.',
        date_not_iso: 'That date is not written as YYYY-MM-DD.',
        date_impossible: 'That date does not exist.',
        language_missing: 'No language given.',
        language_unknown: 'Not one of English, German, Dutch or French.',
        text_blank: 'The verse text is empty.',
        reference_blank: 'The reference is empty.',
        duplicate_in_batch: 'This day appears twice in the paste.',
        // Possibly-missing for the same reason as languageNames: the key is the database's
        // stable identifier, and a reason code added there before this file knows about it
        // falls back to `unknownReason` rather than rendering an empty line.
      } as Record<string, string | undefined>,
      // The one reason that needs the offending value: the row carries no language pill
      // when the language is not one of the four, so without this the reader is told
      // something is wrong with a column they cannot see.
      languageUnknown: (value: string) =>
        `Language “${value}” is not one of English, German, Dutch or French.`,
      unknownReason: 'That row could not be read.',
      outcome: {
        imported: (count: number) =>
          count === 1
            ? 'That verse is scheduled. Members will see it on the day.'
            : `${String(count)} verses are scheduled. Members will see them on the day.`,
        nothing: 'Nothing was imported, so nothing changed.',
        failed: 'Something went wrong and nothing was imported. Try again.',
      },
    },

    verse: {
      editTitle: 'Edit a verse',
      addTitle: 'Add a verse',
      // The scope line under the title: which day and language this form is standing on.
      // The year is spelled out here where the list rows omit it, because this screen is
      // one verse and the list is a queue of months.
      editScope: (date: string, language: string) => `${date} · ${language}`,
      addScope: 'Daily verses',
      date: 'Date',
      // Shown as the box's placeholder and as the browser's own message when the pattern
      // does not match. ISO only, for the reason `try_iso_date()` exists: 01/02/2026 is
      // two different days depending on who is reading it, and a verse on the wrong day is
      // invisible rather than broken.
      datePlaceholder: 'YYYY-MM-DD',
      dateHint: 'Write the day as YYYY-MM-DD, for example 2026-08-14.',
      language: 'Language',
      reference: 'Reference',
      text: 'Verse text',
      translation: 'Translation',
      // "a verse in English", not the frame's "a English verse": the article the frame
      // could hard-code for German is wrong for the one language in four that starts with
      // a vowel, and would be wrong again for a fifth.
      uniqueHint: (language: string) =>
        `One verse per day per language. Saving onto a day that already has a verse in ${language} replaces it.`,
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      remove: 'Remove',
      outcome: {
        saved: 'That verse is scheduled.',
        removed: 'That verse was removed.',
        // A save that moved the verse to another day or language, where clearing the day
        // it came from did not go through. Said out loud rather than reported as success:
        // the verse now exists twice and only the reader can decide which day is right.
        movedPartly:
          'The verse was saved on its new day, but the day it came from could not be cleared, so it may still be scheduled there. Check the list below.',
        gone: 'That verse was already gone, so nothing changed.',
        invalid:
          'That verse could not be saved. Check the date is YYYY-MM-DD and nothing is blank.',
        failed: 'Something went wrong and nothing was changed. Try again.',
      },
    },
  },

  broadcasts: {
    title: 'Broadcasts',
    scope: 'A message to a branch, or to everyone',
    // The line a leader reads before they write anything (COMPOSE frame). Said at the top
    // rather than at the end of the flow, because being told at the end that you cannot
    // send what you just wrote is how a tool loses someone.
    approvalNoticeTitle: 'An admin has to release this.',
    approvalNoticeBody:
      'Every broadcast is approved by an admin who is not its author, whatever its scope. You will not be able to send it yourself.',
    tabs: { waiting: 'Waiting', drafts: 'Drafts', sent: 'Sent' },
    waitingHeading: 'Waiting for an admin',
    minesHeading: 'Yours',
    sentHeading: 'Sent',
    waitingOnYou: (count: number) =>
      count === 1 ? '1 waiting on you' : `${String(count)} waiting on you`,
    newBroadcast: 'New broadcast',
    approve: 'Approve and send',
    sendBack: 'Send back',
    stop: 'Stop sending',
    // The refusal an admin sees on their OWN broadcast, spelled out in place rather than
    // hidden behind a greyed button. Naming who else can release it IS the answer when the
    // ministry has two admins.
    ownTitle: 'Another admin has to release this one',
    ownBody: 'You wrote it, so you cannot approve it.',
    ownBodyWithNames: (names: string) =>
      `You wrote it, so you cannot approve it. ${names} can.`,
    // Halting, stated before the click rather than in a dialog after it.
    haltTitle: 'Stopping is final',
    haltBody:
      'Whatever has already left cannot be recalled, and a stopped broadcast is not resumed: you would duplicate it as a draft and start again, approval included.',
    status: {
      draft: 'Draft',
      pending_approval: 'Awaiting approval',
      rejected: 'Sent back',
      sending: 'Sending now',
      sent: 'Sent',
      halted: 'Stopped',
      failed: 'Could not be delivered',
    },
    scopeLabel: {
      branch: (branch: string) => `Branch · ${branch}`,
      ministry: 'Whole ministry',
    },
    people: (count: number) =>
      count === 1 ? '1 person' : `${String(count)} people`,
    approvedBy: (name: string) => `Approved by ${name}`,
    rejectPrompt: 'Why are you sending it back?',
    rejectHint: 'The author reads this, so write it to them.',
    // The link allowlist refusal (COMPOSE frame). It names the way out, not only the rule.
    linkNotAllowed: 'That link cannot be sent',
    linkNotAllowedBody:
      'A broadcast may link to a screen in the app or to agbcglobal.com, and nothing else. To share this one, send the broadcast without it and paste the address into the WhatsApp community yourself.',
    linkMalformed: 'That does not look like a link',
    linkMalformedBody:
      'Check it for a stray space or a missing https://, then try again.',
    whoItReaches: 'Who it reaches',
    hintLeader: (branch: string) =>
      `It goes to every member of ${branch} who has branch updates switched on.`,
    hintAdmin:
      'The whole ministry reaches every branch. Both are approved by another admin before anything is sent.',
    fieldTitle: 'Title',
    fieldBody: 'Message · English',
    fieldBodyHint:
      'German, Dutch and French are optional. Anyone whose app is set to a language you leave blank reads this one.',
    fieldBodyDe: 'Message · German (optional)',
    fieldBodyNl: 'Message · Dutch (optional)',
    fieldBodyFr: 'Message · French (optional)',
    fieldLink: 'Link (optional)',
    continue: 'Continue',
    saving: 'Saving...',
    // Pending labels say what is happening rather than "Loading", because the reader is
    // waiting to know whether a message went to the whole ministry.
    approving: 'Sending...',
    sendingBack: 'Sending back...',
    stopping: 'Stopping...',
    submitting: 'Sending for approval...',
    emptyFieldsTitle: 'It needs a title and a message',
    emptyFieldsBody:
      'Those two are what arrives on a phone, so a broadcast cannot go out without them.',
    refusedBody:
      'Your role may have changed since this screen loaded. Reload, and tell Ayo if it keeps happening.',
    // The confirmation screen (CONFIRM frame): the last thing before hundreds of lock
    // screens, so the numbers are split rather than totalled.
    confirmTitle: 'Send for approval',
    confirmScope: 'Check it the way they will read it',
    statReached: 'People reached',
    statPhone: 'On a phone now',
    statInApp: 'In-app only',
    asItArrives: 'As it will arrive',
    whatsappTitle: 'Copy for WhatsApp',
    whatsappBody:
      'The same words as pasteable text, for the church WhatsApp community. Nothing is sent by copying, and the text carries no member details.',
    whatsappAction: 'Copy',
    whatsappCopied: 'Copied',
    inAppOnlyNotice: (count: number) =>
      count === 1
        ? '1 person has no phone registered.'
        : `${String(count)} people have no phone registered.`,
    inAppOnlyBody:
      'They will find this in the app notifications the next time they open it.',
    sendForApproval: 'Send for approval',
    keepEditing: 'Keep editing',
    opensLabel: 'Opens',
    opensInApp: 'the app',
    emptyTitle: 'Nothing to send yet',
    emptyBody:
      'A broadcast reaches every member of a branch, or of the whole ministry, on their phone and in the app.',
    outcome: {
      approved: 'Approved. It is going out now.',
      sentBack: 'Sent back to the author with your note.',
      submitted: 'Sent for approval.',
      stopped: 'Stopped. Nothing more will be delivered.',
    },
    refused: 'That is not yours to do.',
    raced: 'Somebody got there first. Refresh to see where it stands now.',
  },

  sermonAudio: {
    title: 'Sermon audio',
    scope: 'Every branch · one shelf',
    // The frame's banner reads "Sunday's message has no audio yet", which is true only on
    // a Sunday; the real screen names the message, which is true every day. The body
    // carries the frame's argument for why the upload matters at all.
    missingTitle: (title: string) => `${title} has no audio yet`,
    missingBody:
      'It is on YouTube, so members can watch it. Listening in the background, the thing members actually asked for, only exists once its MP3 is on the shelf.',
    missingAction: 'Add audio',
    stats: {
      withAudio: 'With audio',
      withoutAudio: 'Without audio',
      audioOnly: 'Audio only',
    },
    guideTitle: 'Export speech quality, not music quality.',
    guide:
      '64–96 kbps mono MP3 sounds identical for a preached message and halves both storage and every member’s data. A full service lands near 25 MB; the shelf takes up to 150 MB.',
    addAudioOnly: 'Add an audio-only message',
    statsLabel: 'The shelf today',
    filters: {
      all: 'All',
      without: 'Without audio',
      with: 'With audio',
      audioOnly: 'Audio only',
    },
    listLabel: 'Recent messages · newest first',
    filtersLabel: 'Filter the list',
    filterEmpty: 'Nothing in this view. The other tabs still hold messages.',
    kind: {
      video: 'Video',
      live_replay: 'Live replay',
      audioOnly: 'Audio only',
    },
    noAudioPill: 'No audio',
    audioPill: (minutes: number) => `Audio · ${String(minutes)} min`,
    minutesOnYouTube: (minutes: number) => `${String(minutes)} min on YouTube`,
    sizeMb: (mb: number) => `${String(mb)} MB`,
    sizeKb: (kb: number) => `${String(kb)} KB`,
    neverOnYouTube: 'never on YouTube',
    rowAdd: 'Add audio',
    rowManage: 'Manage',
    // Accessible names: a list of identical "Add audio"s tells a screen-reader user
    // nothing (the verses `editOn` rule). Visible word first, per label-in-name.
    rowAddFor: (title: string) => `Add audio to ${title}`,
    rowManageFor: (title: string) => `Manage the audio on ${title}`,
    emptyTitle: 'No messages here yet',
    emptyBody:
      'The nightly sync brings the channel’s messages in overnight. An audio-only message can be added right now; it does not wait on YouTube.',
    notAdminTitle: 'The shelf is kept by a ministry admin',
    notAdminBody:
      'One shelf serves every branch, like the verse schedule, so it is stocked centrally rather than per branch. Nothing is wrong with your account.',
    notAdminAction: 'Go to your queue',

    attach: {
      title: 'Add the audio',
      fileLabel: 'The file',
      dropTitle: 'Drop the MP3 here, or browse',
      dropSub: 'MP3 or M4A · up to 150 MB',
      browse: 'Choose a file',
      dropHint:
        'Straight from your editing export. Speech quality (64–96 kbps mono) is plenty; there is no need to re-encode a bigger file if that is what you have.',
      speakerLabel: 'Speaker',
      seriesLabel: 'Series',
      seriesPlaceholder: 'None',
      prefilledHint:
        'Both come filled in from the message and land on the card members see. Fix them here if the sync guessed wrong.',
      readingFile: 'Reading the file…',
      uploadingLabel: 'Uploading',
      uploadingProgress: (sentMb: number, totalMb: number) =>
        `${String(sentMb)} of ${String(totalMb)} MB`,
      uploadingHint:
        'Keep this tab open until it finishes. Closing it stops the upload; nothing half-sent is ever shown to members.',
      checkedTitle: (minutes: number, mb: number) =>
        `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} of audio, ${String(mb)} MB`,
      checkedBody:
        'Read from the file itself. Saving puts Listen on this message in the app.',
      save: 'Save the audio',
      saving: 'Saving…',
      startOver: 'Start over',
      cancel: 'Cancel',
      // Client-side early refusals: cheap, honest, and never the real check (the server
      // reads the object's own bytes at save).
      pickNotAudio:
        'That does not look like an audio file. Export an MP3 or M4A and try again.',
      pickTooBig: (mb: number) =>
        `That file is ${String(mb)} MB and the shelf takes up to 150 MB. Export it at speech quality (64–96 kbps mono) and try again.`,
      unreadable:
        'That file could not be read as audio. Export it again and retry.',
      uploadFailed:
        'The upload did not finish. Check your connection and try again; nothing half-sent is ever shown to members.',
      wrongKindTitle: 'That file is not an MP3 or M4A',
      wrongKindBody:
        'The file’s contents were checked, not its name. Nothing was saved and the upload was discarded; export the audio again and retry.',
      speakerRequired: 'Name the speaker: it lands on the card members see.',
      goneBody:
        'That message is no longer there. Go back to the shelf and pick again.',
      refusedBody:
        'That is not yours to change. Your role may have changed since this page loaded.',
      failedBody: 'Something went wrong and nothing was changed. Try again.',
      offline:
        'You appear to be offline. Check your connection and try again. Nothing was saved.',
    },

    manage: {
      title: 'The audio on the shelf',
      factsPill: (minutes: number) => `Audio · ${String(minutes)} min`,
      shelvedOn: (date: string) => `shelved ${date}`,
      removeHint:
        'Removing takes Listen out of the app at once. Anyone mid-listen finishes their session (their link lives for up to a day), and nobody new can start. Replacing swaps a fresh file in the same way.',
      replace: 'Replace the file',
      remove: 'Remove the audio',
      removing: 'Removing…',
      // Said where the missing Remove button would otherwise read as an oversight, the
      // reports `flagged` rule: it is a rule, and rules are better stated than inferred.
      audioOnlyNoRemove:
        'This message exists only as audio, so removing it would leave nothing at all. The audio can be replaced, never removed.',
    },

    // W3.1 slice 5 (frames: the artwork field on `SERMON-AUDIO-ATTACH` and
    // `SERMON-AUDIO-NEW`, its own block on `SERMON-AUDIO-MANAGE`, and its four moments on
    // `SERMON-AUDIO-ARTWORK`). The field is optional and its hint says the opposite thing
    // in the two situations it appears in, which is the whole reason there are two hints:
    // arguing for an upload a message does not need is how a shelf fills with pictures
    // nobody asked for.
    artwork: {
      label: 'The artwork · optional',
      sectionLabel: 'The artwork',
      dropTitle: 'Drop a picture here, or browse',
      dropSub: 'JPG, PNG or WebP · up to 5 MB',
      hasThumbnailHint:
        'This message already shows its YouTube thumbnail, so it needs nothing. Add a picture only to override it: a wide one, 1280×720 or larger, since it is cropped square on a lock screen.',
      noThumbnailHint:
        'There is no picture for this one, so it shows the plain navy cover everywhere: in every list, on the player and on the lock screen. A wide picture, 1280×720 or larger, is cropped square on a lock screen.',
      hasArtworkHint:
        'Choosing a picture replaces the one above; the old one is retired as soon as the new one is saved. A wide picture, 1280×720 or larger, is cropped square on a lock screen.',
      // What the preview beside the field is showing, so the tile is never an unlabelled
      // rectangle. Also its alt text: a decorative image would be wrong here, because
      // WHICH picture is on the cards is the fact the reader came for.
      onCardsNow: 'On cards now',
      onCards: 'On cards',
      chosen: 'Chosen',
      previewOwn: 'The picture on this message',
      previewYouTube: 'The thumbnail YouTube gives this message',
      previewNone: 'The plain navy cover this message shows today',
      sending: 'Sending it',
      sendingLabel: 'Uploading the picture',
      readyTitle: (kb: number) => `Picture ready, ${String(kb)} KB`,
      readyBody: 'It lands on every card as soon as this is saved.',
      chooseAnother: 'Choose a different picture',
      clear: 'Remove',
      replace: 'Replace the picture',
      remove: 'Remove the picture',
      removing: 'Removing…',
      save: 'Save the picture',
      saving: 'Saving…',
      removeHint: (size: string, added: string) =>
        `${size}, added ${added}. Members see it on every list, on the player and on their lock screen. Removing it puts the plain navy cover back; nothing else changes.`,
      // Client-side early refusals: cheap, honest, and never the real check.
      pickNotImage:
        'That does not look like a picture. Choose a JPG, PNG or WebP and try again.',
      pickTooBig: (mb: number) =>
        `That picture is ${String(mb)} MB and the limit is 5 MB. Export it smaller and try again.`,
      uploadFailed:
        'The picture did not finish uploading. Check your connection and try again.',
      // HEIC named on purpose: a photo straight off an iPhone is the likeliest real
      // failure on this screen, and naming the fix beats restating the rule.
      wrongKindTitle: 'That file is not a JPG, PNG or WebP',
      wrongKindBody:
        'The file’s contents were checked, not its name. Nothing was saved and the upload was discarded. A photo straight off an iPhone is often HEIC: export or save it as JPG and try again.',
    },

    create: {
      title: 'An audio-only message',
      scope: 'Sermon audio',
      titleLabel: 'Title',
      dateLabel: 'Date preached',
      datePlaceholder: 'YYYY-MM-DD',
      dateHint:
        'Decides where it appears in the app’s rails. It shows an audio cover instead of a video, and everything else works the same: resume, save, notes.',
      submit: 'Create the message',
      submitting: 'Creating…',
      titleRequired: 'Give the message a title.',
      dateRequired: 'Write the day it was preached as YYYY-MM-DD.',
    },

    outcome: {
      saved:
        'The audio is on the shelf. Listen is live on this message in the app.',
      replaced:
        'The new file is on the shelf, and the old one is retired. Listeners mid-session finish on the old file for up to a day.',
      created: 'The message is in Watch now, with Listen ready.',
      removed:
        'The audio is off the shelf. The message stays, and Listen is gone from the app.',
      artworkSet:
        'The picture is up. It is on every card, on the player and on the lock screen.',
      artworkReplaced:
        'The new picture is up and the old one is retired. Devices holding the old one see it until they next load the card.',
      artworkRemoved:
        'The picture is gone and the plain navy cover is back. Nothing else changed.',
      // Its own line rather than reusing the forms' `wrongKindBody`. That body reads under
      // a Notice whose TITLE names the problem; the manage screen refuses through a
      // redirect, where an alert saying only "the contents were checked, not the name"
      // never tells the reader what was actually wrong (caught driving the real file pick,
      // 2026-08-15).
      artworkNotImage:
        'That file is not a JPG, PNG or WebP. Its contents were checked, not its name, so nothing was saved and the upload was discarded. A photo straight off an iPhone is often HEIC: export or save it as JPG and try again.',
      noArtwork: 'That message had no picture, so nothing changed.',
      noAudio: 'That message had no audio, so nothing changed.',
      gone: 'That message is no longer there, so nothing changed.',
      audioOnly:
        'That message exists only as audio, so its audio cannot be removed, only replaced. Nothing was changed.',
      refused:
        'That is not yours to change. Your role may have changed since this page loaded.',
      failed: 'Something went wrong and nothing was changed. Try again.',
    },
  },

  /**
   * Events (docs/spec/17 §3, `11`; frames NEW EVENT / EDIT / CANCEL).
   *
   * Every sentence here is really about the audience, because that is what makes this form
   * different from every other one in the dashboard: an ordinary save reaches phones. The
   * counts are the SAME ones the notice reaches (`event_rsvp_audience`), so the copy can
   * promise a number without hedging.
   */
  events: {
    title: 'Events',
    scope: 'What is on, and who has been told',
    newEvent: 'New event',
    open: 'Open',
    backToEvents: 'Back to events',
    upcomingHeading: 'Coming up',
    pastHeading: 'Already happened',
    emptyTitle: 'Nothing in the diary yet',
    emptyBody:
      'Post the next gathering here and everyone at your branch hears about it. Members see the same list in the app.',
    ministryWide: 'All branches',
    cancelledPill: 'Cancelled',
    // Who called it off, because cancelling reaches everyone holding an RSVP and an act
    // with that reach should have a name against it (W3.5 slice 4 follow-up).
    cancelledBy: (who: string, when: string) => `Cancelled by ${who} · ${when}`,
    // The fallback when the actor is real but not a name this caller may read: `profiles`
    // is RLS-scoped, so an admin from another branch is an admin rather than a stranger.
    aMinistryAdmin: 'a ministry admin',
    rsvpOff: 'No RSVP',
    readOnly: 'A ministry admin runs this one',
    // The form.
    createTitle: 'New event',
    createScope: (branch: string) =>
      `${branch} · times are this branch's own clock`,
    ministryScopeNote: 'Ministry-wide · shown to every branch',
    fields: {
      scope: 'Who it is for',
      scopeBranch: 'My branch',
      scopeMinistry: 'The whole family',
      scopeHint:
        'Ministry-wide events are admins only. They show under “All branches” in the app and reach every branch.',
      scopeLocked:
        'Who an event is for is fixed once it is posted. Post a new one if it needs to move.',
      title: 'Title',
      starts: 'Starts',
      startsHint: (branch: string) =>
        `${branch}'s own clock, which is what members read in the app.`,
      ends: 'Ends (optional)',
      location: 'Place',
      description: 'About it',
      rsvp: 'RSVP',
      rsvpOn: 'Members can say they are going',
      rsvpHint:
        'Turn this off for something nobody needs to book, like a notice. You can still change it later.',
      picture: 'Picture · optional',
    },
    picture: {
      dropTitle: 'Drop a picture, or choose a file',
      dropSub: 'JPG, PNG or WebP · up to 5 MB',
      // Three subjects, three different true things to say. `hasThumbnailHint` cannot
      // happen for an event (nothing syncs one a picture), but the field's shape asks for
      // it, so it answers the same way as no picture at all rather than inventing a state.
      noThumbnailHint:
        'Without one, the event shows the branded cover at the top of its page, which is a designed state rather than a gap. A wide picture, 1280×720 or larger, sits best behind the title.',
      hasThumbnailHint:
        'Without one, the event shows the branded cover at the top of its page, which is a designed state rather than a gap. A wide picture, 1280×720 or larger, sits best behind the title.',
      hasArtworkHint:
        'Choosing a picture replaces the one above; the old one is retired as soon as this is saved. A wide picture, 1280×720 or larger, sits best behind the title.',
      onCardsNow: 'On the event now',
      // What the empty tile is captioned, which is the frame's word for it: the slot is
      // not empty, it holds the branded cover, and naming it as an absence would read as a
      // missing image rather than as the designed state `11` calls for.
      captionNone: 'Branded cover',
      chosen: 'Chosen',
      previewOwn: 'The picture on this event',
      previewYouTube: 'The picture on this event',
      previewNone: 'The branded cover this event shows today',
      sendingLabel: 'Uploading the picture',
      readyTitle: (kb: number) => `Picture ready, ${String(kb)} KB`,
      readyBody: 'It goes up when this event is saved.',
      chooseAnother: 'Choose a different picture',
      pickNotImage: 'That is not a JPG, PNG or WebP picture.',
      pickTooBig: (mb: number) =>
        `That picture is ${String(mb)} MB. The limit is 5 MB.`,
      uploadFailed: 'The picture did not reach storage. Try it again.',
      remove: 'Remove the picture',
      removeHint:
        'The event goes back to the branded cover. Nothing else changes, and nobody is told: only a new time or venue reaches anyone.',
    },
    // What a save will do, said before it happens.
    postingTellsTitle: (count: number) =>
      `Posting this tells ${String(count)} ${count === 1 ? 'person' : 'people'}.`,
    postingTellsBody:
      'Everyone at your branch who has branch updates switched on gets a notification a couple of minutes after you save. Nothing goes out while you are still editing.',
    postingMinistryBody:
      'Every branch hears about this one: everyone with ministry announcements switched on gets a notification a couple of minutes after you save.',
    changeTellsTitle: (count: number) =>
      `This change tells ${String(count)} ${count === 1 ? 'person' : 'people'}`,
    // Nobody has said they are coming yet, so there is nothing to warn about. Said out loud
    // because "this change tells 0 people" reads as a broken counter rather than as calm.
    changeTellsNobodyTitle: 'Nobody has said they are coming yet',
    changeTellsNobodyBody:
      'So a change to the time or the place tells nobody. Once members RSVP, moving it lets them know, about two minutes after you save.',
    changeTellsBody: (when: string) =>
      `Change the time or the place and everyone still holding an RSVP is told, about two minutes after you save, so there is time to change your mind. Right now it says ${when}. Editing the description tells nobody.`,
    goingAndInterested: (going: number, interested: number) =>
      `${String(going)} going, ${String(interested)} interested`,
    save: 'Save changes',
    saving: 'Saving',
    post: 'Post this event',
    posting: 'Posting',
    discard: 'Discard',
    cancelForm: 'Cancel',
    // Cancelling.
    cancelEvent: 'Cancel this event',
    cancelTitle: (title: string) => `Cancel ${title}?`,
    cancelStats: {
      going: 'Said they are going',
      interested: 'Interested',
      reachable: 'Will be told',
    },
    cancelTellsNobodyTitle: 'Nobody has said they are coming',
    cancelTellsNobodyBody:
      'So cancelling tells nobody. It still shows in the app as cancelled, which is what anyone arriving from an old link will see.',
    cancelWarningTitle: 'Everyone holding an RSVP hears about this',
    cancelWarningBody: (count: number) =>
      `All ${String(count)} get “this event is cancelled”, including anyone who has branch updates switched off: they booked, so this one is not theirs to miss. It goes out about two minutes after you confirm, so putting it back on straight away sends nothing at all.`,
    cancelKeepsTitle: 'The event is not deleted',
    cancelKeepsBody:
      'It stays in the app wearing a “Cancelled by the organiser” banner, so an old link still lands somewhere true instead of on a missing page. You can put it back on while its start is still in the future.',
    cancelConfirm: 'Yes, cancel it',
    cancelling: 'Cancelling',
    cancelKeep: 'Keep it on',
    reinstate: 'Put it back on',
    reinstating: 'Putting it back on',
    reinstateNote:
      'This event is cancelled. Putting it back on tells everyone still holding an RSVP, and only works while its start is in the future.',
    problems: {
      title_required: 'Give the event a title before posting it.',
      starts_required: 'An event needs a start time.',
      location_required: 'Say where it is, even if that is “online”.',
      ends_before_start: 'The end time is before the start time.',
      scope_locked:
        'Who an event is for cannot change after it is posted. Post a new one instead.',
      image_not_found:
        'The picture did not finish uploading. Choose it again, then save.',
      image_not_an_image:
        'That file is not a JPG, PNG or WebP picture, whatever it is named. Nothing was saved.',
      refused:
        'That is not yours to change. Your role may have changed since this page loaded.',
      failed: 'Something went wrong and nothing was changed. Try again.',
    },
    outcome: {
      posted: 'Posted. Your branch hears about it in a couple of minutes.',
      postedMinistry:
        'Posted. Every branch hears about it in a couple of minutes.',
      saved: 'Saved.',
      savedAndTold:
        'Saved. Everyone holding an RSVP is told in a couple of minutes.',
      cancelled:
        'Cancelled. Everyone holding an RSVP is told in a couple of minutes.',
      reinstated:
        'Back on. Everyone holding an RSVP is told in a couple of minutes.',
      alreadyStarted:
        'That event has already started, so it stays cancelled. Post a new one if it is happening again.',
    },
  },

  // W3.5 slice 5b. Two acts here reach every member and neither can be undone by a leader,
  // so the copy carries more weight than usual: every consequence a screen states is one the
  // reader is deciding against, and each number below comes from the same definition the act
  // itself uses (`server/branches.ts`), never from a count this layer made up.
  branches: {
    title: 'Branches',
    scope: 'Where AGBC meets, and who runs each one',
    newBranch: 'Add a branch',
    open: 'Open',
    backToBranches: 'Back to branches',
    openHeading: 'Open',
    closedHeading: 'Closed',
    hqPill: 'HQ',
    closedPill: 'Closed',
    members: (count: number) =>
      `${String(count)} ${count === 1 ? 'member' : 'members'}`,
    emptyTitle: 'No branches yet',
    emptyBody:
      'Add the first one and it appears in the app straight away, for members and guests alike.',

    // The create form. Its guide is the whole point of the screen: there is no draft state
    // for a branch, so the first save is the moment every member and guest can see it.
    createTitle: 'Add a branch',
    createScope: (nth: string) => `The ${nth} place AGBC meets`,
    createGuideTitle:
      'There is no draft. Saving puts this in front of everybody.',
    createGuideBody:
      'It joins the list new members choose from, the switcher on Home and the family map, for members and guests alike, the moment you press the button and without an app release. Nothing is sent to anybody’s phone: a new branch is an invitation to find, not an announcement.',
    createSubmit: 'Add this branch',
    createPending: 'Adding…',
    createFooter:
      'Headquarters and closing are decided from a branch’s own page, not here: neither is a thing to settle about a place on the day it opens.',

    // The edit form.
    // No "open since": `branches` has no opened-at, and `created_at` is when the ROW was
    // written, which for the four seeded branches is the day this repo was set up rather
    // than the day the church started meeting there. A subtitle is not worth a column, and
    // an invented date is worse than none.
    editScope: (members: number, zone: string) =>
      `${String(members)} ${members === 1 ? 'member' : 'members'} · ${zone}`,
    editScopeClosed: (members: number, when: string) =>
      `${String(members)} ${members === 1 ? 'member' : 'members'} · closed ${when}`,
    save: 'Save changes',
    savePending: 'Saving…',
    discard: 'Discard',

    // Sections, in the order the frame puts them.
    sectionBranch: 'The branch',
    sectionWhere: 'Where it meets',
    sectionWhen: 'When it meets',
    sectionWho: 'Who leads it',
    sectionApp: 'On the app',

    nameLabel: 'Name',
    namePlaceholder: 'AGBC Rotterdam',
    slugLabel: 'Short id',
    slugPlaceholder: 'rotterdam',
    slugHintNew:
      'Lowercase, no spaces. Chosen once and never changed, so it is worth a second’s thought: it is how this branch is named in every row that will ever point at it.',
    slugHintExisting:
      'Set when the branch was added and never after. Renaming a branch is an edit; re-slugging one is a different branch wearing its rows.',
    cityLabel: 'City',
    countryLabel: 'Country',
    languagesLabel: 'Languages',
    languagesPlaceholder: 'Nederlands / English',
    timezoneLabel: 'Time zone',
    timezonePlaceholder: 'Europe/Amsterdam',
    timezoneHint:
      'Not a display setting. It decides which DAY an “I’m here” tap counts as, and what time a reminder goes out.',
    addressLabel: 'Address',
    addressPlaceholder: 'Street and number',
    address2Label: 'Address line 2 (optional)',
    address2Placeholder: 'Unit, building or floor',
    latLabel: 'Latitude',
    lngLabel: 'Longitude',
    coordinatesHint:
      'Both are needed: a branch with no coordinates has no pin, and the family map is the screen this whole app is named after.',

    // The days and the three service kinds live here rather than in the component, on the
    // dashboard's own rule: no component holds a literal string, even though this app is
    // deliberately not translated. `weekdays` is indexed by `branch_services.weekday`, where
    // 0 is Sunday, so its ORDER is part of the contract and not a display choice.
    weekdays: [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ],
    serviceKinds: {
      sunday: 'Sunday',
      midweek: 'Midweek',
      classes: 'Classes',
    },
    weekdayLabel: 'Day',
    startTimeLabel: 'Starts',
    serviceKindLabel: 'Kind',
    serviceLabelLabel: 'What to call it',
    addService: 'Add a service',
    removeService: (label: string) => `Remove ${label || 'this service'}`,
    servicesHint:
      'These rows are what the reminders read: an hour before each one, everybody at this branch who has service reminders on hears about it. Removing a row stops those, and changes nothing that has already gone out.',
    serviceTimesLabel: 'How the times read in the app',
    serviceTimesPlaceholder: 'Sundays 11:00, doors from 10:30',
    serviceTimesHint:
      'The sentence members actually read on the church page, in your words. Kept separate from the rows above on purpose: the rows are a schedule and this is a welcome. If you change one, look at the other.',

    leadNameLabel: 'Lead name',
    leadNamePlaceholder: 'Pastor',
    leadRoleLabel: 'Lead role',
    leadRolePlaceholder: 'Branch Pastor',
    leadBioLabel: 'A line about them',
    leadBioPlaceholder: 'A sentence members read under their name',
    leadersLabel: 'Other leaders',
    leaderNameLabel: 'Name',
    leaderRoleLabel: 'What they do',
    addLeader: 'Add a leader',
    removeLeader: (name: string) => `Remove ${name || 'this leader'}`,
    leadersGuideTitle: 'Naming somebody here gives them nothing.',
    leadersGuideBody:
      'These are the names on the church page, under “who leads here”. Letting a person moderate this branch is a separate act in People, by email address, and it is the one that decides what they can see.',

    youtubeLabel: 'YouTube channel (optional)',
    youtubePlaceholder: 'Leave empty to use the main AGBC channel',
    emailLabel: 'Contact email',
    welcomeLabel: 'Welcome',
    welcomePlaceholder: 'What this branch wants a stranger to read first',
    orderLabel: 'Order in the list',
    orderHint: 'Where it sits among the others. Defaults to last.',

    // The two banners at the foot of the edit form.
    hqBannerTitle: (branch: string) => `${branch} is the headquarters`,
    hqBannerBody:
      'HQ wears the gold badge members see in the branch list, is offered first when somebody’s branch closes, sets the clock for events belonging to the whole family, and is the one branch that cannot itself be closed.',
    hqBannerAction: 'Move HQ here',
    hqBannerThisOne:
      'This branch is the headquarters, so it cannot be closed and cannot be handed the badge it already holds.',
    closeBannerTitle: 'Close this branch',
    closeBannerBody:
      'For a branch that has stopped meeting. It is never deleted: its testimonies, prayers and attendance stay exactly where they are.',
    closeBannerAction: (branch: string) => `Close ${branch}`,
    reopenBannerTitle: (who: string, when: string) =>
      `Closed by ${who} · ${when}`,
    reopenBannerBody:
      'It is hidden from the branch list, the switcher and the map, its reminders have stopped and nothing new can go on its diary.',
    reopenBannerAction: 'Open it again',
    aMinistryAdmin: 'a ministry admin',

    // CLOSE, blocked.
    closeTitle: (branch: string) => `Close ${branch}?`,
    closeBlockedScope: (count: number) =>
      `Not yet: ${count === 1 ? 'one person' : `${String(count)} people`} still ${count === 1 ? 'leads' : 'lead'} it`,
    closeBlockedTitle: 'Move or step down its leaders first',
    closeBlockedBody: (names: string) =>
      `${names} ${names.includes(' and ') ? 'lead' : 'leads'} this branch. Give them another branch, or make them members again, and this page will let you carry on.`,
    closeBlockedAction: 'Open People',
    closeBlockedGuideTitle: 'This is not tidying up.',
    closeBlockedGuideBody:
      'What a leader can moderate is decided by which branch they belong to, so a leader still pointing at a closed branch has authority over a place that no longer exists. Emptying the branch first is also what hands its unreviewed posts to the admins: the queue goes to a branch’s own leaders, or to every admin when it has none.',
    backToBranch: 'Back to the branch',

    // CLOSE, the confirm.
    closeScope: (city: string) => `${city} · no leaders left`,
    statMembers: 'Members to re-home',
    statGatherings: 'Gatherings cancelled',
    statBroadcasts: 'Broadcast stopped',
    statBroadcastsPlural: 'Broadcasts stopped',
    closeMembersTitle: (count: number) =>
      `${String(count)} ${count === 1 ? 'member is' : 'members are'} asked to choose a new home`,
    closeMembersBody: (hq: string) =>
      `Next time each of them opens the app they are asked where they belong now, with ${hq} offered first. Nobody is moved for them, and nobody is locked out while they think about it. Until they choose, branch news and service reminders stop reaching them; the whole family’s announcements still do.`,
    closeMembersNone:
      'Nobody calls this branch home, so nobody is asked to move.',
    closeEventsTitle: (events: number, people: number) =>
      `Its next ${events === 1 ? 'gathering is' : `${String(events)} gatherings are`} cancelled, and ${String(people)} ${people === 1 ? 'person is' : 'people are'} told`,
    closeEventsBody:
      'Everyone still holding an RSVP gets “this is cancelled” in their own language, about two minutes after you confirm. Gatherings already held are left exactly as they are.',
    closeEventsNone: 'Nothing is in its diary, so nobody is told anything.',
    closeKeptTitle: 'Nothing is deleted',
    closeKeptBody:
      'Every testimony, prayer and attendance record stays, and stays readable under Everywhere: this branch has been part of the family and the family map still knows it. The branch disappears from the places people JOIN it from, and you can open it again.',
    typeToConfirmLabel: 'Type the branch name to confirm',
    typeToConfirmHint: (branch: string) => `Type ${branch} exactly.`,
    codeLabel: 'Code from your authenticator',
    closeCodeHint:
      'Asked for again because this one closes a place. Nobody else has to approve it, so the second factor is the pause.',
    closeSubmit: 'Close this branch',
    closePending: 'Closing…',
    closeCancel: 'Keep it open',

    // RE-OPEN.
    reopenTitle: (branch: string) => `Open ${branch} again?`,
    reopenScope: (who: string, when: string) => `Closed on ${when} by ${who}`,
    reopenBackTitle: 'It becomes a place again',
    reopenBackBody:
      'It comes back to the branch list, the switcher and the map, people can join it, and it can hold events and send broadcasts. Its own leaders are not restored: give somebody the role in People when there is somebody to give it to.',
    reopenNotUndoTitle: 'This is not an undo',
    reopenNotUndoBody:
      'Any cancelled gatherings stay cancelled, because people were already told and announcing them again would be a second message about the same day. Members who have already chosen a new home stay where they went: that was their choice to make, not ours to reverse.',
    reopenSubmit: 'Open it again',
    reopenPending: 'Opening…',
    reopenCancel: 'Leave it closed',

    // MOVE HQ.
    hqTitle: (branch: string) => `Make ${branch} the headquarters?`,
    hqScope: (current: string) =>
      `${current} has held it since the first branch`,
    hqBadgeTitle: 'The gold HQ badge moves, and members see it move',
    hqBadgeBody:
      'It sits beside the branch name everywhere somebody chooses one: the list new members pick from, and the switcher on Home. Nobody is told, and nobody moves branch; the badge is simply on this one the next time they look.',
    hqDefaultsTitle: 'Two defaults move with it',
    hqDefaultsBody: (zone: string) =>
      `A member whose branch closes is offered this one first, and an event that belongs to the whole family takes its clock (${zone}) unless it is given one. Events already posted keep the zone they were posted with.`,
    hqLosesTitle: (current: string) => `And ${current} becomes closeable`,
    hqLosesBody:
      'HQ is the one branch this dashboard refuses to close, because it is where everyone else is sent. Hand that over and the branch holding it now loses the protection.',
    hqCodeHint:
      'The same pause the closing screen asks for, and for the same reason: an ordinary edit here rides your sign-in, and the two acts that reach every member ask again.',
    hqSubmit: (branch: string) => `Move HQ to ${branch}`,
    hqPending: 'Moving…',
    hqCancel: (current: string) => `Leave it with ${current}`,

    problems: {
      nameRequired: 'Give the branch a name.',
      slugRequired: 'Give the branch a short id.',
      slugShape:
        'A short id is lowercase letters, numbers and single hyphens, and cannot be changed once the branch exists.',
      slugTaken: 'A branch already uses that short id. Pick another.',
      cityRequired: 'Say which city it meets in.',
      countryRequired: 'Say which country it is in.',
      timezoneRequired: 'Give the branch a time zone.',
      timezoneUnknown:
        'That is not a time zone this system knows. Use an IANA id like Europe/Amsterdam or Africa/Lagos.',
      coordinatesRequired:
        'Give both coordinates, as numbers: latitude between -90 and 90, longitude between -180 and 180.',
      serviceIncomplete: 'Every service row needs a start time.',
      nameMismatch: 'That is not the branch name. Type it exactly to confirm.',
      badCode:
        'That code did not work. Open your authenticator and try the next one.',
      noFactor:
        'Your account has no authenticator set up, so this cannot be confirmed.',
      hasLeaders:
        'Somebody still leads this branch. Move or step them down first.',
      isHq: 'That branch is the headquarters, which is where members are sent when a branch closes, so it cannot be closed.',
      lastBranch: 'That is the last open branch, so it cannot be closed.',
      already: 'That has already been done.',
      notFound: 'That branch no longer exists.',
      refused: 'That is not yours to do.',
      failed: 'That did not go through. Try again.',
    },

    outcome: {
      added: 'Added. It is in the app now, for members and guests alike.',
      saved: 'Saved.',
      closed:
        'Closed. Its members are asked to choose a new home next time they open the app.',
      reopened: 'Open again, and back in front of members.',
      hqMoved: 'The headquarters has moved.',
    },
  },

  /**
   * Attaching a website course registration to a member by hand (#164, frames approved
   * 2026-08-31).
   *
   * Two rules run through all of it. THE AMOUNT IS NEVER NAMED, anywhere, in any string:
   * `20` §minimum necessary, and the figure says nothing about who somebody is. And WHO set
   * a row aside is never named either, because `set_aside_by` is outside the column grant;
   * every sentence about setting aside says when, or says nothing.
   */
  academy: {
    title: 'Academy',
    scope: 'Registrations paid on the website',

    stats: {
      waiting: 'Waiting to be matched',
      aside: 'Set aside',
      linkedByHand: 'Linked by hand',
    },

    filters: {
      waiting: (count: number) => `Waiting ${String(count)}`,
      aside: (count: number) => `Set aside ${String(count)}`,
      linked: 'Linked',
      label: 'Which registrations',
    },

    // The judgement warning sits above the decision it governs, the way the moderation
    // queue's safeguarding rule does. Decision 1's accepted risk, stated to the person who
    // carries it.
    guideTitle: 'A link is a judgement, not proof of anything.',
    guide:
      'Attaching a payment to the wrong member gives them somebody else’s course, tells them it is theirs, and teaches the app to repeat the mistake the next time that address pays. Where the name is not obviously the same person, leave it here and ask them.',

    waitingLabel: 'Waiting to be matched · newest first',
    asideLabel: 'Set aside · most recent first',
    linkedLabel: 'Attached to a member · most recent first',

    // A registration whose slug matched nothing in our catalogue. Not an error: the website
    // sells things we do not carry, and `course_id` is resolved from the slug at insert.
    noCourse: 'Not a course in our catalogue',
    noBranch: 'No branch given',
    registeredOn: (when: string) => `Registered ${when}`,
    setAsideOn: (when: string) => `Set aside ${when}`,

    notMatched: 'Not matched',
    methods: {
      leader: 'Linked by hand',
      email_auto: 'Matched on the address',
      handoff: 'Registered in the app',
      self: 'Claimed by the member',
    },

    actions: {
      find: 'Find their account',
      setAside: 'No app account',
      bringBack: 'Bring it back',
      unlink: 'Unlink',
      backToQueue: 'Back to the queue',
      backToSuggestions: 'Back to the suggestions',
      seeAside: (count: number) => `See the ${String(count)} set aside`,
    },

    emptyTitle: 'Nothing needs a name',
    emptyBody:
      'Registrations attach themselves whenever the payment carries an address the member signs in with. This screen holds only the ones that did not, so most weeks it is empty and that is the system working.',
    emptyAsideTitle: 'Nothing has been set aside',
    emptyAsideBody:
      'A registration lands here when somebody decides the payer never installed the app. Nothing has been judged that way yet.',
    emptyLinkedTitle: 'Nothing has been attached yet',
    emptyLinkedBody:
      'Registrations that found their member, by hand or on their own, are listed here so a wrong one can be undone.',

    link: {
      title: 'Whose registration is this?',
      scope: (course: string, when: string) => `${course} · registered ${when}`,
      paidLabel: 'Paid on the website',
      // Said out loud because it is the one thing that makes the list below honest: an exact
      // address was matched automatically long before a human saw the row.
      guideTitle: 'Every name below is a resemblance, not a match.',
      guide:
        'Anyone signing in with this exact address was attached automatically long before the row reached you, so what is left are people whose name looks similar. Each row says what the resemblance is. Read it before you choose.',
      suggestionsLabel: 'Members who might be them · best first',
      noneLabel: 'None of them?',
      searchLabel: 'Search by name, or by the address they sign in with',
      searchPlaceholder: 'Ade, or ade.o@outlook.com',
      searchHint:
        'Two letters or more, and at most eight people come back. There is no way to list everybody. An address is matched exactly, a name loosely.',
      search: 'Search',
      resultsLabel: (count: number, query: string) =>
        `${String(count)} ${count === 1 ? 'person' : 'people'} match “${query}” · closest first`,
      choose: (name: string) => `Choose ${name}`,
      noResultsTitle: 'Nobody here is called that',
      noResultsBody: (query: string) =>
        `No member’s name or sign-in address matches “${query}”. Try the part of the name they would have typed themselves, or ask them which address they sign in with. If they have never opened the app, this registration is one to set aside.`,
      tooShortTitle: 'Give it at least two letters',
      tooShortBody:
        'A single character would return most of the ministry, and there is no reason to read a list of everybody in order to find one person.',
      /**
       * The reason a suggestion carries, as the database phrased it.
       *
       * A map rather than a passthrough, so no copy lives outside this file, and with a
       * fallback to the raw string so a reason added in SQL degrades to itself rather than
       * to a blank pill. Deliberately NOT re-derived from the similarity score and the
       * branch names: that would give one visible fact two owners.
       */
      reasons: {
        'similar name': 'Similar name',
        'similar name, same branch': 'Similar name, same branch',
      } as Record<string, string>,
    },

    confirm: {
      title: (member: string) => `Attach this registration to ${member}?`,
      becomesLabel: 'Attached to',
      toldTitle: (member: string) =>
        `${member} is told, within a minute or two`,
      toldBody: (course: string) =>
        `They get “Your place is confirmed” on their phone and in their notifications, in their own language, and it opens ${course}. Nothing at all is sent to the address on the payment.`,
      // Decision 5 and open risk 1, stated as the accepted risk it is rather than softened.
      teachesTitle: (address: string, member: string) =>
        `This also teaches the app that ${address} is ${member}’s`,
      teachesBody: (member: string) =>
        `From now on anything paid for with that address attaches to ${member} by itself, with nobody in the loop. That is exactly the point when you are right, and the danger when you are not: a shared or mistyped address quietly becomes one person’s permanent rule.`,
      undoTitle: 'You can undo the link. You cannot undo the address',
      undoBody: (member: string) =>
        `Unlinking puts the registration back in the queue, and ${member} keeps the proven address, because by then it may have been proven another way. Taking an address off somebody is a different act with different consequences, and it is not built.`,
      submit: (member: string) => `Yes, attach it to ${member}`,
      pending: 'Attaching…',
      cancel: 'No, go back',
    },

    unlink: {
      title: (member: string) => `Unlink this registration from ${member}?`,
      scope: (course: string, when: string) => `${course} · linked ${when}`,
      silenceTitle: (member: string) => `${member} is told nothing at all`,
      silenceBody: (course: string) =>
        `There is no kind way to send “that course is not yours after all” to somebody’s lock screen, so nothing is sent. ${course} simply stops appearing as theirs. You are the one who knows why: reach them yourself.`,
      addressTitle: 'The address stays proven',
      addressBody: (address: string, member: string) =>
        `${address} remains one of ${member}’s addresses, so the next payment from it attaches to them again by itself. That is on purpose: it may have been proven another way since, and taking an address off somebody is a different act with different consequences. It is not built.`,
      backTitle: 'The registration goes back to the queue',
      backBody:
        'It appears under Waiting again, exactly as it arrived, with nothing about the payment changed, ready to be attached to whoever it really belongs to.',
      typeLabel: 'Type the member’s name to confirm',
      typeHint:
        'Asked for because this one detaches a person from a course they paid for. No code from your authenticator: nothing leaves for a phone, and linking it again puts it back exactly as it was.',
      submit: 'Unlink it',
      pending: 'Unlinking…',
      cancel: 'Leave it as it is',
      nameMismatch: 'That is not the name on this registration',
      // Its own words, not the hint repeated: the reader has just read the hint and needs to
      // know what to do differently, which is to copy the name exactly as it appears above.
      nameMismatchBody: (member: string) =>
        `Type it exactly as it appears above: ${member}. Nothing has been changed.`,
    },

    refusedTitle: 'That address already belongs to somebody else',
    refusedScope: 'Nothing has been changed',
    // `owner` is the member who already holds the address, when we could read one, and the
    // reason the screen bothers to look it up is the instruction below it: you cannot ring
    // somebody you have not been told about.
    takenTitle: (address: string, owner: string | null) =>
      owner
        ? `${address} is already proven for ${owner}`
        : `${address} is already proven for another member`,
    takenBody: (member: string, owner: string | null) =>
      `Attaching this registration to ${member} would leave ${owner ? `${owner} and ${member}` : 'two members'} holding one mailbox, and the next payment from it would attach itself to whichever of them the rule names, with no human in the loop. That is the mistake this tool is most dangerous for, so the link is refused rather than made without proving the address.`,
    signinTitle: (address: string) =>
      `${address} is the address another account signs in with`,
    signinBody: (member: string) =>
      `The same collision seen from its other half: attaching it to ${member} would give one mailbox two owners. The link is refused rather than made without proving the address.`,
    ringThemTitle: 'This is a phone call, not a form',
    ringThemBody:
      'Find out whose address it actually is. If this registration really is theirs and the other row is the wrong one, unlink that registration first and come back. If it is a mailbox a family shares, this one is to set aside rather than force onto a name.',

    // The set-aside guide, on the view where those rows live: decision 4, in the words that
    // say why the undo matters.
    asideGuideTitle:
      'Setting aside is not deleting, and not a decision about their place.',
    asideGuide:
      'The payment record stands and they keep their course; what changes is that nobody is still looking for their app account. A queue that only grows is a queue people stop reading, and then a real one is missed among the permanent residents.',

    // The undo banner, which carries the statement AND the reversal, so the outcome Alert is
    // suppressed while it is on screen: two boxes saying the same sentence is what the first
    // build put there (seen 2026-08-31).
    undoTitle: (name: string) => `${name}’s registration is set aside`,
    undoBody:
      'It is out of the working queue and nothing about the payment has changed. Their place on the course is exactly as it was.',

    outcome: {
      linked: 'Attached. They are told within a minute or two.',
      unlinked: 'Unlinked. It is back in the queue, and nothing was sent.',
      setAside: 'Set aside. It is out of the working queue.',
      broughtBack: 'Back in the queue.',
      alreadyLinked:
        'Somebody attached that registration already. Open it under Linked to see who has it.',
      wasSetAside:
        'That registration was set aside. Bring it back before attaching it to anybody.',
      notLinked: 'That registration is not attached to anybody.',
      isLinked:
        'That registration is already attached to a member, so it is not un-matchable. Unlink it first.',
      noMember: 'That member no longer has an account.',
      gone: 'That registration is not there any more.',
      refused: 'That is not yours to do.',
      failed: 'That did not go through. Try again.',
    },
  },

  refused: {
    notAdminTitle: 'Roles are handed out by a ministry admin',
    notAdminBody:
      'Roles are handed out by a ministry admin, and nothing is wrong with your account. What is yours is deciding who joins your branch.',
    notAdminAction: 'Go to branch requests',
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
