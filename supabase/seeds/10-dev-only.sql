-- 10-dev-only.sql · fixture data for local/dev ONLY: never applied to prod.
-- Prod seeding goes through the reviewed step in docs/spec/19 instead.
--
-- No sermon fixtures (removed 2026-07-20 on Ayo's direction): the youtube-sync
-- function fills real channel data on dev, and fake titles polluted the Watch
-- surfaces. pgTAP suites create their own rows (qa standard: builders over
-- shared fixtures). Pre-approved testimonies/prayers land here at W1.5.

-- Daily verses (W1.4): 90 date-relative days so the rollover, the "no verse
-- today" fallback, and the queue monitor (docs/spec/21 §5) all have data. Real
-- content comes from the pastor's quarterly batch via the dashboard
-- (docs/spec/22); this pool cycles verified WEB text (public domain).
with pool (idx, reference, verse_text) as (
  values
    (0, 'Psalm 23:1', 'Yahweh is my shepherd: I shall lack nothing.'),
    (1, 'Philippians 4:19', 'And my God will supply every need of yours according to his riches in glory in Christ Jesus.'),
    (2, 'Romans 8:28', 'We know that all things work together for good for those who love God, to those who are called according to his purpose.'),
    (3, 'Isaiah 41:10', 'Don''t you be afraid, for I am with you. Don''t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.'),
    (4, 'Philippians 4:6', 'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.'),
    (5, 'Philippians 4:7', 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.'),
    (6, 'Psalm 23:4', 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.'),
    (7, 'Romans 8:31', 'What then shall we say about these things? If God is for us, who can be against us?'),
    (8, 'Philippians 4:13', 'I can do all things through Christ, who strengthens me.'),
    (9, 'Psalm 23:6', 'Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh''s house forever.'),
    (10, 'Romans 8:37', 'No, in all these things, we are more than conquerors through him who loved us.'),
    (11, 'Philippians 4:4', 'Rejoice in the Lord always! Again I will say, "Rejoice!"'),
    (12, 'Romans 8:32', 'He who didn''t spare his own Son, but delivered him up for us all, how would he not also with him freely give us all things?'),
    (13, 'Psalm 23:2', 'He makes me lie down in green pastures. He leads me beside still waters.'),
    (14, 'Philippians 4:8', 'Finally, brothers, whatever things are true, whatever things are honorable, whatever things are just, whatever things are pure, whatever things are lovely, whatever things are of good report; if there is any virtue, and if there is any praise, think about these things.'),
    (15, 'Romans 8:39', 'nor height, nor depth, nor any other created thing, will be able to separate us from God''s love, which is in Christ Jesus our Lord.'),
    (16, 'Psalm 23:3', 'He restores my soul. He guides me in the paths of righteousness for his name''s sake.'),
    (17, 'Philippians 4:5', 'Let your gentleness be known to all men. The Lord is at hand.'),
    (18, 'Romans 8:34', 'Who is he who condemns? It is Christ who died, yes rather, who was raised from the dead, who is at the right hand of God, who also makes intercession for us.'),
    (19, 'Philippians 4:9', 'The things which you learned, received, heard, and saw in me: do these things, and the God of peace will be with you.')
),
-- A week of history plus 82 future days: exercises "today" and leaves the
-- queue monitor comfortably above its 14-day floor.
days (offset_days) as (
  select generate_series(-7, 82)
)
insert into public.daily_verses (date, reference, text, translation, language)
select
  current_date + d.offset_days,
  p.reference,
  p.verse_text,
  'WEB',
  'en'
from days d
join pool p on p.idx = (((d.offset_days % 20) + 20) % 20)
on conflict (date, language) do nothing;

-- Family fixtures (W1.5): pre-approved testimonies and prayers across all four
-- branches so the feeds, the scope toggle, the map pins, the counts and the
-- answered-prayer loop all have something real to render on dev. Never prod: the
-- launch feed is seeded with genuine content by the programme in docs/spec/22 §3.
--
-- These rows are written on a direct connection (no auth.uid()), so the write-path
-- guards pass them through and status can be set to 'approved' outright. That is the
-- ONLY way to publish without moderation, and it is exactly what the pgTAP suites
-- prove a client cannot do.

-- These columns are not decoration. Auth (GoTrue) reads this table with a Go struct that has
-- no nullable fields for most of them, and it looks a user up by email AND AUDIENCE, so on a
-- fresh stack a hand-seeded row failed three ways in a row before a sign-in got through
-- (found on device, W2.8):
--
--   aud/role null      -> the lookup misses, Auth tries to CREATE the user, and the email it
--                         is inserting is already there: 500 "Database error saving new user"
--   token columns null -> "converting NULL to string is unsupported"
--   created_at null    -> "unsupported Scan, storing driver.Value type <nil> into *time.Time"
--
-- The app can only render any of those as "You're offline. Check your connection", which is
-- exactly the wrong thing to tell somebody whose connection is fine. Signing in as a seeded
-- member is the whole point of these rows, so they are seeded the way Auth writes them.
insert into auth.users (
  id, email, instance_id, aud, role,
  created_at, updated_at, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data
)
select
  v.id::uuid, v.email, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  now(), now(), now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('50000000-0000-4000-8000-00000000000a', 'dev.grace@example.test'),
  ('50000000-0000-4000-8000-00000000000b', 'dev.tobi@example.test'),
  ('50000000-0000-4000-8000-00000000000c', 'dev.anke@example.test'),
  ('50000000-0000-4000-8000-00000000000d', 'dev.marieke@example.test'),
  ('50000000-0000-4000-8000-00000000000e', 'dev.folake@example.test')
) as v(id, email)
on conflict (id) do nothing;

-- Grace is seeded as a leader so the dev dashboard and the moderation-plane checks
-- have a real branch leader to act as; the rest are members.
insert into public.profiles
  (id, email, display_name, branch_id, language, role, onboarded_at, age_confirmed_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'dev.grace@example.test', 'Grace Bello',
   '00000000-0000-4000-8000-000000000001', 'en', 'leader', now(), now()),
  ('50000000-0000-4000-8000-00000000000b', 'dev.tobi@example.test', 'Tobi Adewale',
   '00000000-0000-4000-8000-000000000001', 'en', 'member', now(), now()),
  ('50000000-0000-4000-8000-00000000000c', 'dev.anke@example.test', 'Anke Richter',
   '00000000-0000-4000-8000-000000000002', 'de', 'member', now(), now()),
  ('50000000-0000-4000-8000-00000000000d', 'dev.marieke@example.test', 'Marieke de Vries',
   '00000000-0000-4000-8000-000000000003', 'nl', 'member', now(), now()),
  ('50000000-0000-4000-8000-00000000000e', 'dev.folake@example.test', 'Folake Ogunleye',
   '00000000-0000-4000-8000-000000000004', 'en', 'member', now(), now())
on conflict (id) do nothing;

-- One request is answered and carries a linked testimony (the loop, docs/spec/09);
-- one is anonymous, so the feed's "A member" path and the author_id stripping are
-- both exercised on dev without waiting for a real anonymous post.
insert into public.prayers
  (id, author_id, branch_id, body, language, is_anonymous, status, consent_version,
   answered_at, moderated_by, moderated_at, created_at)
values
  ('60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   'Please stand with me for my mother''s surgery on Thursday. She is anxious and so am I.',
   'en', false, 'approved', 'content-share-v1',
   now() - interval '2 days',
   '50000000-0000-4000-8000-00000000000a', now() - interval '9 days',
   now() - interval '10 days'),
  ('60000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000002',
   'Bitte betet fuer meine Familie. Wir suchen seit Monaten eine Wohnung in Berlin.',
   'de', false, 'approved', 'content-share-v1',
   null, '50000000-0000-4000-8000-00000000000a', now() - interval '4 days',
   now() - interval '5 days'),
  ('60000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000003',
   'I am walking through something I cannot name publicly. Please pray for peace.',
   'en', true, 'approved', 'content-share-v1',
   null, '50000000-0000-4000-8000-00000000000a', now() - interval '1 day',
   now() - interval '2 days'),
  -- Pending: visible to its author and to its branch leaders, invisible in the feeds.
  ('60000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000004',
   'Pray for our new believers class starting this month in Ogbomosho.',
   'en', false, 'pending', 'content-share-v1', null, null, null, now() - interval '3 hours')
on conflict (id) do nothing;

insert into public.testimonies
  (id, author_id, branch_id, body, language, category_id, from_prayer_id, status,
   consent_version, moderated_by, moderated_at, created_at)
values
  ('70000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   'The surgery went perfectly and my mother came home on Saturday. Thank you to everyone who prayed. God answered.',
   'en', '40000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001', 'approved', 'content-share-v1',
   '50000000-0000-4000-8000-00000000000a', now() - interval '1 day',
   now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
   'After eleven months of applying, I start on Monday. He was never late, only thorough.',
   'en', '40000000-0000-4000-8000-000000000002', null, 'approved', 'content-share-v1',
   '50000000-0000-4000-8000-00000000000a', now() - interval '6 days',
   now() - interval '6 days'),
  ('70000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000003',
   'Mijn broer is voor het eerst in tien jaar meegegaan naar de dienst. Hij wil terugkomen.',
   'nl', '40000000-0000-4000-8000-000000000003', null, 'approved', 'content-share-v1',
   '50000000-0000-4000-8000-00000000000a', now() - interval '3 days',
   now() - interval '3 days'),
  ('70000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000004',
   'We prayed over the shop for two years. It opened last week and the first customer prayed with me.',
   'en', '40000000-0000-4000-8000-000000000004', null, 'approved', 'content-share-v1',
   '50000000-0000-4000-8000-00000000000a', now() - interval '8 hours',
   now() - interval '8 hours')
on conflict (id) do nothing;

-- Reactions and commitments: the counter triggers derive every count from these, so
-- the seeded feeds show exactly the numbers the triggers would produce in the app.
insert into public.glory_reactions (testimony_id, profile_id)
values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a'),
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000c'),
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000d'),
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000e'),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000b'),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000c'),
  ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-00000000000a')
on conflict (testimony_id, profile_id) do nothing;

-- Two fulfilled ("I prayed") and two still committed, so both counts render.
--
-- The committed pair is ENROLLED in the reminder cadence (W3.4 slice 2), because a fresh
-- reset otherwise leaves prayer-reminders with nothing to do for a day and the surface
-- cannot be watched at all. One is backdated so its first nudge is already due and the very
-- next tick sends it; the other sits on the ordinary day-1 schedule. Seeds reach the insert
-- guard with no auth.uid(), so these values pass through rather than being overwritten.
--
-- To watch a nudge arrive on a DEVICE, point one at the account signed in on the phone:
--   update public.prayer_intercessions set next_reminder_at = now()
--    where profile_id = (select id from public.profiles where email = '<your address>');
insert into public.prayer_intercessions
  (prayer_id, profile_id, state, prayed_at, committed_at, next_reminder_at, reminder_count)
values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a',
   'prayed', now() - interval '3 days', now() - interval '4 days', null, 0),
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000c',
   'prayed', now() - interval '4 days', now() - interval '5 days', null, 0),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000a',
   'committed', null, now() - interval '1 day', now() - interval '5 minutes', 0),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-00000000000b',
   'committed', null, now(),
   public.prayer_reminder_next(now(), 0), 0)
