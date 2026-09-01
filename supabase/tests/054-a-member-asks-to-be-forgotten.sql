-- W4.5 slices 1 and 5: the account erasure (docs/spec/16 §DELETE, `20`, `02`, `21` §4).
--
-- THE ASSERTION THIS FILE EXISTS FOR is §1's, and it is not about any single table. `16`'s
-- reach table is a HAND-MAINTAINED LIST, and this item's failure mode is silent and legally
-- serious: a table added next year with a `profile_id` on it, and nobody remembering that
-- somebody's erasure has to reach it. So §1 enumerates every foreign key into `profiles` out
-- of the catalogue and holds it against a list that names, one by one, what happens to each.
-- A new table turns this red until somebody decides which side it is on. It is `048`'s shape
-- applied to erasure instead of grants.
--
-- §2 is the behavioural half: a member with rows scattered across the reach is erased, and
-- every table that should be empty of them is checked BY ENUMERATION rather than by a list
-- written twice.
--
-- THAT HALF HAD AN HONEST LIMIT AND SLICE 5 CLOSED IT. A table nobody seeded passed the
-- enumeration trivially, and fourteen of the twenty-two roads into a member were unseeded, so
-- the erasure was proven for eight of them and merely unrefuted for the rest. §2b now builds
-- the catalogue ONCE and asserts the fixture reaches every road before the erasure runs; §5
-- reads the same list afterwards. One list, so what is looked at and what is put there cannot
-- drift apart. What enumeration still cannot see is a row that STAYED and had to change, so
-- §5b and §5c assert those by hand: the prayer choices, the label that must never move, the
-- destruction of what nobody can see, the photo set handed to the sweep, and the purchase
-- pipeline's copies of the address.
--
-- The rest is the branches: the member's two choices, the safeguarding hold, the last admin,
-- and the second-device hole `02` closes with `deleted_at`.
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block pairs
-- it with `set local request.jwt.claims to '{}'`.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The two safeguarding predicates are asserted from the catalogue, never invoked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

\set glasgow '00000000-0000-4000-8000-000000000001'

\set leaver   '97000000-0000-4000-8000-00000000000a'
\set stayer   '97000000-0000-4000-8000-00000000000b'
\set admin_a  '97000000-0000-4000-8000-00000000000c'
\set admin_b  '97000000-0000-4000-8000-00000000000d'

\set kept_t   '97000000-0000-4000-8000-0000000000a1'
\set held_t   '97000000-0000-4000-8000-0000000000a2'

\set kept_p   '97000000-0000-4000-8000-0000000000b1'
\set anon_p   '97000000-0000-4000-8000-0000000000b2'
\set other_p  '97000000-0000-4000-8000-0000000000b3'
\set bcast    '97000000-0000-4000-8000-0000000000c1'
\set sermon   '97000000-0000-4000-8000-0000000000d1'

