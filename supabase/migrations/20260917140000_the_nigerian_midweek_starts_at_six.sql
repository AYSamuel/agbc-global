-- Ogbomosho's Wednesday service starts at 6:00 PM, not 7:00 PM (Ayo, 2026-09-17).
--
-- Both layers were wrong and they were wrong in the same direction, which is the
-- shape `20260917120000` warned about: the display string and the machine schedule
-- describe one service and nothing in the database keeps them honest.
--
--   branch_services   weekday 3, 19:00 Africa/Lagos   ->  18:00
--   service_times     'Wednesdays 7:00 PM (WAT)'      ->  'Wednesdays 6:00 PM (WAT)'
--
-- ONLY THE SECOND WAS COSMETIC. `branch_services` is what the reminder job, the
-- check-in window and live detection read, all resolved in the branch's own zone, so
-- a 19:00 row meant the Nigerian branch's members were told "starting in an hour" at
-- the moment the service actually began, and the "I'm here" affordance opened at
-- 18:30 for a gathering that started at 18:00. The other three branches were right:
-- UK 18:00, Berlin and Emmen 19:00.
--
-- THE HOUR IS A FIXED LOCAL WALL CLOCK AND DAYLIGHT SAVING NEVER MOVES IT (Ayo,
-- 2026-09-17). The church does not re-announce a service because a clock changed:
-- Nigeria meets at 6pm, the UK at 6pm, Germany and Emmen at 7pm, every week of the
-- year. That is exactly what `branch_services` already stores (branch-local time
-- plus the branch's IANA zone), so nothing about the model needed to change. The
-- consequence to know, and it is deliberate: these four services are simultaneous
-- while the UK is on BST and an hour apart once it returns to GMT. Nigeria has no
-- daylight saving; the UK and Germany do, on the same dates as each other.
--
-- Keyed on SLUG and on (weekday, kind), never on id: `syncServices` in the dashboard
-- (apps/dashboard/src/server/branches.ts) saves a branch's schedule by DELETE then
-- INSERT, so the seeded id '...142' survives only until somebody edits that branch
-- through the form. The seed carries the same two values for local resets.
--
-- The jsonb is MERGED rather than rebuilt, for the reason the previous migration was
-- written at all: editing one key must not delete the others.
--
-- Rollback: set 19:00 and '7:00 PM' back. No other row references either value.

update public.branch_services s
set start_time = '18:00'
from public.branches b
where s.branch_id = b.id
  and b.slug = 'ogbomosho'
  and s.weekday = 3
  and s.kind = 'midweek';

update public.branches
set service_times = service_times || jsonb_build_object(
  'midweek', 'Wednesdays 6:00 PM (WAT)'
)
where slug = 'ogbomosho';
