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
