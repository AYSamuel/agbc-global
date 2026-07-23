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

insert into auth.users (id, email)
values
  ('50000000-0000-4000-8000-00000000000a', 'dev.grace@example.test'),
  ('50000000-0000-4000-8000-00000000000b', 'dev.tobi@example.test'),
  ('50000000-0000-4000-8000-00000000000c', 'dev.anke@example.test'),
  ('50000000-0000-4000-8000-00000000000d', 'dev.marieke@example.test'),
  ('50000000-0000-4000-8000-00000000000e', 'dev.folake@example.test')
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
   'en', false, 'approved', 'seed-v0',
   now() - interval '2 days',
   '50000000-0000-4000-8000-00000000000a', now() - interval '9 days',
   now() - interval '10 days'),
  ('60000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000002',
   'Bitte betet fuer meine Familie. Wir suchen seit Monaten eine Wohnung in Berlin.',
   'de', false, 'approved', 'seed-v0',
   null, '50000000-0000-4000-8000-00000000000a', now() - interval '4 days',
   now() - interval '5 days'),
  ('60000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000003',
   'I am walking through something I cannot name publicly. Please pray for peace.',
   'en', true, 'approved', 'seed-v0',
   null, '50000000-0000-4000-8000-00000000000a', now() - interval '1 day',
   now() - interval '2 days'),
  -- Pending: visible to its author and to its branch leaders, invisible in the feeds.
  ('60000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000004',
   'Pray for our new believers class starting this month in Ogbomosho.',
   'en', false, 'pending', 'seed-v0', null, null, null, now() - interval '3 hours')
on conflict (id) do nothing;

insert into public.testimonies
  (id, author_id, branch_id, body, language, category_id, from_prayer_id, status,
   consent_version, moderated_by, moderated_at, created_at)
values
  ('70000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   'The surgery went perfectly and my mother came home on Saturday. Thank you to everyone who prayed. God answered.',
   'en', '40000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001', 'approved', 'seed-v0',
   '50000000-0000-4000-8000-00000000000a', now() - interval '1 day',
   now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
   'After eleven months of applying, I start on Monday. He was never late, only thorough.',
   'en', '40000000-0000-4000-8000-000000000002', null, 'approved', 'seed-v0',
   '50000000-0000-4000-8000-00000000000a', now() - interval '6 days',
   now() - interval '6 days'),
  ('70000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000003',
   'Mijn broer is voor het eerst in tien jaar meegegaan naar de dienst. Hij wil terugkomen.',
   'nl', '40000000-0000-4000-8000-000000000003', null, 'approved', 'seed-v0',
   '50000000-0000-4000-8000-00000000000a', now() - interval '3 days',
   now() - interval '3 days'),
  ('70000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000004',
   'We prayed over the shop for two years. It opened last week and the first customer prayed with me.',
   'en', '40000000-0000-4000-8000-000000000004', null, 'approved', 'seed-v0',
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
insert into public.prayer_intercessions
  (prayer_id, profile_id, state, prayed_at)
values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a',
   'prayed', now() - interval '3 days'),
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000c',
   'prayed', now() - interval '4 days'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000a',
   'committed', null),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-00000000000b',
   'committed', null)
on conflict (prayer_id, profile_id) do nothing;
