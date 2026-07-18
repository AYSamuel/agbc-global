# 02 · Data Model

Backend-agnostic relational schema (Postgres). Types are indicative. `id` is UUID unless noted. All tables have `created_at timestamptz default now()` and (where edited) `updated_at`. Soft-delete via `deleted_at timestamptz null` where noted.

> **RLS summary** (Supabase path): guests = anonymous read of public content; members = write their own rows; leaders = moderate/broadcast within their branch; admins = global. Enforced by policies referencing role/branch claims (see Write-path invariants below). Never trust the client.

> **Schema conventions:** every FK column gets an explicit index (Postgres does not index FK columns automatically). Public reads of anonymous prayers must strip `author_id` server-side. UUIDs: prefer UUIDv7 generated in the app/edge layer for index locality; if the project stays on `gen_random_uuid()` (v4), record the deviation in the project CLAUDE.md and rely on the composite feed indexes below for ordering. Product-facing, translatable categories use lookup tables, never enums or freeform text.

---

## Write-path invariants (RLS): the rules that make "never trust the client" true

The app writes with the anon key + the user's JWT, which can set ANY column unless constrained. These invariants are enforced by column defaults, `BEFORE INSERT/UPDATE` triggers, and RLS `WITH CHECK`; the UI is never the mechanism. Each has a CI authorization test that attempts the bypass and asserts failure (see `21-OPERATIONS.md`).