-- ===========================================================================
-- 1. THE CATALOGUE: every road to a member is a decision somebody took.
-- ===========================================================================
-- Each name below is in exactly one of two groups, and the comment says which and why.
--
-- REACHED, because the row is the member's own and has no meaning without them:
--   attendance, blocked_users (both directions), branch_change_requests,
--   broadcast_deliveries, course_handoff_tokens, course_interest, devices, entitlements,
--   glory_reactions, job_alerts, milestones, notification_prefs, notifications,
--   playback_positions, prayer_intercessions, profile_emails, reading_state, rsvps,
--   saved_items, sermon_notes, streaks.
--
-- NULLED, because the row outlives them but must not name them:
--   prayers.author_id and testimonies.author_id (the member's own choice, `16`),
--   reports.reporter_id (`20`: the report is kept 24 months, the reporter is not),
--   course_registrations.profile_id (`02`: the payment record survives the payer).
--
-- RETAINED as an opaque id, because it is somebody ELSE's audit trail and `16` names the
-- lawful basis:
--   app_config.updated_by, branches.archived_by, broadcasts.approved_by,
--   broadcasts.author_id, course_registrations.linked_by, course_registrations.set_aside_by,
--   events.status_changed_by, giving_config.updated_by, prayers.moderated_by,
--   testimonies.moderated_by, unmatched_purchases.resolved_profile_id.
--
-- Those three groups are the whole list. If this assertion fails, the answer is never to
-- paste the new name in: it is to decide which group it belongs to and teach
-- `erase_profile()` about it first.

select is(
  (select array_agg(c.conrelid::regclass::text || '.' || a.attname
                    order by c.conrelid::regclass::text || '.' || a.attname)
     from pg_constraint c
     join pg_namespace n on n.oid = c.connamespace
     cross join lateral unnest(c.conkey) k(attnum)
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and n.nspname = 'public'),
  array[
    'app_config.updated_by', 'attendance.profile_id', 'blocked_users.blocked_id',
    'blocked_users.blocker_id', 'branch_change_requests.profile_id', 'branches.archived_by',
    'broadcast_deliveries.profile_id', 'broadcasts.approved_by', 'broadcasts.author_id',
    'course_handoff_tokens.profile_id', 'course_interest.profile_id',
    'course_registrations.linked_by', 'course_registrations.profile_id',
    'course_registrations.set_aside_by', 'devices.profile_id', 'entitlements.profile_id',
    'events.status_changed_by', 'giving_config.updated_by', 'glory_reactions.profile_id',
    'job_alerts.recipient_id', 'milestones.profile_id', 'notification_prefs.profile_id',
    'notifications.profile_id', 'playback_positions.profile_id',
    'prayer_intercessions.profile_id', 'prayers.author_id', 'prayers.moderated_by',
    'profile_emails.profile_id', 'reading_state.profile_id', 'reports.reporter_id',
    'rsvps.profile_id', 'saved_items.profile_id', 'sermon_notes.profile_id',
    'streaks.profile_id', 'testimonies.author_id', 'testimonies.moderated_by',
    'unmatched_purchases.resolved_profile_id'
  ],
  'every foreign key into profiles is accounted for by the erasure: a new one turns this red until somebody decides whether it is reached, nulled, or retained as audit');

-- The four columns that had to be able to hold nothing before `16`'s reach could run at all.
select ok(is_nullable = 'YES', 'testimonies.author_id can be nulled, so "keep my posts" can anonymise rather than pseudonymise')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'testimonies' and column_name = 'author_id';
select ok(is_nullable = 'YES', 'prayers.author_id can be nulled')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'prayers' and column_name = 'author_id';
select ok(is_nullable = 'YES', 'profiles.email can be nulled, which is what frees the address to register again (docs/spec/16)')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'email';
select ok(is_nullable = 'YES', 'profiles.display_name can be nulled: the label for a deleted account belongs to the screen, in its own language, not to a string frozen into the row')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name';

-- Who may erase whom. The member's own door takes no id at all, which is what makes naming
-- somebody else impossible rather than merely refused.
select is(
  (select count(*)::int from pg_proc where proname = 'delete_my_account' and pronargs = 1),
  1,
  'delete_my_account takes ONE argument, the posts choice: the subject is auth.uid() and cannot be named');
select ok(
  not has_function_privilege('authenticated', 'public.erase_profile(uuid, boolean)', 'execute'),
  'a member holds no EXECUTE on erase_profile: the id-taking door is the service role''s, for the web deletion path');
select ok(
  not has_function_privilege('anon', 'public.delete_my_account(boolean)', 'execute'),
  'and a guest holds none on either: revoke from public does not remove Supabase''s default grant to anon, so it is revoked by name');
select ok(
  has_function_privilege('authenticated', 'public.delete_my_account(boolean)', 'execute'),
  'a signed-in member can delete their own account');

-- ===========================================================================
-- 2. Fixtures: a member with rows scattered across the reach.
-- ===========================================================================

insert into auth.users (id, email) values
  (:'leaver', 'leaver@test.local'),
  (:'stayer', 'stayer@test.local'),
  (:'admin_a', 'admin-a@test.local'),
  (:'admin_b', 'admin-b@test.local');

-- A REAL identity row, the shape Supabase's own signup writes: provider 'email',
-- provider_id = the user id, and the address inside identity_data. `identities.email` is a
-- GENERATED column over that JSON and cannot be inserted.
--
-- Seeded auth users in this project have no identities at all, which is exactly how the bug
-- this fixture exists for stayed invisible: the erasure nulled `auth.users.email` and the
-- suite went green, while a real account's address survived in `identity_data` and the
-- address stayed occupied. Driven against the live auth API before it was written down.
insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at)
values (gen_random_uuid(), :'leaver', 'email', :'leaver',
        jsonb_build_object('sub', :'leaver', 'email', 'leaver@test.local',
                           'email_verified', true, 'phone_verified', false),
        now());

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'leaver', 'leaver@test.local', 'Leaver', :'glasgow', 'member', now(), now()),
  (:'stayer', 'stayer@test.local', 'Stayer', :'glasgow', 'member', now(), now()),
  (:'admin_a', 'admin-a@test.local', 'Admin A', :'glasgow', 'admin', now(), now()),
  (:'admin_b', 'admin-b@test.local', 'Admin B', :'glasgow', 'admin', now(), now());

