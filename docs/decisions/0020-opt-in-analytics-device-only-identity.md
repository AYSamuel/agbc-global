# 0020 · Analytics is opt-in and device-only; crash reporting is not gated

Date: 2026-08-12 · Status: accepted · Decider: Ayo (all four questions, interviewed before any code was written)

## Context

W2.10 (#136) instruments the wedge: the ~20 v1 events and five north stars in `22` §5, PostHog EU and Sentry per `01` §7, consent-gated per `20`. Launch week is the only chance to baseline the wedge (`18`), so the event list is not something to trim later.

Two things made this a decision rather than a setup task.

**`20` permits either consent model and does not choose.** §Consent mechanics says v1 may "run PostHog in anonymous/cookieless mode OR behind an in-app opt-in (Settings toggle + first-run card)". Those produce different products: three of the five north stars (weekly contributing members, prayer-to-testimony within 30 days, week-4 rhythm retention) need to recognise the same person across days, which needs a persistent identifier, which under UK/EU ePrivacy needs consent anyway. "Anonymous" would therefore have bought less legal comfort than it looks like while making MAU and retention weaker.

**`20` contradicts itself on crash reporting.** Its lawful-basis table puts "Analytics / crash reporting" under consent; its §Consent mechanics paragraph gates only analytics and says Sentry is configured to scrub PII. Both cannot hold, and the difference matters operationally: `21` §8's rollout halt criterion is "crash-free sessions < 99.5%", which is meaningless if it only measures the subset who opted in.

This app is also higher-stakes than the average: testimonies and prayers are Art. 9 special-category data, and the dashboard shows other people's.

## Decision

1. **Product analytics is opt-in.** Nothing is captured until a member says yes. The ask is a one-time sheet (`ANALYTICS-ASK`, composed and approved in `entry-flow.html` before any code) on the first Home after onboarding, and the switch lives in `SETTINGS › Privacy & data` so the answer is reversible either way. Yes, no, and dismissing all record an answer; it is never asked twice. Refusing is one tap, beside the yes.
2. **Consent lives on the DEVICE, not on a profile.** First run has no account, and `gate_shown` is a guest event by definition, so a per-profile flag could not gate the funnel it exists to measure. Consequence: a member with a phone and a tablet answers twice.
3. **Analytics identity is the device and only the device.** No `identify()`, no member id, no email, ever. Events carry `branch_id`, `scope`, `locale`, `role`. Accepted cost: one person on two devices counts as two people, so member counts skew slightly high. Bought: religious-practice events never sit against an identified individual in a vendor's cloud, which is a materially smaller thing to justify in the DPIA and to a member who asks what we hold. Geo enrichment is off for the same reason (`disableGeoip`), since `branch_id` is a truer location than an IP guess.
4. **Crash reporting is NOT consent-gated, and is scrubbed instead.** Sentry sends from everyone, with no user record, no request bodies, no headers, no query strings, no cookies, no stack-frame locals, no screenshots, no view hierarchy, no session replay, and console breadcrumbs dropped whole. `20`'s lawful-basis table is corrected in the same change: crash reporting is necessary to keep the service working, is stated plainly in the privacy notice and beside the analytics switch in Settings, and the halt criterion stays usable.
5. **App-open events are in scope; unlisted product events are not.** North star 1 is a share OF MAU, so the SDK's own lifecycle events (Installed, Updated, Opened, Became Active, Backgrounded) are enabled to give MAU a denominator. Feature flags, surveys and remote config are all disabled: this project uses PostHog for events only, and left on they POST a flag evaluation carrying a device id and properties at every start.
6. **`testimony_approved` is answered from the database, not sent from a browser.** It is a leader's act in the dashboard, a staff tool with no PostHog in it, and north star 4 (moderation latency p50/p95) reads timestamps the moderation tables already keep. Sending it would add a second, worse source for a number we can compute exactly.

## Alternatives considered

- **Anonymous/cookieless mode, nobody asked.** Faster to ship and no new UI. Rejected: PostHog RN still persists a device identifier, so the ePrivacy question is unchanged, and MAU/retention become device-shaped anyway. It reads like a privacy win without being one.
- **Truly cookieless, no stored identifier.** Cleanest legally, and kills north stars 1 and 5 outright, leaving the wedge with three of its five measures in the only week they can be baselined.
- **One consent covering crashes too.** The strictest reading of `20`'s table. Rejected on decision 4's reasoning: a crash wave among the non-consenting majority would be invisible during exactly the staged rollout the halt criterion governs.
- **Two separate switches** (crashes, analytics). Most honest-looking, and it puts a question in Settings that almost nobody will find, for a stream that is already scrubbed of everything identifying.
- **`identify()` on sign-in.** Cross-device stitching and whole-journey queries. Rejected under decision 3.

## Consequences

- `20` amended: the lawful-basis row for crash reporting, and §Consent mechanics restated to match decisions 1-4. `22` §5 gains a note that lifecycle events supply the MAU denominator. `21` §6.1 gains the DSN/scrubbing shape. `25`'s W2.10 entry records the slicing.
- The tracking plan is a committed artifact (`packages/shared/src/analytics/events.ts`), including the six events no surface can fire yet, each naming the work item that lands it (W3.3 push, Phase 4 plans/library). A name there is a decision; a call site is a consequence.
- Consent is enforced by ONE mechanism, our own store, checked on every `track()` and again when the client is built. An earlier version also passed `defaultOptIn: false` to the SDK as belt and braces; that silently swallowed the first event of every session, because `optIn()` resolves after the capture that triggered construction. Two owners of one fact, and the quieter one won.
- Withdrawal reaches the data, not just the future: switching off opts out, drops the stored device id, and shuts the SDK's timers down.
- Not gating crashes means the scrubbing IS the protection, so it is asserted in tests on both sides (pure scrub functions in the app, a guard test on the dashboard's `dataCollection` inventory). Sentry v10's per-category defaults COLLECT cookies, bodies, headers, query params, DB query data and stack-frame locals, so that guard test exists to fail when an upgrade adds a category.
- Analytics keys and DSNs are absent by default; every runtime no-ops without them, which is how local dev and CI stay silent.
