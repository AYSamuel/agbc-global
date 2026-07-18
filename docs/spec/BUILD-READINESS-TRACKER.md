# Build Readiness Tracker

The single place to track what gates the build. Detail lives in the numbered specs, `AUDIT-2026-07-12.md`, and `24-PHASE-MINUS-1.md`; this doc rolls those up to gate level with owners and status so nothing load-bearing gets lost.

Status key: 🔴 not started · 🟡 in progress · 🟢 done · ⚪ decision/owner needed

Last updated: 2026-07-18

---

## The 5 readiness gates

| # | Gate | What it unblocks | Status | Owner |
|---|------|------------------|--------|-------|
| 1 | **User research: validate the wedge** | Confidence to build Family in Phase 2 | 🟡 plan ready, interviews to run | Ayo + Glasgow pastor |
| 2 | **Owners + open decisions** | Content doesn't dry up; specs are unambiguous | 🟡 3 decisions closed today; owners pending | Ayo |
| 3 | **Design phase (hi-fi + component library)** | Feature build in each phase; Reader + Family map are undesigned | 🟡 in progress (Family map spec+mockup done; Figma foundations built) | Ayo + Claude |
| 4 | **Technical + legal gates** | Safe prod migration; lawful NG operation | 🔴 not started | Developer + legal |
| 5 | **Phase -1 accounts** | WhatsApp broadcasts by Phase 3 (Meta fuse, start in month 1); everything else is same-day and free. Auth has NO external fuse since the email-OTP decision (2026-07-18) | see `24` | Ayo + Developer |

Gate 1 runs in parallel (2-week lead). Gates 3 and 4 are the next big workstreams once Gate 2's owners are named.

---

## Decisions log

### Resolved
| Decision | Choice | Date |
|---|---|---|
| Auth method | **Email OTP replaces phone OTP**: typed 6-digit code delivered by email (Supabase native, Resend custom SMTP; local Mailpit for dev). Why: zero cost (the Twilio cluster + NG sender-ID registration are dropped entirely), email to NG beats SMS (no DND filtering), and it is reversible (phone/WhatsApp OTP addable post-v1 without account loss). Meta verification now gates Phase 3 broadcasts only; one WhatsApp number needed instead of two. Docs `00`-`03`, `14`, `16`-`21`, `23`-`25`, README + the entry-flow.html AUTH frames updated | 2026-07-18 |
| Zero-spend constraint | **No paid service until its trigger forces it.** Twilio: gone with phone OTP. EAS Starter ($19/mo): at launch or when free builds bottleneck. Supabase Pro: before the first prod-pointed TestFlight build (traffic fence unchanged). Resend: free tier carries launch; volume alert pages before quota | 2026-07-18 |
| Repo location (amends `23` §4 / `24` §2.1) | **Repo stays under Ayo's personal account** (`AYSamuel/agbc-global`, private); the free-org plan was considered and declined | 2026-07-18 |
| UI languages | **Add French: UI ships EN/DE/NL/FR.** Content (verses/devotionals) stays EN v1. FR strings are net-new (the website has no French); docs, schema (`profiles.language`, `body_fr`), i18n layout, store listings, and the ONB-3 mockup updated. An FR reviewer must be named (see open decisions) | 2026-07-18 |
| Bible translation (verses/devotionals) | **Public domain: World English Bible (WEB)**. No attribution burden; free to store and put on share images. Add `translation` column; render translation label. | 2026-07-15 |
| Tablet / iPad stance | **Full bespoke tablet layouts in v1** (not capped-column). Conscious trade-off: more design + build cost; capped-column is the fallback if schedule slips. | 2026-07-15 |
| WhatsApp broadcast budget | **Push-first; cap ~2 ministry-wide WhatsApp blasts/month.** Broadcasts default to free push + in-app; WhatsApp reserved for high-value moments. Wire spend alerts. | 2026-07-15 |
| Devotional in-app experience | **One purchase unlocks BOTH**: the readable book in My Library AND the structured day-by-day plan (PLAN-DAY) that drives Home's daily CTA + Rhythm streak. Content already written by the authoring pastor; import tool splits the book into days. | 2026-07-15 |
| Reader v1 scope | Both PDF + EPUB | 2026-07-12 |
| Analytics tool | PostHog (EU cloud) | 2026-07-12 |
| Prototypes vs docs | Prototypes patched to match docs; docs win on conflict | 2026-07-13 |
| Legal entity (for Meta verification) | Amazing Grace Bible Church Global Ltd (UK) | 2026-07-13 |
| Supabase region / reuse-as-prod | eu-central-1 confirmed; reuse shared project as prod | 2026-07-13 |
| Repo / branch protection | Private repo on GitHub; `main` protected (PR-required, self-merge, admin-enforced) | 2026-07-15 |

