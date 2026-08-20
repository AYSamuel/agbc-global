# 02 · Data Model

Backend-agnostic relational schema (Postgres). Types are indicative. `id` is UUID unless noted. All tables have `created_at timestamptz default now()` and (where edited) `updated_at`. Soft-delete via `deleted_at timestamptz null` where noted.

> **RLS summary** (Supabase path): guests = anonymous read of public content; members = write their own rows; leaders = moderate/broadcast within their branch; admins = global. Enforced by policies referencing role/branch claims (see Write-path invariants below). Never trust the client.

> **Public Family reads go through views, not base tables** (ADR 0013, W1.5). RLS filters rows and cannot hide a column, so `prayers` would leak an anonymous author's `author_id` to anyone holding the anon key. `public.testimony_feed` and `public.prayer_feed` are security-definer views whose WHERE clause is the public-visibility boundary (approved, not deleted, not blocked either way) and which null the author fields when `is_anonymous`. The base tables grant `anon` nothing at all.
>
> **Each view also carries the CALLER's own interaction with the row** (W2.4): `testimony_feed.reacted_by_me`, and `prayer_feed.my_intercession_state` (null / `committed` / `prayed`). Both answer only about `auth.uid()`, so a guest always gets false/null and nobody learns anything about anyone else; the aggregate counts remain the only public statement about other members. They live on the row rather than in a second client query for a reason found on device: a card assembled from two independently-refetching queries can hold one and not the other for a frame, which showed up as a count that went 1, 0, 1 and a reaction border that flickered on and off. One card, one row, one moment.

> **Schema conventions:** every FK column gets an explicit index (Postgres does not index FK columns automatically). Public reads of anonymous prayers must strip `author_id` server-side. UUIDs: prefer UUIDv7 generated in the app/edge layer for index locality; if the project stays on `gen_random_uuid()` (v4), record the deviation in the project CLAUDE.md and rely on the composite feed indexes below for ordering. Product-facing, translatable categories use lookup tables, never enums or freeform text.

---

## Write-path invariants (RLS): the rules that make "never trust the client" true

The app writes with the anon key + the user's JWT, which can set ANY column unless constrained. These invariants are enforced by column defaults, `BEFORE INSERT/UPDATE` triggers, and RLS `WITH CHECK`; the UI is never the mechanism. Each has a CI authorization test that attempts the bypass and asserts failure (see `21-OPERATIONS.md`).

