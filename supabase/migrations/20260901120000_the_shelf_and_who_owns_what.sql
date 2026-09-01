/**
 * W4.1 slice 2 (docs/spec/14, docs/spec/02 §books/entitlements/purchase pipeline and
 * §Storage, `20` §retention, `21` §5): the shelf the books sit on, and the record of who
 * owns which one.
 *
 * Five tables and two buckets, and NOT the pipeline: nothing here confirms a sale, grants
 * an entitlement or answers a webhook. Those are slices 3 to 5 and they wait on the trust
 * model, which waits on the Payhip key handoff (`24` §1 row 13). What this migration does
 * is make the destination exist, with its boundary written down, so the pipeline lands on
 * a shelf whose rules were decided before anything was in a hurry.
 *
 * THE ONE INVARIANT THIS FILE EXISTS FOR (`02` §Invariants): paid state is never
 * client-writable. `entitlements` has no client write policy of any kind, and no INSERT,
 * UPDATE or DELETE grant to either API role, so a member INSERT is refused at the grant
 * layer before RLS is even consulted. A member who could write this table would be handing
 * themselves the church's books.
 *
 * SIX DEPARTURES FROM `02`'s SKETCH, each argued where it happens and all six carried into
 * `02` in this same PR:
 *   1. `file_url` / `cover_url` are `file_path` / `cover_path`. The W2.3 and W3.1 rule:
 *      what belongs in a row is the PATH. A signed URL expires and a public one pins the
 *      project host into every row.
 *   2. A third bucket, `book-covers`, which `02` §Storage does not list. A cover has
 *      nowhere else to live, and hotlinking Payhip's CDN would put a third party's URL on
 *      every card in a guest-first grid.
 *   3. `book-files` is minted through an RLS SELECT policy rather than the per-request edge
 *      function `14` describes, exactly as W2.3 decided for `testimony-photos`: the policy
 *      gives the identical guarantee with no extra service on the read path.
 *   4. `entitlements` gains `revoked_at` + `revoked_reason` rather than being deleted on
 *      refund, because `14` promises a re-purchase restores place and progress and a
 *      deleted row cannot say what was taken back or why.
 *   5. The inbox is unique on `(event_id, event_type)`, not `event_id` alone. Payhip's
 *      refund webhook carries the ORIGINAL order id, so a refund and its sale share an id
 *      and a single-column unique would swallow every refund as a replay.
 *   6. `books.payhip_product_link` exists alongside `payhip_product_id`, because the
 *      licence-key verification this pipeline will rest on is keyed on the product
 *      PERMALINK in Payhip's v1 API. Which of the two the confirmer actually uses is slice
 *      1's, which is why it is nullable today.
 *
 * Rollback plan: drop the two storage guard functions and their trigger, the five storage
 * policies, the two bucket rows, the five tables (in FK order: reading_state,
 * unmatched_purchases, entitlements, payhip_events, books), the two enums, and restore
 * `run_retention_purges()` from 20260819160000.
 */

begin;

-- Nothing here touches a table anything reads yet, so the lock timeout is a habit rather
-- than a need. It stays because `run_retention_purges()` is replaced below and the monthly
-- job could in principle be mid-run (~/.claude/standards/database.md §Migrations).
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. The catalogue
-- ---------------------------------------------------------------------------

create type public.book_format as enum ('pdf', 'epub');

comment on type public.book_format is
  'Which reader engine opens the file (docs/spec/14 §READER). Both ship in v1 by the 2026-07-12 decision.';

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  description text not null default '',
  format public.book_format not null,
  -- Money in minor units plus an explicit ISO 4217 code, never a symbol in prose (`02`).
  -- Display only: Payhip charges, and its own page is the price that binds.
  price_minor integer not null,
  price_currency char(3) not null,
  -- Object paths, never URLs. See departure 1 in the header.
  cover_path text,
  file_path text,
  -- The Buy button's destination: the product's page on Payhip (`14` BOOK-DETAIL).
  payhip_url text not null,
  -- The webhook's `items[].product_id`, which is how an arriving sale finds its book.
  payhip_product_id text not null,
  -- The product PERMALINK, which is what /api/v1/license/verify takes. Nullable until
  -- slice 1 settles which of the two the confirmer uses (header, departure 6).
  payhip_product_link text,
  -- Null = not on sale. A catalogue row has to be able to exist before it is public,
  -- because the dashboard will create it, upload two files to it and then publish it, and
  -- a book visible between those steps is a Buy button leading to a product that is not
  -- there yet. Same shape as `courses.upcoming` and for the same reason.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_payhip_product_id_key unique (payhip_product_id),
  constraint books_price_positive check (price_minor > 0)
);

