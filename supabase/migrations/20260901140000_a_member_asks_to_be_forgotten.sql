/**
 * W4.5 slice 1 (docs/spec/16 §DELETE, `20`, `02` §Invariants): the erasure itself, executed
 * in ONE transaction so a half-deleted account is not a state this system can be in.
 *
 * `16` gives the reach table and the order. Building it against the real schema turned up
 * FIVE places where the reach as written could not run, and each is fixed here rather than
 * worked around. All five go back into `16` and `02` in this same PR.
 *
 * 1. THE PROFILE ROW AND THE AUTH USER BOTH HAVE TO SURVIVE. `profiles.id` references
 *    `auth.users(id)` ON DELETE CASCADE, so deleting the auth user hard-deletes the profile
 *    and cascades into twenty tables, taking with it the audit trail `16` says is retained
 *    (`broadcasts.author_id` is NOT NULL with NO ACTION: that row cannot survive its author's
 *    profile going). So the profile is soft-deleted and STRIPPED, and the auth user is
 *    neutralised in place. Nulling its email is enough to free the address for a fresh
 *    registration, because `auth.users_email_partial_key` is a partial UNIQUE index and nulls
 *    do not collide.
 *
 * 2. `testimonies.author_id` AND `prayers.author_id` WERE NOT NULL, so `16`'s "Keep them,
 *    credited to A former member ... null `author_id`" could not run at all. It matters
 *    beyond a failed statement: a kept post still pointing at a stripped profile shell is
 *    PSEUDONYMISED, not anonymised, and pseudonymised data is still personal data. The
 *    member chose to leave something behind, not to leave a link to themselves behind. Both
 *    columns are nullable from here, and `testimony_feed`'s INNER JOIN becomes a LEFT JOIN
 *    in the same breath, or "keep my posts" would silently vanish every one of them.
 *
 * 3. `profiles.email` AND `profiles.display_name` WERE ALSO NOT NULL, which is the same
 *    problem one layer up: `16` and `02` both say the email is nulled on deletion so the
 *    address can register again, and neither could. `display_name` joins it because the name
 *    is personal data and the LABEL for a deleted account belongs to whichever screen draws
 *    it, not to a string frozen into the row in one language.
 *
 * 4. THE SAFEGUARDING CASCADE. `reports.testimony_id` and `reports.prayer_id` are ON DELETE
 *    CASCADE, so hard-deleting a member's content destroys every report ever made about it,
 *    including safeguarding ones. That is the opposite of `20` (reports retained 24 months as
 *    safeguarding evidence) and of `02`'s own line that "reports flagged as safeguarding stay
 *    open and flagged (removal does not end a safeguarding duty)". So content carrying an
 *    OPEN safeguarding report is anonymised and soft-deleted rather than destroyed: it leaves
 *    every member-facing surface immediately, the person is erased from it, and the evidence
 *    survives. **This is a real limit on erasure and the church should know it**, lawful under
 *    Art. 17(3) but not unlimited: the hold is scoped to OPEN reports, because a settled one
 *    has had its duty discharged and the report row itself is then the evidence.
 *
 * 5. `16` SAYS HARD-DELETE `course_registrations`; `02` AND `20` SAY THE PAYMENT RECORD
 *    SURVIVES. `02` wins: `profile_id` is ON DELETE SET NULL precisely so "payment records
 *    survive account deletion", and it is one of THE TWO SHARED TABLES the live website's
 *    Stripe webhook writes. Deleting the church's own record of a fee because the payer left
 *    is not erasure, it is losing the books.
 *
 * WHAT THIS SLICE DOES NOT DO: the two things SQL cannot. Storage objects and the auth user's
 * own row need calls to services outside the database, so the routine RECORDS them in
 * `account_erasures` and slice 2's edge function finishes the job, with a sweep behind it for
 * anything that failed. The database half is complete and atomic on its own.
 *
 * Rollback plan: drop the two routines, the flag function and `account_erasures`, restore
 * `testimony_feed` from 20260720220000's definition, and re-add the four NOT NULLs (which is
 * only possible while no row has exercised them, so this is a roll-forward in practice).
 */

begin;

-- Four ALTERs on tables every feed reads, plus a view replace. Three seconds then failing
-- beats queueing every Family query behind a waiting ALTER
-- (~/.claude/standards/database.md §Migrations).
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. The four columns that had to be able to hold nothing
-- ---------------------------------------------------------------------------
-- Widening a column is the safe direction (nothing existing violates it) and needs no
-- backfill. What it costs is that every reader must now handle null, which is why the view
-- below changes in the same migration and why `053`'s successor asserts the label.

alter table public.testimonies alter column author_id drop not null;
alter table public.prayers alter column author_id drop not null;
alter table public.profiles alter column email drop not null;
alter table public.profiles alter column display_name drop not null;

comment on column public.testimonies.author_id is
  'The author, or NULL once they have deleted their account and chose to leave the post standing (docs/spec/16). NULL is the anonymised state: block filtering stops applying, `is_mine` is false for everyone, and the screen draws "A former member". Forced to auth.uid() on insert, so it is never null for a live post.';
comment on column public.prayers.author_id is
  'The author, or NULL once they have deleted their account and chose to leave the request standing (docs/spec/16). A prayer posted anonymously keeps the label "A member" whatever happens here: anonymity chosen at post time is never altered by later account state, because relabelling one would reveal that its author had left.';