### Still open (need Ayo)
| Decision | Recommendation | Blocks | Owner |
|---|---|---|---|
| Founding-members seeding program | Get each pastor's buy-in: 15-25 members per branch contribute 1 testimony + 1 prayer pre-launch; bar = 10+ approved testimonies across branches before public launch | Family cold-start (empty wedge at launch) | Ayo + pastors |
| French reviewer (translation + UGC moderation escalation) | Name a fluent French reader: no francophone branch exists, so this cannot default to a branch lead like DE/NL | Phase 4 localization pass; French UGC moderation (`17`/`22`) | Ayo |

### Decisions already in the specs (verified 2026-07-15)
All of today's decisions were already documented by the 2026-07-12 remediation pass; verified file-by-file, no edits needed. WEB translation: `07` (Daily Verse), `20` (Content licensing), `02` (`daily_verses.translation` + `devotional_days.verse_translation`). Full tablet layouts: `05` (Tablet & orientation). WhatsApp cap (2 ministry-wide/month, push-first): `15` (Sending) + `21` §9. Devotional = one entitlement unlocks BOTH reader + structured plan: `10`, `14`, `07`, `02`. Today's session ratified these; docs and decisions now agree.

---

## Owners (proposed assignments 2026-07-15; Ayo to confirm or correct)

The spec says the product "dies in month 3" without these. Real names are used where known (the four branch pastors); "interim" or "name TBC" marks where a specific person still needs confirming. A pastor can delegate to a leader, but someone owns it. Critical-path roles (⏰) should be locked before Phase 2.

| Role | Responsibility | Owner (proposed) | By when |
|---|---|---|---|
| ⏰ Per-branch moderators | Approve testimonies/prayers, 1+ per branch (pastor accountable, may delegate a leader) | Glasgow: Ps Esther Olayinka · Berlin: Ps AY Samuel · Emmen: Ps Blossom Anukposi · Ogbomosho: Ps Taiwo Falayi | Phase 2 |
| ⏰ Daily verses curator | Queue ~90 verses/quarter; keep 14+ future days filled | HQ content coordinator (Glasgow); interim: Ayo | Phase 2 |
| ⏰ Weekly sermon MP3 + metadata | Upload each week's audio + details | HQ media/AV owner (Glasgow), name TBC; accountable to Ps Esther | Phase 3 |
| ⏰ Data-protection contact | Field privacy / deletion / export requests (UK entity) | Proposed: a church administrator, else Ps Esther (lead); firm up in Gate 4 | Before launch |
| Devotional import owner | Split the pastor's existing devotional into the day-by-day plan (import tool); author supplies the file | Author: lead pastor (per Payhip setup, `24` item 13) · Import: Ayo (interim) | Phase 4 |
| Events owner (per branch) | Keep each branch's events current | Each branch pastor / branch admin | Phase 2-3 |
| Academy courses / registrations | Course content + confirm registrations | HQ teaching team (Glasgow), name TBC | Phase 2 |
| Books / store config | Payhip catalog + entitlement config | Lead pastor's Payhip account (Ps Esther); dev wires entitlement | Phase 4 |
| Giving config | Per-branch giving links + bank details | Each branch treasurer / admin; HQ collates | Phase 1 |
| DE / NL / FR translation reviewers | Review UI strings + urgent broadcasts | DE: Berlin (Ps AY Samuel) · NL: Emmen (Ps Blossom Anukposi) · FR: name TBC (no francophone branch) | Phase 4 |

The devotional "author" role is retired (content already written); what remains is the lighter import/curation task above.

---

## Design workstream (Gate 3) log

Scope (confirmed 2026-07-15): design system + ALL screens in Figma, built in batches matching build phases. Light-mode only in Figma (Starter plan = 1 mode; dark stays in `05` + mockup). Figma capped at 3 pages (Starter), so components/screens are sectioned within pages.

