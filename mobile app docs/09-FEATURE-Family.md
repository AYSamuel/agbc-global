# 09 · Feature — Family (Testimonies · Prayer · Map)

**This is the wedge.** It's what makes the app worth opening daily and what a generic church-app template can't easily replicate. Build it with the most care.

## Purpose
Make **belonging visible** across a scattered, multi-nation family: members share what God has done, respond to each other, pray for one another, and see the family alive across cities.

## User stories
- As a member, I post a testimony and the family responds with "Glory to God."
- As a member, I share a prayer request, others tap "I prayed," and when it's answered I turn it into a testimony.
- As a member, I toggle between **my branch's** stories and **everywhere** (all nations).
- As anyone, I can read testimonies and prayers, and see the global family map.

## Screen: `FAMILY` (Tab 3)
Sub-tabs (segmented): **Testimonies · Prayer · Map**. Persistent **scope toggle**: **My branch · Everywhere** (default **Everywhere** so the "one family, many nations" reality is felt; user can narrow to their branch).

### Testimonies
- Feed of **approved** testimonies (author, branch, time, body, optional photo, **Glory to God** count).
- **Glory to God** = the signature reaction (the app's "like"). Tap → `glory_reactions` insert (gate), count +1 with a small celebratory animation; tap again to remove. One per member per testimony.
- **Answered-prayer ribbon:** testimonies born from a prayer show a ribbon linking to the origin prayer — the visible arc.
- **FAB: Share a testimony** → `TESTIMONY-COMPOSE`.
- Card overflow: own post → edit/delete (`POST-ACTIONS`; editing an approved post re-enters moderation, see below); other → **Report** (`REPORT`) and **Block this member** (v1, store-required for UGC apps: writes `blocked_users`, feeds filter blocked authors server-side; managed under Settings → "Blocked members").
- Tap card → `TESTIMONY-DETAIL`.

### `TESTIMONY-COMPOSE` → `CONSENT` → `POST-PENDING`
1. Compose: body (required), category (optional: healing, provision, salvation, breakthrough…), optional photo.
2. **Consent step** (`CONSENT`): explicit agreement to share publicly + notice that a leader reviews before it's visible. (Important for pastoral care + safeguarding.)
3. Submit → `status = pending`. Show `POST-PENDING` ("Thank you — a leader will review this shortly"). Author sees their pending post with a "Pending" badge in feed and in `MY-POSTS`.

### `TESTIMONY-DETAIL`
Full body, photo, Glory reactions + who (aggregate), origin-prayer link if any, Share (OS/WhatsApp).

### Prayer
- Feed of **approved** prayer requests (body, optional anonymous "A member", **pray count**).
- **"I prayed"** → `prayer_intercessions` insert (gate), count +1. Encouraging micro-copy ("The family is praying with you").
- **FAB: Share a request** → `PRAYER-COMPOSE` → consent → pending → confirm.
- Own request → **Mark as answered** (`MARK-ANSWERED`).

### `PRAYER-DETAIL`
Body, pray count, "I prayed." Own request: **Mark as answered** → sets `answered_at`, then **prompts to write a testimony** (`TESTIMONY-COMPOSE` prefilled + linked via `from_prayer_id`). This closes the loop.

### The prayer → answered → testimony loop (build in v1)
```
PRAYER (pending → approved) → family taps "I prayed" (pray_count)
   → author Marks answered (answered_at)
      → prompt: "Share how God answered?" 
         → TESTIMONY-COMPOSE (prefilled, from_prayer_id set)
            → approved testimony shows "Answered prayer" ribbon → links back to prayer
```
This is the emotional spine of the app — make each step feel like a small celebration.

### Map
- Stylized global map: **branch pins** (from `branches.lat/lng`) + recent **testimony pins** across nations.
- Scope toggle: highlight my branch vs show all nations.
- Tap branch pin → `BRANCH-INFO`; testimony pin → `TESTIMONY-DETAIL`.
- Conveys "one family, many nations" at a glance.

### `MY-POSTS` (the author's view of the pipeline)
- Every own post with a status chip: **Pending / Approved / Needs changes / Removed**.
- A rejected post shows the leader's reason (`rejection_reason`) inline with a primary **Edit and resubmit** action (same compose, prefilled, returns to `pending`).
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
- `testimonies`, `glory_reactions`, `prayers`, `prayer_intercessions`, `reports`. Counts denormalized (`glory_count`, `pray_count`) via triggers.
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
- **Answered without testimony:** allowed — prayer shows "Answered 🙏" without a linked testimony; the testimony prompt is optional.

## Notifications
- Your testimony got Glory reactions (if enabled). Someone prayed for your request. Your post was approved / needs changes. (See `15`.)

## Acceptance criteria
- [ ] Scope toggle correctly filters My branch vs Everywhere (approved only).
- [ ] Glory reaction and "I prayed" gate for guests and complete after sign-in, with live count updates.
- [ ] The full prayer→answered→testimony loop works and the resulting testimony links back to the prayer.
- [ ] Nothing posts publicly without leader approval.
- [ ] Consent step is mandatory before a testimony/prayer is submitted.
- [ ] Map shows branches + recent testimonies across nations.
