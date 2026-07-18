# 09 · Feature: Family (Testimonies · Prayer · Map)

**This is the wedge.** It's what makes the app worth opening daily and what a generic church-app template can't easily replicate. Build it with the most care.

## Purpose
Make **belonging visible** across a scattered, multi-nation family: members share what God has done, respond to each other, pray for one another, and see the family alive across cities.

## User stories
- As a member, I post a testimony and the family responds with "Glory to God."
- As a member, I share a prayer request, others commit to pray ("I will pray") and are gently reminded until they come back and mark "I prayed," and when it's answered I turn it into a testimony.
- As a member, I toggle between **my branch's** stories and **everywhere** (all nations).
- As anyone, I can read testimonies and prayers, and see the global family map.

## Screen: `FAMILY` (Tab 3)
Sub-tabs (segmented): **Testimonies · Prayer · Map**. Persistent **scope toggle**: **My branch · Everywhere** (default **Everywhere** so the "one family, many nations" reality is felt; user can narrow to their branch).

### Testimonies
- Feed of **approved** testimonies (author, branch, time, body, optional photo, **Glory to God** count).
- **Glory to God** = the signature reaction (the app's "like"). Tap → `glory_reactions` insert (gate), count +1 with a small celebratory animation; tap again to remove. One per member per testimony.
- **Answered-prayer ribbon:** testimonies born from a prayer show a ribbon linking to the origin prayer: the visible arc. **Render rule:** the ribbon is a LINK only while the origin prayer is publicly visible (approved, not deleted); otherwise it degrades to a static "Born from an answered prayer" label with no navigation. Symmetrically, a prayer's link to its testimony renders only while that testimony is approved. Stale deep links get the `15` "no longer available" treatment.
- **FAB: Share a testimony** → `TESTIMONY-COMPOSE`.
- **Post actions menu (`⋯` on the DETAIL screen header, not the feed card).** Decision 2026-07-17: keep the feed cards clean (just the reaction + Share), and put the actions menu one tap deeper, in the `TESTIMONY-DETAIL` / `PRAYER-DETAIL` header. From there: own post → edit/delete (`POST-ACTIONS`; editing an approved post re-enters moderation, see below); other member's post → **Report** (`REPORT`) and **Block this member** (v1, store-required for UGC apps: writes `blocked_users`, feeds filter blocked authors server-side; managed under Settings → "Blocked members").
- Tap card → `TESTIMONY-DETAIL`.

### `TESTIMONY-COMPOSE` → `CONSENT` → `POST-PENDING`
1. Compose: body (required), category (optional: healing, provision, salvation, breakthrough…), optional photo.
2. **Consent step** (`CONSENT`): explicit agreement to share publicly + notice that a leader reviews before it's visible. (Important for pastoral care + safeguarding.)
3. **Draft survival:** compose drafts persist to local storage on every change and restore on next composer open with a "Draft restored" notice (process death loses nothing). Consent is per-submission: the `CONSENT` step always re-runs after a restore (a stale carried-over consent flag would undermine the Art. 9 capture).
4. Submit → `status = pending`. Show `POST-PENDING` ("Thank you: a leader will review this shortly"). Author sees their pending post with a "Pending" badge in feed and in `MY-POSTS`.

### `TESTIMONY-DETAIL`
Full body, photo, Glory reactions + who (aggregate), origin-prayer link if any, Share (OS/WhatsApp).

### Prayer
- Feed of **approved** prayer requests (body, optional anonymous "A member", and two counts shown side by side: **praying** (people currently committed) and **prayed** (people who have fulfilled)).
- **Prayer commitment (two-step "I will pray" then "I prayed", so a tap means real prayer):**
  - The reaction on a prayer request reads **"I will pray"** (a forward commitment), **not** a past-tense "I prayed". Tapping it (gate) inserts a `prayer_intercessions` row, **adds the member to the praying (committed) count**, and **enrols them in gentle prayer reminders** for that request.
  - Over the following days the member receives periodic nudges to actually pray for the person (see `15` Notifications).
  - When the member returns to the request and taps **"I prayed"** (the second state), the intercession is marked **fulfilled** (moving them from the **praying** count into the **prayed** count) and the reminders **stop**.
  - **Why (product intent):** the two steps discourage a hollow one-tap "like" and nudge people toward genuine, sustained intercession, rather than tapping "I prayed" without actually praying. Encouraging micro-copy on commit: "The family is praying with you."
  - **Data / impl (build note):** `prayer_intercessions` carries a state (`committed` then `prayed`) plus a reminder schedule (e.g. `committed_at`, `prayed_at`, `next_reminder_at`, cadence + a hard cap so it never nags). Reminders stop on fulfilment ("I prayed"), when the request is answered or deleted, at the cap, or if the member opts out. Guests hit the gate first, then the commit completes.
- **FAB: Share a request** → `PRAYER-COMPOSE` → consent → pending → confirm.
- Own request → **Mark as answered** (`MARK-ANSWERED`).

### `PRAYER-DETAIL`
Body, pray count, and the two-step "I will pray" then "I prayed" commitment (see **Prayer** above; the second tap stops the reminders). Own request: **Mark as answered** (offered ONLY on approved, non-deleted prayers; server-checked, see `02`) → sets `answered_at`, then **prompts to write a testimony** (`TESTIMONY-COMPOSE` prefilled + linked via `from_prayer_id`). This closes the loop. **Undo:** "Mark as not answered" clears `answered_at` while no linked testimony exists; once one exists, undo requires deleting that testimony first, and the confirm sheet says so.

### The prayer → answered → testimony loop (build in v1)
```
PRAYER (pending → approved) → family taps "I will pray" (praying_count), later "I prayed" (prayed_count)
   → author Marks answered (answered_at)
      → prompt: "Share how God answered?" 
         → TESTIMONY-COMPOSE (prefilled, from_prayer_id set)
            → approved testimony shows "Answered prayer" ribbon → links back to prayer
```
This is the emotional spine of the app: make each step feel like a small celebration.

### Map
- Stylized global map: **branch pins** (from `branches.lat/lng`) + recent **testimony pins** across nations.
- Scope toggle: highlight my branch vs show all nations.
- Tap branch pin → `BRANCH-INFO`; testimony pin → `TESTIMONY-DETAIL`.
- Conveys "one family, many nations" at a glance.

### `MY-POSTS` (the author's view of the pipeline)
- Every own post with a status chip: **Pending / Approved / Needs changes / Removed**.
- A rejected post shows the leader's reason (`rejection_reason`) inline with a primary **Edit and resubmit** action (same compose, prefilled, returns to `pending`).
- **`removed` is terminal for the author** (edits are refused server-side, `02`; delete stays allowed): the chip shows the removal reason plus "Removed by a leader. If you believe this is a mistake, contact your branch leader" with a contact link. Only an admin can restore removed content, audit-logged.
- **Edit semantics (rule):** ANY edit to body, photo, or category on an approved post resets it to `pending` and removes it from public feeds until re-approved (server-enforced, see `02` invariants); reactions are retained. Notifications "Post approved / needs changes" deep-link here.

### Multilingual feeds
Posts carry a language tag (declared or detected); the Everywhere feed labels posts not in the reader's UI language, with translation via the OS share sheet in v1 (in-app translation post-v1). Moderation language escalation rules live in `17`/`22`.

## Moderation (see also `17`)
- All testimonies + prayers are **`pending` until a leader of that branch approves** (leader-approval model chosen for safeguarding).
- Public feeds read `status = 'approved'` only; authors see their own pending.
- **Report** → `reports` row → surfaces in leader queue. Leaders can approve/reject/remove; admins global.
- Removed content disappears from public; author notified with reason (kind copy).
- **Freshness safeguard:** leaders are notified when items enter their queue; anything `pending` longer than 48h escalates to admins. A quiet leader must never make a branch's feed look dead (see `17`).

## Data
- `testimonies`, `glory_reactions`, `prayers`, `prayer_intercessions`, `reports`. Counts denormalized via triggers (`glory_count`; and for prayer, a **`praying_count`** for committed-but-not-yet-fulfilled intercessions and a **`prayed_count`** for fulfilled ones). `prayer_intercessions` also stores the commitment **state** (committed then prayed) and reminder timestamps (`committed_at`, `prayed_at`, `next_reminder_at`) for the two-step "I will pray" then "I prayed" flow.
- `is_anonymous` is enforced server-side: public reads go through a view that omits `author_id` (see `02`). The UI hiding the name is presentation, not the mechanism.
- Scope filter = `branch_id` (My branch) vs none (Everywhere), always `status='approved'`.
- Realtime: feed + counts update live (Supabase Realtime).

## States / edge cases
- **Guest:** read freely; Glory/I prayed/compose → gate (returns and completes).
- **Empty feed:** "Be the first to share what God has done" + compose CTA (never blank).
- **Pending backlog:** author reassured; not shown publicly.
- **Anonymous prayer:** hide author identity everywhere public.
- **Offline:** cached feed; actions queue or show retry.
- **Abuse/spam (concrete):** content creation capped at 5 testimonies+prayers combined per account per day; reports capped at 20 per reporter per day (blunts queue-flooding); sign-up velocity per IP/ASN monitored; **Block** ships in v1 (store requirement). Reaction uniqueness (one per member) already blunts count inflation; farming needs many phone numbers, monitored via the OTP funnel (`21` §6).
- **Day-one cold start:** the feed must not launch empty; the seeding program (founding members, pre-launch collection, leaders post first, launch-Sunday choreography, 10+ approved testimonies bar) is specced in `22-CONTENT-OPERATIONS.md` §3.
- **Answered without testimony:** allowed: prayer shows "Answered 🙏" without a linked testimony; the testimony prompt is optional.

## Notifications
- Your testimony got Glory reactions (if enabled). Someone prayed for your request. Your post was approved / needs changes. (See `15`.)

## Acceptance criteria
- [ ] Scope toggle correctly filters My branch vs Everywhere (approved only).
- [ ] Glory reaction and the two-step prayer commitment ("I will pray" then "I prayed") gate for guests and complete after sign-in, with live count updates; committing enrols the member in prayer reminders that stop when they mark "I prayed".
- [ ] The full prayer→answered→testimony loop works and the resulting testimony links back to the prayer.
- [ ] Nothing posts publicly without leader approval.
- [ ] Consent step is mandatory before a testimony/prayer is submitted.
- [ ] Map shows branches + recent testimonies across nations.