| Invariant | Enforcement |
|-----------|-------------|
| Content is born `pending` | `status default 'pending'`; BEFORE INSERT trigger forces `status='pending'`, `moderated_by/at=NULL` for non-moderators regardless of client-supplied values; member INSERT policy `WITH CHECK (status='pending')` |
| Authorship cannot be forged | trigger forces `author_id = auth.uid()` and `branch_id` = the author's profile branch on insert |
| Approved content cannot be edited into abuse | BEFORE UPDATE trigger: any author change to `body`, `image_path`, or `category_id` on an `approved` row resets `status='pending'` and clears `moderated_by/at`; only leader (own branch) / admin policies may set `approved`/`rejected`/`removed` |
| Roles are immutable to their owner | members update only an allowlisted column set (display_name, avatar_url, language, theme_pref); `email` is NOT in the allowlist: it mirrors the auth identity and changes only via the Supabase auth email-change flow (`03`). A privilege change is never self-service: `profiles_guard` raises on any `NEW.role <> OLD.role` written by the row's OWNER, admins included (the bootstrap promotion is exempt via `in_bootstrap_promote()`, pgTAP `015`), and the privileged bypass asks the live table through `caller_is_admin_live()` rather than the `user_role` JWT claim, so a just-demoted admin loses the power immediately rather than when their token expires |
| Branch is assigned, never self-assigned | `branch_id` was in the allowlist above until 2026-07-29 and must never return to it: `can_moderate_branch()` derives moderation authority FROM this column, so a leader could update their own row into another branch and moderate it (measured: `can_moderate_branch(glasgow)` f -> t, queue 0 -> 1 items). Worse than the write, the read: pending testimonies and prayers are Art. 9 data (`20`). `profiles_guard` now raises on any owner change to `branch_id` once `onboarded_at is not null`; AUTH-3 still chooses freely on the way in, and its resume path still works. Changes are PROPOSED and approved by **the branch being JOINED**, never the one being left (ADR 0015): a member moving Glasgow to Berlin needs Berlin's leader, and Glasgow's leader only sees it afterwards. A LEADER's move is approved by an admin and drops them to member. The 48 hours members are quoted is an expectation, not a hold; churn is bounded by a 90-day cooldown after a completed move and one open request at a time. This needs an admin write path that does not exist yet: the only UPDATE policy on `profiles` is `members update their own profile`, so today nobody can move an onboarded member at all. Proven in `018-branch-assignment.sql` |
| Counters are server-maintained | `glory_count` and the prayer counts (`praying_count`/`prayed_count`) written only by triggers (below), never by any client policy; the "I prayed" tap moves an intercession `committed`→`prayed`, decrementing `praying_count` and incrementing `prayed_count` |
| Prayer commitment cannot be forged or self-scheduled | `prayer_intercessions.profile_id` is trigger-forced = `auth.uid()`; a BEFORE UPDATE trigger allows only the one-way `committed`→`prayed` transition (sets `prayed_at`, never reverts); `committed_at`, `next_reminder_at`, and `reminder_count` are server/trigger-controlled, so a client cannot backdate, self-schedule, or silence reminders (its own or anyone else's) by writing these columns |
| The prayer-testimony link cannot be stolen | BEFORE INSERT/UPDATE trigger raises unless `from_prayer_id IS NULL` or the referenced prayer's `author_id = auth.uid()` (admins exempt); the UNIQUE constraint already prevents double-claiming. Without this, anyone could fabricate an "Answered prayer" ribbon on a stranger's prayer and permanently squat the link |
| Attendance is honest about WHEN, bounded against backdating | every attendance insert carries `client_taken_at` (device UTC instant captured at tap time). The BEFORE INSERT trigger sets `service_date = (client_taken_at at time zone branches.timezone)::date` when `client_taken_at` is within the past 72 hours and not in the future; otherwise it falls back to `now()`. Offline replays land on the day actually attended (a Saturday tap replayed Monday still records Saturday); fabrication beyond 72 hours stays impossible; `profile_id` remains trigger-forced |
| Paid state is never client-writable | `entitlements`, `streaks`, `milestones` have NO client write policies at all; writes happen only via service role (edge functions / dashboard) or DB triggers. A member INSERT into `entitlements` would be self-granted paid books |
| Moderation is compare-and-set | approve/reject/remove carries the `updated_at` of the version the leader reviewed; the moderation UPDATE (trigger-enforced) fails with "content changed since review" when `updated_at` differs, and the item returns to the queue. Closes the race where an author edit lands between review and approval, publishing unreviewed content |
| Deleted accounts cannot write | every member INSERT/UPDATE policy additionally requires the profile row to have `deleted_at IS NULL`. Closes the second-device replay hole: queued writes from a device that missed the deletion are rejected, never recreating erased Art. 9 data |
| Mark-answered has preconditions | a trigger refuses setting `answered_at` unless the prayer is `approved` and not deleted; "Mark as not answered" clears it only while no linked testimony exists. The `from_prayer_id` trigger additionally raises when the referenced prayer is `removed` |
| `removed` is terminal for authors | a trigger refuses author UPDATE on `removed` rows (DELETE stays allowed); only an admin may restore removed content, audit-logged |
| Consent evidence is real and current | `consent_version` is an FK into `consent_versions`, so no client (and no service-role job either) can record consent against a version that was never published; the BEFORE INSERT trigger additionally refuses one whose `active` is false, so a stale app cannot keep recording superseded wording. Authorship, branch and both consent columns are already immutable after insert. Without this the Art. 9(2)(a) record (`20`) is just a string the app chose |
| A photo reference must be the author's own | the BEFORE INSERT/UPDATE trigger raises unless `image_path`'s first path segment is `auth.uid()`. Reads of the object hang on "is there an approved testimony pointing at it", so owning the reference has to be as hard as owning the object: otherwise a member could point their own testimony at a stranger's private photo and mint a signed URL for it once approved |
| A photo the server has not opened cannot be referenced | Storage checks the size and the mime the CLIENT declared; the `photo-guard` edge function reads the object's leading bytes and records the pass in `testimony_photo_validations` (service-role writes only). The BEFORE INSERT/UPDATE trigger refuses an `image_path` with no matching record, so skipping the check is a failed insert rather than an unchecked upload. The record pins `storage.objects.id` (and `version`), so deleting the object and re-uploading different bytes at the same path un-validates it. Added W2.3 slice 3, replacing an earlier plan where the app called the guard AFTER posting and a client that never called it was never checked |
| Consent describes what was actually shared | `consent_versions.covers_photos` marks the wording that asks about the people in a photo (`20` §Photos). A row carrying an `image_path` may only record a version with the flag set, checked on INSERT and on the null-to-non-null edit; the app shows the matching wording (`content-share-photo-v1`) and the words-only wording (`content-share-v1`) stays active for everything else. Because consent evidence is immutable, adding a photo to an existing post is refused until W2.6's edit flow re-runs the consent step |
| `is_anonymous` flips without re-moderation but never silently | author changes to `is_anonymous` on an approved prayer are allowed (it is their own identity), fire the same sanitized realtime broadcast so live clients re-render, and anonymous-to-named requires a confirm sheet. All OTHER author-editable content columns (`body`, `language`) reset an approved row to pending |

**Role/branch in policies:** put `role` and `branch_id` into JWT claims via the Supabase Custom Access Token auth hook (server-set, so client role claims stay untrusted). Caveat: a demoted leader keeps stale claims until token refresh, so moderation-plane actions re-check `profiles.role` from the table. **Generalised by ADR 0015: any check that GRANTS power reads the live table, never a claim** (`caller_is_admin_live()`, never `is_admin()`), because a claim is a cached copy of an authorization decision and revocation has to bite immediately, not at token expiry. Claims are for cheap scoping hints and non-privileged reads. Wrap `auth.uid()` as `(select auth.uid())` in policies (per-row re-evaluation footgun), `FORCE ROW LEVEL SECURITY` on every table, per-role statement timeouts.

**Policy matrix (summary):**

| Table | anon | member | leader (own branch) | admin |
|-------|------|--------|---------------------|-------|
| testimonies / prayers | NO base-table access; SELECT the `testimony_feed` / `prayer_feed` views (approved + not deleted + not blocked) | same views, + base-table SELECT/UPDATE/DELETE own (any status); INSERT (forced pending) | + SELECT any status in branch; UPDATE status | all |
| glory_reactions | none | INSERT/DELETE own; SELECT | same | all |
| prayer_intercessions | none | INSERT/DELETE own + UPDATE own (state `committed`→`prayed` only); SELECT | same | all |
| profiles | none | own row (allowlisted columns; NOT `branch_id` once onboarded, NOT `role` ever) | read limited columns in-branch | read all; writes to `role`/`branch_id` only via the `SECURITY DEFINER` functions, never a broad UPDATE policy |
| branch_change_requests *(planned, ADR 0015)* | none | SELECT/INSERT own; UPDATE own to `cancelled` while pending | SELECT + UPDATE where `to_branch_id` is their branch (the branch being JOINED decides); SELECT only, decided rows only, where `from_branch_id` is theirs | all |
| privileged_actions *(planned, ADR 0015)* | none | none | none | SELECT only. Append-only: no UPDATE or DELETE for anyone, enforced by a trigger as well as by absent policies |
| notifications / devices / notification_prefs | none | own rows only | own rows only | all |
| reading_state / plan_progress / saved_items / playback_positions / sermon_notes | none | SELECT / INSERT / UPDATE / DELETE own rows | own rows | all |
| attendance | none | SELECT own; INSERT own (trigger-forced values, see invariants) | own | all |
| entitlements / streaks / milestones | none | SELECT own rows ONLY (no client writes, see invariants) | SELECT own | all (via service role) |
| testimony_categories / course_fees_regional / giving_config / app_config | SELECT | SELECT | SELECT | + write |
| payhip_events / unmatched_purchases / broadcasts / broadcast_deliveries | none | none | none (leaders act via dashboard service-role routes) | service-role only: RLS forced with ZERO client policies (`unmatched_purchases` holds buyer emails) |
| rsvps / course_interest | none | own rows | read in-branch | all |
| course_registrations (SHARED with the live website, ADR 0017) | none | SELECT own: `profile_id = auth.uid()` OR the row's email is a proven address; UPDATE = the cancel transition only (column grant: `status` alone) | SELECT only rows linked to an in-branch member or carrying an in-branch `branch_id`; an UNLINKED website row NEVER | all; the link happens via a definer routine and is audited by trigger |
| profile_emails | none | SELECT/DELETE own; no client writes it at all (its only writer, `verify_email_claim`, was retired 2026-08-11; the leader-linking tool becomes the next one) | none | SELECT |
| course_handoff_tokens | none | none | none | none: zero grants for every API role; the service-role RPCs are the only doors |
| sermons / events / courses / books / daily_verses / reading_plans | SELECT | SELECT | + manage own branch rows (dashboard) | all |
| branches / branch_services | SELECT | SELECT | SELECT only: branch management is ADMIN-only (`17` §5), so a leader gets no write version of it | admins INSERT/UPDATE at `aal2` (branch_services also DELETE), through a COLUMN grant that excludes `status`, `archived_at` and `archived_by`, so archiving cannot be reached by writing the column and has to go through `archive_branch()`. No DELETE on `branches` for anyone: they are archived, and the absent grant is the enforcement. Service role: all |
| devotional_days | free plans: SELECT | + entitled plans (entitlement join) | same | all |
| reports | none | INSERT; SELECT own | SELECT/UPDATE in-branch | all |
| blocked_users | none | own rows (blocker_id) | none | all |

**Feed indexes:** `(branch_id, status, created_at desc)` on `testimonies` and `prayers` (lead with the scoping column or RLS gets slow).

**Realtime:** do NOT expose `postgres_changes` on content tables (it streams raw base-table rows: views don't apply, DELETE events skip RLS, and anonymous `author_id` would leak). Instead: AFTER INSERT/UPDATE/DELETE triggers build a sanitized payload and call `realtime.send()` (NOT `realtime.broadcast_changes()`, which takes the raw record and cannot strip a column; corrected W1.5) on private channels (`family:branch:<id>`, `family:all`), author fields nulled when `is_anonymous`; only `approved` transitions broadcast. **Removal signal:** any transition OUT of public visibility (status leaves `approved`, `deleted_at` set, or AFTER DELETE using OLD) broadcasts a minimal `{table, id, action:'removed'}` so live clients drop the card immediately; withdrawn Art. 9 content must not linger on screens until refetch. RLS policy on `realtime.messages`; Realtime Authorization on; public channel access off. Counts (Glory / pray / watching-now) also travel via Broadcast. **"Watching now" is server-aggregated:** clients never subscribe to raw Presence (O(N²) at a Sunday peak breaks the message quota, `21` §10); an edge/DB aggregator tracks presence and broadcasts a single count every 10-15s. **Degradation bound:** clients that lose the family channel refetch the feed on a 60s timer and on focus; the removal guarantee is realtime-first, polling-bounded (worst case 60s).

## Storage buckets

| Bucket | Access | Rules |
|--------|--------|-------|
| `testimony-photos` | private | 5 MiB, jpeg/png only. A member writes only inside their own `<author_id>/` folder, and `testimonies.image_path` is trigger-checked to sit in that same folder, so a reference cannot be pointed at a stranger's object. Objects are **write-once**: there is no UPDATE policy, so replacing a photo is a new random object plus a delete, and the bytes behind a validated path cannot change under it. Reads are decided by a `storage.objects` SELECT policy: own object, OR referenced by an `approved` non-deleted testimony, OR the caller moderates that testimony's branch. A signed URL cannot be minted without passing it, so pending photos are unreachable pre-review. **Amended W2.3:** this used to say an edge function would mint the URLs; the RLS policy gives the identical guarantee with no extra service on the read path, and one less place to re-implement the rule wrongly |
| `book-files` | private | signed URL per request after an `entitlements` check, short TTL (minutes); see `14` |
| `avatars` | public-read | low sensitivity; still re-encoded on upload |
| `sermon-artwork` | public-read | **Decided 2026-08-15 (W3.1 slice 5, with Ayo):** deliberately NOT the audio's posture, because it is a different kind of object. The audio is the asset; the artwork is the picture on every rail card in a guest-first app, chosen by the church FOR public display, so there is nothing in it to fence (and unlike `testimony-photos` it carries no Art. 9 risk and no moderation gate). Three costs, none of which the audio pays: `expo-image` caches by URL and a rotating signature defeats it; signed URLs must not be persisted, so a persisted rails query would paint offline with every picture missing (`04`); and the lock screen is fetched by the OS out-of-process. 5 MiB, `image/jpeg` + `image/png` + `image/webp`. `public` widens only the READ path: writers are still live-table admins at `aal2` with machine-minted `<uuid>.<ext>` names and no UPDATE policy (write-once matters MORE here, because a public URL is CDN- and device-cached). SELECT on the object row is **admins only**, for the dashboard's `list()`; members need none, since the app derives the URL from the path. See `08` |
| `sermon-audio` | private, signed URLs (24h TTL) | **Decided 2026-08-14 (W3.1, with Ayo):** the audios are the church's own uploads (some sermons are never on YouTube), so a URL copied out of the app's traffic dies within a day instead of becoming a permanent free door; 24h cannot expire mid-listen and the player re-mints on open. 150 MiB, audio mimes only. Writers: live-table admins at aal2 (the aal2 claim is safe here where it was NOT on content tables: no mobile member writes this bucket). Object names machine-minted `<uuid>.<ext>`. SELECT (= the mint permission) covers `anon`: guest listening is a `08` requirement, so the TTL is the whole fence. Write-once like `testimony-photos`; see `08` |

All uploads: authenticated, size-capped, magic-byte validated (never trust client Content-Type), images re-encoded with EXIF/GPS stripped (a testimony photo can carry a member's home coordinates), random object ids. Docs `14`/`16`/`20` reference this section.

---

## Core identity

### `branches`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| slug | text unique | `glasgow`, `berlin`, `emmen`, `ogbomosho` |
| name | text | "AGBC Glasgow" |
| city | text | |
| country | text | |
| is_hq | bool | Glasgow = true |
| status | enum | `active` \| `archived` (default active). Branches are ARCHIVED, never hard-deleted (attendance, content, audit rows reference them). Archived: hidden from onboarding/BRANCH-SWITCH/BRANCHES/map; `branch_services` deactivated (reminders stop); content stays readable under Everywhere; members whose home branch is archived are prompted on next launch to pick a new one (HQ preselected) and get no branch-tier notifications meanwhile. **That prompt is the one branch change that needs no approval and ignores the cooldown** (ADR 0015): there is no branch left to stay in and no leader to ask, so it is a server-owned assignment writing its own audit row, not a request; residual pending moderation escalates to admins immediately; the dashboard blocks archiving until its leaders are reassigned (`17` §5). **Built W3.5 slice 5a** (`archive_branch()`, `restore_branch()`, `rehome_from_archived_branch()`): only `archive_branch()` may set this, because `status` is outside the admins' column grant. Archiving additionally CANCELS the branch's future scheduled events (so `event-notices` tells everyone holding an RSVP) and stops its broadcasts (a `sending` one is halted, one awaiting approval is rejected with a note, and `broadcast_recipients` gives a branch-scoped one no audience at all while a MINISTRY one still reaches these members: the branch TIER stops, not everything). It refuses HQ, the last open branch, and any branch a leader still points at. "Reminders and live windows" above was written before ADR 0021 removed the live layer |
| archived_at / archived_by | timestamptz null / uuid FK null (ON DELETE SET NULL) | **Who closed this branch, and when** (W3.5 slice 5a). Server-written by `branches_guard` from the status transition and from `auth.uid()`, and restored for any caller who tries to set them; NULL for a trusted caller with no user context, or an account since deleted. Cleared when a branch is re-opened, because they record a STATE and not a history. Deliberately NOT in `privileged_actions`, for the third time in W3.5 and the same reason each time: that ledger is profile-oriented (`actor_id` and `target_id` both reference `profiles`) and this action's subject is a branch, so it would be a row with a null target whose meaning lived in a JSON blob. The row is its own record |
| timezone | text | IANA id: `Europe/London`, `Europe/Berlin`, `Europe/Amsterdam`, `Africa/Lagos`. Acts exactly once, at attendance write time |
| languages | text | "English", "Deutsch / English"… |
| youtube_channel_id | text null | empty ⇒ use global HQ channel |
| email | text | |
| lat | numeric | for the global map |
| lng | numeric | |
| service_times | jsonb | display strings only (`{ sunday, classes, midweek }`); the machine-readable schedule is `branch_services` |
| address | jsonb | `{ line1, line2 }` |
| lead | jsonb | `{ name, role, bio }` |
| leaders | jsonb[] | `[{ name, role }]` |
| welcome | text | |
| order | int | display order |

> **Seeding reality check:** `agbc/src/content/branches/*.json` does NOT contain `lat`, `lng`, `slug`, or `timezone`, uses camelCase keys (`isHq`, `youtubeChannelId`, `times`), and has a `quote` field. Seed via a versioned seed file that merges the JSON with a hand-built augmentation map per slug (geocoded lat/lng, timezone, slug from filename) and maps key names. Never "seed from the JSON as-is".

### `branch_services`
Machine-readable service schedule (reminders, service_date, live windows).
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| branch_id | uuid FK | |
| weekday | smallint | 0–6 |
| start_time | time | branch-local wall clock |
| kind | enum | `sunday` \| `midweek` \| `classes` |
| duration_min | int | default 120. The service WINDOW everywhere it is load-bearing (live detection polling, live-watch attendance credit, the "I'm here" affordance) = [start_time minus 30 min, start_time + duration_min]. DST: nonexistent local start times resolve to the next valid instant; ambiguous (fall-back) times take the earlier UTC offset |
| label | text | display |

`attendance.service_date` is defined as `(now() at time zone branches.timezone)::date` at write time.

### `profiles`
The app user. Created on first successful OTP; a guest has **no** profile row.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | = auth user id |
| email | text unique | the sign-in identity (mirrors `auth.users.email`, kept in sync server-side; see `03`); **verified by definition** (sign-in IS the verification); backs Payhip entitlement matching (`14`); nulled on account deletion so the address can re-register (see `16`) |
| display_name | text | |
| avatar_url | text null | |
| branch_id | uuid FK→branches | user's **home branch** (drives attendance timezone, reminders, branch notifications; see `07` branch-context model) |
| language | text | `en` \| `de` \| `nl` \| `fr` |
| role | enum | `member` \| `leader` \| `admin` (default `member`; immutable to owner, see invariants) |
| theme_pref | enum | `system` \| `light` \| `dark` |
| onboarded_at | timestamptz | set ONLY when `AUTH-3` completes; a session whose profile has `onboarded_at IS NULL` is routed to `AUTH-3` before anything else (abandoned half-created profiles resume there); content/reaction/RSVP/attendance INSERT policies additionally require `onboarded_at IS NOT NULL` |
| age_confirmed_at | timestamptz | the 16+ self-declaration evidence (`20`), written in the same `AUTH-3` update |
| deleted_at | timestamptz null | account deletion; `email` nulled at the same time (see `16`) |

### `devices`
Push targets; a profile may have several. Rows are created on/after sign-in only: v1 push is member-oriented (see `15`), so guests never register tokens.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | |
| expo_push_token | text unique | upsert on registration; row deleted on sign-out and on `DeviceNotRegistered` receipts (`15`) |
| platform | enum | `ios` \| `android` |
| last_seen_at | timestamptz | |

### `notification_prefs`
Row created by an AFTER INSERT trigger on `profiles`; fan-out treats an absent row as the column defaults.
| field | type | notes |
|-------|------|-------|
| profile_id | uuid PK/FK | |
| ministry_announcements | bool | default true |
| branch_updates | bool | default true |
| service_reminders | bool | default true |
| prayer_activity | bool | default true (the wedge's reward loop) |
| prayer_reminders | bool | default true (opt-out; reminders to pray for requests you committed to, stop on "I prayed", see `15`) |
| testimony_activity | bool | default true |

### `blocked_users`
Store-required UGC control (Apple 1.2 / Play UGC policy): block, not just report. Feeds filter blocked authors server-side; Settings lists "Blocked members".
| field | type | notes |
|-------|------|-------|
| blocker_id | uuid FK→profiles | |
| blocked_id | uuid FK→profiles | |
| - | PK(blocker_id, blocked_id) | |

### `giving_config`
Server-side giving configuration (currencies, accounts) so bank-detail changes NEVER require an app release (`12`/`22`). Seeded from `site.ts`.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | singleton row (or one per currency) |
| accounts | jsonb | the currency/account structures from `12` |
| updated_by | uuid FK | audit |

### `app_config`
Remote app configuration read on launch, PRE-AUTH (anon SELECT): the forced-update gate (`21` §8) and similar flags.
| field | type | notes |
|-------|------|-------|
| key | text PK | e.g. `minimum_supported_version` |
| value | jsonb | |
| updated_by | uuid FK | audit; writes admin/service-role only |

**Block mechanism (decided): two-way hide, the industry norm.** Approved-content SELECT policies add `NOT EXISTS (select 1 from blocked_users b where (b.blocker_id = (select auth.uid()) and b.blocked_id = author_id) or (b.blocked_id = (select auth.uid()) and b.blocker_id = author_id))`, so neither party sees the other's content. Notification fan-out suppresses activity from either direction of a block (`15`); live-feed clients drop broadcast events whose non-anonymous author is locally blocked.

---

## Family (the wedge)

### `testimony_categories`
Lookup table (product-facing + translatable; freeform text fragments filters and cannot localize).
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| key | text unique | `healing`, `provision`, `salvation`, `breakthrough`… i18n label lives in the app bundle by key |
| sort | int | |
| active | bool | |

### `consent_versions`
The consent wordings a member can agree to when sharing. Art. 9(2)(a) evidence has to be verifiable, so the version on a post is an FK into this table and not free text a client could invent; the insert guards additionally refuse an inactive version, so consent is only ever recorded against the wording currently on offer. The wording TEXT lives in the app i18n bundle in four languages, pinned to these keys by a hash test in `apps/mobile`, so consent copy cannot drift without minting a new version. New versions ship as migrations (the row must reach dev and prod, which seeds do not); no client can write here.
| field | type | notes |
|-------|------|-------|
| version | text PK | e.g. `content-share-v1` |
| published_at | timestamptz | |
| active | bool | retire with `active=false`, NEVER a delete: existing rows reference it as retained evidence (`20`). Retiring breaks any app build still shipping that key, so retire only after `app_config.minimum_supported_version` has moved past those builds |
| notes | text null | what changed in this wording |

### `testimonies`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| author_id | uuid FK→profiles | trigger-forced = auth.uid() |
| branch_id | uuid FK→branches | trigger-forced = author's branch at post time (scopes "My branch") |
| body | text | CHECK 1..2000 characters after trimming (`09`; unbounded UGC text is both an abuse vector and an unreadable feed card) |
| language | text | declared at compose or detected server-side (`en`/`de`/`nl`/`fr`/`yo`…); drives the Everywhere-feed label (`09`) and moderation language escalation (`17`/`22`) |
| category_id | uuid FK→testimony_categories null | |
| image_path | text null | object PATH in the private `testimony-photos` bucket (`<author_id>/<uuid>.jpg`), never a URL: URLs for this bucket are signed and expire. Trigger-checked to sit in the author's own folder, so the reference cannot be pointed at a stranger's object. Readability is decided by the storage policies (see Storage buckets above). Renamed from `image_url` in W2.3, before it ever held a value |
| from_prayer_id | uuid FK→prayers null **unique** | set when born from an answered prayer; `on delete set null`. Single source of truth for the loop; the reverse link is derived by join (no second FK to drift) |
| status | enum | `pending` \| `approved` \| `rejected` \| `removed` (trigger-forced pending on insert and on author edit) |
| rejection_reason | text null | shown to the author in MY-POSTS with "Edit and resubmit" (`09`) |
| consent_version | text FK→consent_versions | version of the consent wording shown (Art. 9 evidence, see `20`). FK, not free text: the insert guard additionally refuses a version that is no longer `active`, so consent can only ever be recorded against wording currently on offer |
| consented_at | timestamptz | |
| moderated_by | uuid null | leader/admin |
| moderated_at | timestamptz null | |
| glory_count | int | denormalized counter (see triggers note) |
| deleted_at | timestamptz null | author delete |

### `glory_reactions`  ("Glory to God" = the app's like)
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| testimony_id | uuid FK | |
| profile_id | uuid FK | |
| - | unique(testimony_id, profile_id) | one per member per testimony |

### `prayers`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| author_id | uuid FK | trigger-forced |
| branch_id | uuid FK | trigger-forced |
| body | text | CHECK 1..1000 characters after trimming (as on `testimonies`, shorter: a request is an ask, not an essay) |
| language | text | as on `testimonies` |
| is_anonymous | bool | show as "A member"; `author_id` stripped server-side in every public read AND in realtime broadcasts (see Write-path invariants) |
| status | enum | `pending` \| `approved` \| `rejected` \| `removed` |
| rejection_reason | text null | |
| consent_version | text FK→consent_versions | as on `testimonies` |
| consented_at | timestamptz | |
| answered_at | timestamptz null | set when author marks answered |
| praying_count | int | denormalized: intercessors still committed (not yet fulfilled) |
| prayed_count | int | denormalized: intercessors who have marked "I prayed" |
| moderated_by | uuid null | leader/admin (as on `testimonies`; added W1.5, the born-pending and compare-and-set invariants apply to both tables) |
| moderated_at | timestamptz null | |
| deleted_at | timestamptz null | |

(The resulting testimony, if converted, is found via `testimonies.from_prayer_id`.)

### `prayer_intercessions`  (two-step commitment: "I will pray" then "I prayed")
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| prayer_id | uuid FK | |
| profile_id | uuid FK | |
| state | enum | `committed` ("I will pray" tap) then `prayed` ("I prayed" tap) |
| committed_at | timestamptz | set on the "I will pray" tap; starts prayer reminders |
| prayed_at | timestamptz null | set on the "I prayed" tap; stops reminders |
| next_reminder_at | timestamptz null | next gentle nudge; NULL once fulfilled / answered / deleted / capped / opted-out |
| reminder_count | int | default 0; hard cap so it never nags (see `15`) |
| - | unique(prayer_id, profile_id) | |

### `reports` (moderation queue input)
**Shape decided W1.5 (2026-07-20):** two real FKs, not the polymorphic `(target_type, target_id)` pair this doc originally specced. A bare `target_id` gets no foreign key, no cascade, and lets a report outlive the content it points at, which the account-deletion auto-resolve below would then have to chase as orphans. Cost of the change: a third reportable type needs a migration.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| testimony_id | uuid FK→testimonies null | `on delete cascade` |
| prayer_id | uuid FK→prayers null | `on delete cascade` |
| - | CHECK `num_nonnulls(testimony_id, prayer_id) = 1` | exactly one target |
| reporter_id | uuid FK | anonymized on reporter's account deletion (`20` retention: 24 months) |
| reason | text | |
| status | enum | `open` \| `actioned` \| `dismissed` |
| is_safeguarding | bool | default false; leader-set, never reporter-set. Flagged reports survive the auto-resolve sweep below |
| resolution_note | text null | the system note written when a report is auto-dismissed |
| - | partial unique (reporter_id, testimony_id) and (reporter_id, prayer_id) | re-reporting is a no-op ("You've already reported this") |

When target content leaves existence or public visibility via a NON-moderation path (author delete, the account-deletion job), that same job auto-resolves matching `open` reports to `dismissed` with a system note; reports flagged as safeguarding stay open and flagged (removal does not end a safeguarding duty, `17`/`20`).

**Counter triggers (spec):** AFTER INSERT / AFTER DELETE row triggers on the reaction tables do an atomic `update … set glory_count = glory_count + 1` (or −1). Inserts go through `on conflict do nothing` (a skipped conflicting insert fires no trigger, so counts stay correct under the tap-untap-tap toggle and offline replays). A nightly reconciliation job recounts and fixes drift (account-deletion cascades are the known drift source).

---

## Watch

### `sermons`
Cache/index of YouTube + self-hosted audio (a nightly sync job populates from the channel; manual rows for audio-only).
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| branch_id | uuid FK null | null ⇒ HQ/global |
| title | text | |
| speaker | text | |
| youtube_id | text null | **partial unique index** `where youtube_id is not null`; sync upserts `on conflict (youtube_id) do update` (idempotent retries) |
| audio_path | text null | object PATH in the private `sermon-audio` bucket, never a URL (playback URLs are signed and expire; the same shape lesson as `testimonies.image_path`). Trigger-checked to reference an existing object, and a referenced object is not deletable (clear the column first). Dashboard-owned; the sync never writes it. Renamed from `audio_url` in W3.1, before it ever held a value |
| artwork_path | text null | object PATH in the PUBLIC-READ `sermon-artwork` bucket (W3.1 slice 5): the message's OWN picture, uploaded in the dashboard. A path even though the URL never expires, because the URL is derivable from the path and a stored one would pin the project host into every row (`19`). **Never `thumbnail_url`**, which the nightly sync owns and overwrites (`20260720190000`); a column two writers both own is a column with no owner. Preferred over `thumbnail_url` wherever both exist, on all four surfaces that draw a message's picture (`features/watch/artwork.ts` owns that precedence for every one of them). Trigger-checked like `audio_path`, with the same removal order. Dashboard-owned |
| duration_sec | int null | |
| thumbnail_url | text | |
| series | text null | |
| published_at | timestamptz | |
| kind | enum | `video` \| `live_replay`: which channel tab the sync sourced it from (Videos = UULF playlist, Live = UULV; mirrors the website's watch page, decision 2026-07-20) |
| status | enum | `available` \| `unavailable` (sync marks vanished YouTube videos unavailable, never deletes rows: saves resume/notes/My List, see `08`) |

### `playback_positions` (resume)
| field | type | notes |
|-------|------|-------|
| profile_id | uuid FK | |
| sermon_id | uuid FK | |
| position_sec | int | |
| updated_at | timestamptz | |
| - | PK(profile_id, sermon_id) | |

### `sermon_notes`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | |
| sermon_id | uuid FK | |
| body | text | |

### `saved_items` (My List)
| field | type | notes |
|-------|------|-------|
| profile_id | uuid FK | |
| sermon_id | uuid FK | |
| created_at | timestamptz | orders My List (added while building W1.3, 2026-07-20) |
| - | PK(profile_id, sermon_id) | |

---

## Rhythm

### `attendance`  ("I'm here" + live watch)
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | |
| branch_id | uuid FK | the branch attended (may differ from home branch when visiting; see `07` branch-context model) |
| client_taken_at | timestamptz | device UTC instant captured at tap time; basis for `service_date` (see invariants: 72h clamp) so offline replays land on the attended day |
| service_date | date | derived by trigger from `client_taken_at` in the branch timezone; one row per member per date (same-day double services deliberately collapse) |
| source | enum | `here_button` only. `live_watch` is RETIRED (ADR 0021): it belonged to the cut LIVE screen's credit-on-open rule, nothing ever wrote it, and the enum value survives solely because Postgres cannot drop one || `live_watch` |
| - | unique(profile_id, service_date) | idempotent under offline replays |

### `streaks` (derived, cached)
| field | type | notes |
|-------|------|-------|
| profile_id | uuid PK/FK | |
| current_weeks | int | weeks in the member's current run. **Grace covers ONE missed week; two consecutive misses start a new run** (decided 2026-08-07, W2.8: this column said "consecutive ISO weeks" and `10` said a missed week pauses and resumes, which are different rules. `10`'s promise wins, because "Grace covers this week" is the copy the product actually makes). A streak week is **the ISO week of `attendance.service_date`, nothing else** (the timezone acted once, at write time, in the attended branch); `service_date` is immutable, so branch-timezone edits and home-branch changes never re-bucket history. **The stored value is the run as of the last attendance, and whether that run is still LIVE is decided at read time** by `rhythm_state()`, because a member who stops attending would otherwise keep showing five weeks until some job got round to them |
| longest_weeks | int | monotonic |
| last_service_date | date | |

**Recompute spec:** AFTER INSERT trigger on `attendance` runs an idempotent full recompute from `attendance` (never incremental-only), so late offline replays retro-correct. A weekly pg_cron pass re-runs it as a safety net (lock/lease so it can't double-run).

> Streaks are **grace-framed**: a missed week pauses, never scolds; copy is encouraging (see `10`).

### `milestones`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | |
| kind | text | `first_service`, `4_week_rhythm`, `first_testimony`, `plan_complete:<plan_id>`… |
| achieved_at | timestamptz | |
| - | unique(profile_id, kind) | insert `on conflict do nothing`: no double celebrations |

### Devotional plans (paid, entitlement-gated)
**Model decision (2026-07-12):** devotionals are written by the lead pastor and **sold** (Payhip), like books. A devotional is BOTH a book (readable in `READER`) and, once imported, a structured day-by-day plan. Purchase grants the entitlement; entitlement unlocks the plan experience (today's reading, mark complete, progress, milestones).

| table | key fields |
|-------|-----------|
| `reading_plans` | id, title, description, language (`en` v1), day_count, **book_id FK→books null** (null = free plan, e.g. a future starter plan; non-null = requires an entitlement to that book) |
| `devotional_days` | id, plan_id FK, day_number, verse_ref, verse_text, verse_translation (default `WEB`), reflection, prayer; readable only if the plan is free OR the reader holds the entitlement (RLS join) |
| `plan_enrollments` | profile_id, plan_id, started_on date; PK pair. Created on first PLAN open. "Today's day" = the lowest incomplete day_number (missed days shift, never skip); "active plan" = the enrollment with incomplete days and the most recent plan_progress write; Home's CTA routes there (`07`/`10`) |
| `plan_progress` | profile_id, plan_id, day_number, completed_at; PK(profile_id, plan_id, day_number) |

Structured days are imported once per devotional via the dashboard (`17` content module; pipeline in `22-CONTENT-OPERATIONS.md`).

### `daily_verses`
Free for everyone (unlike devotionals). Translation: **WEB (World English Bible), public domain** (decision 2026-07-12; attribution-free, safe to store and render on branded share images).
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| date | date | unique together with `language` (one verse per day per language); anchored to the user's device-local date |
| reference | text | e.g. "Ephesians 2:8" |
| text | text | |
| translation | text | default `WEB` |
| language | text | `en` v1; part of the unique key so DE/NL/FR verses can be added later with no schema change |

---

## Events

### `events`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| branch_id | uuid FK null | null ⇒ ministry-wide (fans out to all branches, see `15`); the single source of truth, no separate `is_global` flag to drift |
| title | text | |
| description | text | |
| starts_at_local | timestamp | wall-clock, per the backend standard (future user-facing events store local time + zone; pre-converted UTC breaks when timezone law changes) |
| timezone | text | IANA; defaults to the branch's timezone |
| ends_at_local | timestamp null | |
| location | text | |
| image_url | text null | |
| status | enum | `scheduled` \| `cancelled`: published events with RSVPs are cancelled, never hard-deleted; cancellation and time/venue changes auto-notify non-cancelled RSVPs (`11`/`17`, built W3.5 slice 4 as the `event-notices` job) |
| rsvp_enabled | bool | |
| source | text | `manual` v1 (`sanity` reserved for a post-v1 sync, see `11`) |
| announced_status / announced_starts_at_local / announced_location | enum / timestamp / text, all null | **The plan as last announced** (W3.5 slice 4). Server-written only: the update guard restores them whenever `auth.uid()` is set, because a leader who could edit them could silence the cancellation of their own event. All three NULL means nobody has been told this event exists, which is what makes the posting notice due. "What they were told is not what is true" IS the `event-notices` job's work list, and it is why cancelling and reinstating inside the settle window announces nothing: the plan came back to itself |
| status_changed_by / status_changed_at | uuid FK null (ON DELETE SET NULL) / timestamptz null | **Who cancelled this event, or put it back on, and when** (W3.5 slice 4 follow-up). Server-written by the update guard from `auth.uid()` and restored for any caller who tries to set them, because a leader who could write somebody else's name could put it on an act that was not theirs. NULL means a trusted caller with no user context, or an account since deleted. Deliberately NOT in `privileged_actions`: that ledger is profile-oriented (`actor_id` and `target_id` both reference `profiles`) and this action's subject is an event, so it would be a row with a null target whose meaning lived in a JSON blob. Only a STATUS change stamps them; an ordinary edit does not |
| notice_revision | integer, default 1 | Bumped by the update guard on a plan change (status, start, zone, location) and used for NOTHING except keeping a dedupe key unique: 18:00 -> 19:00 -> 18:00 -> 19:00 would otherwise reuse a key and the fourth notice would be swallowed. It never decides whether to send |

### `rsvps`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| event_id | uuid FK | |
| profile_id | uuid FK | |
| status | enum | `going` \| `interested` \| `cancelled` |
| - | unique(event_id, profile_id) | a trigger refuses INSERT/UPDATE to `going`/`interested` when the event is `cancelled` or has started (setting one's own rsvp to `cancelled` stays allowed); a late offline replay is rejected and the client reconciles quietly (`01` §8) |

---

## Academy

### `courses` / `course_registrations` / `course_interest` *(shape landed W2.9 slice 2, ADR 0017)*
| table | key fields |
|-------|-----------|
| `courses` | id, slug (the website's content slug: the join key to `course_registrations.course`), name, level, level_name, step, summary jsonb, pathway_summary jsonb null (the ACADEMY card's own blurb), outline jsonb, gains jsonb, formats jsonb null (localized durations), prereq_slug null FK→slug, **fee_minor int null, fee_currency char(3) null** (money in minor units + explicit ISO currency, never symbol-in-jsonb), fee_note jsonb null, upcoming bool, "order" int. Prose columns are localized `{en,de,nl,fr}` jsonb because the website's content files already carry all four translations; plain-string columns match the website's "deliberately plain" list (names, ordinals, outline titles, scripture refs) |
| `course_fees_regional` | PK (course_id FK, country_code char(2)), fee_minor int, currency char(3); the NG override from the seed JSON |
| `course_registrations` | **ONE table shared with the LIVE website** (ADR 0017; the app's earlier planned shape is superseded). The website's columns, never dropped/renamed/retyped without a coordinated change in `Desktop/agbc`: id uuid, created_at, course text (slug), format text, full_name, email, city, country, branch text null (display name, NEVER used for scoping), amount int (Stripe minor units), currency text (lowercase ISO), payment_status text, stripe_session_id text unique. The app's additions, all nullable/defaulted: profile_id FK null (ON DELETE SET NULL: payment records survive account deletion per `20`), status enum(`pending`\|`confirmed`\|`cancelled`), notes null, source enum(`app`\|`website`\|`import`) default website, course_id FK null (resolved from the slug by trigger at birth), branch_id FK null, and the link trio linked_by/linked_at/link_method enum(`handoff`\|`email_auto`\|`self`\|`leader`). **Partial unique (course_id, profile_id) where status <> 'cancelled'**; cancelled is terminal for every writer; the app holds NO INSERT (registration + payment happen on the website) and members may write only `status`, only to `cancelled`. `profile_id` + the link trio are server-written (ADR 0015: a column a policy reads must not be writable by its subject); every change of owner is audit-logged by trigger |
| `course_interest` | course_id FK, profile_id FK, created_at; unique pair; backs "Notify me" on upcoming courses (`13`) so admins can actually notify when a level opens. The one member write in the domain |
| `profile_emails` | profile_id FK, email (one owner per normalized address), verified_at; the addresses a member has PROVEN. The email match on `course_registrations` reads this SET plus `auth.users.email`, always as `lower(trim(...))`, through a security-definer function and never a JWT claim. **Empty as of 2026-08-11:** the self-service claim flow that filled it (`email-claim` + request/verify RPCs) was cut with ADR 0017's amendment and its objects dropped; the table and every reader stay, and the leader-linking tool on the dashboard is its next writer |
| `course_handoff_tokens` | profile_id FK, course_id FK, token_hash unique, expires_at (30 min), used_at; the Register handoff (ADR 0017 decision 7): minted by the `course-handoff` edge function, peeked (prefill) and consumed (Checkout creation) by the website via `redeem_course_handoff`. Opaque, hashed at rest, single use, bound to one course |

Seed courses from `agbc/src/content/courses/*.json` + `academy/*.json` via `scripts/convert-course-seeds.mjs` (the JSON stores "£"-symbol major units and region overrides in majors; the script converts to minor units + ISO currency and commits the result as `supabase/seeds/05-courses.sql`, so CI never needs the sibling checkout). Any future in-app charge recomputes totals server-side.

---

## Giving

### `donations` *(landed 2026-08-17, ADR 0023; the app never reads it)*

Written ONLY by the live church website's Stripe webhook (`Desktop/agbc`), which INSERTs with the service-role key and reads nothing back. It is in our schema because production became a project of our own and the website moved onto it, and `donations` was the one table the website had that our history never created. In-app giving still links out (ADR 0004), so no app or dashboard surface reads this table yet.

| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| created_at | timestamptz | |
| donor_name | text null | |
| email | text | the donor's, from the Checkout session |
| amount | int | **Stripe minor units**, as with `fee_minor` / `price_minor` elsewhere |
| currency | text | lowercase ISO ('gbp') |
| frequency | text | `one_time` or `monthly` today; NOT a CHECK, see below |
| branch | text null | branch DISPLAY NAME from the website's content collection. **Not an FK** to `branches`: the two repos keep separate lists |
| stripe_session_id / stripe_invoice_id / stripe_payment_intent_id | text unique null | the idempotency trio. One-time gifts dedupe on the session, recurring charges on the invoice; the website reads `23505` off them and treats it as "already recorded". `stripe_payment_intent_id` is inert (nothing writes it) |
| stripe_subscription_id | text null | **deliberately not unique**: one subscription emits one invoice a month |
| payment_status | text, default `pending` | the website always writes `paid`; the default exists so a status-less row never reads as money received |
| gift_aid_eligible / donor_address | bool null / text null | Gift Aid claim data. **Empty by design**: the current giving form does not collect it |
| user_id | uuid null FK→`auth.users` **ON DELETE SET NULL** | written by nothing today. The null-on-delete is the fix for the old project's un-deletable auth users |
| giving_type / reference / source | text null | designation ('General'), donor free text, and 'web' |

**RLS: FORCE, with ZERO policies, and nothing granted to `anon` or `authenticated`.** The only writer holds BYPASSRLS and no client surface reads donor records, so there is no grant to widen: this is where issue #96's blanket privileges over donor PII die by construction rather than by remediation.

**No value CHECK constraints on the website's columns, deliberately, and the same goes for `course_registrations`.** The writer is a different repository on its own release schedule, and the failure is one-sided: a refused INSERT is not a validation message anyone sees, it is a donor who has been charged with no record of the gift, because the webhook throws on anything but `23505` and Stripe retries into the same wall. Nullability, the PK, the FK and the three unique keys are the constraints; `amount >= 0` is the one arithmetic guard, and only because Stripe cannot produce anything it would refuse. The full argument is in `20260817120000`'s header, and the shape of BOTH shared tables is asserted in `supabase/tests/039`.

---

## Store / Library

### `books` / `entitlements` / purchase pipeline
| table | key fields |
|-------|-----------|
| `books` | id, title, author, **price_minor int, price_currency char(3)**, cover_url, file_url (Storage, private), format enum(`pdf`\|`epub`), payhip_url, payhip_product_id, description |
| `entitlements` | id, profile_id FK, book_id FK, source enum(`payhip`\|`gift`), **source_ref text unique null** (Payhip transaction/order id: replays no-op), granted_at; unique(profile_id, book_id) |
| `reading_state` | profile_id, book_id, location text (CFI/page), updated_at; PK(profile_id, book_id) |
| `broadcast_deliveries.processed_at` | timestamptz null, added 2026-08-20 | when the receipts sweep learned what became of this push. NULL means Expo accepted the ticket and nobody has asked yet, the same meaning `push_tickets.processed_at` carries, which is what lets one query serve both ledgers (`21` §5) |
| `payhip_events` | id, event_id text unique, payload jsonb, received_at, processed_at null; raw webhook inbox; processing is async and idempotent |
| `unmatched_purchases` | id, buyer_email text (normalized lowercase), book_id FK, source_ref text, payload jsonb, created_at; drained automatically when a profile with that email later exists (the identity email is verified by sign-in, `03`); visible in the dashboard "unmatched purchases" queue (`17`) |

**Entitlement trust model (see `14`):** the Payhip webhook is a TRIGGER only (its "signature" is a static hash, forgeable). Grants happen only after server-side confirmation against Payhip's API, keyed by transaction id. Restore-purchase claims grant only against the profile's identity email (verified by sign-in, `03`) or a Payhip order id, with uniform responses and rate limits. Refund events revoke the entitlement.

---

## Notifications

### `notifications` (in-app center)
Localization model: automated notifications store a **template key + params**, rendered per recipient `profiles.language` at send time and at display time (never baked English strings: the lock screen is the most visible localized surface). **Not partitioned** (ADR [0022](../decisions/0022-notifications-is-not-partitioned.md)); the 12-month retention purge (`20`) is a batched DELETE via `purge_old_notifications()`.

> **RESOLVED 2026-08-16 by ADR [0022](../decisions/0022-notifications-is-not-partitioned.md) (W3.3 slice 2).** This table was specified as monthly-partitioned, and W2.7 slice 5 found (2026-08-06) that partitioning and the two uniqueness rules below cannot both hold: Postgres requires every unique constraint on a partitioned table to include the partition key, and neither `unique(profile_id, broadcast_id)` nor the partial unique on `(profile_id, dedupe_key)` does. Enforced per partition, both would lapse at a month boundary, so a fan-out retried across midnight on the 1st would notify every recipient twice. **The partitioning went, not the constraints.** Both exist globally in `20260816120000` and are asserted across a month boundary in pgTAP `037`. The deciding argument was asymmetry rather than cost: a retention job that fails leaves stale rows, while a partition-maintenance job that fails stops INSERTs on a date known in advance, which for this table means reminders silently stop. Revisit only if the table passes a few million rows (~290k is the realistic standing size). W2.7's staff alerts keep their own `job_alerts` ledger; nothing about that changes.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | recipient |
| type | text | pref-gated: `prayer`, `testimony_glory`, `event`, `ministry`, `branch`, `service_reminder`; transactional (always-on channel, `15`): `moderation`, `rsvp_reminder`, `registration`, `purchase`, `event_change`. **`event` is a NEW event posted and `event_change` is a change to one somebody RSVP'd to** (W3.5 slice 4): the first is news and gates on `branch_updates` (or `ministry_announcements`, when the event is ministry-wide and the type is `ministry`), the second answers an action the member took and gates on nothing, because a member who turned branch news off would otherwise turn up at a locked door |
| template_key | text null | automated notifications (e.g. `prayer.someone_prayed`) |
| params | jsonb null | template parameters (never special-category content; push payloads stay generic, body fetched in-app: `15`/`20`) |
| title / body | text null | manual broadcasts only (pre-rendered per recipient language at fan-out) |
| broadcast_id | uuid FK null | unique(profile_id, broadcast_id): fan-out re-runs never double-write |
| dedupe_key | text null | partial unique `(profile_id, dedupe_key) where dedupe_key is not null`; automated jobs write deterministic keys so re-runs never double-send (`21` §5). **Rule: keys for time-bound sends embed the occurrence they announce, INCLUDING its local start time** (`service_reminder:<branch_id>:<YYYY-MM-DD>T<HH24:MI>`, `rsvp_reminder:<event_id>:<starts_at_local>`), so a rescheduled event mints a new key and its reminder is NOT swallowed by the old one. **The event notices (W3.5 slice 4) carry the occurrence AND a revision** (`event_moved:<event_id>:<YYYY-MM-DD>T<HH24:MI>:r<n>`), because the occurrence alone cannot separate two announcements of the same start: an event moved to 19:00, back to 18:00 and to 19:00 again reuses its key on the third move, and the members who were told 18:00 would never hear otherwise. **The service key carried only the date until 2026-08-19** (W3.4 slice 1), which could not keep that promise: two services on one date at one branch shared a key, so the evening one was never announced, and a service moved from 11:00 to 18:00 on the same date was swallowed by its own earlier reminder, which is the exact case the rule is about |
| deep_link | text | expo-router path (see `15`) |
| read_at | timestamptz null | |

### `broadcasts` (leader/admin → many)
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| author_id | uuid FK | leader/admin |
| scope | enum | `branch` \| `ministry` (ministry scope requires four-eyes approval, `17`) |
| branch_id | uuid null | when scope=branch |
| title | text | |
| body | text | primary language as written |
| body_de / body_nl / body_fr | text null | optional per-locale bodies; fall back to `body` |
| link | text null | allowlisted + previewed before send (`17`) |
| channels | text[] | `push`, `in_app` (both, always). Kept as an array rather than collapsed away so a second channel can return without a schema redesign (ADR 0014) |
| status | enum | `draft` \| `pending_approval` \| `rejected` \| `sending` \| `sent` \| `halted` \| `failed` |
| review_note | text null | shown to the author on rejection (`status='rejected'`); the author's next edit moves it back to `draft` for resubmission |
| recipient_count | int null | computed at confirmation |
| approved_by | uuid null | the approving admin, **on every broadcast rather than ministry ones only** (2026-08-19, see the state machine below); DB CHECK `approved_by IS DISTINCT FROM author_id` (self-approval impossible) plus a second CHECK tying its presence to the status, backed by `approve_broadcast()` reading the role from the live table |
| sent_at | timestamptz null | |

**Broadcast state machine (REWRITTEN 2026-08-19, W3.5 slice 1):** **both scopes** run `draft` → `pending_approval` → `sending` (fired BY the approver's approval action, sending immediately) or → `rejected`. **Every broadcast is approved by an admin who is not its author**, decided with Ayo in place of `17` §2's per-account daily send caps: a cap bounds how OFTEN one account reaches everyone and says nothing about WHAT it says, while an approval gate bounds the content, which is the half that cannot be taken back off a lock screen. This replaces the original branch-scope path (`draft` → `sending`, no approval state). The approver being an admin is enforced in `approve_broadcast()` via `caller_is_admin_live()` (a CHECK cannot query `profiles`); the not-the-author half IS a CHECK, so self-approval is impossible rather than merely refused. **Known cost, accepted:** with two admin accounts, either being unreachable stops all broadcasting, and a single-admin period stops it entirely; no break-glass was added, on the grounds that a rule with an exception is a rule people misremember. Any author edit while `pending_approval` returns the row to `draft` and clears `approved_by` (server trigger: what the approver reviewed is what sends). Content columns are immutable from `sending` onward. `halted` is terminal for delivery; the dashboard offers "Duplicate as draft" (full approval path again). `failed` is set when fan-out exhausts 3 retries; "Retry delivery" returns it to `sending` and re-runs fan-out for pending/failed deliveries only (deduped by the unique key).

### `broadcast_deliveries`
Per-recipient delivery tracking: powers resumable chunked fan-out, Expo receipt processing, token pruning, and the failure-rate alert. Purged 30 days after send (aggregates stay on `broadcasts`).
| field | type | notes |
|-------|------|-------|
| broadcast_id | uuid FK | |
| profile_id | uuid FK | one delivery row per (broadcast, recipient, channel) |
| device_id | uuid FK null | set for push rows only; unique(broadcast_id, profile_id, channel, device_id) |
| channel | enum | `push` \| `in_app` (enum kept extensible, ADR 0014) |
| status | enum | `pending` \| `sent` \| `failed` |
| ticket_id | text null | Expo push ticket; receipts fetched ~15 min later (`15`) |
| error | text null | |

### `push_tickets`
Delivery truth for AUTOMATED pushes (service reminders, activity, transactional), which are otherwise fire-and-forget: every push send persists its ticket ids here; the receipts job sweeps ALL unprocessed tickets, not per-fan-out (`21` §5). Purged after 7 days.
| field | type | notes |
|-------|------|-------|
| ticket_id | text PK | Expo's own id, so re-recording one is a no-op |
| device_id | uuid FK | |
| sent_at | timestamptz | |
| processed_at | timestamptz null | NULL is the receipts sweep's work queue |
| error | text null | **Added 2026-08-16 (W3.3 slice 3, `20260816140000`).** Expo's machine code from the RECEIPT (`DeviceNotRegistered`, `MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials`), null when the push landed. This column was missing and `21` §5's alert ("more than 10% of a day's automated tickets error") cannot be computed without it: a rate over a DAY outlives any single run's memory. Mirrors `broadcast_deliveries.error`, which `02` already specified for the fan-out side of the same question. Only `DeviceNotRegistered` prunes a device; the credentials errors mean OUR key is wrong and pruning on them would delete every registration during an outage we caused |

---

## Relationship notes / integrity

- A **testimony born from a prayer** links via `testimonies.from_prayer_id` (unique, `on delete set null`); the prayer's "Answered" state is `answered_at`; the reverse lookup is a join. One FK, one source of truth.
- Denormalized counters (`glory_count`, and the prayer `praying_count`/`prayed_count`) are maintained by the DB triggers specced above; the reaction tables remain the source of truth; nightly reconciliation fixes drift.
- **"My branch" scoping** uses `testimonies.branch_id` / `prayers.branch_id`. **"Everywhere"** removes the branch filter (approved rows only).
- All user-generated content (`testimonies`, `prayers`) is **`pending` until a leader approves**: public reads filter `status='approved'`; authors can always see their own pending rows; the Write-path invariants make this unforgeable.
- **Account deletion** (see `16` for the full deletion-reach table): profile soft-deleted AND `email` nulled (the unique constraint would otherwise block that address from registering again); pending content hard-cancelled (never approvable post-consent-withdrawal); reactions removed with counter reconciliation; Storage objects deleted in the same job.