-- An approved testimony they will choose to keep, and one an open safeguarding report holds.
insert into public.testimonies (id, author_id, branch_id, body, status, consent_version, consented_at)
values
  (:'kept_t', :'leaver', :'glasgow', 'God moved in our house this year.', 'approved',
   'content-share-v1', now()),
  (:'held_t', :'leaver', :'glasgow', 'Something that was reported.', 'approved',
   'content-share-v1', now());

-- A pending one, which `16` cancels FIRST because publishing after consent withdrawal is an
-- Art. 9 breach.
insert into public.testimonies (author_id, branch_id, body, status, consent_version, consented_at)
values (:'leaver', :'glasgow', 'Still waiting on a leader.', 'pending', 'content-share-v1', now());

insert into public.reports (testimony_id, reporter_id, reason, status, is_safeguarding)
values (:'held_t', :'stayer', 'safeguarding concern', 'open', true);

-- A report the LEAVER made about somebody else, which is retained with the reporter dropped.
insert into public.testimonies (id, author_id, branch_id, body, status, consent_version, consented_at)
values ('97000000-0000-4000-8000-0000000000a3', :'stayer', :'glasgow', 'Another member''s post.',
        'approved', 'content-share-v1', now());
insert into public.reports (testimony_id, reporter_id, reason, status, is_safeguarding)
values ('97000000-0000-4000-8000-0000000000a3', :'leaver', 'not right', 'open', false);

-- The personal tables, one row each where a row is cheap to make.
insert into public.streaks (profile_id, current_weeks, longest_weeks)
  values (:'leaver', 3, 5);
-- A sermon of this file's OWN, never `from public.sermons limit 1`. Sermons are SYNCED from
-- YouTube and never seeded, so on any database where the sync has not run (CI, which applies
-- migrations and seeds and nothing else) that select returns no rows, the insert silently
-- inserts nothing, and the road it was meant to put a row on is left empty. `saved_items` and
-- `sermon_notes` did exactly that from slice 1 until §2b started asking, and the sweep below
-- reported them clean in CI for the same reason an empty table is clean.
insert into public.sermons (id, title) values (:'sermon', 'A sermon for the erasure test');

insert into public.saved_items (profile_id, sermon_id) values (:'leaver', :'sermon');
insert into public.sermon_notes (profile_id, sermon_id, body)
  values (:'leaver', :'sermon', 'my notes');
insert into public.reading_state (profile_id, book_id, location)
  select :'leaver', b.id, '42' from public.books b limit 1;
insert into public.entitlements (profile_id, book_id, source, source_ref)
  select :'leaver', b.id, 'gift', 'erasure-test-1' from public.books b limit 1;
insert into public.profile_emails (profile_id, email, verified_at)
  values (:'leaver', 'leaver-alt@test.local', now());
insert into public.blocked_users (blocker_id, blocked_id) values (:'leaver', :'stayer');
insert into public.glory_reactions (profile_id, testimony_id)
  values (:'leaver', '97000000-0000-4000-8000-0000000000a3');

-- One website payment record, which survives the payer (`02`).
insert into public.course_registrations
  (course, format, full_name, email, city, country, amount, currency, payment_status,
   stripe_session_id, profile_id, linked_at, link_method)
