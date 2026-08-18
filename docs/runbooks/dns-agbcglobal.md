# DNS: `agbcglobal.com`

The zone that serves the church **website** (Vercel) and **all auth email** (Resend, and from
Track P Phase 2 the Supabase custom SMTP sender). Written 2026-08-18, when a DNS change made
in good faith silently deleted a record that sending depends on and nobody had a copy to
compare against.

**Getting this zone wrong takes agbcglobal.com down, not just email.** Treat it like a
migration, not a settings page.

## Current state (after the 2026-08-18 migration to Cloudflare)

**DNS is hosted at Cloudflare** (`conrad.ns.cloudflare.com`, `jo.ns.cloudflare.com`), free
plan, zone added as "Connect a domain" so **registration stays at Namecheap**. Domain renews
**2027-06-24**. Every record is **DNS only** (grey cloud): proxying Vercel breaks certificates
and redirects, and a migration should change routing behaviour by zero.

| Host | Type | Value | Pri | What it is |
|---|---|---|---|---|
| `@` | A | `216.198.79.1` | | Vercel, the website |
| `@` | MX | `route1.mx.cloudflare.net` | 28 | Cloudflare Email Routing |
| `@` | MX | `route2.mx.cloudflare.net` | 60 | " |
| `@` | MX | `route3.mx.cloudflare.net` | 23 | " |
| `@` | TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` | | **Exactly one apex SPF.** Two would be a permerror |
| `cf2024-1._domainkey` | TXT | Cloudflare DKIM | | Email Routing |
| `www` | CNAME | `96dd1a05caa4576c.vercel-dns-017.com` | | Vercel |
| `send` | MX | `feedback-smtp.eu-west-1.amazonses.com` | 10 | **Resend** custom MAIL FROM. Deleted by accident and restored, see below |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | | **Resend**, sending SPF |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@agbcglobal.com; fo=1` | | Still monitoring, but **now collecting reports**; see below |
| `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXnNIOhLcha1C5QMW6sxWxNXD7B6BZnzZzzdHfklO1JXs/qETmqHkoiu3z6z5227xGRslqwvuSfIdsnxNuOCpcAjxY9LojVtszrv0jymwpkGz9tIwTGFVGwmNfl8mem6L4W0GDsLrJLH8ObQl60PW3lRFM/FasUN+thmMpI69FNwIDAQAB` | | **Resend**, DKIM. Byte-compared old vs new before cutover |
| `tache` | A | `167.233.51.98` | | Known to Ayo, retained deliberately. **Cloudflare's scan did not find it**; it was carried across from the captured inventory |

**Inbound mail is Cloudflare Email Routing**, not Namecheap forwarding. Status Enabled, three
rules Active: `auth@` → `aysamuel007@gmail.com` · `hello@` → `oami.gospel@gmail.com` ·
`dmarc@` → `aysamuel007@gmail.com`. Adding a new alias means adding a routing rule, and a
**new destination address must click Cloudflare's verification email** before it can be used
as a target.

## Pre-migration state, for reference

Nameservers were `dns1.registrar-servers.com` / `dns2.registrar-servers.com` (Namecheap
BasicDNS), with apex MX on `eforward1-5.registrar-servers.com` and an apex SPF of
`v=spf1 include:spf.efwd.registrar-servers.com ~all`. Both are gone: Cloudflare Email Routing
refuses to configure while non-Cloudflare MX exist, and two apex SPF records are invalid.

| Host | Type | Value | Priority | What it is |
|---|---|---|---|---|
| `@` | A | `216.198.79.1` | | Vercel, the website |
| `@` | MX | `eforward1.registrar-servers.com` | 10 | Namecheap email forwarding |
| `@` | MX | `eforward2.registrar-servers.com` | 10 | " |
| `@` | MX | `eforward3.registrar-servers.com` | 10 | " |
| `@` | MX | `eforward4.registrar-servers.com` | 15 | " |
| `@` | MX | `eforward5.registrar-servers.com` | 20 | " |
| `@` | TXT | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | | SPF for the forwarders |
| `www` | CNAME | `96dd1a05caa4576c.vercel-dns-017.com` | | Vercel |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | | **Resend**, sending SPF |
| `send` | MX | `feedback-smtp.eu-west-1.amazonses.com` | 10 | **Resend**, custom MAIL FROM. **DELETED 2026-08-18, see below** |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | | monitoring only, no `rua` |
| `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXnNIOhLcha1C5QMW6sxWxNXD7B6BZnzZzzdHfklO1JXs/qETmqHkoiu3z6z5227xGRslqwvuSfIdsnxNuOCpcAjxY9LojVtszrv0jymwpkGz9tIwTGFVGwmNfl8mem6L4W0GDsLrJLH8ObQl60PW3lRFM/FasUN+thmMpI69FNwIDAQAB` | | **Resend**, DKIM |
| `tache` | A | `167.233.51.98` | | **UNKNOWN.** Not Vercel, not Resend. Identify before any migration drops it |

