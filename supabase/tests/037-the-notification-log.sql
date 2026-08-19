-- W3.3 slice 2: the notification log and its ticket ledger (20260816120000),
-- attempted as real clients (docs/spec/21 §4).
--
-- Four claims under test:
--
--   1. ADR 0022 is true in the schema, not just in prose: the table is a plain
--      table, and BOTH dedupe guarantees hold ACROSS A MONTH BOUNDARY. That
--      last part is the whole decision. Under the monthly partitioning `02`
--      originally specified, the two inserts in section 2 would land in
--      different partitions and both succeed, which is a fan-out notifying
--      every recipient twice.
--   2. Nobody writes their own notifications. No INSERT grant, no DELETE grant,
--      no policy for either, and the one permitted write (`read_at`) is scoped
--      by COLUMN, so a member cannot rewrite `dedupe_key` on their own row and
--      silently suppress a future reminder to themselves.
--   3. Own rows only, for everyone. There is no admin SELECT policy, following
--      the precedent `devices` and `notification_prefs` set at W0.10 for this
--      same `02` matrix row, so an admin sees exactly their own log.
--   4. `push_tickets` is machine bookkeeping: zero client access of any kind.
--
-- Plus the retention function, because ADR 0022 traded partition drops for it
-- and an untested purge is a promise rather than a mechanism.
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every
-- privileged block pairs it with `set local request.jwt.claims to '{}'`.
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the
-- backend segfaults. Section 5 asserts the ACL rather than probing it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- Cast: two members and an admin, written by the trusted path.
insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-00000000000a', 'notif-a@test.local'),
  ('97000000-0000-4000-8000-00000000000b', 'notif-b@test.local'),
  ('97000000-0000-4000-8000-00000000000c', 'notif-admin@test.local');
insert into public.profiles (id, email, display_name, branch_id, role) values
  ('97000000-0000-4000-8000-00000000000a', 'notif-a@test.local', 'Notif A',
   '00000000-0000-4000-8000-000000000001', 'member'),
  ('97000000-0000-4000-8000-00000000000b', 'notif-b@test.local', 'Notif B',
   '00000000-0000-4000-8000-000000000002', 'member'),
  ('97000000-0000-4000-8000-00000000000c', 'notif-admin@test.local', 'Notif Admin',
   '00000000-0000-4000-8000-000000000001', 'admin');

-- ===========================================================================
-- 1. Shape: ADR 0022 in the catalogue.
-- ===========================================================================

select is(
  (select relkind::text from pg_class where oid = 'public.notifications'::regclass),
  'r',
  'notifications is a plain table, not partitioned (ADR 0022)');

select has_index('public', 'notifications', 'notifications_broadcast_once',
  'the fan-out re-run guard exists');
select has_index('public', 'notifications', 'notifications_dedupe_once',
  'the job re-run guard exists');
select has_index('public', 'notifications', 'notifications_profile_created_idx',
  'NC''s keyset page leads with the scoping column');
select has_index('public', 'notifications', 'notifications_unread_idx',
  'the unread badge has its partial index');
select has_index('public', 'push_tickets', 'push_tickets_unprocessed_idx',
  'the receipts sweep has its work-queue index');
select has_index('public', 'push_tickets', 'push_tickets_device_id_idx',
  'push_tickets.device_id is indexed (every FK column is)');
select col_is_pk('public', 'push_tickets', 'ticket_id',
  'Expo''s own ticket id is the natural key, so a re-record is a no-op');

-- ===========================================================================
-- 2. The guarantees bite, and they bite ACROSS A MONTH BOUNDARY.
-- ===========================================================================

insert into public.notifications
  (profile_id, type, template_key, params, dedupe_key, deep_link, created_at)
values
  ('97000000-0000-4000-8000-00000000000a', 'service_reminder',
   'service.starts_soon', '{"branch":"Glasgow"}'::jsonb,
   'service_reminder:glasgow:2025-01-31', '/home', '2025-01-31 23:50+00');

select throws_ok(
  $$insert into public.notifications
      (profile_id, type, template_key, dedupe_key, deep_link, created_at)
    values ('97000000-0000-4000-8000-00000000000a', 'service_reminder',
            'service.starts_soon', 'service_reminder:glasgow:2025-01-31',
            '/home', '2025-02-01 00:10+00')$$,
  '23505',
  null,
  'a re-run 20 minutes later, ACROSS the month boundary, is still deduped (ADR 0022)');

