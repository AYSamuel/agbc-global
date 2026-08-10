# 0018 · Backblaze B2 (EU) for off-provider backups, age-encrypted, 30-day retention

Date: 2026-08-10 · Status: accepted · Decider: Ayo (vendor, retention, key custody), interviewed before any account was created

## Context

Track P gate P1 (`25` Track P, `21` §7, `19`): the shared prod project serves the LIVE church website, sits on the Free plan (NO provider backups), and nothing destructive may run against it until a nightly off-provider dump pipeline plus one verified restore exist. The dumps hold donor PII today (`donations`: names, addresses, Gift Aid flags) and Art. 9 special-category data once the app's schema lands (`20`), so vendor region, retention, and encryption are privacy decisions. `24` §1 has no account row for backup storage; a new vendor account was needed. Prod is tiny (53 MB on disk, a sub-1 MB logical dump; one storage bucket, 340 KB), so cost and egress are trivial everywhere and the decision axes are jurisdiction, custody, and simplicity.

## Decision

1. **Vendor: Backblaze B2, EU Central (Amsterdam).** First 10 GB always free (standing need is under 0.1 GB), $6/TB/month beyond, S3-compatible API, lifecycle rules for age-out. A US company: mitigated by client-side encryption (the vendor only ever stores ciphertext) plus their DPA, the same posture `20` already accepts for Expo and Sentry.
2. **Retention: 30 days rolling**, enforced by a bucket lifecycle rule, not by CI. This is also the GDPR erasure age-out bound for backups (`20`): a deleted member's data is fully gone off-provider within a month.
3. **Encryption: age, asymmetric.** CI holds only the recipient (public) key, committed in the workflow; a compromised repo or runner can encrypt but never decrypt. The identity (private key) lives in the password manager ONLY (Ayo's explicit choice, offered the church-safe offline copy and declined). **Accepted risk, recorded:** the key is a single point of failure; losing vault access makes every backup unreadable. Revisit if a second owner is ever added to the vault (`credentials.md` open action).
4. **Shape: one tarball per night** (`agbc-prod-YYYY-MM-DD.tar.zst.age`) holding the `supabase db dump` trio (roles, schema, data; Supabase's own backup/restore recipe) plus a full copy of every storage bucket. Full-copy is right while storage is KBs; revisit for incremental sync (rclone crypt) when sermon audio lands in Phase 3.
5. **Scheduler: GitHub Actions cron**, the one sanctioned exception to the platform-scheduler rule (project CLAUDE.md): pg_cron cannot run pg_dump. Cheapest honest shape: no PR triggers, 15-minute timeout, no-overlap concurrency, ~2-3 min/night (~90 min/month of the shared Actions pool), healthchecks.io dead-man ping with an explicit `/fail` ping on failure.

## Alternatives considered

- **Cloudflare R2** (10 GB free recurring, zero egress): requires a payment card on file just to activate; same US-company posture as B2 with no offsetting advantage since no Cloudflare account exists.
- **Scaleway** (French company, the cleanest GDPR story): free tier is a limited one-zone class and reads as a 3-month trial; cost after is pennies, but signup friction (EU billing/ID verification) outweighed the jurisdiction gain given the ciphertext-only mitigation.
- **AWS S3 eu-central-1**: rejected on isolation grounds; Supabase prod runs on AWS in the same region, so an AWS-side incident is a shared failure mode. "Off-provider" should mean a genuinely different failure domain.
- **GitHub Actions artifacts**: rejected; 90-day cap, same GitHub account as the repo (one account compromise takes both), no lifecycle control.

## Consequences

- `backup.yml` runs nightly at 02:41 UTC; restore procedure in `docs/runbooks/restore-from-backup.md`; account + key custody recorded in `docs/runbooks/credentials.md`; secrets map extended in `23` §2.
- RPO is up to 24h, accepted and recorded in `21` §7. PITR remains a Pro-plan decision for later.
- A B2 DPA/terms acceptance belongs with the church's processor records (`20`).