comment on column public.profiles.email is
  'The sign-in identity, or NULL once the account is deleted (docs/spec/16): the unique constraint would otherwise keep the address occupied for ever and `16` promises it can register again.';
comment on column public.profiles.display_name is
  'The member''s name, or NULL once the account is deleted. Deliberately not a frozen string like "Deleted account": the LABEL belongs to whichever surface draws it, in that surface''s own language, and a name written into the row would be one English literal in the database.';

-- ---------------------------------------------------------------------------
-- 2. The feed has to survive its author leaving
-- ---------------------------------------------------------------------------
-- `JOIN profiles` was an INNER JOIN, so a testimony whose author_id went null would drop out
-- of the feed entirely: the member picks "keep my posts" and every one of them silently
-- disappears, which is the exact opposite of what they chose. `prayer_feed` already tolerates
-- this shape (it nulls the three author columns for anonymous rows and joins on them the same
-- way), so only this one changes.
--
-- `create or replace view` preserves the view's options, `security_invoker` included, and the
-- column list is unchanged: only the join type and the name expression move.

create or replace view public.testimony_feed as
  select
    t.id,
    t.branch_id,
    t.body,
    t.language,
    t.category_id,
    c.key as category_key,
    t.image_path,
    t.from_prayer_id,
    t.glory_count,
    t.created_at,
    t.updated_at,
    t.author_id,
    a.display_name as author_name,
    a.avatar_url as author_avatar_url,
    coalesce(t.author_id = (select auth.uid()), false) as is_mine,
    (select p.id
       from public.prayers p
      where p.id = t.from_prayer_id
        and p.status = 'approved'::public.content_status
        and p.deleted_at is null) as origin_prayer_id,
    (exists (select 1
               from public.glory_reactions g
              where g.testimony_id = t.id
                and g.profile_id = (select auth.uid()))) as reacted_by_me
  from public.testimonies t
  left join public.profiles a on a.id = t.author_id
  left join public.testimony_categories c on c.id = t.category_id
  where t.status = 'approved'::public.content_status
    and t.deleted_at is null
    -- With a null author_id both halves are NULL, the EXISTS is false, and an anonymised
    -- post is visible to everyone. That is `16`'s own note that "block filtering no longer
    -- applies" once the author is gone: there is nobody left to block.
    and not exists (select 1
                      from public.blocked_users b
                     where b.blocker_id = (select auth.uid()) and b.blocked_id = t.author_id
                        or b.blocked_id = (select auth.uid()) and b.blocker_id = t.author_id);

-- ---------------------------------------------------------------------------
-- 3. The flag the guards honour
-- ---------------------------------------------------------------------------
-- Three BEFORE triggers exist to stop a member rewriting their own history, and every one of
-- them would refuse the erasure: `profiles_guard` refuses an owner touching columns outside
-- the allowlist (email is deliberately not in it), and the two content update guards refuse
-- an author editing a `removed` row and reset an approved row to pending on an edit.
--
-- They cannot simply be bypassed by "no user context", the way seeds and jobs are, because
-- the erasure runs with the member's OWN uid: they asked for it. So this is the same shape as
-- `in_privileged_profile_write()` (20260730120000) and `agbc.counter_write` before it: a
-- transaction-local flag, set only inside the routine below, named in one place.

create function public.in_account_erasure()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('agbc.account_erasure', true), 'off') = 'on';
$$;

comment on function public.in_account_erasure is
  'True inside erase_profile()''s transaction. The erasure runs under the departing member''s own uid, so the guards that stop a member rewriting their own history would otherwise refuse it; this is the one write that is allowed to. Set with `set local`, so it cannot outlive the statement that set it.';

-- ---------------------------------------------------------------------------
-- 4. The ledger of what the database could not finish
-- ---------------------------------------------------------------------------
-- Storage objects and the `auth.users` row need calls to services outside Postgres, so they
-- cannot join the transaction. Recording them is what keeps "don't half-delete" true across
-- the seam: the database half either commits whole or not at all, and what is left is a work
-- item that a sweep can retry until it is done.
--
-- Service-role only (FORCE RLS, ZERO policies, nothing granted to either API role): a row
-- here names an auth user id and the paths of somebody's photos.

create table public.account_erasures (
  id uuid primary key default gen_random_uuid(),
  -- Not a FK. The profile row survives the erasure, but this ledger must outlive any future
  -- decision to change that, and a cascade here would delete the record of the erasure along
  -- with its subject.
  profile_id uuid not null,
  auth_user_id uuid not null,
  -- `{"avatars": [...], "testimony-photos": [...]}`: bucket to object names, so the sweep
  -- needs no knowledge of which column a path came from.
  storage_paths jsonb not null default '{}'::jsonb,
  keep_posts boolean not null,
  requested_at timestamptz not null default now(),
  storage_done_at timestamptz,
  auth_done_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

comment on table public.account_erasures is
  'The out-of-database half of an account deletion (docs/spec/16): storage objects to remove and the auth user to neutralise. Written by erase_profile() inside the erasure transaction, drained by slice 2''s function and its sweep. Service-role only: it names an auth user id and the paths of somebody''s photos.';

-- What the sweep asks for on every pass.
create index account_erasures_unfinished_idx
  on public.account_erasures (requested_at)
  where completed_at is null;

alter table public.account_erasures enable row level security;
alter table public.account_erasures force row level security;

revoke all on public.account_erasures from anon, authenticated;
grant all on public.account_erasures to service_role;

commit;