select throws_ok(
  $$insert into public.notifications
      (profile_id, type, template_key, dedupe_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'service_reminder',
            'service.starts_soon', 'service_reminder:glasgow:2025-01-31', '/home')$$,
  '23505',
  null,
  'and deduped within the same month too');

select lives_ok(
  $$insert into public.notifications
      (profile_id, type, template_key, dedupe_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000b', 'service_reminder',
            'service.starts_soon', 'service_reminder:glasgow:2025-01-31', '/home')$$,
  'the same key for a DIFFERENT member is a different notification');

select lives_ok(
  $$insert into public.notifications (profile_id, type, template_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'prayer',
            'prayer.someone_prayed', '/family/prayer/1'),
           ('97000000-0000-4000-8000-00000000000a', 'prayer',
            'prayer.someone_prayed', '/family/prayer/2')$$,
  'a null dedupe_key never collides: the partial index ignores it');

-- A REAL broadcast row since W3.5 slice 1 (20260819180000) gave broadcast_id its foreign
-- key. This fixture used to be a fabricated uuid, which was fine only for as long as there
-- was no table to point at; the FK turning that into a failure is the FK working.
insert into public.broadcasts (id, author_id, scope, title, body)
values ('97000000-0000-4000-8000-0000000000f1',
        '97000000-0000-4000-8000-00000000000a', 'ministry',
        'Global gathering', 'Sunday, all branches');

insert into public.notifications
  (profile_id, type, title, body, broadcast_id, deep_link, created_at)
values
  ('97000000-0000-4000-8000-00000000000a', 'ministry', 'Global gathering',
   'Sunday, all branches', '97000000-0000-4000-8000-0000000000f1', '/events',
   '2025-01-31 23:50+00');

select throws_ok(
  $$insert into public.notifications
      (profile_id, type, title, body, broadcast_id, deep_link, created_at)
    values ('97000000-0000-4000-8000-00000000000a', 'ministry', 'Global gathering',
            'Sunday, all branches', '97000000-0000-4000-8000-0000000000f1',
            '/events', '2025-02-01 00:10+00')$$,
  '23505',
  null,
  'a fan-out retried across the month boundary never double-writes (ADR 0022)');

select throws_ok(
  $$insert into public.notifications
      (profile_id, type, template_key, title, body, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'ministry', 'a.key',
            'A title', 'A body', '/events')$$,
  '23514',
  null,
  'a row cannot be both an automated template AND a rendered broadcast');

select throws_ok(
  $$insert into public.notifications (profile_id, type, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'ministry', '/events')$$,
  '23514',
  null,
  'a row with neither shape would render as nothing, and is refused');

select throws_ok(
  $$insert into public.notifications (profile_id, type, template_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'ministry', 'a.key',
            'https://evil.example/steal')$$,
  '23514',
  null,
  'deep_link is an expo-router path, never a URL (docs/spec/15)');

select throws_ok(
  $$insert into public.notifications (profile_id, type, template_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'not_a_type', 'a.key', '/home')$$,
  '23514',
  null,
  'an unknown notification type is refused by the CHECK');

-- ===========================================================================
-- 3. The privilege inventory. The next column added is a decision, not an
--    oversight (the 20260803140000 rule).
-- ===========================================================================

select is(has_table_privilege('anon', 'public.notifications', 'select'), false,
  'anon cannot SELECT notifications at all: this is a member-only log');
select is(has_any_column_privilege('anon', 'public.notifications', 'insert'), false,
  'anon holds no INSERT on notifications, not even one column');
select is(has_any_column_privilege('anon', 'public.notifications', 'update'), false,
  'anon holds no UPDATE on notifications');
select is(has_table_privilege('anon', 'public.notifications', 'delete'), false,
  'anon holds no DELETE on notifications');

select is(has_table_privilege('authenticated', 'public.notifications', 'select'), true,
  'a member may SELECT notifications (RLS scopes it to their own)');
select is(has_any_column_privilege('authenticated', 'public.notifications', 'insert'),
  false, 'a member holds no INSERT: every row here is the server''s');
select is(has_table_privilege('authenticated', 'public.notifications', 'delete'), false,
  'a member holds no DELETE: nobody hides a moderation notice from their own log');
select is(has_table_privilege('authenticated', 'public.notifications', 'truncate'),
  false, 'nobody but the service role may TRUNCATE (issue #96''s blanket grants are gone)');

