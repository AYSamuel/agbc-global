-- The audit trail outlives the account, which is what `16` already promised.
--
-- `privileged_actions.actor_id` and `target_id` were created as foreign keys with
-- ON DELETE SET NULL (20260729220000). That action could never once run: SET NULL is an
-- UPDATE, the append-only trigger refuses every update outside audit maintenance, and even
-- inside it the rewrite check forbids `actor_id` moving at all. So the table's own trigger
-- forbade its own foreign keys, and the effect was that ANY PROFILE NAMED IN AN AUDIT ROW
-- COULD NOT BE DELETED: Postgres raised "privileged_actions is append-only" and Auth turned
-- it into a 500 "Database error deleting user".
--
-- Found 2026-08-08 through the dashboard test suite, which had quietly failed to clean up
-- after itself for weeks (16 test branches and 52 test profiles were sitting in the local
-- stack, showing up in the app's own branch switcher). The tests were only the messenger.
-- The one that matters is W4.5: `16`'s deletion reach table has to delete the account of a
-- member who may well have been the TARGET of a role change or a branch move, and that
-- deletion would have failed in production exactly the same way.
--
-- WHICH SIDE IS WRONG. Not the trigger. `16`'s reach table already decided this, in its
-- last row: when a leader deletes their account their id is "retained as an opaque id in
-- the audit trail (documented lawful basis: audit)". Retained, not nulled. pgTAP 019 test
-- 15 says the same thing in the other direction ("nor erase who did it: the actor is the
-- point of the record"). An audit row whose actor evaporates when the actor closes their
-- account is not an audit row; the safeguarding case this table exists for is precisely the
-- one where somebody has since left.
--
-- So the foreign keys go and the columns stay. They become what `16` calls them: opaque
-- ids. A deleted account leaves its id behind, pointing at nobody, and the record of what
-- was done survives intact. The append-only trigger is untouched, and every one of its
-- assertions still holds, which is the sign this is the right seam: nothing about who may
-- rewrite the log changes, only who may be deleted from the table it points at.
--
-- The one case where erasure should beat audit is the TARGET, because that is the data
-- subject asking to be forgotten rather than the person who acted. That path already
-- exists and is deliberate: the trigger permits audit maintenance to CLEAR target_id
-- ("redaction clears target_id rather than replacing it"), so W4.5's deletion job nulls it
-- explicitly, inside `agbc.audit_maintenance`, rather than a foreign key doing it silently
-- and unaccountably.
--
-- OPEN, for `20` rather than for this migration: an orphaned uuid is pseudonymous personal
-- data, so the privacy notice should state that the audit trail retains actor ids after an
-- account is deleted, under which basis, and for how long. `reports` already carries a
-- 24-month safeguarding retention and is the obvious precedent.

-- `request_id` is the same trap a third time, and it is reachable by the same single act:
-- `branch_change_requests.profile_id` cascades from profiles, so deleting a member deletes
-- their branch requests, which fires THIS foreign key's SET NULL, which the trigger refuses.
-- A member who ever asked to move branch could not be deleted either. Hence the rule this
-- migration settles on, which is easier to keep than a list of exceptions: the audit table
-- holds opaque ids and NO foreign keys, because every single thing it points at is
-- something the app is allowed to delete later, and the record has to survive all of them.
alter table public.privileged_actions
  drop constraint privileged_actions_actor_id_fkey,
  drop constraint privileged_actions_target_id_fkey,
  drop constraint privileged_actions_request_id_fkey;

comment on column public.privileged_actions.actor_id is
  'Who did it, as an OPAQUE id: no foreign key, so the record survives the account (docs/spec/16 deletion reach). Null only for actions taken with no signed-in caller.';

comment on column public.privileged_actions.target_id is
  'Who it was done to, as an OPAQUE id. Cleared by the erasure path inside audit maintenance when that person is deleted; never repointed at anybody else.';
