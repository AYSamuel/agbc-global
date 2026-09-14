-- The gathering ladder is the server's alone (W4.16 slice 3, folded in by Ayo 2026-09-14).
--
-- `20260914120000` took every client grant off the new calendar helpers, for a reason that
-- applies just as much to one that was already here: a function a client may EXECUTE is an RPC
-- on the public API, and anything that builds a series as long as its argument hands whoever
-- calls it a `generate_series` of their chosen length. `rhythm_gathering_rungs(total)`
-- (`20260808214722`) is exactly that shape, `generate_series(200, total, 100)`, and it kept
-- Supabase's default EXECUTE for `anon`, `authenticated` and `service_role`, so any guest could
-- ask it for a billion rows until the statement timeout stopped them.
--
-- Nothing needs the grant. Its only caller is `attendance_after_insert`, which is SECURITY
-- DEFINER and so calls it as its owner; no read path, job or screen calls it. So it is revoked
-- from every client role, which is also what `056` now asserts for it alongside the calendar
-- helpers.
--
-- Rollback (roll forward): a compensating migration grants EXECUTE back. Nothing in the app,
-- the dashboard or the jobs would notice either way.

begin;

revoke all on function public.rhythm_gathering_rungs(integer)
  from public, anon, authenticated, service_role;

commit;
