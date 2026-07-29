# 0014 · Push + in-app broadcasts only; no WhatsApp Cloud API

- Status: accepted
- Date: 2026-07-29
- Spec: `docs/spec/15-FEATURE-Notifications.md`, `17-ADMIN-DASHBOARD.md`, `02-DATA-MODEL.md`, `20-PRIVACY-COMPLIANCE.md`, `21-OPERATIONS.md`, `24-PHASE-MINUS-1.md`

## Context

The plan was push + in-app as the default channels, with WhatsApp Cloud API broadcasts
rationed to two ministry-wide blasts a month (`21` §9, decision 2026-07-12). Revisiting
it turned up an assumption that does not hold.

**The Cloud API reaches a subset of the push audience, not a superset.** To receive a
WhatsApp broadcast a person must be a signed-in member who opted in (`whatsapp_opt_in`)
AND supplied a phone number, which `02` collects only at that opt-in. To receive a push
they must be a signed-in member who granted OS notification permission. Both require the
app and an account. So the integration never reaches anyone who does not have the app;
its unique audience is the narrow set of members who installed it, signed in, refused
push, and then opted into WhatsApp anyway.

What that narrow set costs, from `24` and `21` §9:

- Meta business verification: the **only remaining multi-week fuse in the project**,
  needing the church's incorporation certificate and a matching utility bill.
- A dedicated number registered to the WABA, plus display-name review.
- A tier ramp: 250 business-initiated conversations/24h unverified, 1,000 verified,
  10k+ only through sustained usage. `24` row 5 already noted that **a 2,000-member
  blast is impossible at tier 1**, so the first blasts could not reach the ministry
  anyway.
- Roughly **$200 per ministry blast** at UK/DE marketing rates, against a 2/month cap.
- Server-side cap enforcement, pre-send cost estimation, per-channel delivery-status
  tracking, and a second failure mode in the fan-out (`17` §2, `21` §4, §6).

Meanwhile the job everyone actually means by "reach the church on WhatsApp" belongs to
the church's EXISTING WhatsApp community and groups: a human posting a message. No API
reaches those, and no API is needed to.

## Decision

**Broadcasts are push + in-app only.** The WhatsApp Cloud API is dropped from the product,
not deferred.

- The dashboard's broadcast composer gains **"Copy for WhatsApp"**: the rendered message
  plus its deep link as pasteable text, for a leader to post into the existing community.
  Free, needs no verification, and it is the only route that reaches people who do not
  have the app yet.
- The in-app Notification Center remains the durable log, so a member who has push turned
  off still sees every broadcast the next time they open the app.
- Meta business verification, the broadcast number, and the tier ramp leave `24`
  entirely. **Phase -1 now has no external fuse of any kind.**
- No phone numbers are collected. `profiles.phone` and
  `notification_prefs.whatsapp_opt_in` exist only to serve this feature and become dead
  columns; a follow-up migration drops them while they still hold no data.

## Consequences

- **Cost:** broadcasts become free. The last recurring per-message vendor cost leaves the
  product; `21` §9's WhatsApp row and its budget alert go with it.
- **Schedule:** the launch critical path loses its last multi-week external dependency.
  Nothing in Phase -1 now needs chasing legal documents.
- **Privacy:** the app collects no phone numbers at all, a straight data-minimisation
  improvement under `20` (GDPR Art. 5(1)(c)), and Meta leaves the processor list.
- **Scope:** Phase 3 broadcasts shrink to one channel, one delivery leg, no cap logic and
  no cost estimation.
- **Accepted loss, resilience:** `21` §6 listed WhatsApp as the fallback when Expo push
  fails. There is now no automated second channel: during a push outage a broadcast
  reaches people only when they next open the app, or via a leader pasting it into the
  community. Judged acceptable because the Notification Center makes nothing permanently
  missed, and because the fallback was never available to members who had not opted in.
- **Accepted loss, reach:** a member who denies notification permission gets nothing until
  they open the app. Mitigated by the in-context pre-permission sheet (`06`) and the
  unread bell on Home.
- **Reversible, with lead time.** `broadcasts.channels` stays an array and
  `broadcast_deliveries.channel` stays an enum, so a second channel can be added without a
  schema redesign. Re-adding WhatsApp would mean redoing verification and the tier ramp
  (weeks), so this is a decision to revisit deliberately, not casually.

## Revisit trigger

**Measured push opt-in.** W2.10 wires PostHog; once real members are on the app, the
notification-permission grant rate is a number rather than a guess. If it is low enough
that broadcasts systematically miss the ministry, reopen this: either a second channel, or
better in-context asking. Until that number exists, adding a paid channel is speculation.