comment on table public.books is
  'The bookstore catalogue (docs/spec/14). Sold on Payhip and read in the app; a devotional is a book like any other and its plan hangs off `reading_plans.book_id` (ADR 0008).';
comment on column public.books.file_path is
  'Object path inside the PRIVATE `book-files` bucket, never a URL: reading URLs are signed and short-lived. Null until the file is uploaded, which is why READER is unreachable for a book whose row exists but whose file does not.';
comment on column public.books.cover_path is
  'Object path inside the PUBLIC-READ `book-covers` bucket, never a URL (the URL is derived; a stored one would pin the project host into the row). Null renders the branded placeholder, which is a designed state.';
comment on column public.books.payhip_product_id is
  'The webhook payload''s `items[].product_id`. The join between an arriving Payhip sale and a row here; unique, so two books cannot claim one product.';
comment on column public.books.published_at is
  'Null = not on sale and invisible to guests and members alike. Owners still read their own books through the entitlement policy, so unpublishing a title never takes it out of somebody''s Library.';

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- The store grid's own order, and the only query the catalogue serves at scale.
create index books_published_at_idx
  on public.books (published_at desc)
  where published_at is not null;

-- Both lead a storage delete policy's referenced-check below; partial because a row can
-- legitimately carry neither (the same shape as sermons_audio_path_idx).
create index books_file_path_idx on public.books (file_path) where file_path is not null;
create index books_cover_path_idx on public.books (cover_path) where cover_path is not null;

-- ---------------------------------------------------------------------------
-- 2. Who owns what
-- ---------------------------------------------------------------------------

create type public.entitlement_source as enum ('payhip', 'gift');

comment on type public.entitlement_source is
  'How the ownership came about: a confirmed Payhip sale, or an admin''s manual grant (docs/spec/17 §4 "entitlement issues / manual grants").';

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- RESTRICT, not CASCADE: a book somebody owns is unpublished, never deleted, and a
  -- migration that deleted one would silently empty a Library.
  book_id uuid not null references public.books (id) on delete restrict,
  source public.entitlement_source not null default 'payhip',
  -- The Payhip transaction id, or the licence key, depending on what slice 1 settles.
  -- Unique so a replayed sale grants once; null for a gift, which has no receipt.
  source_ref text,
  granted_at timestamptz not null default now(),
  -- Refunds revoke rather than delete. See departure 4 in the header.
  revoked_at timestamptz,
  revoked_reason text,
  constraint entitlements_profile_book_key unique (profile_id, book_id),
  constraint entitlements_source_ref_key unique (source_ref),
  constraint entitlements_revoked_pair check ((revoked_at is null) = (revoked_reason is null))
);

comment on table public.entitlements is
  'Who may read which book (docs/spec/14). NO client write policy and no client write grant, ever: `02` §Invariants, "paid state is never client-writable". Written by the Payhip job, by an admin''s manual grant, or by the drain.';
comment on column public.entitlements.revoked_at is
  'Set when a refund is confirmed; the book leaves LIBRARY and READER stops opening it (docs/spec/14 §Revocation). The row stays so a re-purchase restores place and progress, and so there is a record of what was taken back.';

-- book_id is the second column of the unique constraint, so it needs its own index (`02`).
create index entitlements_book_idx on public.entitlements (book_id);
-- What LIBRARY asks for, and what slice 6's notification arm will scan.
create index entitlements_granted_at_idx on public.entitlements (granted_at);

-- ---------------------------------------------------------------------------
-- 3. Where you got to
-- ---------------------------------------------------------------------------