on conflict (prayer_id, profile_id) do nothing;

-- Events fixtures (W1.7): date-relative so a reset always leaves upcoming rows.
-- One per branch plus a ministry-wide gathering, a cancelled event (the banner
-- treatment) and a past one (the Past section). Real events come from the
-- dashboard (W3.5); never prod. Branch events omit `timezone` on purpose: the
-- insert guard fills it from the branch, exactly as the dashboard will rely on.
insert into public.events
  (id, branch_id, title, description, starts_at_local, location, status, rsvp_enabled)
values
  ('83000000-0000-4000-8000-000000000001',
   (select id from public.branches where slug = 'berlin'),
   'Night of Worship',
   'An evening of worship and prayer as the Berlin family gathers to seek God together. All are welcome, so bring a friend.',
   (current_date + 9) + time '19:00', 'Prinzenstr. 84, 10969 Berlin', 'scheduled', true),
  ('83000000-0000-4000-8000-000000000002',
   null,
   'Global Family Sunday',
   'One family, many nations: every branch worships together on the same Sunday, joined across Glasgow, Berlin, Emmen and Ogbomosho.',
   (current_date + 16) + time '10:00', 'Every branch', 'scheduled', true),
  ('83000000-0000-4000-8000-000000000003',
   (select id from public.branches where slug = 'glasgow'),
   'Youth Conference',
   'A day for the young people of the family: teaching, worship and honest conversation about following Jesus where you are.',
   (current_date + 23) + time '10:00', 'Glasgow', 'scheduled', true),
  ('83000000-0000-4000-8000-000000000004',
   (select id from public.branches where slug = 'ogbomosho'),
   'Harvest Thanksgiving',
   'A service of thanksgiving for what God has done in the Ogbomosho family this season.',
   (current_date + 30) + time '09:00', 'Ogbomosho', 'scheduled', true),
  ('83000000-0000-4000-8000-000000000005',
   (select id from public.branches where slug = 'emmen'),
   'Community Picnic',
   'Food, games and family time with the Emmen branch.',
   (current_date + 12) + time '12:00', 'Emmen', 'cancelled', true),
  ('83000000-0000-4000-8000-000000000006',
   (select id from public.branches where slug = 'glasgow'),
   'Night of Prayer',
   'The Glasgow family gathered to pray through the night for the nations.',
   (current_date - 6) + time '18:00', 'Glasgow', 'scheduled', true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  starts_at_local = excluded.starts_at_local,
  location = excluded.location,
  status = excluded.status,
  rsvp_enabled = excluded.rsvp_enabled;

-- These have been "known about" all along: the seed is history, not news (W3.5 slice 4).
-- Without this line every reset would post six events to every seeded member two minutes
-- later, which is the same mistake W3.4 refused to make when it declined to backfill prayer
-- commitments. To watch the notices fire locally, change an event's time in the dashboard
-- (or here) and wait for the settle window.
update public.events
set announced_status = status,
    announced_starts_at_local = starts_at_local,
    announced_location = location
where id in (
  '83000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
  '83000000-0000-4000-8000-000000000005', '83000000-0000-4000-8000-000000000006'
);

-- --- rhythm (W2.8) --------------------------------------------------------------------------
--
-- Attendance history, so RHYTHM and Home's streak strip have something true to draw on device
-- rather than an empty state that looks like a bug. Four shapes on purpose, one per state
-- `rhythm_state()` can answer (docs/spec/10), because a state with no seeded member is a state
-- nobody looks at until a real member is standing in it:
--
--   Grace   (Glasgow leader)  six Sundays with one missed: state ACTIVE, and the run reads 5,
--                             which is the grace ARITHMETIC (the missed week is carried)
--   Tobi    (Glasgow member)  last Sunday only: ACTIVE, a rhythm just beginning
--   Anke    (Berlin member)   nothing for a fortnight: state GRACE, the run still standing
--   Marieke (Emmen member)    a month ago and nothing since: LAPSED, longest remembered
--
-- Anke exists because the grace STATE and the grace ARITHMETIC are different things, and only
-- the arithmetic was seeded until W2.8's screens went looking for the state (2026-08-07). Grace
-- attended last week, so she is `active` on any day of a fresh reset; a member is not in `grace`
-- until a whole week has passed with nothing. The fourth member is the only way that state is on
-- screen the moment `pnpm db:reset` finishes. (Folake, in Ogbomosho, is deliberately left with no
-- attendance at all: she is the `none` state, and the empty rhythm screen.)
--
-- Written with explicit service_date, which the insert guard allows only for a trusted writer
-- (no auth.uid()): as a member every one of these would be clamped to today, which is the
-- whole point of the clamp. Streaks and milestones are NOT seeded; the triggers derive them,
-- so a seeded database exercises the same path a real tap does.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at, source)
select
  p.id,
  p.branch_id,
  (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
  now(),
  'here_button'
from public.profiles p
cross join unnest(array[6, 5, 3, 1]) as w
where p.email = 'dev.grace@example.test'
on conflict (profile_id, service_date) do nothing;

-- One of Grace's six Sundays, credited by watching the stream instead of by the button. The
-- WRITER of these arrives at W3.2 (`08` credit-on-open); the row exists now because RHYTHM's
-- history draws that source differently (the frame's `.atrow.live`, a red disc and "Watched
-- live"), and a rendering path with no data behind it is a path nobody looks at until a real
-- member is standing in it. Split out of the array above rather than added to it, so the
-- dates, the run and the grace week are all exactly as they were.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at, source)
select p.id, p.branch_id, (date_trunc('week', current_date) - interval '4 weeks')::date + 6,
       now(), 'live_watch'
from public.profiles p
where p.email = 'dev.grace@example.test'
on conflict (profile_id, service_date) do nothing;

insert into public.attendance (profile_id, branch_id, service_date, client_taken_at, source)
select p.id, p.branch_id, (date_trunc('week', current_date) - interval '1 week')::date + 6,
       now(), 'here_button'
from public.profiles p
where p.email = 'dev.tobi@example.test'
on conflict (profile_id, service_date) do nothing;

insert into public.attendance (profile_id, branch_id, service_date, client_taken_at, source)
select p.id, p.branch_id, (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
       now(), 'here_button'
from public.profiles p
cross join unnest(array[5, 4]) as w
where p.email = 'dev.marieke@example.test'
on conflict (profile_id, service_date) do nothing;

-- Anke: four Sundays ending a fortnight ago. Exactly one whole week is missed, which is the
-- `grace` state: the run is carried across it and still reads 4. A week 2 rows back rather than
-- 1 is the entire difference between this member and Grace, and between two of the four states
-- the screens have to draw.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at, source)
select p.id, p.branch_id, (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
       now(), 'here_button'
from public.profiles p
cross join unnest(array[5, 4, 3, 2]) as w
where p.email = 'dev.anke@example.test'
on conflict (profile_id, service_date) do nothing;

-- Academy fixtures (W2.9 slice 2, ADR 0017): course_registrations rows in the three
-- shapes the app and dashboard have to draw. Written on a direct connection, so the
-- insert guard treats them as the website's service key: exactly how prod rows arrive.
-- course_id resolves from the slug by trigger; stripe ids are fixtures, unique so the
-- upsert-by-session-id path stays idempotent.

-- 1. A stranger's guest checkout, UNLINKED: admins see it, branch leaders must not
--    (ADR 0017 decision 5). The NG row exercises the regional currency rendering.
insert into public.course_registrations
  (course, format, full_name, email, city, country, branch, amount, currency,
   payment_status, stripe_session_id)
values
  ('grace-reset', 'Intensive (2 weeks)', 'Tunde Adeyemi', 'tunde.adeyemi@example.test',
   'Ogbomosho', 'Nigeria', 'Miracle center Ogbomosho', 500000, 'ngn', 'paid',
   'cs_test_dev_unlinked_ng')
on conflict (stripe_session_id) do nothing;

-- 2. A website checkout by a member's OWN sign-in address, still unlinked: visible to
--    that member through the email match alone (the policy, not a link).
insert into public.course_registrations
  (course, format, full_name, email, city, country, amount, currency,
   payment_status, stripe_session_id)
values
  ('grace-reset', 'Part-time (4 weeks)', 'Grace Dev', 'dev.grace@example.test',
   'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid', 'cs_test_dev_email_match')
on conflict (stripe_session_id) do nothing;

-- 3. A handoff-born registration: linked from birth, confirmed, the "you're
--    registered" state on COURSE.
insert into public.course_registrations
  (course, format, full_name, email, city, country, amount, currency, payment_status,
   stripe_session_id, profile_id, status, source, link_method, linked_by, linked_at)
select
  'grace-masterclass', 'Part-time (6 weeks)', p.display_name, p.email,
  'Emmen', 'Netherlands', 4000, 'gbp', 'paid',
  'cs_test_dev_handoff_linked', p.id, 'confirmed', 'app', 'handoff', p.id, now()
from public.profiles p
where p.email = 'dev.marieke@example.test'
on conflict (stripe_session_id) do nothing;

-- Notifications (W3.3 slice 2): a log for `NC` to page through on the device
-- before the screen exists to page it (slice 5). Deliberately mixed, because a
-- feed of one shape proves nothing: read and unread, an automated template row
-- and a pre-rendered broadcast row, a dedupe key and no dedupe key, and dates
-- spread far enough to exercise the relative timestamps and the cursor.
--
-- Explicit ids so a re-seed is a no-op rather than a second copy. Tobi is the
-- main dev member; Anke gets one so "own rows only" is visible on the device by
-- signing in as either.
insert into public.notifications
  (id, profile_id, type, template_key, params, title, body, dedupe_key,
   deep_link, read_at, created_at)
select
  v.id::uuid, p.id, v.type, v.template_key, v.params::jsonb, v.title, v.body,
  v.dedupe_key, v.deep_link,
  case when v.read_after is null then null else now() - v.read_after::interval end,
  now() - v.age::interval
from (values
  -- Unread, newest: the wedge's reward loop.
  ('60000000-0000-4000-8000-000000000001', 'dev.tobi@example.test', 'prayer',
   'prayer.someone_prayed', '{"count":1}', null, null, null,
   '/family/prayer', null, '2 hours'),
  -- Batched Glory, the "N people said Glory" collapse (docs/spec/15).
  ('60000000-0000-4000-8000-000000000002', 'dev.tobi@example.test', 'testimony_glory',
   'testimony.glory_batch', '{"count":3}', null, null, null,
   '/my-posts', '20 hours', '1 day'),
  -- Transactional: always delivered, no pref key.
  ('60000000-0000-4000-8000-000000000003', 'dev.tobi@example.test', 'moderation',
   'moderation.approved', '{}', null, null, null,
   '/my-posts', null, '2 days'),
  -- A service reminder carrying the occurrence in its dedupe key.
  ('60000000-0000-4000-8000-000000000004', 'dev.tobi@example.test', 'service_reminder',
   'service.starts_soon', '{"branch":"AGBC Glasgow"}', null, null,
   'service_reminder:glasgow:2026-08-09',
   '/', '3 days', '4 days'),
  -- A pre-rendered broadcast: title/body instead of a template key (W3.5 writes
  -- these for real; this one shows NC rendering both shapes).
  ('60000000-0000-4000-8000-000000000005', 'dev.tobi@example.test', 'ministry',
   null, null, 'Global Grace Gathering', 'All branches, this Sunday.', null,
   '/events', '5 days', '6 days'),
  -- Another member's row, so "own rows only" is visible by switching accounts.
  ('60000000-0000-4000-8000-000000000006', 'dev.anke@example.test', 'branch',
   null, null, 'Berlin service moves to 11:00', 'From next Sunday.', null,
   '/branches', null, '12 hours')
) as v(id, email, type, template_key, params, title, body, dedupe_key,
       deep_link, read_after, age)
join public.profiles p on p.email = v.email
on conflict (id) do nothing;
