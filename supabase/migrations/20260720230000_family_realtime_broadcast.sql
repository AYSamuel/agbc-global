-- Realtime for the Family feeds (docs/spec/02 "Realtime", docs/spec/09).
--
-- Deliberately NOT postgres_changes. That streams raw base-table rows: views do not
-- apply, so an anonymous prayer's author_id would go out over the wire, and DELETE
-- events skip RLS entirely. Instead the DB broadcasts a sanitized payload it builds
-- itself, on private channels, and the client refetches through the feed views.
--
-- What travels: enough to render or drop a card without a round trip (id, branch,
-- body, counts) plus author_id ONLY when the row is not anonymous, because clients
-- need it to drop events from authors they have blocked (a single broadcast payload
-- cannot be filtered per recipient, docs/spec/02).
--
-- Channels: `family:all` (the Everywhere feed) and `family:branch:<branch_id>` (My
-- branch). Both private; Realtime Authorization checks the realtime.messages policy
-- at the bottom of this file. The client must call supabase.realtime.setAuth().

-- Any transition OUT of public visibility broadcasts a removal so live clients drop
-- the card immediately: withdrawn Art. 9 content must not linger on screens until
-- the next refetch (docs/spec/02, 20). Worst case without realtime is the 60s poll.
create function public.is_publicly_visible(row_status public.content_status, row_deleted_at timestamptz)
returns boolean
language sql
immutable
as $$
  select row_status = 'approved' and row_deleted_at is null;
$$;

-- SECURITY DEFINER for two reasons: realtime.send() writes to realtime.messages,
-- which clients have no INSERT policy for (and must not), and the payload is built
-- from the row the caller may not be able to read.
create function public.broadcast_family_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected record := coalesce(new, old);
  was_public boolean := false;
  is_public boolean := false;
  action text;
  payload jsonb;
begin
  if tg_op <> 'INSERT' then
    was_public := public.is_publicly_visible(old.status, old.deleted_at);
  end if;
  if tg_op <> 'DELETE' then
    is_public := public.is_publicly_visible(new.status, new.deleted_at);
  end if;

  if is_public and not was_public then
    action := 'inserted';
  elsif is_public and was_public then
    action := 'updated';
  elsif was_public and not is_public then
    action := 'removed';
  else
    -- Never was public and still is not: pending drafts, rejections, edits to a
    -- pending row. Nothing to tell the feeds.
    return null;
  end if;

  if action = 'removed' then
    payload := jsonb_build_object(
      'table', tg_table_name,
      'id', affected.id,
      'action', action
    );
  elsif tg_table_name = 'testimonies' then
    payload := jsonb_build_object(
      'table', tg_table_name,
      'id', new.id,
      'action', action,
      'branch_id', new.branch_id,
      'author_id', new.author_id,
      'body', new.body,
      'language', new.language,
      'category_id', new.category_id,
      'from_prayer_id', new.from_prayer_id,
      'glory_count', new.glory_count,
      'created_at', new.created_at
    );
  else
    payload := jsonb_build_object(
      'table', tg_table_name,
      'id', new.id,
      'action', action,
      'branch_id', new.branch_id,
      -- The whole point: an anonymous request's author never leaves the database,
      -- not in a read and not in a broadcast.
      'author_id', case when new.is_anonymous then null else new.author_id end,
      'is_anonymous', new.is_anonymous,
      'body', new.body,
      'language', new.language,
      'answered_at', new.answered_at,
      'praying_count', new.praying_count,
      'prayed_count', new.prayed_count,
      'created_at', new.created_at
    );
  end if;

  perform realtime.send(payload, 'family', 'family:all', true);
  perform realtime.send(
    payload, 'family', 'family:branch:' || affected.branch_id::text, true);
  return null;
end;
$$;

create trigger testimonies_broadcast
  after insert or update or delete on public.testimonies
  for each row execute function public.broadcast_family_change();

create trigger prayers_broadcast
  after insert or update or delete on public.prayers
  for each row execute function public.broadcast_family_change();

-- Realtime Authorization: who may listen. Read-only, family topics only, and
-- guests included (browsing never requires auth). No INSERT policy anywhere:
-- clients never broadcast on these channels, the database does.
create policy "family channels are readable by everyone"
  on realtime.messages for select
  to anon, authenticated
  using (
    (select realtime.topic()) like 'family:%'
    and realtime.messages.extension = 'broadcast'
  );
