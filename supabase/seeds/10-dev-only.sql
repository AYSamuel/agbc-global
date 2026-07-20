-- 10-dev-only.sql · fixture data for local/dev ONLY: never applied to prod.
-- Prod seeding goes through the reviewed step in docs/spec/19 instead.
-- Pre-approved testimonies/prayers and test events land here as their work
-- items arrive (W1.5, W1.7).

-- Watch fixtures (W1.3): every state the UI must render (docs/spec/08): video
-- with and without audio, audio-only manual row, sermon rot with and without
-- surviving audio, and a STALE live flag (clients must treat it as not live).
-- Fixed ids so pgTAP and app fixtures can reference rows stably.
insert into public.sermons
  (id, title, speaker, youtube_id, audio_url, duration_sec, thumbnail_url,
   series, published_at, is_live, live_checked_at, status)
values
  ('20000000-0000-4000-8000-000000000001',
   'Grace That Carries You', 'Rev Olayinka Ademiluka',
   'dev-yt-0001', 'https://example.test/audio/grace-that-carries-you.mp3', 2520,
   'https://i.ytimg.com/vi/dev-yt-0001/hqdefault.jpg',
   'One Amazing Grace', now() - interval '2 days', false, null, 'available'),
  ('20000000-0000-4000-8000-000000000002',
   'A Family Across Nations', 'Rev Olayinka Ademiluka',
   'dev-yt-0002', null, 2101,
   'https://i.ytimg.com/vi/dev-yt-0002/hqdefault.jpg',
   'One Amazing Grace', now() - interval '9 days', true, now() - interval '1 hour',
   'available'),
  ('20000000-0000-4000-8000-000000000003',
   'Living Loved', 'Pastor T Adeyemi',
   'dev-yt-0003', 'https://example.test/audio/living-loved.mp3', 1980,
   'https://i.ytimg.com/vi/dev-yt-0003/hqdefault.jpg',
   'Foundations', now() - interval '16 days', false, null, 'available'),
  ('20000000-0000-4000-8000-000000000004',
   'Midweek Word: Rest', 'Rev Olayinka Ademiluka',
   null, 'https://example.test/audio/midweek-rest.mp3', 1500,
   '',
   null, now() - interval '20 days', false, null, 'available'),
  ('20000000-0000-4000-8000-000000000005',
   'The Testimony Hour', 'Rev Olayinka Ademiluka',
   'dev-yt-0005', 'https://example.test/audio/testimony-hour.mp3', 3060,
   'https://i.ytimg.com/vi/dev-yt-0005/hqdefault.jpg',
   'Foundations', now() - interval '30 days', false, null, 'unavailable'),
  ('20000000-0000-4000-8000-000000000006',
   'Beginnings', 'Pastor T Adeyemi',
   'dev-yt-0006', null, 1740,
   'https://i.ytimg.com/vi/dev-yt-0006/hqdefault.jpg',
   null, now() - interval '45 days', false, null, 'unavailable')
on conflict (id) do nothing;
