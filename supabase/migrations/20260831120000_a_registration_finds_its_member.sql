-- #164: an admin attaches a website registration to a member by hand.
--
-- WHY THIS EXISTS. ADR 0017 named three ways a registration reaches a member: the automatic
-- email match, a self-service claim, and a leader linking by hand. The claim was CUT on
-- 2026-08-11 and its backend removed. So somebody who paid on the website under one address
-- and signed into the app under another has had NO path at all, and the double-booking wall
-- cannot save them because it keys on (course_id, profile_id) and their row has no
-- profile_id. They can pay twice for the same course. The interim has been a leader reading
-- a stranger's payment record in a SQL client. This is the backend that ends that.
--
-- The interview and its decisions are in `docs/spec/plans/164-link-a-registration-by-hand.md`.
--
-- WHAT IS ALREADY HERE AND IS NOT REBUILT. `20260809202000` did more of this than the SPEC
-- assumed, and finding so removed roughly half the intended work:
--   * `privileged_action` already carries `registration_linked`;
--   * `course_registrations_audit` already writes an audit row on EVERY change of
--     `profile_id`, by trigger, on every path. Linking and unlinking are therefore audited
--     without either routine remembering to, which is the rule ADR 0015 set;
--   * `course_registrations_update_guard` already lets a live admin (and the service role)
--     write these columns and refuses everyone else, so these routines add authorization
--     rather than invent it.
--
-- WHAT IS NEW: two columns, three routines, a suggestion reader, one audit value for the one
-- act that changes no owner, and one column grant without which the queue reads nothing.
--
-- Rollback (roll forward, per the database standard): a compensating migration drops the four
-- functions, the index and the two columns. The enum value stays, because
-- `alter type ... drop value` does not exist and an unused value is inert.

begin;

set local lock_timeout = '3s';

-- --- 1. trigram matching, for the suggestions -------------------------------------------
--
-- The auto-match already ran on EXACT email before any human saw the row, so a suggestion is
-- inexact by definition and needs a similarity measure rather than an equality. Into
-- `extensions`, matching pg_net and pgcrypto rather than dropping a new object into `public`.
create extension if not exists pg_trgm with schema extensions;

