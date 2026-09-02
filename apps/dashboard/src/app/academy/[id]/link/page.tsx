import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { FocusOnArrival } from '@/components/ui/FocusOnArrival';
import { Guide } from '@/components/ui/Guide';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import {
  loadAddressOwner,
  loadMember,
  loadMemberByEmail,
  loadRegistration,
  loadSuggestions,
  searchMembers,
  type MemberMatch,
  type Registration,
  type Suggestion,
} from '@/server/registrations';

import { linkAction, setAsideAction } from '../../actions';
import { formatName, onDate } from '../../format';

export const dynamic = 'force-dynamic';

/**
 * Who is this registration? (#164, LINK / LINK-SEARCH / LINK-CONFIRM / LINK-REFUSED frames,
 * approved 2026-08-31.)
 *
 * ONE ROUTE, FOUR SURFACES, because they are four states of one question rather than four
 * screens, and the URL holds which one: nothing (`suggestions`), `?q=` (a search),
 * `?member=` (the confirm) and `?problem=` (the refusal). That is the "a SURFACE is a STATE"
 * rule, and it is what keeps the whole flow working with HTML alone: the search is a GET
 * form, choosing somebody is a link, and only the last step is a POST.
 *
 * THE AMOUNT IS NOWHERE ON THIS PAGE, and is not fetched (`server/registrations.ts` carries
 * the argument). Every fact drawn here is one of the four `20` allows for deciding who
 * somebody is: name, address, course, date, plus the branch the website typed.
 */