select c.slug, 'intensive', 'Leaver Person', 'leaver@test.local', 'Glasgow', 'GB',
       12000, 'gbp', 'paid', 'cs_erasure_test_1', :'leaver', now(), 'leader'
from public.courses c limit 1;

-- ---------------------------------------------------------------------------
-- W4.5 slice 5: the rest of the reach, so §5 below is an observation and not a
-- coincidence.
-- ---------------------------------------------------------------------------
-- §5's own comment names the hole it left: "a table nobody seeded passes trivially".
-- Fourteen of the twenty-two roads into a member were unseeded when this file was written,
-- so the erasure was PROVEN for eight of them and merely UNREFUTED for the rest, and the
-- whole prayer half of `16`'s reach was never exercised at all. Everything below exists to
-- make that difference, and §2b then refuses to let the hole reopen.

-- A picture on three posts, because WHICH ones get collected is a decision, not a sweep.
update public.profiles set avatar_url = 'avatars/leaver.jpg' where id = :'leaver';
update public.testimonies set image_path = 'testimony-photos/kept.jpg' where id = :'kept_t';
update public.testimonies set image_path = 'testimony-photos/held.jpg' where id = :'held_t';

-- Content nobody can see: destroyed outright whatever the member chose, picture and all.
insert into public.testimonies
  (author_id, branch_id, body, status, image_path, consent_version, consented_at)
values
  (:'leaver', :'glasgow', 'Turned down.', 'rejected', 'testimony-photos/rejected.jpg',
   'content-share-v1', now()),
  (:'leaver', :'glasgow', 'Taken down.', 'removed', null, 'content-share-v1', now());

-- Prayers. `16` treats them exactly like testimonies and nothing in this file touched one.
insert into public.prayers
  (id, author_id, branch_id, body, status, is_anonymous, consent_version, consented_at)
values
  (:'kept_p', :'leaver', :'glasgow', 'Pray for my mother.', 'approved', false,
   'content-share-v1', now()),
  (:'anon_p', :'leaver', :'glasgow', 'Something I could not sign.', 'approved', true,
   'content-share-v1', now()),
  (gen_random_uuid(), :'leaver', :'glasgow', 'Still waiting.', 'pending', false,
   'content-share-v1', now()),
  (gen_random_uuid(), :'leaver', :'glasgow', 'Turned down.', 'rejected', false,
   'content-share-v1', now()),
  (gen_random_uuid(), :'leaver', :'glasgow', 'Taken down.', 'removed', false,
   'content-share-v1', now());

-- Somebody else's prayer that the leaver committed to pray for.
insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version, consented_at)
values (:'other_p', :'stayer', :'glasgow', 'Pray for my exams.', 'approved',
        'content-share-v1', now());
insert into public.prayer_intercessions (prayer_id, profile_id) values (:'other_p', :'leaver');

-- The other direction of a block: neither the one they made nor the one made against them
-- has a subject any more (`16`), and only the first direction was ever seeded.
insert into public.blocked_users (blocker_id, blocked_id) values (:'stayer', :'leaver');

-- The rhythm, the queues, the devices: everything that is only ever theirs.
insert into public.attendance (profile_id, branch_id, service_date)
  values (:'leaver', :'glasgow', current_date);
insert into public.milestones (profile_id, kind) values (:'leaver', 'first_month');
insert into public.playback_positions (profile_id, sermon_id, position_sec)
  values (:'leaver', :'sermon', 120);
insert into public.rsvps (event_id, profile_id, status)
  select e.id, :'leaver', 'going' from public.events e limit 1;
insert into public.course_interest (course_id, profile_id)
  select c.id, :'leaver' from public.courses c limit 1;
insert into public.course_handoff_tokens (profile_id, course_id, token_hash, expires_at)
  select :'leaver', c.id, repeat('a', 64), now() + interval '1 hour'
    from public.courses c limit 1;
insert into public.notifications (profile_id, type, deep_link, title, body)
  values (:'leaver', 'prayer', '/family', 'Someone prayed', 'A member prayed for you.');
-- notification_prefs needs no insert: a row is created for every new profile by trigger,
-- which is itself worth knowing, since it means that road was already seeded by accident.
insert into public.devices (profile_id, expo_push_token, platform)
  values (:'leaver', 'ExponentPushToken[erasure-test]', 'android');
