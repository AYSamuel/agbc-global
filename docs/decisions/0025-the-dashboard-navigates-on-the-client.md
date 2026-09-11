# 0025 · The dashboard navigates on the client, in a shell that outlives the page

Date: 2026-09-11 · Status: accepted · Decider: Ayo (from the report "it doesn't feel like a single page app, sometimes I click and I wait")

## Context

The leader dashboard had **no client-side navigation at all**. It was not a slow single-page
app; it was a set of independently server-rendered documents. The rail was a raw `<a href>`,
so were the moderation filter chips, the People links and the branch-request links, and every
click was a full browser document load.

Measured on a production build before any change (W4.12 slice 1):

| | |
|---|---|
| every rail navigation | `navType: "navigate"`, a full document load |
| JavaScript re-parsed per click | **810 KB decoded, 0 bytes transferred** (all from disk cache) |
| always-loaded bundle | 696 KB raw / 208 KB gzipped |
| time before anything appeared | ~259 ms locally, and strictly worse in production |
| loading states in the whole app | **none**, on any screen |

Next.js 16's own shipped docs name this failure exactly
(`01-app/01-getting-started/04-linking-and-navigating.md:90`): "waiting for a server response
before navigation can give the users the impression that the app is not responding".

Three facts made this more than a one-line fix. All 31 routes are `force-dynamic`, and per
Next's `prefetching.md` **a dynamic route is not prefetched at all without a `loading.js`**, so
`<Link>` alone would have bought nothing. There was no shared layout: 24 page files each
rendered the shell themselves across 31 call sites, so the rail was part of what got replaced.
And the shell had to exist before a loading state could, or the skeleton would blank the
navigation along with the content.

## Decision

**1. The dashboard routes live in a `(dashboard)` route group with one layout that owns the
shell.** Parentheses, so no URL changes: the same 32 routes at the same paths.

**2. The shell is a layout, not a per-page wrapper.** Next preserves a layout across a client
transition and re-renders only the page beneath it, so the rail survives navigation and a
`loading.tsx` has somewhere to render that is not the whole screen.

**3. The rail reads the active route from `useSelectedLayoutSegment()`** rather than being told
by a `current` prop, which retired that prop from 31 call sites. The segment is derived from
each row's `href`, not its key, because `sermonAudio` is keyed one way and routed another.

**4. `createServerComponentClient` is wrapped in React `cache()`.** The layout and the page
both call `authorize()`, and without this a hard load would pay two `getUser()` round trips and
two `profiles` reads instead of one.

**5. Every data surface gets a loading state, built from the mockup's frames.** Ten screens,
plus a deliberately generic form shape for the eighteen nested routes that would otherwise
inherit a list skeleton.

**6. Internal navigation is `<Link>`.** The skip link stays a raw anchor because it moves focus
rather than navigating; the three `window.location.assign` calls in sign-in and MFA stay
because the session cookies were just written and a soft navigation races them.

**7. The content column stops at 1008px and centres beside the rail**, which stays pinned to
the edge. 1008 is what the mockup already holds at the 1280px width every frame is drawn at, so
the rule is inert at laptop width.

## Why

**`authorize()` is untouched, deliberately.** `17` line 13 requires the session to be confirmed
with the auth server rather than decoded locally, "so a signed-out or revoked session dies
immediately rather than at token expiry", and `02` line 41 generalises it. Its two serial round
trips stay. `cache()` deduplicates them **within one request**, which is not the same thing:
the guarantee is that a revoked session dies on the next request, and asking the same question
twice microseconds apart was never part of it. Verified by instrumenting `loadSession` and
counting: exactly one call per page load.

**The layout is not the authorization boundary and must not be mistaken for one.** Next does
not re-run a layout on every client navigation, so a check living only there would go stale the
moment a caller moved between routes without a reload. Each page still awaits its own
`authorize()` for its own action, and the database is still the boundary. The layout's check
decides what the shell shows and where to send a signed-out visitor.

**The order of the work was itself a decision, and it changed mid-item.** The plan was `<Link>`
first. Slice 1's measurement showed the server wait dominates (187 ms TTFB of a 259 ms load),
which means a client transition **removes the browser's own tab spinner and puts nothing in its
place**. Shipping `<Link>` alone would have traded a crude signal for none. The order became
layout, then loading states, then `<Link>`, so that each step was an improvement on its own.

## Consequences

**Measured on a production build, same instrument as the baseline, seven rail hops:**

| | before | after |
|---|---|---|
| navigation kind | full document load | client transition |
| JavaScript re-parsed per click | 810 KB | none |
| time before anything is on screen | ~259 ms, nothing until complete | **5 ms median** (3-17 ms) to the destination's skeleton |
| rail during navigation | torn down and rebuilt | stays mounted |

**The rail badge now appears on every screen** rather than the three pages that remembered to
fetch it, which is what decision 12 always meant, and `/moderation` and `/reports` stop paying
a year-wide view scan to draw a number in somebody else's component.

**Accepted cost: the no-JavaScript fallback is no longer a constraint** for this app (Ayo,
2026-09-10). It is a staff tool. This is a deliberate departure from
`~/.claude/standards/frontend.md`, which asks that core tasks work with HTML alone "wherever
the product allows"; this decides the product does not require it here. Forms still post to
Server Actions and still work without scripts today, so nothing is lost yet. What it buys is
the freedom for a later slice to have actions return data instead of redirecting, which is
what optimistic updates need.

**Accepted cost: eighteen one-line `loading.tsx` files.** A `loading.tsx` is the fallback for
its own segment *and* everything nested under it, so `events/loading.tsx` alone would draw the
events list skeleton over `/events/new`, which is a form. The alternative, a bespoke skeleton
for each, would be a great deal of work spent making the wrong promise more confidently.

**Still open: the Vercel function region for `agbc-dashboard` is unrecorded.** Supabase is
`eu-central-1`. If the functions run anywhere else, every auth round trip crosses an ocean
twice and dwarfs everything measured above. There is no `vercel.json` in the repo, so the
setting lives only in the Vercel console. This ADR does not decide it; pinning a region would
be its own change.

## Alternatives considered

**Cap the whole shell and centre it, rail included.** Rejected by Ayo: the rail is the app's
furniture and belongs at the edge, not inside the reading column.

**Leave the shell per page and add `loading.tsx` anyway.** Rejected: without a shared layout
the skeleton replaces the rail too, which is worse than the blank page it was meant to fix.

**Move the auth check into the layout only, to pay for it once.** Rejected as unsafe for the
reason under "Why": layouts are not re-run on client navigation.

**Animate the skeletons.** Rejected: the mockup's `.skel` is a static three-stop gradient and
that file has no `@keyframes` anywhere. An animated skeleton would be code inventing a decision
the design did not make.