create table public.reading_state (
  -- Server-assigned and excluded from the INSERT grant below. On a member-owned table with
  -- nothing else to force, identity is not an input (W3.1 slice 4): a client that names
  -- this column gets 42501 rather than a silent overwrite, and a trigger whose only job
  -- would be assigning one column is a trigger to maintain.
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  -- A CFI for EPUB, a page number for PDF. Opaque to the server on purpose: the engine
  -- that wrote it is the only thing that can read it (docs/spec/14 §READER).
  location text not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, book_id)
);

comment on table public.reading_state is
  'Where each member got to in each book (docs/spec/14). Retained 12 months past a revocation so a re-purchase restores the place; purged by run_retention_purges() after that.';
comment on column public.reading_state.profile_id is
  'Server-assigned (default auth.uid()); the INSERT grant excludes this column so a client cannot name it (the 20260815120000 pattern). Trusted paths set it explicitly.';

create index reading_state_book_idx on public.reading_state (book_id);

create trigger reading_state_set_updated_at
  before update on public.reading_state
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. The inbox
-- ---------------------------------------------------------------------------
-- Raw webhook bodies, written by the receiver and read by the processor. It is an INBOX,
-- not an outbox: `21` §5 forbids deriving work from a queue we wrote, and this is the
-- opposite, a record of what somebody else told us. Nothing here is trusted; the whole
-- point of `14`'s trust model is that the webhook is a trigger and not a grant.

create table public.payhip_events (
  id uuid primary key default gen_random_uuid(),
  -- Payhip's own order id, from the payload's `id`.
  event_id text not null,
  -- 'paid', 'refunded', 'subscription.created', 'subscription.deleted'.
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  redacted_at timestamptz,
  -- See departure 5 in the header: a refund carries the SALE's id, so the pair is the
  -- identity of an event and `event_id` alone is the identity of an ORDER.
  constraint payhip_events_event_key unique (event_id, event_type)
);

comment on table public.payhip_events is
  'The raw Payhip webhook inbox (docs/spec/14). Service-role only: FORCE RLS with ZERO policies and nothing granted to anon or authenticated, because the payload carries the buyer''s email and IP. Replays no-op on the (event_id, event_type) unique.';
comment on column public.payhip_events.redacted_at is
  'When the payload had its PII stripped (`20`): buyer email and IP go, the order id, price and items stay. Set by run_retention_purges(); the row itself goes at 12 months.';

-- What the processor asks for on every pass.
create index payhip_events_unprocessed_idx
  on public.payhip_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- 5. Sales with nobody to give them to
-- ---------------------------------------------------------------------------

create table public.unmatched_purchases (
  id uuid primary key default gen_random_uuid(),
  -- Normalized lowercase, the same shape `profile_emails` is held to
  -- (20260831150000): the drain matches on equality, so a column that might not be
  -- normalized is a match that might not happen.
  buyer_email text not null,
  -- Nullable, and a case the dashboard queue has to render: a sale for a Payhip product
  -- that is not in our catalogue at all has no book to point at.
  book_id uuid references public.books (id) on delete set null,
  source_ref text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_profile_id uuid references public.profiles (id) on delete set null,
  constraint unmatched_purchases_email_normalized check (buyer_email = lower(trim(buyer_email))),
  constraint unmatched_purchases_resolved_pair
    check ((resolved_at is null) = (resolved_profile_id is null))
);

comment on table public.unmatched_purchases is
  'A confirmed sale whose buyer has no profile here yet (docs/spec/14 §Drain). Service-role only: FORCE RLS with ZERO policies and nothing granted to anon or authenticated, because every row is a stranger''s email address. Worked weekly from the dashboard queue (`17` §4).';

-- The drain's own lookup: "is there a purchase waiting for this address".
create index unmatched_purchases_pending_idx
  on public.unmatched_purchases (buyer_email)
  where resolved_at is null;

-- Both FKs get their own index (the database standard: the engine does not do it for you,
-- and an unindexed FK turns a cascade into a table scan). Partial, because the queue's
-- normal state is a row with neither: a sale for a product we do not stock, waiting for a
-- buyer who has not signed up.
create index unmatched_purchases_book_idx
  on public.unmatched_purchases (book_id)
  where book_id is not null;
create index unmatched_purchases_resolved_profile_idx
  on public.unmatched_purchases (resolved_profile_id)
  where resolved_profile_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Row security
-- ---------------------------------------------------------------------------