insert into public.branch_change_requests (profile_id, from_branch_id, to_branch_id)
  select :'leaver', :'glasgow', b.id
    from public.branches b where b.id <> :'glasgow'::uuid limit 1;
insert into public.job_alerts (kind, recipient_id, subject)
  values ('queue_new', :'leaver', 'a test alert');
insert into public.broadcasts (id, author_id, scope, branch_id, title, body)
  values (:'bcast', :'admin_b', 'branch', :'glasgow', 'A word this week', 'Body.');
insert into public.broadcast_deliveries (broadcast_id, profile_id, channel)
  values (:'bcast', :'leaver', 'push');

-- The purchase pipeline's copies of the address, each with somebody else's row beside it, so
-- "the leaver's row is gone" cannot be satisfied by a statement that emptied the table.
insert into public.unmatched_purchases (buyer_email, source_ref, payload)
values ('leaver@test.local', 'ph_erasure_1', '{"email":"leaver@test.local"}'::jsonb),
       ('someone@test.local', 'ph_erasure_2', '{"email":"someone@test.local"}'::jsonb);
insert into public.payhip_events (event_id, event_type, payload)
values ('ev_erasure_1', 'paid',
        '{"id":"ord_1","type":"paid","date":"2026-09-01","price":1200,"currency":"GBP","items":[],"email":"leaver@test.local","name":"Leaver Person"}'::jsonb),
       ('ev_erasure_2', 'paid',
        '{"id":"ord_2","type":"paid","date":"2026-09-01","price":1200,"currency":"GBP","items":[],"email":"someone@test.local","name":"Someone Else"}'::jsonb);

-- ===========================================================================
-- 2b. Every road into a member, and proof that this fixture walks all of them.
-- ===========================================================================
-- The catalogue is built ONCE here and read twice: by the guard immediately below, which
-- says the FIXTURE reaches every road, and by §5 after the erasure, which says the ERASURE
-- did too. Written out twice it would drift, and it would drift silently in the direction
-- that matters, because a road nobody seeded is a road §5 cannot see.

create temporary table erasure_reached (tbl text, col text) on commit drop;

insert into erasure_reached (tbl, col)
select c.conrelid::regclass::text, a.attname
  from pg_constraint c
  join pg_namespace ns on ns.oid = c.connamespace
  cross join lateral unnest(c.conkey) k(attnum)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.contype = 'f'
   and c.confrelid = 'public.profiles'::regclass
   and ns.nspname = 'public'
   -- The nulled and the retained, named here and nowhere else in this file.
   and (c.conrelid::regclass::text || '.' || a.attname) not in (
     'prayers.author_id', 'testimonies.author_id', 'reports.reporter_id',
     'course_registrations.profile_id',
     'app_config.updated_by', 'branches.archived_by', 'broadcasts.approved_by',
     'broadcasts.author_id', 'course_registrations.linked_by',
     'course_registrations.set_aside_by', 'events.status_changed_by',
     'giving_config.updated_by', 'prayers.moderated_by', 'testimonies.moderated_by',
     'unmatched_purchases.resolved_profile_id');

create temporary table erasure_unseeded (tbl text, col text) on commit drop;

do $$
declare
  r record;
  n integer;
begin
  for r in select * from erasure_reached loop
    execute format('select count(*)::int from %s where %I = $1', r.tbl, r.col)
      into n using '97000000-0000-4000-8000-00000000000a'::uuid;
    if n = 0 then
      insert into erasure_unseeded values (r.tbl, r.col);
    end if;
  end loop;
end;
$$;

select is(
  (select coalesce(array_agg(tbl || '.' || col order by tbl), '{}') from erasure_unseeded),
  '{}'::text[],
  'the fixture puts a row on EVERY road into this member, which is what turns the sweep below from "nothing was found" into "everything was looked for"');

select is(
  (select glory_count from public.testimonies where id = '97000000-0000-4000-8000-0000000000a3'),
  1,
  'the counter counted the reaction, so its decrement below is a real observation and not a tautology');

-- ===========================================================================
-- 3. The erasure, keeping the posts.
-- ===========================================================================

select lives_ok(
  format($$select public.erase_profile(%L, true)$$, :'leaver'),
  'the erasure runs in one transaction');