select is(has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update'),
  true, 'read_at is the one column a member may write');
select is(has_column_privilege('authenticated', 'public.notifications', 'dedupe_key', 'update'),
  false, 'a member cannot rewrite dedupe_key and suppress their own next reminder');
select is(has_column_privilege('authenticated', 'public.notifications', 'deep_link', 'update'),
  false, 'a member cannot repoint deep_link');
select is(has_column_privilege('authenticated', 'public.notifications', 'type', 'update'),
  false, 'a member cannot relabel a notification''s type');
select is(has_column_privilege('authenticated', 'public.notifications', 'params', 'update'),
  false, 'a member cannot rewrite params');

select is(has_table_privilege('anon', 'public.push_tickets', 'select'), false,
  'anon cannot read the ticket ledger');
select is(has_table_privilege('authenticated', 'public.push_tickets', 'select'), false,
  'a member cannot read the ticket ledger: it is machine bookkeeping');
select is(has_any_column_privilege('authenticated', 'public.push_tickets', 'insert'),
  false, 'a member cannot write the ticket ledger');
select is(has_table_privilege('service_role', 'public.push_tickets', 'select'), true,
  'the service role, which is the only writer, can read it');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'push_tickets'),
  0,
  'push_tickets has ZERO policies, like broadcast_deliveries in the 02 matrix');

-- ===========================================================================
-- 4. Own rows only, for everyone, including an admin.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is((select count(*)::int from public.notifications), 4,
  'member A sees their own four notifications');

select lives_ok(
  $$update public.notifications set read_at = now()
    where id = (select id from public.notifications limit 1)$$,
  'a member may mark their own notification read');

select throws_ok(
  $$insert into public.notifications (profile_id, type, template_key, deep_link)
    values ('97000000-0000-4000-8000-00000000000a', 'prayer', 'a.key', '/home')$$,
  '42501',
  null,
  'a member writing their own notification is refused at the GRANT layer, before RLS is consulted');

select throws_ok(
  $$delete from public.notifications$$,
  '42501',
  null,
  'a member deleting their own notification is refused at the grant layer too');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';

select is((select count(*)::int from public.notifications), 1,
  'member B sees only their own, never A''s');

select is(
  (select count(*)::int from public.notifications
   where profile_id = '97000000-0000-4000-8000-00000000000a'),
  0,
  'and cannot reach A''s rows by naming them');

-- A's rows are invisible to B, so an UPDATE aimed at them touches nothing. The
-- grant would allow the column; RLS refuses the row.
with attempted as (
  update public.notifications set read_at = now()
  where profile_id = '97000000-0000-4000-8000-00000000000a'
  returning 1
)
select is((select count(*)::int from attempted), 0,
  'B marking A''s notifications read affects zero rows');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is((select count(*)::int from public.notifications), 0,
  'an admin sees only their own log: there is deliberately no admin SELECT policy (docs/spec/20)');

-- ===========================================================================
-- 5. Retention: the half of ADR 0022 that replaced partition drops.
-- ===========================================================================

reset role;
set local request.jwt.claims to '{}';

select is(has_function_privilege('authenticated',
  'public.purge_old_notifications(interval, integer)', 'execute'), false,
  'a member cannot run the retention purge');
select is(has_function_privilege('service_role',
  'public.purge_old_notifications(interval, integer)', 'execute'), true,
  'the service role can, which is what W3.4''s job will use');

-- Two of A's rows are dated January 2025, which is past the window whenever this
-- suite runs; the other three rows are today's.
select is(
  public.purge_old_notifications('12 months'::interval, 5000),
  2,
  'the purge removes exactly the rows past their 12-month window and says how many');

-- Scoped to this suite's own cast. The dev seed populates this table too, and a
-- whole-table count would couple these assertions to it (it did, on the first
-- run after the seed landed). The purge itself is global by design, so the
-- return value above still speaks for the whole table: a seeded notification
-- past its retention window would be a bug in the seed, and would say so here.
select is(
  (select count(*)::int from public.notifications
   where profile_id in ('97000000-0000-4000-8000-00000000000a',
                        '97000000-0000-4000-8000-00000000000b',
                        '97000000-0000-4000-8000-00000000000c')),
  3,
  'everything inside the window survives');

select is(public.purge_old_notifications('12 months'::interval, 5000), 0,
  're-running the purge is a no-op: it is idempotent and safe to retry');

select * from finish();
rollback;