alter table public.books enable row level security;
alter table public.books force row level security;
alter table public.entitlements enable row level security;
alter table public.entitlements force row level security;
alter table public.reading_state enable row level security;
alter table public.reading_state force row level security;
alter table public.payhip_events enable row level security;
alter table public.payhip_events force row level security;
alter table public.unmatched_purchases enable row level security;
alter table public.unmatched_purchases force row level security;

-- Browsing never requires auth (`02` matrix row 65, `14` §Permissions): the store grid is
-- a guest surface. Only what is on sale, though.
create policy "published books are publicly readable"
  on public.books for select
  using (published_at is not null);

-- An owner reads their own book whatever its shelf state. Without this, unpublishing a
-- title would empty it out of the Libraries of the people who paid for it, and the
-- `book-files` mint policy below (which reads `books` under the caller's own rights) would
-- stop admitting them.
-- EVERY POLICY BELOW IS SCOPED `to authenticated`, and that is load-bearing rather than
-- tidy. RLS ORs the permissive policies together and evaluates ALL of them, so an
-- unscoped policy whose body reads `entitlements` makes the whole catalogue unreadable to
-- `anon`: the guest's query dies with "permission denied for table entitlements" before it
-- reaches the one policy that was meant to admit them. Caught by 053's guest assertion the
-- first time it ran, and the failure is the store going blank for everybody without an
-- account, which is the app's entire front door.
create policy "owners read the books they own"
  on public.books for select
  to authenticated
  using (
    exists (
      select 1 from public.entitlements e
      where e.book_id = books.id
        and e.profile_id = (select auth.uid())
        and e.revoked_at is null
    )
  );

create policy "admins read every book"
  on public.books for select
  to authenticated
  using (public.caller_is_admin_live());

-- ADMINS WRITE THE CATALOGUE THROUGH RLS, not through a service-role route. `courses` (W2.9)
-- has no client write policy at all and says the Phase C dashboard will use the service key;
-- the newer and better-argued convention is W3.5 slice 5b's, "a branch is edited through RLS
-- and column grants, not an RPC, the way the events module works", and `17` §Platform asks
-- for the caller's own JWT wherever it can serve. It matters here for a second reason: the
-- path guard below reads `auth.uid()`, so a catalogue only ever written by the service role
-- would have a guard that never once ran.
--
-- Books are GLOBAL content, so this is `caller_is_admin_live()` and not
-- `caller_is_moderator_live()`: `17` §Roles puts books with daily verses and devotional
-- plans, which are the admin's, not the branch leader's. `aal2` is not asked for in the
-- policy, matching every other table here; `authorize()` refuses a sub-aal2 session before
-- a route ever reaches the database, and the storage policies below ask for it where the
-- bytes are.
--
-- NO DELETE, deliberately. Removing a title from sale is clearing `published_at`, which is
-- what `14` describes and what keeps it in the Library of everybody who bought it. The FK
-- from `entitlements` is ON DELETE RESTRICT anyway, so the only deletable book is one nobody
-- owns, and cleaning up a typo is a service-role job rather than a button.

create policy "admins add books"
  on public.books for insert
  to authenticated
  with check (public.caller_is_admin_live());

create policy "admins edit books"
  on public.books for update
  to authenticated
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

create policy "members read their own entitlements"
  on public.entitlements for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "admins read every entitlement"
  on public.entitlements for select
  to authenticated
  using (public.caller_is_admin_live());

-- No write policy of ANY kind on entitlements. See the header.

create policy "members read their own reading state"
  on public.reading_state for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "members write their own reading state"
  on public.reading_state for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

create policy "members update their own reading state"
  on public.reading_state for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "members forget their own reading state"
  on public.reading_state for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- payhip_events and unmatched_purchases get NO policies at all (`02` matrix row 60). FORCE
-- RLS with zero policies means the service role is the only reader, which is the point:
-- both tables are full of other people's email addresses.

-- ---------------------------------------------------------------------------
-- 7. Grants, which are the other half of the boundary
-- ---------------------------------------------------------------------------
-- Start from zero and hand back exactly the verbs each role needs (issue #96 and
-- 20260820200000: the project bootstrap grants ALL on a new table to both API roles).
-- `048` asserts the negatives schema-wide and asserts that every table names service_role
-- rather than inheriting it, which is the gap 20260831140000 was written to close.

revoke all on public.books, public.entitlements, public.reading_state,
  public.payhip_events, public.unmatched_purchases
  from anon, authenticated;

grant select on public.books to anon, authenticated;
-- The write half of the boundary for the catalogue. Every human here is the same
-- `authenticated` role, so the grant cannot say "admins" and the two policies above are what
-- narrow it; the grant's job is to say which VERBS exist at all, and DELETE does not.
grant insert, update on public.books to authenticated;

-- Not `anon`: a guest has no entitlements and no reading state, and a SELECT grant that
-- can only ever return zero rows is surface for nothing.
grant select on public.entitlements to authenticated;

grant select on public.reading_state to authenticated;
grant insert (book_id, location), update (book_id, location)
  on public.reading_state to authenticated;
grant delete on public.reading_state to authenticated;

-- The service role by NAME on every one of them, never by inheritance. `20260831140000`
-- exists because `course_registrations` took the bootstrap's ambient grant in August and
-- the pinned CI CLI builds a database whose bootstrap does not hand that out, so every
-- service-key INSERT failed there while passing locally.
grant all on public.books, public.entitlements, public.reading_state,
  public.payhip_events, public.unmatched_purchases
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. The two buckets
-- ---------------------------------------------------------------------------
-- TWO POSTURES, and the difference is the OBJECT rather than the neighbour (the W3.1
-- rule). `book-files` is the asset somebody paid for, so it is private and its SELECT
-- policy IS the entitlement check. `book-covers` is the advertisement for it, shown on
-- every card in a guest-first grid, so it is public-read like `sermon-artwork` and
-- `event-images`, and for the identical three costs: `expo-image` caches by URL, a signed
-- URL must not be persisted into an offline query, and neither may be handed to a CDN.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'book-files',
    'book-files',
    false,
    104857600,
    array['application/pdf', 'application/epub+zip']
  ),
  (
    'book-covers',
    'book-covers',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do nothing;

-- 100 MiB is generous for a book: a text-heavy PDF is single-digit megabytes and an EPUB
-- smaller again. It sits under the local stack's 200 MiB global ceiling, raised for
-- sermon-audio in W3.1; prod's equivalent is a dashboard setting on the `19` checklist.

-- Writers on both are live-table admins whose session has cleared the dashboard's second
-- factor (ADR 0015: never a JWT role claim). `aal2` in a policy was ruled OUT for content
-- tables because it would lock every mobile member out the moment one enrolled a factor;
-- it is safe here for the same reason inverted, since no member ever writes either bucket.
-- Books are global content and `17` §Roles puts them with admins, not branch leaders, so
-- this is `sermon-artwork`'s rule rather than `event-images`'.

create policy "admins shelve book files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'book-files'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|epub)$'
  );