- **Figma file:** https://www.figma.com/design/K5XNSWYRYZmlrTXAc4LdPo (Samuel's team). Pages: Foundations, Components, Screens.
- **Family map:** design spec (`design/family-map-design-spec.md`) + hi-fi mockup (artifact) done.
- **Batch 0 Foundations (DONE + validated 2026-07-15):** 42 token variables (14 primitive + 14 semantic color, 9 spacing, 5 radius), 6 text styles (Bricolage/Hanken ramp) + card shadow; swatches + type specimen render correctly.
- **Batch 1 Components:** started Button (8 variants Style×State). Two issues: Primary variants render black (stale paint; fix ready but unapplied), and we hit the **Figma Starter MCP tool-call limit** (third free-plan wall after 1-mode and 3-page). Building the full system + ~50 screens via Figma MCP is not viable on Starter.
- **Decision (2026-07-15): screens designed as HTML mockups/artifacts** (free, unlimited, light+dark), reusing the `05` tokens as CSS variables. Figma keeps the validated token foundation + partial Button (Primary variants pending a paint fix) for eventual handoff.
- **Reference points (durable):** design language = `design/prototype-design-language.md` (reverse-engineered from the prototypes; every screen matches it). Screen mockups live in the repo at `design/mockups/` (versioned, openable) and publish to private artifacts for viewing. `design/mockups/entry-flow.html` = **guest shell + auth**: Splash, Welcome, Branch, Language, Home, Watch, Family (Testimonies), Give, More, GATE, AUTH-1 (email; was phone until 2026-07-18), AUTH-2 (email code; was WhatsApp), AUTH-3 (profile), AUTH-4 (success), all in light AND dark → artifact `8c5d7fb6-8c8c-42cb-8fdd-5b93af049ea4`. Family map mockup artifact = `e3a44262-...`. Now also: **member** Home (name + active streak), TESTIMONY-COMPOSE, CONSENT (Art. 9), POST-PENDING, MY-POSTS (Live/In-review/Needs-changes). 19 screens, all light AND dark. Each verified via headless-render screenshot before publish. Now also the **prayer loop**: Family Prayer feed, PRAYER-DETAIL, MARK-ANSWERED, TESTIMONY-COMPOSE (prefilled/linked), TESTIMONY-DETAIL (answered ribbon). **24 screens; the Family wedge is designed end to end.** All light AND dark, each verified via headless-render screenshot before publish. Now also the **Family Map** (completes the Family tab) and the **media cluster**: SERMON player (video/audio, resume, transport, background note) and LIVE (watching-now + rhythm credit). Now also **cluster 1 (church + events)**: BRANCH-INFO, EVENTS list, EVENT-DETAIL + RSVP. **30 screens.** All light AND dark, each headless-verified (render via `msedge --headless` + screenshot). Remaining: cluster 2 (Read+learn: STORE, BOOK-DETAIL, LIBRARY, READER, devotional PLAN/PLAN-DAY, ACADEMY + course/register), cluster 3 (System: SETTINGS, NOTIFICATION CENTER, notif-prefs, PROFILE, delete-account).
- **Next batches (once unblocked):** finish components, then screens per phase (Guest shell → Wedge/Auth → Media/Notifications → Store/Reader).

### Figma rebuild (2026-07-16): restarted clean on the local bridge
- **Bridge:** `figma-mcp-go` (npm `@vkhanhqui/figma-mcp-go`) via a Figma desktop **dev plugin imported from manifest** (plugin.zip from the repo releases). No REST rate limits. To resume: open the file in Figma desktop + run the plugin (keep its window open). Still **free plan** (1 mode per collection, 3 pages), so both themes use **name-prefixed tokens** (`color/light/*`, `color/dark/*`) and each screen is built in BOTH a light and a dark frame.
- **Old file `K5XNSWYRYZmlrTXAc4LdPo` abandoned** (had a corrupt Button). Rebuilt in a NEW blank file (currently open in Ayo's desktop).
- **Foundations DONE:** pages Foundations/Components/Screens; Color collection `1:2` (44 vars, light/dark prefixed + fixed brand + scripture); Spacing `3:36` (9); Radius `3:37` (6); 6 text styles (Bricolage/Hanken) + Shadow/Card.
- **Next:** build the 30 screens (from `design/mockups/entry-flow.html`, the exact spec) in light + dark frames on the Screens page, plus the not-yet-designed clusters (Store/Reader, Academy, Settings/Notifications). This is a multi-session marathon; the mockups + this log are the resume anchors.

## Immediate next actions

- [ ] Ayo: brief Glasgow pastor; recruit + run wedge interviews (Gate 1)
- [ ] Ayo: confirm/correct the proposed owner assignments (esp. the HQ content coordinator, sermon MP3 owner, and DP contact names)
- [ ] Ayo: get the devotional file from the authoring pastor + confirm it's in Payhip (unblocks Phase 4 import)
- [ ] Ayo: confirm founding-members program with each pastor
- [ ] Next session: thread today's 3 decisions into `07`/`05`/`15`/`02`; then open Gate 3 (design) and Gate 4 (backup pipeline + Nigeria NDPA)
