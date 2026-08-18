# 0024 · Legacy API keys through the cutover, new keys straight after

Date: 2026-08-18 · Status: accepted · Decider: Ayo (preference stated as "use the new way, and legacy only if the new one cannot work")

## Context

`agbc-production` was created on 2026-08-18 (ADR 0023) and its dashboard offers **two key
systems side by side**:

- **Legacy**: `anon` and `service_role`, which are JWTs. Everything this repo has ever been
  built and tested against.
- **New**: `sb_publishable_…` and `sb_secret_…`, which are **not JWTs**. Supabase's current
  guidance is to prefer these; legacy keys stay valid until explicitly disabled and are
  **deprecated end of 2026**.

Building on a format with a stated end date buys a forced migration later, so the new keys
were investigated properly rather than waved away.

## What the investigation found

Checked against Supabase's live docs and this repo's own code on 2026-08-18, not from memory:

1. **Edge Functions cannot verify the new keys at the platform layer.** All nine of our
   functions run `verify_jwt = true`. New keys are not JWTs, so that gate cannot validate
   them; the documented approach is `verify_jwt = false` plus authorization in code.
2. **New keys cannot be sent as `Authorization: Bearer` at all.** They travel in the
   `apikey` header. This is the load-bearing restriction, because
   `jobs.invoke_edge_function` (`20260806120000`, ADR 0016) sends exactly
   `'Authorization', 'Bearer ' || key`, and it already drives four cron jobs on production.
3. **`verify_jwt` is NOT the security boundary for the job functions**, and our own code says
   so: `_shared/auth.ts` notes that the gate "admits ANY valid project JWT (the anon key
   included), so the handler itself requires the service-role key", then does a constant-time
   comparison. This is the finding that makes the migration tractable rather than frightening.
4. **Local parity is not a blocker.** `supabase status` already emits `PUBLISHABLE_KEY` and
   `SECRET_KEY` alongside the legacy pair, so both formats exist in every environment. (This
   was assumed to be a blocker at first and turned out not to be.)
5. **The plural env vars are JSON dictionaries**, not comma-separated lists:
   `JSON.parse(SUPABASE_SECRET_KEYS)['default']`.

## Decision

**Cut over on the legacy keys, then migrate to the new keys as a dedicated slice immediately
after Phase 4.**

Legacy is the fallback Ayo's own rule allows, and the investigation showed the new keys
genuinely cannot work today without changing shipped, tested code on the authorization path.

## Why not simply migrate now

Production is mid-move. The website is still pointed at a paused project, and the app has
never once run against production. Changing the authentication mechanism of every edge
function inside that same window means that when something misbehaves, **you cannot tell
whether it was the move or the keys.** Cut over, prove it works, then change one thing at a
time with its own tests and its own rollback.

## The migration design, so it is not re-derived

**The job path.** The vault holds the `sb_secret_…` key instead of the service-role JWT, and
the invoker changes one line:

```sql
headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'apikey', key                    -- was: 'Authorization', 'Bearer ' || key
)
```

`verify_jwt = false` on the job functions, and `isServiceRoleRequest` reads the other header
and compares against every configured secret:

```ts
const presented = req.headers.get('apikey') ?? '';
if (!presented) return false;
const secrets = JSON.parse(requiredEnv('SUPABASE_SECRET_KEYS')) as Record<string, string>;
for (const key of Object.values(secrets)) {
  if (await timingSafeEqual(presented, key)) return true;
}
return false;
```

**That last part is strictly better than today.** Iterating the dictionary means two keys can
be valid at once, so a rotation is an overlap rather than a flag-day. The single
`SUPABASE_SERVICE_ROLE_KEY` never allowed that.

**The user-facing functions.** `course-handoff` and `photo-guard` need caller identity, and
that survives untouched: **user access tokens are still JWTs** and supabase-js still sends
them as `Authorization: Bearer`. Only the project key moves to `apikey`. With `verify_jwt`
off, the function validates the user itself via `auth.getUser(jwt)`.

**PostgREST.** No design change. Swap the values in EAS, Vercel and `.env`; the Bearer
restriction is specific to the Edge Functions platform gate.

## What gets weaker, stated plainly

The two anon-callable functions (`review-signin`, `contact-form`) lose the platform gate and
gain an explicit `apikey` check against `SUPABASE_PUBLISHABLE_KEYS`. Be honest about what
that gate was worth: **the publishable key is public and ships in every app bundle**, so it
never excluded a determined caller. The real controls there are the per-IP rate limits, the
zod validation, and the constant-time review-code comparison, and none of them change. The
net security change is close to zero; what changes is that the enforcement now lives in code
we own and must not get wrong, which is why it ships with tests rather than as a config flip.

## Consequences

- **`credentials.md` records legacy as the live choice**, and carries a do-not-press warning
  on the dashboard's "Disable JWT-based API keys" button until the migration lands. Pressing
  it today breaks the app, the website, all nine functions and all four cron jobs at once.
- **The plan gains a phase after Phase 4** rather than leaving this as a good intention.
- **Deadline is real**: legacy keys are deprecated end of 2026, so this cannot drift
  indefinitely. It is scheduled at the first moment it can be done safely, not the last.
- Both key pairs exist on the project meanwhile, which costs nothing and means the migration
  can be done incrementally with both valid.

## Alternatives considered

| Option | Verdict |
|---|---|
| New keys now, migrating every function during the cutover | Rejected: two variables changing at once, on the authorization path, with no way to attribute a failure |
| Legacy forever | Rejected: deprecated end of 2026, so it is a forced migration on someone else's schedule |
| Hybrid, new keys for app/website and legacy for functions | Rejected: two key systems in one project, and the service-role key is shared by both halves. Confusion with no benefit |
| Legacy through the cutover, migrate straight after (chosen) | **Chosen** |