create policy "admins hang book covers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'book-covers'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

-- No UPDATE policy on either, like every bucket here: objects are write-once, so the bytes
-- behind a path cannot change under it. It matters twice over for a book file, because a
-- member may already have downloaded it for offline reading and the copy on their phone is
-- the only one they will ever read again.

-- The referenced-check makes the removal order a mechanism rather than a convention: an
-- object a book still points at is simply not deletable, so "clear the column first"
-- cannot be forgotten.
create policy "admins unshelve book files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'book-files'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and not exists (
      select 1 from public.books b where b.file_path = storage.objects.name
    )
  );

create policy "admins unhang book covers"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'book-covers'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and not exists (
      select 1 from public.books b where b.cover_path = storage.objects.name
    )
  );

-- THE MINT PERMISSION, AND IT IS THE ENTITLEMENT CHECK.
--
-- `createSignedUrl()` only works for a caller this policy admits, so ownership is enforced
-- once, in the place the bytes actually leave from. `14` and `25` W4.2 both describe a
-- per-request edge function instead; W2.3 overturned that same wording for
-- `testimony-photos` with a reason that transfers wholesale (the policy gives the identical
-- guarantee with no extra service on the read path and one less place to re-implement the
-- rule wrongly), and `14` is amended in this PR.
--
-- `anon` is deliberately absent, unlike `sermon-audio`: a book is not guest content, and a
-- guest has no entitlement to satisfy this anyway. The `books` read inside runs under the
-- caller's own rights, which is why the "owners read the books they own" policy above is
-- load-bearing rather than a convenience: without it an unpublished book's owner would
-- stop being able to open the file they paid for.
--
-- What the TTL is remains the caller's to choose and is not a boundary: `14`'s "short TTL
-- (minutes)" bounds how long a URL survives being copied out of an entitled member's own
-- traffic, and the download-once offline model mints one at download time.

