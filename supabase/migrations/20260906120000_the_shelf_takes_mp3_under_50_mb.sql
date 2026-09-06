-- The shelf takes MP3, under 50 MB (docs/spec/02 §Storage, `08`; W4.9 slice 1).
-- ---------------------------------------------------------------------------
-- `20260814120000` opened `sermon-audio` to MP3, M4A and AAC at 150 MiB, mirroring what the
-- dashboard's picker and copy said. The first real upload (2026-09-05, a 57 MB m4a) found
-- both halves of that untrue in production:
--
--   * THE CAP WAS NEVER OURS TO SET. The Supabase Free plan fixes the per-file upload limit
--     at 50 MB at the storage layer (Storage > Settings, "Free Plan has a fixed upload file
--     size limit of 50 MB"), and a bucket row saying 150 MiB does not raise it. The upload
--     ran to 22 MB and died, and every line of copy went on promising 150.
--   * THE FORMAT ADVICE WAS ADVICE. `08` and the shelf's own note ask for 64-96 kbps mono
--     MP3, because a preached message needs nothing more and every member pays for the
--     bytes. The bucket, the picker and the byte check accepted m4a and aac anyway.
--
-- Decided with Ayo on 2026-09-06 (`docs/spec/plans/W4.9-audio-shelf-and-player.md`, §2):
-- MP3 only, enforced at every layer that decides, and the cap is the plan's cap so the
-- refusal happens in the browser before a byte is sent and the words are true. This
-- migration is the storage layer's share: the bucket's MIME list and size limit, and the
-- INSERT policy's name rule, which is the one line a service-role writer still meets.
--
-- Objects already shelved are untouched: production holds one `.mp3`, the seeds shelve
-- `.mp3`, and a policy gates inserts, not what exists. If the project moves to Pro, the
-- limit here and `MAX_AUDIO_BYTES` in the dashboard change together (pgTAP 034 pins both
-- to the same number).

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array['audio/mpeg']
where id = 'sermon-audio';

-- Same policy as before in every clause but the extension. Dropped and recreated rather
-- than altered because `alter policy` cannot change a WITH CHECK in place across versions
-- without restating it anyway, and restating it beside its reason is clearer.
drop policy "admins shelve sermon audio" on storage.objects;

create policy "admins shelve sermon audio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sermon-audio'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
  );
