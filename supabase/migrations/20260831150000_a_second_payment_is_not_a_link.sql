-- #164 follow-up: two things the Academy screens could not say truthfully.
--
-- Found by reviewing W4.0 against a running dashboard rather than against its tests, which is
-- also why neither showed up: both are states that 326 green tests never entered.
--
-- 1. THE DOUBLE-BOOKING WALL HAD NO WORDS. `course_registrations_active_enrolment_uniq` is a
--    partial unique on (course_id, profile_id) where status <> 'cancelled'. `link_registration`
--    ends in an UPDATE that sets profile_id, so whenever the member already holds a live
--    registration for that course the UPDATE raises a bare 23505. The dashboard has no
--    fragment for it, so it degrades to "That did not go through. Try again." and retrying
--    can never work.
--
--    That is not an exotic state. It is the state this whole feature exists for. The issue's
--    own premise is a member who paid on the website under one address and in the app under
--    another AND CAN THEREFORE PAY TWICE; the moment an admin tries to attach the second
--    payment to them, this is the wall they hit. The queue offered them the tool and then
--    told them to try again forever.
--
--    pgTAP `052` could not have caught it: its fixture comment says the course strings match
--    no slug "so course_id stays null and the double-booking partial unique cannot interfere".
--    That was the right call for a file about identity, and it is exactly why the one
--    collision a real admin meets had no test. `052` now carries a fixture that DOES resolve
--    to a course, so the refusal is asserted on the same road as the other four.
--
--    Raised here rather than mapped in the dashboard, so this refusal reads like its four
--    neighbours: our words, one SQLSTATE, asserted in pgTAP.
--
--    THE INDEX IS STILL THE MECHANISM, and the check below is only how the common case gets
--    a sentence. A check-then-act across statements is a race (~/.claude/standards/database.md),
--    and this one genuinely is: the routine locks the registration it is linking, never the
--    OTHER registration that would collide with it, so two admins attaching two payments to
--    one member and one course at the same moment both pass this check and the second is
--    refused by the unique index. The dashboard therefore maps the raw constraint name to the
--    same reason as well. A refusal that exists only on the happy path is not a refusal.
--
-- 2. THE STORED ADDRESS WAS NOT GUARANTEED TO BE NORMALIZED. `profile_emails`' uniqueness is
--    on lower(trim(email)) and every writer normalizes, but nothing said the COLUMN holds the
--    normalized value. The dashboard's refusal screen reads it back with a plain equality to
--    name the member who already holds the address, which is the one fact that turns that
--    screen from a wall into a phone call. A single stored capital and the database still
--    refuses the link (the index sees through case) while the screen loses the name.
--
--    Fixed by constraining the column rather than by loosening the read: a case-insensitive
--    read cannot be written safely through PostgREST anyway (ilike would treat the `_` in an
--    address as a wildcard), and the assumption every writer already keeps is better stated
--    than re-derived at each reader.
--
-- Rollback (roll forward, per the database standard): a compensating migration restores the
-- previous `link_registration` body and drops the check constraint.

begin;

set local lock_timeout = '3s';

-- --- 1. a member cannot hold one course twice --------------------------------------------
--
-- Reproduced from `20260831120000` unchanged except for the new refusal and this note, so a
-- diff of the two files shows exactly what moved. `create or replace` keeps the ownership and
-- the ACL the original migration set, so the grants below it are untouched.
create or replace function public.link_registration(registration uuid, member uuid)
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

  -- THE DOUBLE-BOOKING WALL, SPEAKING FOR ITSELF.
  --
  -- The conditions mirror `course_registrations_active_enrolment_uniq` exactly, because a
  -- refusal that is stricter than the index would refuse links the database would have
  -- allowed, and one that is looser would let the bare 23505 through again. So: only when
  -- this row would actually enter the index (course_id resolved, not cancelled), and only
  -- against rows already in it.
  --
  -- A row whose slug resolved to nothing has a null course_id and can never collide, since a
  -- unique index treats nulls as distinct. That is deliberate upstream (`20260809202000`: the
  -- website's write path must never break on our catalogue) and it means an admin can still
  -- attach a payment for something we do not carry.
  if reg.course_id is not null and reg.status <> 'cancelled' and exists (
    select 1
    from public.course_registrations other
    where other.course_id = reg.course_id
      and other.profile_id = member
      and other.status <> 'cancelled'
  ) then
    raise exception 'this member already has a place on that course'
      using errcode = 'check_violation';
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

comment on function public.link_registration is
  'Attach a website registration to a member, admin only (#164, ADR 0017 decision 5). Writes the link trio with link_method=leader and proves the address in profile_emails so future registrations match automatically. Refuses when the address belongs to somebody else, and when the member already holds a live registration for that course, which is the double payment this feature exists to repair rather than to repeat.';

-- --- 2. the stored address is the normalized address --------------------------------------
--
-- Safe by construction: `profile_emails_normalized_uniq` is already unique on
-- lower(trim(email)), so no two rows can normalize onto each other and this UPDATE cannot
-- violate it. On every environment so far it touches zero rows; it exists so the constraint
-- below can be added on a database whose history predates this rule.
update public.profile_emails
  set email = lower(trim(email))
  where email <> lower(trim(email));

-- Added NOT VALID and validated separately, which is the lock-safe shape
-- (~/.claude/standards/database.md): a plain ADD CHECK holds ACCESS EXCLUSIVE for the whole
-- scan, while VALIDATE takes only SHARE UPDATE EXCLUSIVE and lets reads and writes through.
-- The table is small enough that it would not matter today; the habit is what matters, since
-- the next table this is copied onto will not be.
alter table public.profile_emails
  add constraint profile_emails_normalized
  check (email = lower(trim(email))) not valid;

alter table public.profile_emails
  validate constraint profile_emails_normalized;

comment on constraint profile_emails_normalized on public.profile_emails is
  'The column holds what the unique index matches on (#164 review). Readers compare this value with a plain equality, because a case-insensitive comparison through PostgREST would have to be an ilike, and ilike would read the underscore in an address as a wildcard.';

commit;