select is(
  (select count(*)::int from public.profiles
    where id = :'leaver' and deleted_at is not null
      and email is null and display_name is null and avatar_url is null),
  1,
  'the profile is KEPT and stripped: kept because broadcasts.author_id is NOT NULL with NO ACTION and points here, stripped because everything on it is personal data');

select is(
  (select author_id from public.testimonies where id = :'kept_t'),
  null,
  'a kept post is ANONYMISED, not merely re-labelled: pointing it at the stripped shell would leave one stable identifier joining every post they ever wrote, which is pseudonymised rather than erased');

select is(
  (select consent_version from public.testimonies where id = :'kept_t'),
  'content-share-v1',
  'and it keeps its consent evidence, which `20` retains after anonymisation as the Art. 9 processing record');

select is(
  (select count(*)::int from public.testimonies where id = :'kept_t' and deleted_at is null),
  1,
  'the kept post is still live: "keep my posts" that quietly removed them would be the opposite of what the member chose');

select is(
  (select count(*)::int from public.testimony_feed where id = :'kept_t'),
  1,
  'AND IT IS STILL IN THE FEED. testimony_feed joined profiles with an INNER JOIN until this slice, so a null author_id would have made every kept post vanish silently');

select is(
  (select count(*)::int from public.testimonies
    where author_id is null and status = 'pending'),
  0,
  'the pending one is gone, cancelled first of everything: publishing after consent withdrawal is an Art. 9 breach and the queue is where that happens');

-- ===========================================================================
-- 4. Safeguarding holds what it must, and only that.
-- ===========================================================================

-- THE HOLD ONLY BITES WHERE THE ROW WOULD OTHERWISE HAVE BEEN DESTROYED, and this member
-- chose to keep their posts, so nothing was going to destroy this one. It is anonymised like
-- any other kept post and LEFT STANDING: hiding a post somebody asked to keep, on the
-- strength of a report that may yet be dismissed, would punish them for having been
-- reported. §8 is where the hold actually does something, on the remove branch.
select is(
  (select count(*)::int from public.testimonies
    where id = :'held_t' and author_id is null and deleted_at is null),
  1,
  'a held post under "keep my posts" is anonymised and left standing: the hold rescues evidence from destruction, and nothing here was being destroyed');

select is(
  (select count(*)::int from public.reports where testimony_id = :'held_t' and is_safeguarding),
  1,
  'and the report itself is still there, which is the whole point of holding the row');

select is(
  (select reporter_id from public.reports where testimony_id = '97000000-0000-4000-8000-0000000000a3'),
  null,
  'a report the leaver MADE keeps its reason and loses its reporter (`20`: 24 months, anonymised)');

select is(
  (select status::text from public.reports where testimony_id = '97000000-0000-4000-8000-0000000000a3'),
  'open',
  'and stays OPEN: the duty it raised belongs to the branch, not to whether its reporter still has an account');

-- ===========================================================================
-- 5. Every reached table, by enumeration rather than by a list written twice.
-- ===========================================================================
-- The list comes from §2b, which has already asserted that the fixture put a row on every one
-- of these roads. Before slice 5 that was not true and this sweep was blind to the difference:
-- a road nobody seeded reports nothing left behind for the same reason an empty table does.

create temporary table erasure_leftovers (relname text, colname text, n integer) on commit drop;

do $$
declare
  r record;
  n integer;
begin
  -- The same catalogue §2b built and proved the fixture walks. Reading it rather than
  -- rebuilding it is the point: one list, so the roads looked at here are exactly the roads
  -- something was put on.
  for r in select * from erasure_reached
  loop
    execute format('select count(*)::int from %s where %I = $1', r.tbl, r.col)
      into n using '97000000-0000-4000-8000-00000000000a'::uuid;
    if n > 0 then
      insert into erasure_leftovers values (r.tbl, r.col, n);
    end if;
  end loop;
end;
$$;

select is(
  (select coalesce(array_agg(relname || '.' || colname order by relname), '{}')
     from erasure_leftovers),
  '{}'::text[],
  'no table that should have been reached still points at the erased member');

