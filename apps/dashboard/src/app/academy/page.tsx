import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { FocusOnArrival } from '@/components/ui/FocusOnArrival';
import { Guide } from '@/components/ui/Guide';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import {
  loadRegistration,
  loadRegistrationQueue,
  QUEUE_LIMIT,
  type QueueView,
} from '@/server/registrations';

import { setAsideAction } from './actions';
import { RegistrationCard } from './RegistrationCard';

export const dynamic = 'force-dynamic';

/**
 * The Academy queue: website registrations waiting for a member (#164, docs/spec/17 §4,
 * frames approved 2026-08-31).
 *
 * ONE ROUTE, THREE VIEWS, and the view is in the URL (`?view=waiting|aside|linked`), which
 * is what makes the filter shareable, refreshable and back-button safe. `?outcome=<code>`
 * reports what the last act did, and `?undo=<id>` puts the reversal beside the result: none
 * of them names anybody, so this surface keeps the no-JavaScript shape the moderation queue
 * has (`20` keeps PII out of URLs; a uuid names nobody on its own).
 *
 * ADMIN-ONLY, and the refusal stays INSIDE the shell rather than redirecting, so a leader who
 * followed the rail lands on an explanation with a route onward instead of a dead end. That
 * is the shape PR #116 fixed on People, repeated here for the same reason.
 */
export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'link_registrations' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    if (verdict.reason === 'not_admin' && verdict.caller) {
      return (
        <DashboardShell caller={verdict.caller} current="academy">
          <PageHeader title={copy.academy.title} scope={copy.academy.scope} />
          <Notice
            tone="off"
            title={copy.academy.leaderRefusedTitle}
            action={
              <Link
                href="/moderation"
                className="inline-flex min-h-12 items-center rounded-button border border-cardline px-5 text-body font-bold whitespace-nowrap text-text hover:bg-alt"
              >
                {copy.queue.title}
              </Link>
            }
          >
            {copy.academy.leaderRefusedBody}
          </Notice>
        </DashboardShell>
      );
    }
    redirect('/');
  }

  const params = await searchParams;
  const view = readView(params.view);
  const queue = await loadRegistrationQueue(supabase, view);
  const undo = readParam(params.undo);

  /**
   * The row the undo banner is about, and it has to BE set aside for the banner to be true.
   *
   * `?undo=` is just a string in a URL, so any readable registration id put there rendered
   * "X's registration is set aside" over a queue whose Set aside count said 0 and which listed
   * that very row under Waiting. Worse, the Bring it back button beside it worked: the routine
   * only refuses bringing back a LINKED row, so it happily wrote a `registration_set_aside`
   * audit row for a state change that never happened and answered "Back in the queue" about a
   * row that had never left it.
   */
  const undone =
    undo !== undefined
      ? (await loadRegistration(supabase, undo)).registration
      : null;
  const undoable = undone?.setAsideAt ? undone : null;

  // The undo banner says everything the Alert would, and says it about a named row, so the two
  // must not both appear: the first build stacked the identical sentence twice. Suppressed on
  // the BANNER rather than on the parameter, because a `?undo=` that resolves to nothing used
  // to hide the Alert as well and leave the admin with a silent page after a real act.
  const outcome = undoable ? undefined : readOutcome(params.outcome);

  return (
    <DashboardShell caller={verdict.caller} current="academy">
      <PageHeader title={copy.academy.title} scope={copy.academy.scope} />

      {outcome ? (
        <div className="mt-4">
          <FocusOnArrival signal={outcome.code}>
            <Alert tone={outcome.tone}>{outcome.message}</Alert>
          </FocusOnArrival>
        </div>
      ) : null}

      {/* The undo, beside the result and not buried in the list it just left. Setting aside
          is a judgement about a stranger made from four fields; that it is reversible is the
          whole mitigation (SPEC decision 4), so the reversal is offered at the moment the
          judgement is freshest. */}
      {undoable ? (
        <FocusOnArrival signal={undoable.id}>
          <Notice
            tone="off"
            title={copy.academy.undoTitle(undoable.fullName)}
            live="polite"
            action={
              <form action={setAsideAction}>
                <input
                  type="hidden"
                  name="registrationId"
                  value={undoable.id}
                />
                <input type="hidden" name="aside" value="false" />
                <input type="hidden" name="view" value="waiting" />
                <SubmitButton
                  variant="secondary"
                  label={copy.academy.actions.bringBack}
                  pendingLabel={copy.academy.actions.bringBack}
                />
              </form>
            }
          >
            {copy.academy.undoBody}
          </Notice>
        </FocusOnArrival>
      ) : null}

      <dl className="mt-4 flex flex-wrap gap-2.5">
        <Stat label={copy.academy.stats.waiting} value={queue.counts.waiting} />
        <Stat label={copy.academy.stats.aside} value={queue.counts.aside} />
        <Stat
          label={copy.academy.stats.linkedByHand}
          value={queue.counts.linkedByHand}
        />
      </dl>

      <nav aria-label={copy.academy.filters.label} className="mt-4">
        <ul className="inline-flex flex-wrap gap-1 rounded-control bg-alt p-1">
          <ViewTab
            view="waiting"
            current={view}
            label={copy.academy.filters.waiting(queue.counts.waiting)}
          />
          <ViewTab
            view="aside"
            current={view}
            label={copy.academy.filters.aside(queue.counts.aside)}
          />
          <ViewTab
            view="linked"
            current={view}
            label={copy.academy.filters.linked}
          />
        </ul>
      </nav>

      {view === 'waiting' ? (
        <Guide title={copy.academy.guideTitle}>{copy.academy.guide}</Guide>
      ) : null}
      {view === 'aside' ? (
        <Guide title={copy.academy.asideGuideTitle}>
          {copy.academy.asideGuide}
        </Guide>
      ) : null}

      <h2 className="pt-5 pb-1 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {view === 'waiting'
          ? copy.academy.waitingLabel
          : view === 'aside'
            ? copy.academy.asideLabel
            : copy.academy.linkedLabel}
      </h2>

      {queue.rows.length === 0 ? (
        <Empty view={view} asideCount={queue.counts.aside} />
      ) : (
        queue.rows.map((registration) => (
          <RegistrationCard
            key={registration.id}
            registration={registration}
            view={view}
            now={queue.readAt}
          />
        ))
      )}

      {/* Under the list rather than over it: it describes where the list STOPS. */}
      {queue.truncated ? (
        <Notice tone="off" title={copy.academy.truncatedTitle(QUEUE_LIMIT)}>
          {copy.academy.truncatedBody}
        </Notice>
      ) : null}
    </DashboardShell>
  );
}

