-- W3.5 slice 1, second half: how a broadcast moves, and who may move it
-- (docs/spec/17 §2, `02` §Broadcast state machine, ADR 0015).
--
-- The tables landed in `20260819180000` with zero client policies, which is `02`'s matrix
-- row and leaves one question open: how does a leader compose anything at all?
--
-- THROUGH THESE FUNCTIONS, and not through a service-role client. `02` says "leaders act via
-- dashboard service-role routes", and following that literally would mean the dashboard
-- holding the secret key and telling the database who the actor is. That is the shape this
-- project has rejected everywhere else: identity is not an input. The alternative was
-- already sitting in the repo, in `set_member_role` and `decide_branch_request` from W2.7:
-- SECURITY DEFINER functions granted to `authenticated`, called with the STAFF MEMBER'S own
-- token, reading `auth.uid()` for identity and `caller_is_admin_live()` for authority. A
-- definer function does not lose the caller's claims, so `auth.uid()` inside it is still the
-- person who clicked, which is the whole reason that pattern works.
--
-- So the dashboard needs no service-role client for broadcasts, `SUPABASE_SECRET_KEY` stays
-- unused by it, and the answer to "who approved this" is a value the caller could not have
-- supplied.
--
-- THE TRIGGER IS THE STATE MACHINE, not the functions. Each function performs one
-- transition, but the legal transitions are a whitelist in one place, so a future caller
-- (the fan-out moving `sending` -> `sent`, a retry, a migration) cannot invent a path. The
-- functions add WHO; the trigger owns WHAT.
--
-- Rollback (roll forward): a compensating migration drops the trigger and these functions.
-- Rows keep their status; nothing moves again until something can move them.

begin;

set local lock_timeout = '3s';

-- --- 1. the state machine ----------------------------------------------------------

create function public.broadcasts_insert_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Seeds and the service role insert directly and are trusted (the same door
  -- prayer_intercessions leaves open); a client reaching this has a token.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Every broadcast is born a draft, authored by whoever is holding the token. Nothing
  -- downstream of that is the client's to state.
  new.author_id := (select auth.uid());
  new.status := 'draft';
  new.approved_by := null;
  new.review_note := null;
  new.recipient_count := null;
  new.sent_at := null;
  return new;
end;
$function$;

create function public.broadcasts_update_guard()
returns trigger
language plpgsql
as $function$
declare
  content_changed boolean;