select is(
  (select count(*)::int from public.course_registrations where stripe_session_id = 'cs_erasure_test_1'),
  1,
  'the payment record SURVIVES the payer (`02`, `20`): `16` said hard delete, and deleting the church''s record of a course fee because somebody left is losing the books, not erasure');
select is(
  (select profile_id from public.course_registrations where stripe_session_id = 'cs_erasure_test_1'),
  null,
  'without the payer on it');
select is(
  (select link_method from public.course_registrations where stripe_session_id = 'cs_erasure_test_1'),
  null,
  'and without the link trio, which describes how it was attached to a member there is no longer any of');

select is(
  (select glory_count from public.testimonies where id = '97000000-0000-4000-8000-0000000000a3'),
  0,
  'the counters corrected themselves as the reactions went, by their own AFTER DELETE triggers: the nightly reconcile is the net under this, not the mechanism');

-- ===========================================================================
-- 5b. The prayer half of the reach, which enumeration cannot see.
-- ===========================================================================
-- §5 proves a row is GONE. It cannot prove a row that stayed was changed correctly, and
-- `16` gives prayers three behaviours no count would catch: the member's choice, the
-- destruction of what nobody can see, and the one label that must never move.

select is(
  (select author_id from public.prayers where id = :'kept_p'),
  null,
  'a kept prayer is anonymised exactly as a kept testimony is: the reach table names both and only one of them was ever exercised here');

select is(
  (select count(*)::int from public.prayers where id = :'kept_p' and deleted_at is null),
  1,
  'and it is still live, because "keep my posts" that quietly hid them would be the opposite of what the member chose');

select is(
  (select is_anonymous from public.prayers where id = :'anon_p'),
  true,
  'AN ANONYMOUS PRAYER STAYS ANONYMOUS (`16`): anonymity chosen at post time is never altered by later account state, and re-labelling one would tell the family that its author had left');

select is(
  (select count(*)::int from public.prayers
    where author_id is null and status in ('pending', 'rejected', 'removed')),
  0,
  'the prayers nobody can see are destroyed rather than anonymised: consent is withdrawn and no member-facing surface will ever draw them again');

select is(
  (select count(*)::int from public.testimonies
    where author_id is null and status in ('rejected', 'removed')),
  0,
  'and the same for testimonies, the branch this file had never taken');

-- ===========================================================================
-- 5c. The pictures, and the addresses the purchase pipeline kept.
-- ===========================================================================

select is(
  (select storage_paths -> 'avatars' from public.account_erasures where profile_id = :'leaver'),
  '["avatars/leaver.jpg"]'::jsonb,
  'the avatar is written down for the sweep: it is a photograph of the member, and the transaction cannot reach the bytes');

select is(
  (select storage_paths -> 'testimony-photos' from public.account_erasures where profile_id = :'leaver'),
  '["testimony-photos/rejected.jpg"]'::jsonb,
  'and EXACTLY the pictures of the posts being destroyed: not the kept post''s, because a post without its picture is not the post they left standing, and not the held one''s, because the picture may be the evidence');

select is(
  (select count(*)::int from public.unmatched_purchases where source_ref = 'ph_erasure_1'),
  0,
  'an unmatched purchase in their name goes whole: once its owner is gone the row is an email address and nothing else');

select is(
  (select count(*)::int from public.unmatched_purchases where source_ref = 'ph_erasure_2'),
  1,
  'and somebody else''s is untouched, which is what makes the line above an erasure rather than a truncate');

select is(
  (select payload ->> 'email' from public.payhip_events where event_id = 'ev_erasure_1'),
  null,
  'the webhook body loses the buyer and keeps the sale: `16` retires the address, and the order id and price are the church''s record of a purchase');

select isnt(
  (select redacted_at from public.payhip_events where event_id = 'ev_erasure_1'),
  null,
  'and says when, so the retention job can tell a redacted body from one it has yet to reach');

select is(
  (select payload ->> 'email' from public.payhip_events where event_id = 'ev_erasure_2'),
  'someone@test.local',
  'while another buyer''s body is left alone: the redaction is keyed on this member''s address, not on the table');

-- ===========================================================================
-- 6. The ledger the sweep drains.
-- ===========================================================================

