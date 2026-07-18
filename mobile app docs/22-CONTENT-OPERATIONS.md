# 22 · Content Operations: Owners, Cadences, Launch Content, Seeding, Localization

The software can pass every acceptance criterion and still die in month 3 if these pipelines lapse. Every "admin-managed" feature below is a recurring job that needs a named human. Owners are role placeholders until real names are committed (deadline: **before build Phase 2 starts**); the devotional author is already known (the lead pastor).

## 1. Content pipelines

| Pipeline | Owner (role) | Tool | Cadence | Lead time | Failure mode if it lapses | Monitoring |
|----------|--------------|------|---------|-----------|---------------------------|------------|
| Daily verses (WEB translation, free) | comms/admin volunteer | dashboard verse CRUD (moved to Phase A, see `17`/`18`) with spreadsheet batch import | quarterly batch of 90 days | 2 weeks | every member sees a stale verse for weeks; the daily touchpoint dies quietly | cron alert when < 14 future days queued (`21` §5) |
| Devotional plans (paid) | **lead pastor** (author) + admin (import) | pastor writes (existing Payhip publishing flow); admin runs the one-time structured import (day rows) in the dashboard | per devotional release | import within 1 week of release | buyers get the PDF but no day-by-day plan experience | import checklist per release |
| Sermon audio (MP3) | media team | dashboard upload + attach to the synced sermon row | weekly, by Tuesday after Sunday | n/a | audio-only toggle disabled; the "listen while driving" promise silently empty | weekly checklist; Watch shows per-sermon audio badge |
| Sermon metadata curation | media team | dashboard edit of nightly-synced rows | weekly | n/a | Watch tab full of raw titles like "Sunday Live Stream 12/07/2026" | same weekly checklist |
| Events | each branch leader | dashboard | weekly review; entries at least 2 weeks ahead | n/a | branch shows "No events scheduled yet" forever | monthly admin review of per-branch event counts |
| Courses / Academy | academy coordinator | dashboard | per season: flip `upcoming`, dates, fees; process registrations within 7 days | 2 weeks before season | registrations stuck "pending" forever; dead Register buttons | registration-age alert (> 7 days pending) |
| Books | admin | dashboard catalog + Payhip; unmatched-purchases queue worked weekly | per release | n/a | buyers who paid cannot read (the worst volunteer support ticket) | unmatched-purchases queue count in dashboard |
| Giving config | trustee-level owner | server config (never an app release) | on change | n/a | wrong bank details in the app | change requires two people to confirm |
| Broadcasts | branch leaders / admins | dashboard (`17`) | as needed; WhatsApp rationed to 2 ministry-wide/month (`21` §9) | n/a | overspend or spam fatigue | cost shown pre-send; monthly budget alert |

## 2. Launch-content checklist (minimum viable day-1 set)

- [ ] 4 branches seeded and verified (incl. geocoded lat/lng, timezone, `branch_services` schedule rows: the seed JSON does NOT contain these, see `02`)
- [ ] 90 daily verses queued (WEB translation)
- [ ] The Word Devotional imported as a structured plan; purchase-to-entitlement-to-plan flow tested end to end
- [ ] 12+ back-catalog sermons synced with cleaned titles/speakers/series; at least 4 with MP3 audio attached
- [ ] 2+ upcoming events per branch plus 1 ministry-wide event
- [ ] All current-season courses with correct dates and fees
- [ ] Book catalog with working Payhip links (both PDF and EPUB paths tested if both exist)
- [ ] Welcome broadcast drafted (EN, with DE/NL bodies)
- [ ] 10+ approved testimonies spanning all 4 branches and 5+ active prayers (see §3)
- [ ] One trained moderator per branch signed off (moderation notifications + 48h escalation verified)

## 3. Family cold-start seeding (the wedge must not launch empty)

1. **Founding Members program:** 15 to 25 invited members per branch join 3 to 4 weeks pre-launch on the internal/TestFlight track; each is asked to share one testimony and one prayer request. **Backend fence:** this phase runs against the DEV project unless prod is already on Pro (`24` §1 traffic fence: Free-tier prod egress is shared with the live website and would be exhausted within days).
2. **Pre-launch collection at services:** a card or WhatsApp form leaders transcribe (with recorded consent), posted under the member's account at first sign-in or leader-posted with attribution.
3. **Leaders post first:** each branch leader shares in week 1 (they are members too).
4. **Launch Sunday choreography:** announced from the pulpit at all 4 branches with a QR code; everyone is asked to tap Glory on one testimony that day.
5. **Bar to clear before public launch:** at least 10 approved testimonies across all 4 branches and 5 active prayers. An empty map and feed on day 1 is a failure of the product thesis, not a UX edge case.

## 4. Localization workflow (EN/DE/NL)

- **Owners:** DE = Berlin lead (Pastor AY) + one second reader; NL = Emmen lead (Pastor Blossom) + one second reader. Placeholder until confirmed.
- **Process:** i18n keys mandatory from Phase 1 (no literal strings in components); string freeze checkpoint per release; new features ship with all three languages or do not ship.
- **Legal strings** (consent wording, privacy summaries, deletion copy) are reviewed by the data-protection contact in all three languages before release (`20`).
- **Broadcasts:** composer writes the primary language; optional `body_de`/`body_nl` fields; dashboard warns "sent as written to all recipients" when locale bodies are empty. Automated notifications are template-key based and render per recipient language (`02`/`15`).
- **Multilingual UGC:** posts carry a language tag; the Everywhere feed labels non-UI-language posts; stale pending items in a language the escalation admin cannot read are escalated to the named reviewer for that language (DE: Berlin, NL: Emmen, Yoruba: Ogbomosho leads); nobody approves content they cannot read (`17`).

## 5. Analytics: the wedge baseline (instrument in Phase 2, not Phase 4)

Tool: PostHog EU cloud, consent-gated (`20`). Event names snake_case; standard properties: branch_id, scope, locale, role.

**v1 events:** onboarding_completed, signup_completed, gate_shown / gate_converted (action_type), testimony_posted / testimony_approved, prayer_posted, glory_tapped (own_branch bool), i_prayed_tapped (own_branch bool), prayer_marked_answered, answered_converted_to_testimony, map_opened, scope_toggled, attendance_marked (source), plan_day_completed (plan_id), devotional_purchased_matched, sermon_played (mode), sermon_resumed, rsvp_set, give_tapped (method), broadcast_received / broadcast_opened, notification_opened (type), reader_opened (format).

**North stars for "belonging made visible":**
1. Weekly contributing members: % of MAU who posted OR reacted that week.
2. Prayer-to-testimony conversion within 30 days.
3. Cross-branch reactions: % of Glory and prayer ("I will pray" / "I prayed") taps landing on another branch's post (the literal measure of "one family, many nations").
4. Moderation latency p50/p95 (the feed's freshness ceiling).
5. Week-4 rhythm retention (the retention anchor).
