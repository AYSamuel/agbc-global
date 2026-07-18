# 00 · Overview

## What we are building

The **AGBC Global** mobile app (iOS + Android) for **Amazing Grace Bible Church**, a multi-branch ministry founded in 1962 with congregations across the UK, Europe, and Nigeria. The app is the everyday companion for members and the front door for visitors.

The church's self-description, **"One family · many nations · one amazing grace"**, is the product thesis. AGBC is *diaspora-shaped*: Nigerian roots with branches scattered across cities where members are often far from "home." Most church apps are built for one big local campus. AGBC's is built for a **family spread across nations that needs to feel like one body.**

## The wedge: "belonging made visible"

The single feature-set that makes this app worth opening (and hard for a generic church-app template to replicate) is the **Family** experience:

- **Testimonies**: members post what God has done; readers respond with a **"Glory to God"** reaction (the app's signature "like"). Testimonies flow into a shared feed that can be scoped to **My branch** or **Everywhere** (all nations).
- **The prayer loop**: a request can be prayed for by the family, then marked **Answered**, then turned into a **testimony**. Prayer → Answered → Testimony is a complete, visible arc of God's faithfulness.
- **The global family map**: testimonies and branches plotted across nations, so a member in Emmen can see the family is alive in Glasgow, Berlin, and Ogbomosho on the same day.

Everything else (watch, give, events, academy) is table-stakes done well. The Family experience is the differentiator.

## Who it's for

A balance of **members** (the everyday core: watch, give, rhythm, family) and **visitors/seekers** (browse freely, find a branch, plan a visit, watch a message: no account wall).

## The branches (real data)

| Branch | City / Country | HQ | Languages | Sunday | Lead |
|--------|----------------|----|-----------|--------|------|
| AGBC Glasgow | Glasgow, Scotland UK | ★ HQ | English | 10:30 AM | Pastor Esther Olayinka (Founder & Lead Pastor) |
| AGBC Lighthouse Berlin | Berlin, Germany | | Deutsch / English | 11:00 AM | Pastor AY Samuel |
| AGBC Emmen | Emmen, Netherlands | | Nederlands / English | 10:00 AM | Pastor Blossom Anukposi |
| Miracle Centre Ogbomosho | Ogbomosho, Nigeria | | English / Yoruba | 8:00 AM | Pastor Taiwo Falayi |

Source: `agbc/src/content/branches/*.json`. The app must load branches from the backend (seeded from these files), never hard-code them: new branches will be added.

## Languages

- **App UI:** English, German (Deutsch), Dutch (Nederlands), French (Français): selectable in onboarding and Settings.
- **Content (devotional, reading plan) v1:** English only. Architecture must not block per-language content later.

## Scope philosophy

The app **does not need to mirror the website.** It shares the brand (colors, type, tone) but is leaner and more personal. The website is the public, marketing/SEO surface; the app is the relational, logged-in-life surface.

### In scope for v1

Onboarding · Home + daily verse · Watch (sermons + HQ live + audio-only) · Sermon player (resume, background, lock-screen) · Family (testimonies, Glory reactions, prayer loop, global map) · Rhythm (attendance "I'm here," streaks, milestones, devotional plan) · Events (list, detail, RSVP) · Giving (link-out to web) · Academy (pathway, courses, registration) · Store (buy on web) + My Library reader · Notifications (push + WhatsApp, tiers) · Settings (theme, language, profile, privacy, account deletion) · Auth (email-OTP).

### Deferred (post-v1, architecture-ready)

In-app native giving (App Store review risk) · in-app book purchase (store-cut avoidance) · decentralized per-branch livestreams · in-app chat/DMs (we share out to WhatsApp instead) · per-language content beyond English.

## Platform & tech at a glance

- **App:** React Native + **Expo** (one codebase, iOS + Android). See `01-ARCHITECTURE.md` for why, and how to develop/test iOS from a Windows PC.
- **Backend:** Managed BaaS (Supabase recommended): Postgres, auth, storage, realtime, edge functions. Custom-backend option and costs are laid out in `01`.
- **Auth:** Email-OTP; a typed 6-digit code delivered by email (decision 2026-07-18, see `03`).
- **Store identity:** ships as an update to the existing Grace Portal listings (same Android app id / iOS bundle id), so current installs receive it automatically. See `19-MIGRATION-GRACE-PORTAL.md`.
- **Video:** YouTube (HQ channel). **Audio:** self-hosted files with resume/background playback (see `08`).
- **Moderation:** leader-approval before public (see `09` + `17`).
- **Notifications:** Expo Push + WhatsApp (Cloud API / provider) (see `15`).
- **Admin:** separate web dashboard for leaders (see `17`).

## Brand in one line

Navy (`#14213d` / `#0e1420`), sunny gold (`#ffcf4a`), hopeful blue (`#2f6fed`), warm cream (`#fbf8f3`); **Bricolage Grotesque** display + **Hanken Grotesk** text. Full system in `05-DESIGN-SYSTEM.md`.
