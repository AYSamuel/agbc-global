-- The sync job's idempotent upsert (docs/spec/02: on conflict (youtube_id) do
-- update). Lives in SQL because PostgREST upserts cannot target a PARTIAL unique
-- index (the conflict target must repeat the index predicate). Service-role
-- only: clients never write sermons.
--
-- Field policy: the sync owns title/thumbnail/published_at/duration/status;
-- dashboard- and manually-owned fields (audio_url, speaker, series, branch_id)
-- are never touched. duration_sec keeps its old value when the source has none
-- (the RSS fallback carries no durations). status returns to 'available' on
-- every sighting: restore is symmetric (docs/spec/08).

create function public.sync_upsert_sermons(rows jsonb)
returns integer
language sql
as $$
  -- Kind first, and only when the source KNOWS it (API playlists): RSS mode
  -- sends null and must never flip a stored live_replay back to 'video'. A
  -- separate statement because `excluded.*` in DO UPDATE reflects post-coalesce
  -- insert values, which would erase the null marker.
  update public.sermons s
  set kind = i.kind, updated_at = now()
  from (
    select *
    from jsonb_to_recordset(rows) as r(youtube_id text, kind public.sermon_kind)
  ) i
  where s.youtube_id = i.youtube_id
    and i.kind is not null
    and s.kind is distinct from i.kind;

  with input as (
    select *
    from jsonb_to_recordset(rows) as r(
      youtube_id text,
      title text,
      published_at timestamptz,
      thumbnail_url text,
      duration_sec integer,
      kind public.sermon_kind
    )
    where youtube_id is not null
  ),
  upserted as (
    insert into public.sermons
      (youtube_id, title, published_at, thumbnail_url, duration_sec, kind, status)
    select youtube_id, title, published_at, thumbnail_url, duration_sec,
           coalesce(kind, 'video'::public.sermon_kind),
           'available'::public.sermon_status
    from input
    on conflict (youtube_id) where youtube_id is not null
    do update set
      title = excluded.title,
      published_at = excluded.published_at,
      thumbnail_url = excluded.thumbnail_url,
      duration_sec = coalesce(excluded.duration_sec, sermons.duration_sec),
      status = 'available',
      updated_at = now()
    returning 1
  )
  select coalesce(count(*), 0)::int from upserted;
$$;

comment on function public.sync_upsert_sermons(jsonb) is
  'Idempotent nightly-sync upsert on the partial unique youtube_id index; sync-owned fields only (docs/spec/02, 08).';

-- Service invocations only (the sync job); FORCE RLS on sermons would stop
-- non-privileged callers anyway, but the execute boundary is the clean one.
revoke execute on function public.sync_upsert_sermons(jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_upsert_sermons(jsonb) to service_role;