create policy "owners mint the books they own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'book-files'
    and exists (
      select 1
      from public.books b
      join public.entitlements e on e.book_id = b.id
      where b.file_path = storage.objects.name
        and e.profile_id = (select auth.uid())
        and e.revoked_at is null
    )
  );

-- Reading the object ROW is not reading the picture: covers are served by the public route,
-- which never consults RLS, and the app derives that URL from the path. This is scoped to
-- the only caller who needs it, the dashboard, which lists an object to state its size and
-- reads its first bytes back at save time. Left open it would hand `list()` to `anon`.
create policy "admins read book objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('book-files', 'book-covers')
    and public.caller_is_admin_live()
  );

-- ---------------------------------------------------------------------------
-- 9. "A book cannot point at a file that is not there"
-- ---------------------------------------------------------------------------
-- A dangling `file_path` is a Read button that dies on open, which is worse than the state
-- `14` designs for (no file yet = the book is not readable and says so). A dangling
-- `cover_path` is a broken image where a designed placeholder belongs. The reference is
-- checked when it is WRITTEN, which is also what fixes the removal order.
--
-- Service-role writers (seeds, jobs, the dashboard's admin client) are exempt like every
-- guard in this schema: no user context means a caller that is already trusted.

create function public.assert_book_object_exists(bucket text, target text)
returns void
language plpgsql
stable
as $$
begin
  if target is null or (select auth.uid()) is null then
    return;
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = bucket and o.name = target
  ) then
    raise exception 'books.% must reference an uploaded % object',
      case bucket when 'book-files' then 'file_path' else 'cover_path' end, bucket
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.books_object_path_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.file_path is distinct from old.file_path then
    perform public.assert_book_object_exists('book-files', new.file_path);
  end if;
  if tg_op = 'INSERT' or new.cover_path is distinct from old.cover_path then
    perform public.assert_book_object_exists('book-covers', new.cover_path);
  end if;
  return new;
end;
$$;

create trigger books_object_path_guard
  before insert or update on public.books
  for each row execute function public.books_object_path_guard();

-- ---------------------------------------------------------------------------
-- 10. Retention
-- ---------------------------------------------------------------------------
-- `21` §5's monthly row said the Payhip tables join THIS function at W4.1 rather than
-- arriving as a second job, and they do. Two things came with them:
--
-- `broadcast_deliveries` was supposed to join at W3.5 and never did. `21` §5 has listed it
-- since the beginning ("`broadcast_deliveries` > 30 days") and slice 2 of W3.5 built the
-- fan-out without touching this function, so a delivery row from the first broadcast this
-- ministry ever sends would have been kept for ever. Four lines, found while reading the
-- header that names it.
--
-- `reading_state` past a revocation is `14`'s own promise ("retained 12 months so a
-- re-purchase restores place and progress") and had no mechanism anywhere. It is here
-- rather than in a Payhip job because a purge belongs with the other purges.
--
-- THE REDACTION IS NOT AGE-BASED. `20` says the payload is redacted "after successful
-- processing", so the condition is `processed_at is not null`, not a window. Slice 3 may
-- move it into the processor itself, which would make this the backstop rather than the
-- mechanism; that is a better place for it and it is not this slice's to build.