Email forwarders configured at Namecheap (not DNS records):
`hello@` → `oami.gospel@gmail.com` · `auth@` → `aysamuel007@gmail.com`

## What happened on 2026-08-18, and the trap to remember

`hello@agbcglobal.com` had been **bouncing since forever**: the apex had no MX at all, so
nothing on the internet accepted mail for `@agbcglobal.com`. The website's contact form had
been handing enquiries to Resend and watching them bounce. Fixing that also mattered for
auth, because a domain that sends but cannot receive is a spam signal, and production OTP
had just landed in Gmail's spam folder.

Switching Namecheap's **Mail Settings** from `Custom MX` to `Email Forwarding` fixed inbound.
It also, **one step later than expected, deleted the `send` MX record.** The mode switch
itself preserved it (checked, and it survived); adding the first forwarder is what rewrote
the MX set and took the subdomain record with it.

**The trap, stated plainly: Namecheap's `Email Forwarding` mode owns the ENTIRE MX set,
including MX records on subdomains it has nothing to do with, and offers no way to add one
back.** Apex MX and subdomain MX coexist perfectly well in DNS; this is a registrar UI
limitation, not a protocol one.

Consequence of losing it: AWS SES falls back to its default MAIL FROM. Sending continues and
DKIM still signs as `agbcglobal.com`, so DMARC still passes on DKIM alignment. What is lost
is **SPF alignment**, and Resend will eventually mark the record failed. Not fatal, but a
weakening at exactly the moment the domain needs to look more trustworthy, not less.

**Resolution (Ayo, 2026-08-18): DNS moved to Cloudflare**, where apex MX and subdomain MX
coexist with no mode to fight, with Cloudflare Email Routing for inbound.

### A second trap, found only because Namecheap said so afterwards

**Namecheap's email forwarding requires Namecheap's nameservers.** After the switch, its
Redirect Email panel reads: *"To perform this function from your account, you must first
change your nameservers to Namecheap default."* So forwarding was never going to survive the
move, and the assumption that it would (the MX pointed at their servers, so it seemed
DNS-host independent) was wrong. Cloudflare Email Routing replaced it in the same sitting,
which is why the eforward MX records are gone.

## What made the migration safe, and is worth repeating

1. **The zone was captured from live DNS first** (`1.1.1.1`), not from the registrar UI, and
   written down before anything moved. Cloudflare's own scan warns it "may have missed
   uncommon records or custom subdomains", and it did: **`tache` was missing** from the
   import. Without the captured table that would have vanished silently.
2. **The new zone was queried directly at `conrad.ns.cloudflare.com` BEFORE the nameserver
   change**, while the live zone was still Namecheap's. All 13 records answered correctly,
   and the DKIM and `send` SPF strings were **byte-compared** old against new, because a
   truncated DKIM key breaks sending without any visible error.
3. **Everything stayed DNS-only.** Cloudflare prompts hard to enable proxying; declining is
   correct for Vercel and keeps behaviour identical to before.
4. **Deletions were done behind a search filter.** Selecting rows directly is how the wrong
   record gets picked: the selection toolbar appears, the rows shift, and a click lands one
   row off. That very nearly deleted the `send` MX a second time. Filtering to `eforward` and
   then using select-all made it impossible to select anything else.

Reverting, if ever needed, is a nameserver change back to
`dns1.registrar-servers.com` / `dns2.registrar-servers.com`. The old zone still exists at
Namecheap, minus the records changed there today.

## Still owed on this domain (`03` makes email posture a launch item)

- **DMARC: reports now collect, enforcement is still owed.** `rua=mailto:dmarc@agbcglobal.com`
  and `fo=1` were added on 2026-08-18, with a routing rule so the reports actually land
  somewhere; the reporting address is on the same domain, so no external-destination
  verification record is needed. The policy is deliberately still `p=none`: moving straight to
  `p=quarantine` without report data is how a church stops its own mail being delivered.
  **Let a couple of weeks accumulate, read them, then tighten.**
  Two things to expect: aggregate reports are **raw gzipped XML**, unpleasant to read by
  hand, so a free analyser is worth pointing `rua` at once there is anything to analyse; and
  `fo=1` also requests failure reports, which is what makes a misconfiguration visible early
  rather than as a silent delivery drop.
- **Resend TLS is `Opportunistic`.** These emails carry sign-in codes. `Enforced` is the
  stronger posture; the trade is that mail to a server without TLS fails rather than
  downgrading.
- **Production OTP landed in spam** on its first real send (2026-08-18). Contributing factors,
  in the order worth fixing: no inbound MX (now fixed), a brand-new sender identity with no
  reputation, `p=none`, and Supabase's default template, which is a bare "Confirm your email
  address" with a link and is textbook phishing shape. The template fix is Phase 2's next task
  and is not cosmetic.