-- --- 2. setting a registration aside -----------------------------------------------------
--
-- `course_registrations` is SHARED with the live website (`02`, `039`). The contract forbids
-- dropping, renaming, retyping or NOT NULL-ing any of the website's columns; it does not
-- forbid adding NULLABLE ones, which is exactly how the app's existing additions landed. Both
-- of these are nullable with no default, so the website's INSERT is untouched.
--
-- DELIBERATELY NOT `status`. Its own comment draws the line this sits on: `status` is an
-- ENROLMENT decision ("you have a place") and the link trio is an IDENTITY one ("this row is
-- yours"). "No app account" is an identity statement, so reusing `status` would corrupt a
-- distinction ADR 0017 made on purpose.
alter table public.course_registrations
  add column set_aside_at timestamptz,
  add column set_aside_by uuid references public.profiles (id) on delete set null;

comment on column public.course_registrations.set_aside_at is
  'When an admin judged this row un-matchable (the payer never installed the app), taking it out of the linking queue without deleting or altering the payment record (#164). Reversible. NOT an enrolment state: status says whether they have a place, this says whether anybody is still looking for their account.';
comment on column public.course_registrations.set_aside_by is
  'Which admin set it aside (#164). ON DELETE SET NULL: the judgement outlives the account that made it, like the link trio beside it.';

-- The queue's read path: unlinked, not set aside, newest first. Partial, because the whole
-- point of setting rows aside is that the queue stays the small remainder.
create index course_registrations_link_queue_idx
  on public.course_registrations (created_at desc)
  where profile_id is null and set_aside_at is null;

-- THE GRANT THIS TABLE NEEDS AND ALMOST DID NOT GET.
--
-- `20260809202000` revoked everything from `authenticated` and granted SELECT per NAMED
-- COLUMN. A column added without touching that list is readable by nobody, and the failure is
-- silent in the worst way: the queue screen would render, empty, forever. So:
--
--   * `set_aside_at` is GRANTED. The screen filters on it; it is the difference between
--     "nobody has looked at this yet" and "somebody decided", which is the whole feature.
--   * `set_aside_by` is WITHHELD, by the same argument the existing grant makes for
--     `linked_by`: which staff member made the call is an internal fact, the `moderated_by`
--     and `moderation_note` reasoning. Every human client is the same `authenticated` role,
--     so withholding it from members withholds it from leaders too; a dashboard that ever
--     needs to show it gets a definer read path, not a widened grant.
grant select (set_aside_at) on public.course_registrations to authenticated;

-- Setting aside changes no owner, so `course_registrations_audit` does not fire for it and it
-- needs a value of its own. Same reasoning that gave `branch_request_rejected` one: an action
-- that changes no row of the audited kind fires no trigger and must write its own row.
alter type public.privileged_action add value 'registration_set_aside';

-- --- 3. the three actions ----------------------------------------------------------------

/**
 * Attach a registration to a member.
 *
 * ADMIN ONLY, checked here rather than trusted from the caller. ADR 0017 decision 5, and the
 * reason is structural rather than a preference: an unlinked website row carries no
 * `branch_id`, so "leaders read in-branch" has no answer for it. There is no correct branch
 * leader for a stranger's payment record.
 *
 * WHY A ROUTINE AND NOT AN UPDATE. `profile_id` and the link trio are server-written
 * (ADR 0015: a column an authorization check READS must not be writable by its subject). The
 * update guard would let an admin write them directly; this exists so the write is one
 * validated act with one audited outcome rather than whatever a route happens to send.
 *
 * THE `profile_emails` WRITE IS THE POINT (SPEC decision 5): it is what stops this member
 * hitting the same wall on their next registration. But two existing constraints mean it
 * cannot ALWAYS succeed, and the honest answer to each is to refuse the whole link rather
 * than link quietly without it:
 *   * the address is already proven by a DIFFERENT member (the global unique on
 *     lower(trim(email))), or
 *   * it is another account's sign-in address (`profile_emails_insert_guard`).
 * Either means two people have a claim on one mailbox, which is exactly the mis-link this
 * tool is most dangerous for. Refusing says so; skipping the email would hide it and leave an
 * admin believing the auto-match had been taught. The address already being THIS member's is
 * not an error and is a no-op.
 */
create function public.link_registration(registration uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reg public.course_registrations%rowtype;
  row_email text;
  owner uuid;
begin
  if not public.caller_is_admin_live() then
    raise exception 'linking a payment record to a member is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  select * into reg
  from public.course_registrations r
  where r.id = registration
  for update;

  if not found then
    raise exception 'no such registration' using errcode = 'no_data_found';
  end if;

  -- Not a silent re-link: moving a registration between members is unlink then link, so a
  -- double-submitted form cannot quietly reassign a course somebody paid for.
  if reg.profile_id is not null then
    raise exception 'this registration is already linked; unlink it first'
      using errcode = 'check_violation';
  end if;

  if reg.set_aside_at is not null then
    raise exception 'this registration was set aside; bring it back first'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = member and p.deleted_at is null
  ) then
    raise exception 'no such member' using errcode = 'no_data_found';
  end if;

  row_email := lower(trim(reg.email));

  select pe.profile_id into owner
  from public.profile_emails pe
  where lower(trim(pe.email)) = row_email;

  if owner is not null and owner <> member then
    raise exception 'that address is already proven by another member'
      using errcode = 'check_violation';
  end if;

  if owner is null then
    -- The insert guard refuses an address that is somebody else's SIGN-IN address, and that
    -- exception is deliberately allowed to surface: same class of collision as above.
    insert into public.profile_emails (profile_id, email)
    values (member, row_email);
  end if;

  update public.course_registrations
  set profile_id = member,
      linked_by = (select auth.uid()),
      linked_at = now(),
      link_method = 'leader'
  where id = registration;
end;
$function$;

/**
 * Return a registration to the unlinked queue.
 *
 * Decision 2: without this, the error case leaves an admin exactly where this issue started,
 * in a SQL client. The audit trigger records the reversal by itself, because `profile_id`
 * changed; nothing here writes an audit row.
 *
 * It deliberately does NOT remove the `profile_emails` row the link wrote. The address may
 * have been proven by another route since, and un-proving somebody's mailbox is a different
 * act with different consequences. Out of scope, and recorded as open risk 1 in the SPEC.
 */
create function public.unlink_registration(registration uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.caller_is_admin_live() then
    raise exception 'unlinking a payment record is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.course_registrations r
    where r.id = registration and r.profile_id is not null
  ) then
    raise exception 'this registration is not linked' using errcode = 'check_violation';
  end if;

  update public.course_registrations
  set profile_id = null,
      linked_by = null,
      linked_at = null,
      link_method = null
  where id = registration;
end;
$function$;

/**
 * Take an un-matchable registration out of the working queue, or bring it back.
 *
 * Decision 4: a queue that only grows is a queue people stop reading, and then a real one is
 * missed among the permanent residents. The payment record itself is neither deleted nor
 * altered; only its presence in the working queue changes.
 *
 * Audited EXPLICITLY, and this is the exception to "audited by trigger, not by the caller"
 * rather than a violation of it: this changes no owner, so `course_registrations_audit` never
 * fires. It is still a judgement made about a stranger from four fields.
 */
create function public.set_registration_aside(registration uuid, aside boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  was timestamptz;
  linked uuid;
begin
  if not public.caller_is_admin_live() then
    raise exception 'setting a registration aside is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  select r.set_aside_at, r.profile_id into was, linked
  from public.course_registrations r
  where r.id = registration
  for update;

  if not found then
    raise exception 'no such registration' using errcode = 'no_data_found';
  end if;

  if aside and linked is not null then
    raise exception 'a linked registration is not un-matchable; unlink it first'
      using errcode = 'check_violation';
  end if;

  update public.course_registrations
  set set_aside_at = case when aside then now() else null end,
      set_aside_by = case when aside then (select auth.uid()) else null end
  where id = registration;

  insert into public.privileged_actions (actor_id, target_id, action, before, after)
  values (
    (select auth.uid()),
    -- No target member, and that is the point of the action: nobody matches this row.
    null,
    'registration_set_aside',
    jsonb_build_object('registration_id', registration, 'set_aside_at', was),
    jsonb_build_object('registration_id', registration, 'set_aside', aside)
  );
end;
$function$;

-- --- 4. who might this be? ---------------------------------------------------------------

/**
 * Members who might be the payer, best first.
 *
 * Decision 6: name similarity, then same branch. `reason` is RETURNED rather than left for
 * the screen to infer, because decision 1 accepted a real risk: a confident-looking
 * suggestion is easier to accept than a wrong name somebody typed themselves. Showing why
 * each name is here is what lets an admin disagree with it, so the reason travels with the
 * row rather than being reconstructed beside it.
 *
 * The branch comparison is against the website's `branch` DISPLAY name, which `02` says is
 * never trustworthy enough to SCOPE access. Ranking is not scoping: being wrong here reorders
 * a list a human then reads, and gates nothing.
 *
 * Definer because it reads every profile, which is the admin-only judgement this whole
 * feature is; the admin check is inside, as with the other three.
 */
create function public.registration_match_suggestions(
  registration uuid,
  limit_to integer default 5
)
returns table (
  profile_id uuid,
  display_name text,
  email text,
  branch_name text,
  name_similarity real,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.caller_is_admin_live() then
    raise exception 'suggesting members for a payment record is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with target as (
    select r.full_name, r.branch
    from public.course_registrations r
    where r.id = registration
  ),
  scored as (
    select
      p.id as pid,
      p.display_name as pname,
      p.email as pemail,
      b.name as bname,
      extensions.similarity(p.display_name, t.full_name) as sim,
      (b.name is not null and t.branch is not null
        and extensions.similarity(b.name, t.branch) > 0.3) as same_branch
    from target t
    cross join public.profiles p
    left join public.branches b on b.id = p.branch_id
    where p.deleted_at is null
      and extensions.similarity(p.display_name, t.full_name) > 0.2
  )
  select
    s.pid,
    s.pname,
    s.pemail,
    s.bname,
    s.sim,
    case when s.same_branch then 'similar name, same branch' else 'similar name' end
  from scored s
  order by s.same_branch desc, s.sim desc, s.pname
  limit limit_to;
end;
$function$;

-- --- 5. who may call these ---------------------------------------------------------------
--
-- Granted to `authenticated` because staff call them with their OWN token, which is what
-- makes `caller_is_admin_live()` and the audit rows' `auth.uid()` mean anything. The admin
-- check inside each function is the boundary; the grant is not.
--
-- REVOKED FROM `anon` BY NAME, not just from PUBLIC. Supabase's default privileges grant
-- EXECUTE on every new function in `public` to anon and authenticated, and revoking from
-- PUBLIC does not touch a grant made to a role. Issue #96 is the same shape one layer up.
-- pgTAP asserts anon holds none of the four, which is how this was caught.
revoke all on function public.link_registration(uuid, uuid) from public, anon;
revoke all on function public.unlink_registration(uuid) from public, anon;
revoke all on function public.set_registration_aside(uuid, boolean) from public, anon;
revoke all on function public.registration_match_suggestions(uuid, integer) from public, anon;

grant execute on function public.link_registration(uuid, uuid) to authenticated;
grant execute on function public.unlink_registration(uuid) to authenticated;
grant execute on function public.set_registration_aside(uuid, boolean) to authenticated;
grant execute on function public.registration_match_suggestions(uuid, integer) to authenticated;

comment on function public.link_registration is
  'Attach a website registration to a member, admin only (#164, ADR 0017 decision 5). Writes the link trio with link_method=leader and proves the address in profile_emails so future registrations match automatically. Refuses when the address belongs to somebody else, which is the mis-link this tool is most dangerous for.';
comment on function public.unlink_registration is
  'Return a registration to the unlinked queue, admin only (#164). Does not un-prove the address: that is a separate act with different consequences (SPEC open risk 1).';
comment on function public.set_registration_aside is
  'Take an un-matchable registration out of the working queue, or bring it back (#164). Reversible, and audited explicitly because it changes no owner and so fires no ownership audit.';
comment on function public.registration_match_suggestions is
  'Members who might be the payer, ranked by name similarity then same branch, each carrying the reason it was suggested (#164). Inexact by definition: exact email already matched before a human saw the row.';

commit;