| Invariant | Enforcement |
|-----------|-------------|
| Content is born `pending` | `status default 'pending'`; BEFORE INSERT trigger forces `status='pending'`, `moderated_by/at=NULL` for non-moderators regardless of client-supplied values; member INSERT policy `WITH CHECK (status='pending')` |
| Authorship cannot be forged | trigger forces `author_id = auth.uid()` and `branch_id` = the author's profile branch on insert |
| Approved content cannot be edited into abuse | BEFORE UPDATE trigger: any author change to `body`, `image_url`, or `category_id` on an `approved` row resets `status='pending'` and clears `moderated_by/at`; only leader (own branch) / admin policies may set `approved`/`rejected`/`removed` |
| Roles are immutable to their owner | members update only an allowlisted column set (display_name, avatar_url, branch_id, language, theme_pref, phone); `email` is NOT in the allowlist: it mirrors the auth identity and changes only via the Supabase auth email-change flow (`03`); BEFORE UPDATE trigger raises if `NEW.role <> OLD.role` and the actor is not an admin |
| Counters are server-maintained | `glory_count` and the prayer counts (`praying_count`/`prayed_count`) written only by triggers (below), never by any client policy; the "I prayed" tap moves an intercession `committed`→`prayed`, decrementing `praying_count` and incrementing `prayed_count` |
| Prayer commitment cannot be forged or self-scheduled | `prayer_intercessions.profile_id` is trigger-forced = `auth.uid()`; a BEFORE UPDATE trigger allows only the one-way `committed`→`prayed` transition (sets `prayed_at`, never reverts); `committed_at`, `next_reminder_at`, and `reminder_count` are server/trigger-controlled, so a client cannot backdate, self-schedule, or silence reminders (its own or anyone else's) by writing these columns |
| The prayer-testimony link cannot be stolen | BEFORE INSERT/UPDATE trigger raises unless `from_prayer_id IS NULL` or the referenced prayer's `author_id = auth.uid()` (admins exempt); the UNIQUE constraint already prevents double-claiming. Without this, anyone could fabricate an "Answered prayer" ribbon on a stranger's prayer and permanently squat the link |
| Attendance is honest about WHEN, bounded against backdating | every attendance insert carries `client_taken_at` (device UTC instant captured at tap time). The BEFORE INSERT trigger sets `service_date = (client_taken_at at time zone branches.timezone)::date` when `client_taken_at` is within the past 72 hours and not in the future; otherwise it falls back to `now()`. Offline replays land on the day actually attended (a Saturday tap replayed Monday still records Saturday); fabrication beyond 72 hours stays impossible; `profile_id` remains trigger-forced |
| Paid state is never client-writable | `entitlements`, `streaks`, `milestones` have NO client write policies at all; writes happen only via service role (edge functions / dashboard) or DB triggers. A member INSERT into `entitlements` would be self-granted paid books |
| Moderation is compare-and-set | approve/reject/remove carries the `updated_at` of the version the leader reviewed; the moderation UPDATE (trigger-enforced) fails with "content changed since review" when `updated_at` differs, and the item returns to the queue. Closes the race where an author edit lands between review and approval, publishing unreviewed content |
| Deleted accounts cannot write | every member INSERT/UPDATE policy additionally requires the profile row to have `deleted_at IS NULL`. Closes the second-device replay hole: queued writes from a device that missed the deletion are rejected, never recreating erased Art. 9 data |
| Mark-answered has preconditions | a trigger refuses setting `answered_at` unless the prayer is `approved` and not deleted; "Mark as not answered" clears it only while no linked testimony exists. The `from_prayer_id` trigger additionally raises when the referenced prayer is `removed` |
| `removed` is terminal for authors | a trigger refuses author UPDATE on `removed` rows (DELETE stays allowed); only an admin may restore removed content, audit-logged |
| `is_anonymous` flips without re-moderation but never silently | author changes to `is_anonymous` on an approved prayer are allowed (it is their own identity), fire the same sanitized realtime broadcast so live clients re-render, and anonymous-to-named requires a confirm sheet. All OTHER author-editable content columns (`body`, `language`) reset an approved row to pending |

**Role/branch in policies:** put `role` and `branch_id` into JWT claims via the Supabase Custom Access Token auth hook (server-set, so client role claims stay untrusted). Caveat: a demoted leader keeps stale claims until token refresh, so moderation-plane actions re-check `profiles.role` from the table. Wrap `auth.uid()` as `(select auth.uid())` in policies (per-row re-evaluation footgun), `FORCE ROW LEVEL SECURITY` on every table, per-role statement timeouts.

**Policy matrix (summary):**

| Table | anon | member | leader (own branch) | admin |
|-------|------|--------|---------------------|-------|
| testimonies / prayers | SELECT approved + not deleted | + SELECT/UPDATE/DELETE own (any status); INSERT (forced pending) | + SELECT any status in branch; UPDATE status | all |
| glory_reactions | none | INSERT/DELETE own; SELECT | same | all |
| prayer_intercessions | none | INSERT/DELETE own + UPDATE own (state `committed`→`prayed` only); SELECT | same | all |
| profiles | none | own row (allowlisted columns) | read limited columns in-branch | all incl. role |
| notifications / devices / notification_prefs | none | own rows only | own rows only | all |
| reading_state / plan_progress / saved_items / playback_positions / sermon_notes | none | SELECT / INSERT / UPDATE / DELETE own rows | own rows | all |
| attendance | none | SELECT own; INSERT own (trigger-forced values, see invariants) | own | all |
| entitlements / streaks / milestones | none | SELECT own rows ONLY (no client writes, see invariants) | SELECT own | all (via service role) |
| testimony_categories / course_fees_regional / giving_config / app_config | SELECT | SELECT | SELECT | + write |
| payhip_events / unmatched_purchases / broadcasts / broadcast_deliveries | none | none | none (leaders act via dashboard service-role routes) | service-role only: RLS forced with ZERO client policies (`unmatched_purchases` holds buyer emails) |
| rsvps / course_registrations / course_interest | none | own rows | read in-branch | all |
| branches / branch_services / sermons / events / courses / books / daily_verses / reading_plans | SELECT | SELECT | + manage own branch rows (dashboard) | all |
| devotional_days | free plans: SELECT | + entitled plans (entitlement join) | same | all |
| reports | none | INSERT; SELECT own | SELECT/UPDATE in-branch | all |
| blocked_users | none | own rows (blocker_id) | none | all |

**Feed indexes:** `(branch_id, status, created_at desc)` on `testimonies` and `prayers` (lead with the scoping column or RLS gets slow).

**Realtime:** do NOT expose `postgres_changes` on content tables (it streams raw base-table rows: views don't apply, DELETE events skip RLS, and anonymous `author_id` would leak). Instead: AFTER INSERT/UPDATE triggers call `realtime.broadcast_changes()` on private channels (`family:branch:<id>`, `family:all`) with a sanitized payload (author fields nulled when `is_anonymous`; only `approved` transitions broadcast). **Removal signal:** any transition OUT of public visibility (status leaves `approved`, `deleted_at` set, or AFTER DELETE using OLD) broadcasts a minimal `{table, id, action:'removed'}` so live clients drop the card immediately; withdrawn Art. 9 content must not linger on screens until refetch. RLS policy on `realtime.messages`; Realtime Authorization on; public channel access off. Counts (Glory / pray / watching-now) also travel via Broadcast. **"Watching now" is server-aggregated:** clients never subscribe to raw Presence (O(N²) at a Sunday peak breaks the message quota, `21` §10); an edge/DB aggregator tracks presence and broadcasts a single count every 10-15s. **Degradation bound:** clients that lose the family channel refetch the feed on a 60s timer and on focus; the removal guarantee is realtime-first, polling-bounded (worst case 60s).

## Storage buckets

| Bucket | Access | Rules |
|--------|--------|-------|
| `testimony-photos` | private | signed URLs minted by an edge function ONLY for `approved` rows; pending photos are unreachable pre-review |
| `book-files` | private | signed URL per request after an `entitlements` check, short TTL (minutes); see `14` |
| `avatars` | public-read | low sensitivity; still re-encoded on upload |
| `sermon-audio` | public-read or modest-TTL signed | choose per bandwidth posture; see `08` |

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
| status | enum | `active` \| `archived` (default active). Branches are ARCHIVED, never hard-deleted (attendance, content, audit rows reference them). Archived: hidden from onboarding/BRANCH-SWITCH/BRANCHES/map; `branch_services` deactivated (reminders + live windows stop); content stays readable under Everywhere; members whose home branch is archived are prompted on next launch to pick a new one (HQ preselected) and get no branch-tier notifications meanwhile; residual pending moderation escalates to admins immediately; the dashboard blocks archiving until its leaders are reassigned (`17` §5) |
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
| phone | text unique null | optional, E.164; collected ONLY at WhatsApp broadcast opt-in (`15`), never at sign-in; nulled on deletion |
| display_name | text | |
| avatar_url | text null | |
| branch_id | uuid FK→branches | user's **home branch** (drives attendance timezone, reminders, branch notifications; see `07` branch-context model) |
| language | text | `en` \| `de` \| `nl` \| `fr` |
| role | enum | `member` \| `leader` \| `admin` (default `member`; immutable to owner, see invariants) |
| theme_pref | enum | `system` \| `light` \| `dark` |
| onboarded_at | timestamptz | set ONLY when `AUTH-3` completes; a session whose profile has `onboarded_at IS NULL` is routed to `AUTH-3` before anything else (abandoned half-created profiles resume there); content/reaction/RSVP/attendance INSERT policies additionally require `onboarded_at IS NOT NULL` |
| age_confirmed_at | timestamptz | the 16+ self-declaration evidence (`20`), written in the same `AUTH-3` update |
| deleted_at | timestamptz null | account deletion; `phone`/`email` nulled at the same time (see `16`) |

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
| whatsapp_opt_in | bool | default false |

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

### `testimonies`
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| author_id | uuid FK→profiles | trigger-forced = auth.uid() |
| branch_id | uuid FK→branches | trigger-forced = author's branch at post time (scopes "My branch") |
| body | text | |
| language | text | declared at compose or detected server-side (`en`/`de`/`nl`/`fr`/`yo`…); drives the Everywhere-feed label (`09`) and moderation language escalation (`17`/`22`) |
| category_id | uuid FK→testimony_categories null | |
| image_url | text null | private bucket; signed URLs only for approved rows (see Storage buckets above) |
| from_prayer_id | uuid FK→prayers null **unique** | set when born from an answered prayer; `on delete set null`. Single source of truth for the loop; the reverse link is derived by join (no second FK to drift) |
| status | enum | `pending` \| `approved` \| `rejected` \| `removed` (trigger-forced pending on insert and on author edit) |
| rejection_reason | text null | shown to the author in MY-POSTS with "Edit and resubmit" (`09`) |
| consent_version | text | version of the consent wording shown (Art. 9 evidence, see `20`) |
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
| body | text | |
| language | text | as on `testimonies` |
| is_anonymous | bool | show as "A member"; `author_id` stripped server-side in every public read AND in realtime broadcasts (see Write-path invariants) |
| status | enum | `pending` \| `approved` \| `rejected` \| `removed` |
| rejection_reason | text null | |
| consent_version | text | |
| consented_at | timestamptz | |
| answered_at | timestamptz null | set when author marks answered |
| praying_count | int | denormalized: intercessors still committed (not yet fulfilled) |
| prayed_count | int | denormalized: intercessors who have marked "I prayed" |
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
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| target_type | enum | `testimony` \| `prayer` |
| target_id | uuid | |
| reporter_id | uuid FK | anonymized on reporter's account deletion (`20` retention: 24 months) |
| reason | text | |
| status | enum | `open` \| `actioned` \| `dismissed` |
| - | unique(reporter_id, target_type, target_id) | re-reporting is a no-op ("You've already reported this") |

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
| audio_url | text null | self-hosted file (Storage) |
| duration_sec | int null | |
| thumbnail_url | text | |
| series | text null | |
| published_at | timestamptz | |
| is_live | bool | current live flag |
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
| source | enum | `here_button` \| `live_watch` |
| - | unique(profile_id, service_date) | idempotent under offline replays |

### `streaks` (derived, cached)
| field | type | notes |
|-------|------|-------|
| profile_id | uuid PK/FK | |
| current_weeks | int | consecutive ISO weeks with attendance. A streak week is **the ISO week of `attendance.service_date`, nothing else** (the timezone acted once, at write time, in the attended branch); `service_date` is immutable, so branch-timezone edits and home-branch changes never re-bucket history |
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
| status | enum | `scheduled` \| `cancelled`: published events with RSVPs are cancelled, never hard-deleted; cancellation and time/venue changes auto-notify non-cancelled RSVPs (`11`/`17`) |
| rsvp_enabled | bool | |
| source | text | `manual` v1 (`sanity` reserved for a post-v1 sync, see `11`) |

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

### `courses` / `course_registrations` / `course_interest`
| table | key fields |
|-------|-----------|
| `courses` | id, slug, name, level, level_name, step, summary, outline jsonb[], gains jsonb[], prereq_slug null, **fee_minor int null, fee_currency char(3) null** (money in minor units + explicit currency, never symbol-in-jsonb), fee_note text null, upcoming bool |
| `course_fees_regional` | course_id FK, country_code char(2), fee_minor int, currency char(3); the NG override from the seed JSON |
| `course_registrations` | id, course_id FK, profile_id FK, format enum(`in_person`\|`online`), branch_id null, status enum(`pending`\|`confirmed`\|`cancelled`), notes text null, created_at; **partial unique (course_id, profile_id) where status <> 'cancelled'**; name/contact prefill from `profiles`, not stored again |
| `course_interest` | course_id FK, profile_id FK, created_at; unique pair; backs "Notify me" on upcoming courses (`13`) so admins can actually notify when a level opens |

Seed courses from `agbc/src/content/courses/*.json` + `academy/*.json` via a conversion script (the JSON stores "£"-symbol major units and region overrides; convert to minor units + ISO currency at seed time). Any future in-app charge recomputes totals server-side.

---

## Store / Library

### `books` / `entitlements` / purchase pipeline
| table | key fields |
|-------|-----------|
| `books` | id, title, author, **price_minor int, price_currency char(3)**, cover_url, file_url (Storage, private), format enum(`pdf`\|`epub`), payhip_url, payhip_product_id, description |
| `entitlements` | id, profile_id FK, book_id FK, source enum(`payhip`\|`gift`), **source_ref text unique null** (Payhip transaction/order id: replays no-op), granted_at; unique(profile_id, book_id) |
| `reading_state` | profile_id, book_id, location text (CFI/page), updated_at; PK(profile_id, book_id) |
| `payhip_events` | id, event_id text unique, payload jsonb, received_at, processed_at null; raw webhook inbox; processing is async and idempotent |
| `unmatched_purchases` | id, buyer_email text (normalized lowercase), book_id FK, source_ref text, payload jsonb, created_at; drained automatically when a profile with that email later exists (the identity email is verified by sign-in, `03`); visible in the dashboard "unmatched purchases" queue (`17`) |

**Entitlement trust model (see `14`):** the Payhip webhook is a TRIGGER only (its "signature" is a static hash, forgeable). Grants happen only after server-side confirmation against Payhip's API, keyed by transaction id. Restore-purchase claims grant only against the profile's identity email (verified by sign-in, `03`) or a Payhip order id, with uniform responses and rate limits. Refund events revoke the entitlement.

---

## Notifications

### `notifications` (in-app center)
Localization model: automated notifications store a **template key + params**, rendered per recipient `profiles.language` at send time and at display time (never baked English strings: the lock screen is the most visible localized surface). Partitioned by month so the 12-month retention purge (`20`) is a partition drop, not a giant DELETE.
| field | type | notes |
|-------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | recipient |
| type | text | pref-gated: `prayer`, `testimony_glory`, `event`, `ministry`, `branch`, `service_reminder`; transactional (always-on channel, `15`): `moderation`, `rsvp_reminder`, `registration`, `purchase` |
| template_key | text null | automated notifications (e.g. `prayer.someone_prayed`) |
| params | jsonb null | template parameters (never special-category content; push payloads stay generic, body fetched in-app: `15`/`20`) |
| title / body | text null | manual broadcasts only (pre-rendered per recipient language at fan-out) |
| broadcast_id | uuid FK null | unique(profile_id, broadcast_id): fan-out re-runs never double-write |
| dedupe_key | text null | partial unique `(profile_id, dedupe_key) where dedupe_key is not null`; automated jobs write deterministic keys so re-runs never double-send (`21` §5). **Rule: keys for time-bound sends embed the occurrence they announce** (`service_reminder:<branch_id>:<service_date>`, `rsvp_reminder:<event_id>:<starts_at_local>`), so a rescheduled event mints a new key and its reminder is NOT swallowed by the old one |
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
| channels | text[] | `push`, `whatsapp`, `in_app` (WhatsApp rationed: max 2 ministry-wide/month, `15`) |
| status | enum | `draft` \| `pending_approval` \| `rejected` \| `sending` \| `sent` \| `halted` \| `failed` |
| review_note | text null | shown to the author on rejection (`status='rejected'`); the author's next edit moves it back to `draft` for resubmission |
| recipient_count | int null | computed at confirmation |
| approved_by | uuid null | second admin, ministry scope; DB CHECK `approved_by IS DISTINCT FROM author_id` (self-approval impossible) backed by the dashboard route refusing it |
| sent_at | timestamptz null | |

**Broadcast state machine:** branch scope: `draft` → `sending` (author sends from the confirmation screen; no approval state). Ministry scope: `draft` → `pending_approval` → `sending` (fired BY the approver's approval action, sending immediately) or → `rejected`. Any author edit while `pending_approval` returns the row to `draft` and clears `approved_by` (server trigger: what the approver reviewed is what sends). Content columns are immutable from `sending` onward. `halted` is terminal for delivery; the dashboard offers "Duplicate as draft" (full approval path again). `failed` is set when fan-out exhausts 3 retries; "Retry delivery" returns it to `sending` and re-runs fan-out for pending/failed deliveries only (deduped by the unique key).

### `broadcast_deliveries`
Per-recipient delivery tracking: powers resumable chunked fan-out, Expo receipt processing, token pruning, and the failure-rate alert. Purged 30 days after send (aggregates stay on `broadcasts`).
| field | type | notes |
|-------|------|-------|
| broadcast_id | uuid FK | |
| profile_id | uuid FK | one delivery row per (broadcast, recipient, channel): WhatsApp sends are profile-keyed |
| device_id | uuid FK null | set for push rows only; unique(broadcast_id, profile_id, channel, device_id) |
| channel | enum | `push` \| `whatsapp` \| `in_app` |
| status | enum | `pending` \| `sent` \| `failed` |
| ticket_id | text null | Expo push ticket; receipts fetched ~15 min later (`15`) |
| error | text null | |

### `push_tickets`
Delivery truth for AUTOMATED pushes (service reminders, activity, transactional), which are otherwise fire-and-forget: every push send persists its ticket ids here; the receipts job sweeps ALL unprocessed tickets, not per-fan-out (`21` §5). Purged after 7 days.
| field | type | notes |
|-------|------|-------|
| ticket_id | text PK | |
| device_id | uuid FK | |
| sent_at | timestamptz | |
| processed_at | timestamptz null | |

---

## Relationship notes / integrity

- A **testimony born from a prayer** links via `testimonies.from_prayer_id` (unique, `on delete set null`); the prayer's "Answered" state is `answered_at`; the reverse lookup is a join. One FK, one source of truth.
- Denormalized counters (`glory_count`, and the prayer `praying_count`/`prayed_count`) are maintained by the DB triggers specced above; the reaction tables remain the source of truth; nightly reconciliation fixes drift.
- **"My branch" scoping** uses `testimonies.branch_id` / `prayers.branch_id`. **"Everywhere"** removes the branch filter (approved rows only).
- All user-generated content (`testimonies`, `prayers`) is **`pending` until a leader approves**: public reads filter `status='approved'`; authors can always see their own pending rows; the Write-path invariants make this unforgeable.
- **Account deletion** (see `16` for the full deletion-reach table): profile soft-deleted AND `phone`/`email` nulled (unique constraints would otherwise block the number from re-registering); pending content hard-cancelled (never approvable post-consent-withdrawal); reactions removed with counter reconciliation; Storage objects deleted in the same job.