export default async function LinkRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
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
    redirect('/academy');
  }

  const { id } = await params;
  const { registration, readAt } = await loadRegistration(supabase, id);
  if (!registration) notFound();

  // Two states the database would refuse anyway. Sending the reader back is kinder than
  // rendering a screen whose only ending is an error they could not have avoided.
  if (registration.member) redirect('/academy?view=linked');
  if (registration.setAsideAt) redirect('/academy?view=aside');

  const query = readParam((await searchParams).q)?.trim() ?? '';
  const chosen = readParam((await searchParams).member);
  const problem = readProblem(readParam((await searchParams).problem));

  // The catalogue name where there is one, and the website's raw slug where there is not.
  // `inCatalogue` travels with it because two sentences change on it: where the notification
  // lands, and whether this string is a course name at all.
  const course = registration.courseName ?? registration.courseSlug;
  const inCatalogue = registration.courseName !== null;
  const scope = copy.academy.link.scope(
    course,
    onDate(registration.createdAt, readAt),
  );

  // THE REFUSAL. Its own surface because it is the mis-link this tool is most dangerous for:
  // two people with a claim on one mailbox. It offers no way to force it, which is the point
  // of `link_registration` refusing the whole link rather than linking without proving the
  // address.
  if (problem) {
    const attempted = chosen ? await loadMember(supabase, chosen) : null;

    // WHO ALREADY HOLDS THE ADDRESS, read from whichever half of the collision this is: a
    // proven address lives in `profile_emails`, a sign-in address in `profiles`. Both are
    // read so the instruction below can name a person, which is the whole reason this screen
    // bothers to look one up.
    const owner =
      problem === 'address_taken'
        ? await loadAddressOwner(supabase, registration.email)
        : null;
    const signinOwner =
      problem === 'address_is_signin'
        ? await loadMemberByEmail(supabase, registration.email)
        : null;

    // The member the admin was attaching to, NOT the payer. The two are routinely different
    // words, the sentence is about what the link would do to two members, and naming the payer
    // there reads perfectly while saying the wrong thing (seen on screen 2026-08-31). The old
    // fallback to `registration.fullName` quietly restored that same bug whenever `?member=`
    // was absent or named a closed account, so there is no fallback now: the sentence drops
    // the name rather than printing the wrong one.
    const attemptedName = attempted?.displayName ?? null;

    return (
      <DashboardShell caller={verdict.caller} current="academy">
        <PageHeader
          title={copy.academy.refusedTitle}
          scope={copy.academy.refusedScope}
        />
        <FocusOnArrival signal={problem}>
          <Notice
            tone="bad"
            title={
              problem === 'address_taken'
                ? copy.academy.takenTitle(registration.email, owner)
                : copy.academy.signinTitle(registration.email)
            }
            live="assertive"
          >
            {problem === 'address_taken'
              ? copy.academy.takenBody(attemptedName, owner)
              : copy.academy.signinBody(attemptedName)}
          </Notice>
        </FocusOnArrival>

        {/* THE ONE-CLICK WAY OUT, and only this half of the collision has one. The insert
            guard refuses an address that is ANOTHER account's sign-in (`u.id <> profile_id`),
            so attaching the registration to the account whose address it actually is
            succeeds. Usually that is the payer, signed up under the address they paid with,
            and the admin simply chose the wrong member from a list of similar names. */}
        {signinOwner ? (
          <Notice
            tone="tell"
            title={copy.academy.signinFixTitle(signinOwner.displayName)}
            action={
              <Link
                href={`/academy/${registration.id}/link?member=${signinOwner.id}`}
                className="inline-flex min-h-12 items-center rounded-button border border-controlline px-5 text-body font-bold whitespace-nowrap text-text hover:bg-alt"
              >
                {copy.academy.signinFixAction(signinOwner.displayName)}
              </Link>
            }
          >
            {copy.academy.signinFixBody(
              signinOwner.displayName,
              registration.email,
            )}
          </Notice>
        ) : null}

        {/* ONLY ON THE HALF THAT HAS NO WAY OUT. "Nothing on this screen can move it, and
            only <owner> can give it up" is true of a PROVEN address and false of a sign-in
            one, where attaching it to the right account is allowed and is the notice above.
            Showing both put a true instruction and a false one on the same screen, which is
            the shape this whole review was about; caught by reading the rendered page rather
            than the diff. Where the sign-in owner could not be read there is no way out to
            offer either, so the phone call is the honest answer again. */}
        {problem === 'address_taken' || !signinOwner ? (
          <Notice tone="off" title={copy.academy.ringThemTitle}>
            {problem === 'address_taken'
              ? copy.academy.ringThemBody(owner)
              : copy.academy.signinNoOwnerBody}
          </Notice>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href={`/academy/${registration.id}/link`}
            className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
          >
            {copy.academy.actions.backToSuggestions}
          </Link>
          <SetAside id={registration.id} />
        </div>
      </DashboardShell>
    );
  }

  // THE CONFIRM. Both sides named, and the reason the member was suggested travels into it:
  // what is being accepted IS the resemblance, so it stays on screen at the moment of
  // accepting it.
  if (chosen) {
    const member = await findChosen(supabase, registration, chosen);
    if (!member) redirect(`/academy/${registration.id}/link`);

    return (
      <DashboardShell caller={verdict.caller} current="academy">
        <PageHeader
          title={copy.academy.confirm.title(member.displayName)}
          scope={scope}
        />

        <SectionLabel>{copy.academy.link.paidLabel}</SectionLabel>
        <PaymentCard registration={registration} now={readAt} />

        <SectionLabel>{copy.academy.confirm.becomesLabel}</SectionLabel>
        <MemberCard member={member} />

        <Notice
          tone="tell"
          title={copy.academy.confirm.toldTitle(member.displayName)}
        >
          {copy.academy.confirm.toldBody(course, inCatalogue)}
        </Notice>

        {/* The banner this screen exists for. The `profile_emails` write is the point of the
            feature and its standing risk (SPEC decision 5, open risk 1), and it is stated in
            those words rather than softened. */}
        <Notice
          tone="bad"
          title={copy.academy.confirm.teachesTitle(
            registration.email,
            member.displayName,
          )}
        >
          {copy.academy.confirm.teachesBody(member.displayName)}
        </Notice>

        <Notice tone="off" title={copy.academy.confirm.undoTitle}>
          {copy.academy.confirm.undoBody(member.displayName)}
        </Notice>

        {/* No typed name and no authenticator code, deliberately: the line the branches
            module drew is blast radius, not danger. This reaches ONE person with a true and
            welcome message, and the admin can undo it themselves. */}
        <form
          action={linkAction}
          className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-4"
        >
          <input type="hidden" name="registrationId" value={registration.id} />
          <input type="hidden" name="memberId" value={member.id} />
          <SubmitButton
            label={copy.academy.confirm.submit(member.displayName)}
            pendingLabel={copy.academy.confirm.pending}
          />
          <Link
            href={`/academy/${registration.id}/link`}
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {copy.academy.confirm.cancel}
          </Link>
        </form>
      </DashboardShell>
    );
  }

  // THE SUGGESTIONS, or a search in their place. A search REPLACES them for as long as it is
  // a search and never sits under them competing for the same decision; clearing the box
  // brings them back.
  const search = query ? await searchMembers(supabase, query) : null;
  const suggestions = search ? [] : await loadSuggestions(supabase, id);

  return (
    <DashboardShell caller={verdict.caller} current="academy">
      <PageHeader title={copy.academy.link.title} scope={scope} />

      <SectionLabel>{copy.academy.link.paidLabel}</SectionLabel>
      <PaymentCard registration={registration} now={readAt} />

      {search ? null : (
        <Guide title={copy.academy.link.guideTitle}>
          {copy.academy.link.guide}
        </Guide>
      )}

      {search === null ? (
        <>
          <SectionLabel>{copy.academy.link.suggestionsLabel}</SectionLabel>
          {suggestions.map((suggestion) => (
            <MemberRow
              key={suggestion.id}
              registrationId={registration.id}
              member={suggestion}
              reason={reasonLabel(suggestion)}
            />
          ))}
          <SectionLabel>{copy.academy.link.noneLabel}</SectionLabel>
        </>
      ) : null}

      {/* A GET form: the query belongs in the URL, so a search is shareable and the back
          button works. It is a member's NAME, never anything about the payer, so nothing
          `20` protects travels in it. */}
      <form id="member-search" method="get" className="mt-3 max-w-[560px]">
        <label
          htmlFor="q"
          className="block text-label font-extrabold tracking-widest text-muted uppercase"
        >
          {copy.academy.link.searchLabel}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={copy.academy.link.searchPlaceholder}
          aria-describedby="q-hint"
          className="mt-1.5 min-h-12 w-full rounded-input border border-controlline bg-card px-3.5 py-3 text-body text-text"
        />
        <p id="q-hint" className="mt-1.5 text-small text-muted">
          {copy.academy.link.searchHint}
        </p>
      </form>

      {search?.status === 'too_short' ? (
        <Notice
          tone="off"
          title={copy.academy.link.tooShortTitle}
          live="polite"
        >
          {copy.academy.link.tooShortBody}
        </Notice>
      ) : null}

      {search?.status === 'ok' && search.members.length === 0 ? (
        <Notice
          tone="off"
          title={copy.academy.link.noResultsTitle}
          live="polite"
          action={<SetAside id={registration.id} />}
        >
          {copy.academy.link.noResultsBody(query, query.includes('@'))}
        </Notice>
      ) : null}

      {search?.status === 'ok' && search.members.length > 0 ? (
        <>
          <SectionLabel>
            {copy.academy.link.resultsLabel(
              search.members.length,
              query,
              search.truncated,
            )}
          </SectionLabel>
          {/* A searched row carries NO reason: a suggestion was ranked by the database and
              can say why it is there, while a result is only what the admin asked for.
              Giving it one would manufacture an endorsement out of their own typing. */}
          {search.members.map((member) => (
            <MemberRow
              key={member.id}
              registrationId={registration.id}
              member={member}
            />
          ))}
        </>
      ) : null}

      {/* ONE ACTION ROW, as the approved frame draws it: Search on the left, "No app account"
          pushed to the right by a spacer. The build had grown a second bordered row below the
          first, which put two rules across the screen and separated the search button from the
          box it submits.

          Search sits OUTSIDE its form and reaches it by `form="member-search"`, which is the
          only way to have it share a row with the set-aside form: forms cannot nest. A plain
          Button rather than a SubmitButton because `useFormStatus` reports the form a button
          is RENDERED INSIDE, which this one no longer is; nothing is lost, since a GET
          submission has no pending state and its two labels were already identical. */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-4">
        <Button type="submit" form="member-search" variant="secondary">
          {copy.academy.link.search}
        </Button>
        <Link
          href="/academy"
          className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {copy.academy.actions.backToQueue}
        </Link>
        <span className="flex-1" />
        <SetAside id={registration.id} />
      </div>
    </DashboardShell>
  );
}

/**
 * The member the admin picked, read back SERVER-SIDE rather than trusted from the URL.
 *
 * `?member=` is a uuid anybody could type, so the confirm never renders a name from it: the
 * row is read back, and a member who is not there (or whose account has closed since the
 * suggestion was drawn) sends the reader back to choose again rather than to a confirm about
 * nobody. Not the security boundary either way: `link_registration` checks the caller and
 * refuses everything that matters.
 *
 * The suggestions are consulted FIRST, and only to carry the reason. That is the one fact
 * the profile row does not hold, and it has to survive into the confirm: what is being
 * accepted is the resemblance.
 */
async function findChosen(
  supabase: Parameters<typeof loadSuggestions>[0],
  registration: Registration,
  memberId: string,
): Promise<(MemberMatch & { reason?: string }) | null> {
  const suggestions = await loadSuggestions(supabase, registration.id);
  const suggested = suggestions.find((row) => row.id === memberId);
  if (suggested) return suggested;

  return loadMember(supabase, memberId);
}

/** The suggestion's reason, in this file's words rather than the database's. */
function reasonLabel(suggestion: Suggestion): string {
  return copy.academy.link.reasons[suggestion.reason] ?? suggestion.reason;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-5 pb-1 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
      {children}
    </h2>
  );
}

/** The registration itself, restated wherever a decision is being made about it. */
function PaymentCard({
  registration,
  now,
}: {
  registration: Registration;
  now: number;
}) {
  return (
    <article className="mt-1 rounded-card border border-cardline bg-card px-4.5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(14rem,100%)] flex-1">
          <p className="font-display text-card font-extrabold text-text">
            {registration.fullName}
          </p>
          <p className="mt-0.5 text-body break-all text-muted">
            {registration.email}
          </p>
        </div>
        <Pill>{registration.courseName ?? registration.courseSlug}</Pill>
      </div>
      {/* The same meta line the queue card draws, INCLUDING the "not in our catalogue"
          caveat, which used to be on the browsing card and absent from the two screens where
          the decision is actually made. A raw website slug printed as though it were a course
          name is the one thing a reader here cannot check for themselves. */}
      <p className="mt-2.5 text-small font-bold text-muted">
        {copy.academy.registeredOn(onDate(registration.createdAt, now))} ·{' '}
        {formatName(registration.format)} ·{' '}
        {registration.branch ?? copy.academy.noBranch}
        {registration.courseName ? null : ` · ${copy.academy.noCourse}`}
      </p>
    </article>
  );
}

/** The member, on the confirm, with the reason that put them there if there was one. */
function MemberCard({ member }: { member: MemberMatch & { reason?: string } }) {
  return (
    <article className="mt-1 rounded-card border border-cardline bg-card px-4.5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[min(12rem,100%)] flex-1">
          <p className="font-display text-card font-extrabold text-text">
            {member.displayName}
          </p>
          <p className="mt-0.5 text-body break-all text-muted">
            {member.email}
            {member.branchName ? ` · ${member.branchName}` : ''}
          </p>
        </div>
        {member.reason ? (
          <Pill>
            {copy.academy.link.reasons[member.reason] ?? member.reason}
          </Pill>
        ) : null}
      </div>
    </article>
  );
}

/**
 * One person who might be the payer.
 *
 * THE REASON PILL IS QUIET AND THE BUTTON IS OUTLINE, on every row including the first.
 * Decision 1 accepted that a confident-looking suggestion is easier to accept than a wrong
 * name somebody typed; a filled button on the top row would endorse far louder than a grey
 * pill declines to. The ORDER carries the ranking, and nothing else does.
 */
function MemberRow({
  registrationId,
  member,
  reason,
}: {
  registrationId: string;
  member: MemberMatch;
  reason?: string;
}) {
  return (
    <article className="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-cardline bg-card px-4.5 py-3.5">
      <div className="min-w-[min(14rem,100%)] flex-1">
        <p className="font-display text-card font-extrabold text-text">
          {member.displayName}
        </p>
        <p className="mt-0.5 text-body break-all text-muted">
          {member.email}
          {member.branchName ? ` · ${member.branchName}` : ''}
        </p>
      </div>
      {reason ? <Pill>{reason}</Pill> : null}
      <Link
        href={`/academy/${registrationId}/link?member=${member.id}`}
        className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
      >
        {copy.academy.link.choose(firstName(member.displayName))}
      </Link>
    </article>
  );
}

/** "Choose Ade", not "Choose Ade Ogunlesi": the button is next to the full name already. */
function firstName(displayName: string): string {
  return displayName.split(' ')[0] ?? displayName;
}

function SetAside({ id }: { id: string }) {
  return (
    <form action={setAsideAction}>
      <input type="hidden" name="registrationId" value={id} />
      <input type="hidden" name="aside" value="true" />
      <input type="hidden" name="view" value="waiting" />
      <SubmitButton
        variant="ghost"
        label={copy.academy.actions.setAside}
        pendingLabel={copy.academy.actions.setAside}
      />
    </form>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readProblem(
  value: string | undefined,
): 'address_taken' | 'address_is_signin' | undefined {
  return value === 'address_taken' || value === 'address_is_signin'
    ? value
    : undefined;
}