/**
 * The empty queue, which is the state an admin sees MOST WEEKS and so needs to say what
 * empty means.
 *
 * "Nothing waiting" on its own reads as a screen that might be broken. What is true is that
 * the automatic match did its job, and that only the rows it could not answer land here. The
 * set-aside count is the one route onward, because those rows are the only thing still
 * actionable from here and are otherwise invisible.
 */
function Empty({ view, asideCount }: { view: QueueView; asideCount: number }) {
  const titles: Record<QueueView, string> = {
    waiting: copy.academy.emptyTitle,
    aside: copy.academy.emptyAsideTitle,
    linked: copy.academy.emptyLinkedTitle,
  };
  const bodies: Record<QueueView, string> = {
    waiting: copy.academy.emptyBody,
    aside: copy.academy.emptyAsideBody,
    linked: copy.academy.emptyLinkedBody,
  };

  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <h3 className="font-display text-[1.2rem] font-extrabold">
        {titles[view]}
      </h3>
      <p className="mt-1.5 max-w-[46ch] text-body leading-relaxed text-sub">
        {bodies[view]}
      </p>
      {view === 'waiting' && asideCount > 0 ? (
        <Link
          href="/academy?view=aside"
          className="mt-4 inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {copy.academy.actions.seeAside(asideCount)}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * One filter, as a LINK rather than a button.
 *
 * The frame draws the mockup's segmented control, which is a set of buttons; these navigate,
 * so they are links wearing that treatment. `aria-current` carries the selection for anyone
 * who cannot see which one is filled.
 */
function ViewTab({
  view,
  current,
  label,
}: {
  view: QueueView;
  current: QueueView;
  label: string;
}) {
  const on = view === current;
  return (
    <li>
      <Link
        href={`/academy?view=${view}`}
        aria-current={on ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center rounded-control px-4 text-body font-bold ${
          on ? 'bg-raised text-text shadow-sm' : 'text-muted hover:text-text'
        }`}
      >
        {label}
      </Link>
    </li>
  );
}

function readView(value: string | string[] | undefined): QueueView {
  const candidate = readParam(value);
  return candidate === 'aside' || candidate === 'linked'
    ? candidate
    : 'waiting';
}

interface Outcome {
  message: string;
  tone: 'error' | 'info';
}

// The value type carries the `undefined`, because a `Record<string, T>` lookup is typed as
// always-present and this one is not: `?outcome=` is whatever somebody put in the URL. Said in
// the type rather than at the call site, where an annotation is narrowed away again.
const OUTCOMES: Record<string, Outcome | undefined> = {
  linked: { message: copy.academy.outcome.linked, tone: 'info' },
  unlinked: { message: copy.academy.outcome.unlinked, tone: 'info' },
  set_aside: { message: copy.academy.outcome.setAside, tone: 'info' },
  brought_back: { message: copy.academy.outcome.broughtBack, tone: 'info' },
  already_linked: {
    message: copy.academy.outcome.alreadyLinked,
    tone: 'error',
  },
  set_aside_first: {
    message: copy.academy.outcome.wasSetAside,
    tone: 'error',
  },
  already_enrolled: {
    message: copy.academy.outcome.alreadyEnrolled,
    tone: 'error',
  },
  not_linked: { message: copy.academy.outcome.notLinked, tone: 'error' },
  is_linked: { message: copy.academy.outcome.isLinked, tone: 'error' },
  no_member: { message: copy.academy.outcome.noMember, tone: 'error' },
  gone: { message: copy.academy.outcome.gone, tone: 'error' },
  refused: { message: copy.academy.outcome.refused, tone: 'error' },
  failed: { message: copy.academy.outcome.failed, tone: 'error' },
};

function readOutcome(
  value: string | string[] | undefined,
): (Outcome & { code: string }) | undefined {
  const candidate = readParam(value);
  if (!candidate) return undefined;

  const found = OUTCOMES[candidate];

  // The code travels with the message so the focus wrapper can tell one arrival from the
  // next: two acts in a row on the same route reuse the component instance.
  return found ? { code: candidate, ...found } : undefined;
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
