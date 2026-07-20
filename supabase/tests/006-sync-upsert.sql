-- sync_upsert_sermons (docs/spec/02, 08): idempotent replays, sync-owned fields
-- only, symmetric restore, and a client-execution ban.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Replay idempotence: the same payload twice yields ONE row with updated fields.
select is(
  public.sync_upsert_sermons('[{"youtube_id":"tap-yt-1","title":"First title",
    "published_at":"2026-07-01T10:00:00Z","thumbnail_url":"https://i.ytimg.com/vi/tap-yt-1/hqdefault.jpg",
    "duration_sec":1200}]'::jsonb),
  1, 'first upsert inserts one row');
select is(
  public.sync_upsert_sermons('[{"youtube_id":"tap-yt-1","title":"Retitled",
    "published_at":"2026-07-01T10:00:00Z","thumbnail_url":"https://i.ytimg.com/vi/tap-yt-1/hqdefault.jpg",
    "duration_sec":1200}]'::jsonb),
  1, 'replaying the upsert touches the same row, not a new one');
select is(
  (select count(*) from public.sermons where youtube_id = 'tap-yt-1')::int,
  1, 'one row exists after the replay');
select is(
  (select title from public.sermons where youtube_id = 'tap-yt-1'),
  'Retitled', 'the replay updated sync-owned fields');

-- Sync-owned fields ONLY: audio_url survives (dashboard-owned), and a null
-- source duration keeps the stored one (RSS mode carries none).
update public.sermons
  set audio_url = 'https://example.test/audio/keep.mp3'
  where youtube_id = 'tap-yt-1';
select is(
  public.sync_upsert_sermons('[{"youtube_id":"tap-yt-1","title":"Retitled",
    "published_at":"2026-07-01T10:00:00Z","thumbnail_url":"https://i.ytimg.com/vi/tap-yt-1/hqdefault.jpg",
    "duration_sec":null}]'::jsonb),
  1, 'the null-duration replay still upserts the row');
select is(
  (select audio_url from public.sermons where youtube_id = 'tap-yt-1'),
  'https://example.test/audio/keep.mp3',
  'the upsert never touches dashboard-owned fields');
select is(
  (select duration_sec from public.sermons where youtube_id = 'tap-yt-1'),
  1200, 'a null source duration keeps the stored duration (RSS mode)');

-- Restore is symmetric (docs/spec/08): an unavailable row that reappears in the
-- source flips back to available. Seed row 5 is the unavailable fixture.
select is(
  public.sync_upsert_sermons('[{"youtube_id":"dev-yt-0005","title":"The Testimony Hour",
    "published_at":"2026-06-20T10:00:00Z","thumbnail_url":"https://i.ytimg.com/vi/dev-yt-0005/hqdefault.jpg",
    "duration_sec":3060}]'::jsonb),
  1, 'the reappeared row upserts');
select is(
  (select status from public.sermons where youtube_id = 'dev-yt-0005'),
  'available'::public.sermon_status,
  'a reappeared unavailable row restores to available');

-- Clients can never call the sync upsert.
select is(
  has_function_privilege('authenticated', 'public.sync_upsert_sermons(jsonb)', 'execute'),
  false, 'authenticated users cannot execute the sync upsert');

select * from finish();
rollback;