create or replace function public.run_retention_purges()
returns table (item text, removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  gone_notifications integer;
  gone_tickets integer;
  gone_devices integer;
  gone_reports integer;
  open_past_window integer;
  gone_deliveries integer;
  redacted_events integer;
  gone_events integer;
  gone_unmatched integer;
  gone_reading integer;
begin
  -- Batched inside itself (ADR 0022): the one table here big enough to need it.
  gone_notifications := public.purge_old_notifications();

  -- Expo clears receipts after ~24 hours, so a ticket older than a week is unanswerable
  -- and the sweep will never look at it again (20260816120000).
  delete from public.push_tickets where sent_at < now() - interval '7 days';
  get diagnostics gone_tickets = row_count;

  -- The pruning backstop for tokens the receipts sweep never got to answer for (`21` §5).
  -- Harmless when wrong: the token re-registers on the next app open.
  delete from public.devices where last_seen_at < now() - interval '180 days';
  get diagnostics gone_devices = row_count;

  -- 24 months, SETTLED ONLY. An open report past its window is a process failure, and
  -- deleting it would destroy the safeguarding evidence and the task together.
  delete from public.reports
    where created_at < now() - interval '24 months'
      and status <> 'open';
  get diagnostics gone_reports = row_count;

  select count(*)::integer into open_past_window
  from public.reports
  where created_at < now() - interval '24 months'
    and status = 'open';

  -- One delivery row per recipient per broadcast (`21` §5, owed since W3.5). The receipts
  -- sweep has finished with them long before 30 days; what is left is a per-member record
  -- of a message they were sent, which is exactly what a retention window is for.
  delete from public.broadcast_deliveries where created_at < now() - interval '30 days';
  get diagnostics gone_deliveries = row_count;

  -- The buyer's email and IP leave a processed webhook body; the order id, price and the
  -- items stay, because those are what a support question is answered from (`20`).
  update public.payhip_events
     set payload = jsonb_build_object(
           'id', payload -> 'id',
           'type', payload -> 'type',
           'date', payload -> 'date',
           'price', payload -> 'price',
           'currency', payload -> 'currency',
           'items', payload -> 'items'
         ),
         redacted_at = now()
   where processed_at is not null
     and redacted_at is null;
  get diagnostics redacted_events = row_count;

  delete from public.payhip_events where received_at < now() - interval '12 months';
  get diagnostics gone_events = row_count;

  -- `20` says "purged 12 months after creation if unclaimed". A CLAIMED row goes at the
  -- same age and not sooner: the durable record of the sale is the entitlement it produced,
  -- so what is left here is a stranger's address with nothing hanging on it.
  delete from public.unmatched_purchases where created_at < now() - interval '12 months';
  get diagnostics gone_unmatched = row_count;

  -- `14`: place and progress survive a refund for 12 months so a re-purchase restores them.
  -- Keyed on the revocation rather than on the reading, so an owner who has not opened a
  -- book in two years keeps their bookmark.
  delete from public.reading_state rs
   where exists (
     select 1 from public.entitlements e
     where e.profile_id = rs.profile_id
       and e.book_id = rs.book_id
       and e.revoked_at is not null
       and e.revoked_at < now() - interval '12 months'
   );
  get diagnostics gone_reading = row_count;

  return query
    select 'notifications'::text, gone_notifications, 0
    union all select 'push_tickets'::text, gone_tickets, 0
    union all select 'devices'::text, gone_devices, 0
    union all select 'reports'::text, gone_reports, open_past_window
    union all select 'broadcast_deliveries'::text, gone_deliveries, 0
    union all select 'payhip_events_redacted'::text, redacted_events, 0
    union all select 'payhip_events'::text, gone_events, 0
    union all select 'unmatched_purchases'::text, gone_unmatched, 0
    union all select 'reading_state'::text, gone_reading, 0;
end;
$function$;

revoke all on function public.run_retention_purges()
  from public, anon, authenticated, service_role;
grant execute on function public.run_retention_purges() to service_role;

comment on function public.run_retention_purges is
  'The monthly retention purge (docs/spec/20 schedule, `21` §5): notifications at 12 months, push_tickets at 7 days, devices at 180 days of silence, SETTLED reports at 24 months, broadcast_deliveries at 30 days, processed payhip_events redacted then purged at 12 months, unmatched_purchases at 12 months, and reading_state 12 months past a revocation. An open report past its window is kept and counted rather than deleted.';

-- `assert_book_object_exists` is called by the guard trigger, which runs as the INVOKING
-- role (the W3.4 lesson), so the roles that write `books` must hold EXECUTE on it. Nothing
-- else may call it: it is a helper, not a surface.
revoke all on function public.assert_book_object_exists(text, text) from public, anon;
grant execute on function public.assert_book_object_exists(text, text)
  to authenticated, service_role;

commit;
