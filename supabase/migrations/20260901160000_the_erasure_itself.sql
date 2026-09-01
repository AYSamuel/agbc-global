/**
 * W4.5 slice 1c (docs/spec/16 §DELETE's reach table, `20`, `02`): the erasure, in one
 * transaction.
 *
 * ONE TRANSACTION IS THE WHOLE POINT. `16` says "don't half-delete", and the only way to mean
 * it is for every database write to commit together or not at all. So this is a routine and
 * not a job: a member's rows number in the tens, the ordering matters, and a job that died
 * between two of its steps would leave an account that is neither here nor gone.
 *
 * THE ORDER IS FROM `16` AND IT IS LOAD-BEARING IN ONE PLACE ABOVE ALL: pending testimonies
 * and prayers are cancelled FIRST, before anything else can go wrong, because publishing
 * content after its author withdrew consent is an Art. 9 breach and a moderation queue is
 * exactly where that would happen.
 *
 * TWO CALLERS, ONE WORKER. `delete_my_account()` is the member's own door, granted to
 * `authenticated` and hard-wired to `auth.uid()`, so there is no argument through which one
 * member could name another. `erase_profile()` takes an id and is granted to `service_role`
 * only, for the web deletion path (slice 4), where the OTP has proved the address but no
 * session exists.
 *
 * WHAT IS DELIBERATELY LEFT UNDONE, and recorded rather than attempted: storage objects and
 * the `auth.users` row need calls to services outside Postgres. They are written into
 * `account_erasures` and slice 2 finishes them, with a sweep behind it. The seam is chosen so
 * that the side which can be atomic IS atomic, and the side that cannot is idempotent and
 * retryable. The SESSIONS are the exception and are killed here: a live refresh token is a
 * working account, and that cannot wait for a sweep.
 *
 * Rollback plan: drop the three routines. The data they would have erased is not recoverable
 * by a migration either way, which is the other reason every step below is tested before it
 * ships.
 */

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- What safeguarding holds
-- ---------------------------------------------------------------------------
-- `reports.testimony_id` and `reports.prayer_id` are ON DELETE CASCADE, so destroying a
-- member's content destroys every report ever made about it. `02` says the opposite in as
-- many words ("reports flagged as safeguarding stay open and flagged: removal does not end a
-- safeguarding duty") and `20` retains reports for 24 months as safeguarding evidence. These
-- two predicates are how the erasure tells the difference.
--
-- OPEN only, and that narrowness is deliberate. A settled safeguarding report has had its
-- duty discharged and the report row is then the evidence on its own; holding content for
-- every report ever filed would mean a three-year-old dismissed complaint could keep somebody
-- from being forgotten, which is the same failure pointing the other way.
--
-- Two functions rather than one with a `kind` argument: a string parameter is a typo waiting
-- to silently answer "false", and false here means destroying evidence.

create function public.testimony_held_for_safeguarding(p_testimony_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
     where r.testimony_id = p_testimony_id
       and r.is_safeguarding
       and r.status = 'open'
  );
$$;

create function public.prayer_held_for_safeguarding(p_prayer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
     where r.prayer_id = p_prayer_id
       and r.is_safeguarding
       and r.status = 'open'
  );
$$;

comment on function public.testimony_held_for_safeguarding is
  'True while an OPEN safeguarding report points at this testimony. The account erasure anonymises and hides such a row instead of destroying it, because `reports` cascades from here and a hard delete would take the evidence with it (`02`, `20`).';
comment on function public.prayer_held_for_safeguarding is
  'True while an OPEN safeguarding report points at this prayer. See testimony_held_for_safeguarding.';

-- ---------------------------------------------------------------------------
-- The erasure
-- ---------------------------------------------------------------------------

create function public.erase_profile(p_profile_id uuid, p_keep_posts boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_avatar text;
  v_photos text[];
  v_erasure uuid;
  v_is_admin boolean;
  v_live_admins integer;
begin
  -- The flag the three guards honour (20260901150000). `is_local = true`, so it cannot
  -- outlive this transaction and no later statement inherits the right to rewrite a member's
  -- history.
  perform pg_catalog.set_config('agbc.account_erasure', 'on', true);

  -- Take the row first. Two devices, or the app and the web page, can ask at the same moment;
  -- the second waits here and then finds nothing live to erase, which is the honest answer.
  select p.email, p.avatar_url, p.role = 'admin'
    into v_email, v_avatar, v_is_admin
    from public.profiles p
   where p.id = p_profile_id
     and p.deleted_at is null
     for update;

  if not found then
    raise exception 'no live account to erase'
      using errcode = 'no_data_found';
  end if;

  -- THE LAST ADMIN CANNOT LEAVE, the same rule ADR 0015 already applies to demotion and for
  -- the same reason: a ministry with no admin has nobody who can appoint one, and the only
  -- way back is a database console. Deleting yourself is a demotion with extra steps, so the
  -- rule has to cover both doors or it covers neither.
  if v_is_admin then
    select pg_catalog.count(*)::integer into v_live_admins
      from public.profiles p
     where p.role = 'admin' and p.deleted_at is null;
    if v_live_admins <= 1 then
      raise exception 'the last admin cannot delete their account; appoint another admin first'
        using errcode = 'raise_exception';
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 0. The photos of everything about to be destroyed
  -- ---------------------------------------------------------------------
  -- Collected BEFORE the deletes, because a path cannot be read back off a row that is gone.
  -- The set is exactly "will be destroyed": never a post the member chose to keep (a post
  -- without its picture is not the post they decided to leave standing) and never one
  -- safeguarding is holding (the picture may be the evidence).

  select pg_catalog.array_agg(t.image_path)
    into v_photos
    from public.testimonies t
   where t.author_id = p_profile_id
     and t.image_path is not null
     and not public.testimony_held_for_safeguarding(t.id)
     and (t.status in ('pending', 'rejected', 'removed') or not p_keep_posts);

  v_photos := coalesce(v_photos, '{}'::text[]);

  -- ---------------------------------------------------------------------
  -- 1. Pending content, first, before anything else can publish it
  -- ---------------------------------------------------------------------
  -- `16`: "hard-cancel first: removed from moderation queues, never approvable (publishing
  -- after consent withdrawal is an Art. 9 breach)". Everything else in this routine could run
  -- in almost any order; this could not.

  delete from public.testimonies t
   where t.author_id = p_profile_id and t.status = 'pending'
     and not public.testimony_held_for_safeguarding(t.id);
  delete from public.prayers p
   where p.author_id = p_profile_id and p.status = 'pending'
     and not public.prayer_held_for_safeguarding(p.id);

  -- ---------------------------------------------------------------------
  -- 2. Content nobody can see: rejected and removed
  -- ---------------------------------------------------------------------
  -- `16`: hard delete the rows AND their photos, because this is non-public content whose
  -- consent has been withdrawn. The safeguarding evidence lives in `reports`, not here.

  delete from public.testimonies t
   where t.author_id = p_profile_id and t.status in ('rejected', 'removed')
     and not public.testimony_held_for_safeguarding(t.id);
  delete from public.prayers p
   where p.author_id = p_profile_id and p.status in ('rejected', 'removed')
     and not public.prayer_held_for_safeguarding(p.id);

  -- ---------------------------------------------------------------------
  -- 3. Approved content: the member's own choice
  -- ---------------------------------------------------------------------
  -- Anonymising nulls `author_id` and NOTHING else: `branch_id`, the counts, the answered
  -- ribbon and above all the consent evidence stay, because `20` keeps consent records after
  -- anonymisation as the Art. 9 processing evidence. A prayer posted anonymously keeps its
  -- "A member" label either way; relabelling one would announce that its author had left.

  if p_keep_posts then
    update public.testimonies t set author_id = null
     where t.author_id = p_profile_id and t.status = 'approved';
    update public.prayers p set author_id = null
     where p.author_id = p_profile_id and p.status = 'approved';
  else
    delete from public.testimonies t
     where t.author_id = p_profile_id and t.status = 'approved'
       and not public.testimony_held_for_safeguarding(t.id);
    delete from public.prayers p
     where p.author_id = p_profile_id and p.status = 'approved'
       and not public.prayer_held_for_safeguarding(p.id);
  end if;

  -- ---------------------------------------------------------------------
  -- 4. What safeguarding holds, it holds anonymised
  -- ---------------------------------------------------------------------
  -- A row under an open safeguarding report is never DESTROYED: it is emptied of its author
  -- and taken out of every member-facing surface by `deleted_at`.
  --
  -- THE HOLD ONLY BITES WHERE THE ROW WOULD OTHERWISE HAVE BEEN DESTROYED, which is why this
  -- runs after step 3 rather than before it and why it keys on `author_id` still pointing at
  -- the member. A held APPROVED post under "keep my posts" was already anonymised above and
  -- is deliberately left standing: nothing was going to destroy it, so there is no evidence
  -- to rescue, and hiding a post the member asked to keep on the strength of a report that
  -- may yet be dismissed would be punishing them for having been reported. What reaches here
  -- is the rest: everything pending, rejected or removed, and every approved row when the
  -- member chose to remove their posts.
  --
  -- This is a real limit on erasure, lawful under Art. 17(3) and scoped as narrowly as it can
  -- be. It is also the one place where "the account is gone" and "the words are gone" come
  -- apart, which is why `16` gains a sentence about it in this PR.

  update public.testimonies t
     set author_id = null,
         deleted_at = pg_catalog.now()
   where t.author_id = p_profile_id
     and public.testimony_held_for_safeguarding(t.id);
  update public.prayers p
     set author_id = null,
         deleted_at = pg_catalog.now()
   where p.author_id = p_profile_id
     and public.prayer_held_for_safeguarding(p.id);

  -- ---------------------------------------------------------------------
  -- 5. Reports they MADE
  -- ---------------------------------------------------------------------
  -- `16`/`20`: the row is retained 24 months as safeguarding evidence, with the reporter
  -- anonymised. An open report of theirs is left open on purpose: the duty it raised belongs
  -- to the branch, not to whether its reporter still has an account.

  update public.reports r set reporter_id = null where r.reporter_id = p_profile_id;

  -- ---------------------------------------------------------------------
  -- 6. Reactions, then the counters correct themselves
  -- ---------------------------------------------------------------------
  -- The AFTER DELETE counter triggers decrement as these go (`02`), so no counter step is
  -- needed here; the nightly `counter-reconcile` is the net under it, not the mechanism.

  delete from public.glory_reactions g where g.profile_id = p_profile_id;
  delete from public.prayer_intercessions i where i.profile_id = p_profile_id;

  -- ---------------------------------------------------------------------
  -- 7. Everything that is only ever theirs
  -- ---------------------------------------------------------------------
  -- `16`'s hard-delete rows, plus the four member-referencing tables `16` never named, each
  -- of which is theirs alone and has no reason to outlive them. `054` asserts that this list
  -- and the schema agree, so the next table added is a decision rather than an omission.

  delete from public.attendance a where a.profile_id = p_profile_id;
  delete from public.streaks s where s.profile_id = p_profile_id;
  delete from public.milestones m where m.profile_id = p_profile_id;
  delete from public.playback_positions pp where pp.profile_id = p_profile_id;
  delete from public.saved_items si where si.profile_id = p_profile_id;
  delete from public.sermon_notes sn where sn.profile_id = p_profile_id;
  delete from public.reading_state rs where rs.profile_id = p_profile_id;
  delete from public.entitlements e where e.profile_id = p_profile_id;
  delete from public.rsvps r where r.profile_id = p_profile_id;
  delete from public.course_interest ci where ci.profile_id = p_profile_id;
  delete from public.notifications n where n.profile_id = p_profile_id;
  delete from public.broadcast_deliveries bd where bd.profile_id = p_profile_id;
  delete from public.devices d where d.profile_id = p_profile_id;
  delete from public.notification_prefs np where np.profile_id = p_profile_id;
  -- Both directions: a block they made, and a block made against them. Neither has a subject
  -- any more.
  delete from public.blocked_users b
   where b.blocker_id = p_profile_id or b.blocked_id = p_profile_id;
  -- Named by nothing in `16`, and all theirs alone.
  delete from public.profile_emails pe where pe.profile_id = p_profile_id;
  delete from public.branch_change_requests bc where bc.profile_id = p_profile_id;
  delete from public.course_handoff_tokens ch where ch.profile_id = p_profile_id;
  delete from public.job_alerts ja where ja.recipient_id = p_profile_id;

  -- ---------------------------------------------------------------------
  -- 8. The payment record survives, without the payer
  -- ---------------------------------------------------------------------
  -- `16` says hard delete; `02` and `20` say the opposite and win. `profile_id` is ON DELETE
  -- SET NULL here precisely so payment records outlive an account, and this is one of THE TWO
  -- SHARED TABLES the live website's Stripe webhook writes. Losing the church's record of a
  -- course fee because the payer left is not erasure, it is losing the books.
  --
  -- The link trio goes with the profile: it describes HOW this row was attached to a member,
  -- and there is no member to attach it to any more. The staff columns (`set_aside_by`) are
  -- untouched: they record what a leader did, not who the payer was.

  update public.course_registrations cr
     set profile_id = null,
         linked_by = null,
         linked_at = null,
         link_method = null
   where cr.profile_id = p_profile_id;

  -- ---------------------------------------------------------------------
  -- 9. The purchase pipeline's copies of their address
  -- ---------------------------------------------------------------------
  -- `16`: buyer emails must not outlive the account. An unmatched purchase is deleted whole
  -- (once its owner is gone it is an address and nothing else); a webhook body is redacted
  -- exactly the way `run_retention_purges()` redacts it, because the order id and the price
  -- are the church's record of a sale and only the buyer's identity has to go.

  if v_email is not null then
    delete from public.unmatched_purchases up
     where up.buyer_email = pg_catalog.lower(pg_catalog.btrim(v_email));

    update public.payhip_events pe
       set payload = pg_catalog.jsonb_build_object(
             'id', pe.payload -> 'id',
             'type', pe.payload -> 'type',
             'date', pe.payload -> 'date',
             'price', pe.payload -> 'price',
             'currency', pe.payload -> 'currency',
             'items', pe.payload -> 'items'
           ),
           redacted_at = pg_catalog.now()
     where pe.payload ->> 'email' = pg_catalog.lower(pg_catalog.btrim(v_email))
       and pe.redacted_at is null;
  end if;

  -- ---------------------------------------------------------------------
  -- 10. The ledger the sweep drains
  -- ---------------------------------------------------------------------
  -- `avatar_url`'s shape is unsettled and this is the first code to care: nothing writes the
  -- column yet, and its name predates the W2.3 rule that a row holds a PATH rather than a URL.
  -- Slice 2 handles both shapes, and the column should be renamed the day an uploader is
  -- built.

  insert into public.account_erasures
    (profile_id, auth_user_id, storage_paths, keep_posts)
  values
    (p_profile_id, p_profile_id,
     pg_catalog.jsonb_build_object(
       'avatars', case when v_avatar is null then '[]'::jsonb
                       else pg_catalog.jsonb_build_array(v_avatar) end,
       'testimony-photos', pg_catalog.to_jsonb(v_photos)
     ),
     p_keep_posts)
  returning id into v_erasure;

  -- ---------------------------------------------------------------------
  -- 11. The profile itself: stripped, kept, and unable to write again
  -- ---------------------------------------------------------------------
  -- Kept because the audit trail points at it (`broadcasts.author_id` is NOT NULL with NO
  -- ACTION), stripped because everything on it is personal data, and `deleted_at` because
  -- every member write policy in this schema already requires it to be null. That last one is
  -- what closes the second-device hole the moment this commits, with no client involved.

  update public.profiles p
     set deleted_at = pg_catalog.now(),
         email = null,
         display_name = null,
         avatar_url = null
   where p.id = p_profile_id;

  -- ---------------------------------------------------------------------
  -- 12. The sessions, now
  -- ---------------------------------------------------------------------
  -- The auth user's own row is slice 2's (it is the half that needs the admin API), but the
  -- sessions cannot wait for a sweep: a live refresh token is a working account. Note the
  -- cast: `auth.refresh_tokens.user_id` is a varchar in Supabase's schema while
  -- `auth.sessions.user_id` is a uuid, and comparing the first to a uuid raises rather than
  -- matching nothing, which is the better failure but still a failure.

  delete from auth.refresh_tokens rt where rt.user_id = p_profile_id::text;
  delete from auth.sessions s where s.user_id = p_profile_id;

  return v_erasure;
end;
$function$;

comment on function public.erase_profile is
  'Executes docs/spec/16''s deletion reach in ONE transaction, in its order, and records the storage objects and auth user that slice 2 must finish outside the database. Service-role only: the member''s own door is delete_my_account(). Refuses the last admin, and holds content under an open safeguarding report anonymised rather than destroying it (`02`, `20`).';

/**
 * The member's own door.
 *
 * No id parameter, deliberately: the subject is `auth.uid()` and nothing else, so there is no
 * argument through which one member could name another and no authorization check to get
 * wrong. It is the same reasoning `20260815120000` used for `profile_id` defaults on personal
 * tables, applied to the most destructive call in the schema: identity is not an input.
 */
create function public.delete_my_account(p_keep_posts boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'sign in to delete your account'
      using errcode = 'insufficient_privilege';
  end if;
  return public.erase_profile(v_actor, p_keep_posts);
end;
$function$;

comment on function public.delete_my_account is
  'The member deletes their own account (docs/spec/16 DELETE). Takes no id: the subject is auth.uid(), so one member can never name another. `p_keep_posts` is the screen''s radio choice, which defaults to remove.';

-- `revoke all ... from public` does NOT remove Supabase's default role grants (the W4.0
-- lesson), so `anon` is revoked BY NAME or it keeps EXECUTE on all of these.
revoke all on function public.testimony_held_for_safeguarding(uuid) from public, anon;
revoke all on function public.prayer_held_for_safeguarding(uuid) from public, anon;
revoke all on function public.erase_profile(uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_my_account(boolean) from public, anon;

grant execute on function public.erase_profile(uuid, boolean) to service_role;
grant execute on function public.delete_my_account(boolean) to authenticated;
-- The two predicates are called from inside a definer that owns them, so nothing outside
-- needs EXECUTE. `054` asserts the negative rather than calling them (019's segfault trap).

commit;