begin
  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'a broadcast cannot be reassigned or backdated'
      using errcode = 'check_violation';
  end if;

  content_changed :=
    new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.body_de is distinct from old.body_de
    or new.body_nl is distinct from old.body_nl
    or new.body_fr is distinct from old.body_fr
    or new.link is distinct from old.link
    or new.scope is distinct from old.scope
    or new.branch_id is distinct from old.branch_id;

  -- Frozen once it is out of the composer's hands. A message that could be edited while
  -- sending would deliver two different texts to two halves of the ministry, and the row
  -- would not say which anyone got.
  if old.status in ('sending', 'sent', 'halted', 'failed') and content_changed then
    raise exception 'a broadcast in flight or finished cannot be edited'
      using errcode = 'check_violation';
  end if;

  -- The whitelist. Anything not named here is refused, including transitions nobody has
  -- thought of yet, which is the point of writing it as a list rather than as guards
  -- against the paths we happen to remember.
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'pending_approval')
      or (old.status = 'pending_approval'
          and new.status in ('draft', 'rejected', 'sending'))
      or (old.status = 'rejected' and new.status = 'draft')
      or (old.status = 'sending' and new.status in ('sent', 'halted', 'failed'))
      -- "Retry delivery" (docs/spec/02): re-runs the fan-out for pending and failed
      -- deliveries only, deduped by the unique key, so it never re-sends to anyone.
      or (old.status = 'failed' and new.status = 'sending')
    ) then
      raise exception 'a broadcast cannot go from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- What the approver reviewed is what sends (docs/spec/02). An author edit while the row
  -- is waiting takes it back to draft rather than quietly changing the thing under review.
  if old.status = 'pending_approval'
     and content_changed
     and new.status is not distinct from old.status then
    new.status := 'draft';
    new.approved_by := null;
  end if;

  -- Stamped when it leaves the dashboard, and never restamped: a retry after a failure is
  -- the same broadcast, and the history screen should say when it was sent, not when
  -- somebody last pressed retry.
  if new.status = 'sending' and old.status is distinct from 'sending' then
    new.sent_at := coalesce(old.sent_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger broadcasts_guard
  before insert on public.broadcasts
  for each row execute function public.broadcasts_insert_guard();

create trigger broadcasts_update_guard
  before update on public.broadcasts
  for each row execute function public.broadcasts_update_guard();

create trigger broadcast_deliveries_set_updated_at
  before update on public.broadcast_deliveries
  for each row execute function public.set_updated_at();

-- --- 2. the audience ---------------------------------------------------------------

/**
 * Who a broadcast reaches.
 *
 * ONE definition, used by the confirmation screen's count and by the fan-out's chunks, so
 * the number a leader approved and the set that receives cannot drift apart. That is the
 * "one visible fact, one owner" rule applied to the most consequential number in the
 * dashboard: a leader is deciding whether to send based on it.
 *
 * PREFS APPLY, BLOCKS DO NOT. `15` suppresses ACTIVITY notifications across a block, and
 * activity is one member's action reaching another; a broadcast is the church speaking to
 * its own members, and blocking someone does not opt you out of your branch's news. An
 * absent prefs row is the column defaults, which are all true (`02`).
 */
create function public.broadcast_recipients(broadcast uuid)
returns table (profile_id uuid, language text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.language
  from public.broadcasts b
  join public.profiles p
    on p.deleted_at is null
    and (b.scope = 'ministry' or p.branch_id = b.branch_id)
  left join public.notification_prefs np on np.profile_id = p.id
  where b.id = broadcast
    and case b.scope
      when 'ministry' then coalesce(np.ministry_announcements, true)
      when 'branch' then coalesce(np.branch_updates, true)
    end;
$function$;

revoke all on function public.broadcast_recipients(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_recipients(uuid) to service_role;

comment on function public.broadcast_recipients is
  'The audience for a broadcast: prefs applied, blocks deliberately not (docs/spec/15; a broadcast is not activity between two members). The fan-out''s source and, through broadcast_recipient_count(), the confirmation screen''s number.';

/**
 * How many that is, for the confirmation screen.
 *
 * Granted to `authenticated` rather than service_role alone, because a leader has to see it
 * before deciding to send and the dashboard calls it with their own token. It discloses a
 * COUNT of a branch or of the ministry to staff who are about to message exactly those
 * people, which is the narrowest possible reading of that disclosure.
 */
create function public.broadcast_recipient_count(broadcast uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer from public.broadcast_recipients(broadcast);
$function$;

revoke all on function public.broadcast_recipient_count(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_recipient_count(uuid)
  to authenticated, service_role;

-- --- 3. the four actions -----------------------------------------------------------

/**
 * The author sends it for approval.
 *
 * Author only: an admin who wants somebody else's draft out can approve it once it is
 * submitted, but submitting on their behalf would put a name on the row that did not choose
 * the words.
 */
create function public.submit_broadcast(broadcast uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_author uuid;
  row_status public.broadcast_status;
begin
  select b.author_id, b.status into row_author, row_status
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if row_author is distinct from (select auth.uid()) then
    raise exception 'only the author may submit this broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status not in ('draft', 'rejected') then
    raise exception 'only a draft can be submitted for approval'
      using errcode = 'check_violation';
  end if;

  -- Recorded at submission so the approver and the author are looking at the same number.
  update public.broadcasts
    set status = 'pending_approval',
        review_note = null,
        recipient_count = public.broadcast_recipient_count(broadcast)
    where id = broadcast;
end;
$function$;

/**
 * A second pair of eyes releases it.
 *
 * THE WHOLE RULE IS HERE: an admin, read from the live table, who is not the author. There
 * is no scope condition and no role condition and no break-glass, which is the decision
 * taken with Ayo on 2026-08-19 (see 20260819180000's header). Approval and sending are one
 * act: `02` has the approver's click fire the send, so there is no window in which an
 * approved broadcast sits waiting for someone to remember to send it.
 */
create function public.approve_broadcast(broadcast uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_author uuid;
  row_status public.broadcast_status;
  actor uuid := (select auth.uid());
begin
  select b.author_id, b.status into row_author, row_status
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may approve a broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_author = actor then
    raise exception 'a broadcast cannot be approved by its author'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status <> 'pending_approval' then
    raise exception 'only a broadcast awaiting approval can be approved'
      using errcode = 'check_violation';
  end if;

  update public.broadcasts
    set status = 'sending',
        approved_by = actor,
        -- Recomputed at the moment of release rather than trusted from submission: people
        -- join a branch and change their prefs while a draft waits.
        recipient_count = public.broadcast_recipient_count(broadcast)
    where id = broadcast;
end;
$function$;

/**
 * Or sends it back.
 *
 * The note is shown to the author (`17` §2), unlike a moderation `moderation_note`, so it is
 * feedback rather than a private record and the copy in the dashboard should say so.
 */
create function public.reject_broadcast(broadcast uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_author uuid;
  row_status public.broadcast_status;
begin
  select b.author_id, b.status into row_author, row_status
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may review a broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_author = (select auth.uid()) then
    raise exception 'a broadcast cannot be reviewed by its author'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status <> 'pending_approval' then
    raise exception 'only a broadcast awaiting approval can be rejected'
      using errcode = 'check_violation';
  end if;
  if note is null or length(btrim(note)) = 0 then
    raise exception 'a rejection has to say why' using errcode = 'check_violation';
  end if;

  update public.broadcasts
    set status = 'rejected', review_note = btrim(note)
    where id = broadcast;
end;
$function$;

/**
 * Stop an in-flight fan-out.
 *
 * The author OR any admin, which is wider than approval deliberately: approving is a
 * judgement about whether something should go out, and halting is an emergency brake. The
 * person best placed to notice a mistake is usually the one who wrote it.
 *
 * `halted` is terminal for delivery (`02`); the dashboard offers "Duplicate as draft", which
 * walks the whole approval path again rather than resuming something a human stopped.
 */
create function public.halt_broadcast(broadcast uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_author uuid;
  row_status public.broadcast_status;
begin
  select b.author_id, b.status into row_author, row_status
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if row_author is distinct from (select auth.uid())
     and not public.caller_is_admin_live() then
    raise exception 'only the author or an admin may halt a broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status <> 'sending' then
    raise exception 'only a broadcast in flight can be halted'
      using errcode = 'check_violation';
  end if;

  update public.broadcasts set status = 'halted' where id = broadcast;
end;
$function$;

revoke all on function public.submit_broadcast(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_broadcast(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_broadcast(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.halt_broadcast(uuid)
  from public, anon, authenticated, service_role;

-- Granted to `authenticated`, and the authority check is inside each one. A member who
-- calls them is refused by `caller_is_admin_live()` or by the author test; the grant is
-- what lets the dashboard use the staff member's own token instead of a service-role key.
grant execute on function public.submit_broadcast(uuid) to authenticated, service_role;
grant execute on function public.approve_broadcast(uuid) to authenticated, service_role;
grant execute on function public.reject_broadcast(uuid, text) to authenticated, service_role;
grant execute on function public.halt_broadcast(uuid) to authenticated, service_role;

comment on function public.approve_broadcast is
  'Releases a broadcast, by an admin who is not its author (docs/spec/17 §2, decided 2026-08-19). Authority is read from the live profiles row per ADR 0015, never from a JWT claim; the not-the-author half is also a CHECK on the table, so self-approval is impossible rather than merely refused.';
comment on function public.halt_broadcast is
  'The emergency brake on an in-flight fan-out (docs/spec/17 §2). Author or admin, deliberately wider than approval. Terminal: a halted broadcast is duplicated as a draft, never resumed.';

commit;