select is(
  (select count(*)::int from auth.identities where user_id = :'leaver'),
  0,
  'THE IDENTITY IS GONE, which is what actually frees the address. Nulling auth.users.email alone does NOT: driven against the real auth API, a signup for the same address is still refused 422 email_exists, because identities.email is a generated column over identity_data and the signup check reads it too');
select is(
  (select count(*)::int from auth.users where id = :'leaver' and email is null),
  1,
  'and the auth user is an inert shell rather than a deleted row: deleting it would cascade the profile away and take the audit trail with it');

select is(
  (select count(*)::int from public.account_erasures where profile_id = :'leaver'),
  1,
  'the one half that cannot join the transaction is written down: the storage objects, for the sweep');
select is(
  (select keep_posts from public.account_erasures where profile_id = :'leaver'),
  true,
  'with the choice the member made, so the sweep never has to guess');
select ok(
  not has_table_privilege('authenticated', 'public.account_erasures', 'select'),
  'and no member can read it: a row names an auth user id and the paths of somebody''s photos');

-- ===========================================================================
-- 7. The account is unusable the instant the transaction commits.
-- ===========================================================================
-- `02`'s invariant: every member write policy requires `deleted_at is null`, so the
-- second-device hole closes with no client involved. Attempted as the erased member.

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select throws_ok(
  $$insert into public.glory_reactions (profile_id, testimony_id)
    values ('97000000-0000-4000-8000-00000000000a',
            '97000000-0000-4000-8000-0000000000a3')$$,
  '42501',
  null,
  'a queued write from a device that missed the deletion is refused: erased Art. 9 data cannot be recreated by a replay');

-- What is NOT attempted here, deliberately: calling `erase_profile` as the member to watch
-- it refuse. Invoking a function the current role lacks EXECUTE on SEGFAULTS the backend
-- (019's trap), and it took this file down at exactly this line the first time it ran. The
-- privilege is asserted from the catalogue in §1 instead, which is the only safe way to ask.

reset role;
set local request.jwt.claims to '{}';

select throws_ok(
  format($$select public.erase_profile(%L, true)$$, :'leaver'),
  'P0002',
  null,
  'erasing an already-erased account raises rather than quietly doing it twice: two devices can ask at the same moment and the second must get an honest answer');

-- ===========================================================================
-- 8. The last admin cannot leave.
-- ===========================================================================
-- ADR 0015 already refuses demoting the last admin. Deleting yourself is a demotion with
-- extra steps, so the rule has to cover both doors or it covers neither: a ministry with no
-- admin has nobody who can appoint one.

-- A post of admin_a's that an open safeguarding report holds, erased on the REMOVE branch,
-- which is where the hold has something to do: without it the row would be destroyed and
-- `reports` would cascade away with it, taking the evidence.
insert into public.testimonies (id, author_id, branch_id, body, status, consent_version, consented_at)
values ('97000000-0000-4000-8000-0000000000a4', :'admin_a', :'glasgow', 'Reported, and to be removed.',
        'approved', 'content-share-v1', now());
insert into public.reports (testimony_id, reporter_id, reason, status, is_safeguarding)
values ('97000000-0000-4000-8000-0000000000a4', :'stayer', 'safeguarding concern', 'open', true);

select lives_ok(
  format($$select public.erase_profile(%L, false)$$, :'admin_a'),
  'one of two admins may go');

select is(
  (select count(*)::int from public.testimonies
    where id = '97000000-0000-4000-8000-0000000000a4'
      and author_id is null and deleted_at is not null),
  1,
  'ON THE REMOVE BRANCH the hold does its work: the row is anonymised and hidden rather than destroyed, because reports CASCADE from testimonies and a hard delete would take the safeguarding evidence with it (`02`, `20`)');
select is(
  (select count(*)::int from public.reports
    where testimony_id = '97000000-0000-4000-8000-0000000000a4' and is_safeguarding),
  1,
  'and the report is still there, which is the entire reason the row was held');

select throws_ok(
  format($$select public.erase_profile(%L, false)$$, :'admin_b'),
  'P0001',
  'the last admin cannot delete their account; appoint another admin first',
  'and the last one may not: the only way back from a ministry with no admin is a database console');

select * from finish();
rollback;
