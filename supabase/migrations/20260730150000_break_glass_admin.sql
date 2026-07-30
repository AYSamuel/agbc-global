-- A second admin identity, so that no single account is a single point of failure
-- (ADR 0015 consequences, decided with Ayo 2026-07-30).
--
-- WHY. Three separate rules in the W2.7 people slice assume more than one admin eventually
-- exists, and today each one has the same single point of failure with a hand-written migration
-- as its only recovery:
--
--   * the erasure lockout: if the sole admin's account is erased or lost, nobody can grant a
--     role again, so nobody can appoint a leader or approve a branch move;
--   * the 48-hour fallback in `decide_branch_request`: an admin is the backstop approver when a
--     destination branch has no leader, which is EVERY branch right now;
--   * the last-admin refusal in `set_member_role`, which exists for a state one account cannot
--     reach.
--
-- WHAT THIS IS, AND WHAT IT IS NOT. This is a break-glass identity: a second admin ACCOUNT held
-- by the same person, which is the industry-standard control for exactly the failure above
-- (Microsoft's "emergency access accounts", the AWS root-account pattern, CIS Controls 5 and 6).
-- It fixes AVAILABILITY and RECOVERY.
--
-- It is NOT separation of duties, and this migration should not be read as providing any. A
-- second account held by one person cannot review that person's actions. Real oversight needs a
-- second HUMAN holding authority over other people's Art. 9 data, which is a governance decision
-- for Ayo and the trustees rather than a technical task, and it is recorded as still open in
-- ADR 0015 and the W2.7 plan.
--
-- It also does NOT make the last-admin count clause in `set_member_role` reachable. That is
-- arithmetic and does not change with the number of admins: the caller must be a live admin and
-- cannot be the target, so any admin target implies two live admins and demoting one leaves one.
-- pgTAP `020` says so plainly. What this migration buys is the first two bullets above.
--
-- WHY THIS PATH. `bootstrap_admins` is the existing audited mechanism (`015`): the grant is
-- declared as data in a reviewed migration and applied by a trigger, so it is visible in git
-- rather than being a hand-typed UPDATE nobody saw. Production gets its second admin by
-- applying this same file. Nothing else in the schema can hand out `admin` yet, because
-- `set_member_role` refuses `target = auth.uid()` and there is currently one admin to be.
--
-- CUSTODY CAVEAT, stated because it is a real limitation of the address chosen and not a
-- defect: a personal-provider mailbox is controlled by whoever holds that provider account, not
-- by the ministry, so it does not outlive its holder the way a church-domain mailbox would.
-- Ayo's decision, 2026-07-30, having been offered the domain alternative. Revisit when the
-- ministry has a managed mail domain; a follow-up row here is all it takes, and the runbook
-- carries the operational half (where the TOTP seed and recovery codes live).
--
-- OPERATIONAL PRECONDITION, and the reason this migration alone is not the whole job: the grant
-- lands when the account first signs in and AUTH-3 creates its profile. Until someone signs in
-- with this address there is still functionally one admin. The account must then enrol its own
-- TOTP factor, because the dashboard refuses any staff session below aal2 and `set_member_role`
-- refuses one too. Recovery codes and the seed belong offline, per the runbook.
--
-- Retention: one row of personal data (an email), kept only while the grant stands, on the same
-- lawful basis as the first row (docs/spec/20). Deleting the row is the deletion path, and it
-- sits deliberately outside `profiles`' cascade so that closing an app account cannot silently
-- revoke an admin grant.
--
-- Rollback (roll forward): a compensating migration deletes this row AND demotes the account
-- with an explicit UPDATE. Deleting the row alone does not demote anyone, because the promotion
-- has already been written to `profiles.role` (the same warning `015`'s migration carries).

insert into public.bootstrap_admins (email, note)
values (
  'oami.gospel@gmail.com',
  'Break-glass admin (ADR 0015, 2026-07-30). Second admin identity so the erasure lockout and the 48-hour fallback approver are not one account. Held by Ayo; availability and recovery, NOT separation of duties. TOTP seed and recovery codes offline per docs/runbooks/credentials.md.'
)
on conflict (email) do nothing;

-- Order must not matter: if the profile already exists when this migration runs, promote it now.
-- A migration runs on a direct connection with no user context, so `profiles_guard` already
-- treats this as privileged; the flag is raised anyway so the statement does not quietly depend
-- on how it happens to be applied. With the flag raised, `profiles_audit` records this grant
-- with a NULL actor, which is correct and is the point of the migration before this one.
do $$
begin
  perform set_config('agbc.bootstrap_promote', 'on', true);
  update public.profiles p
    set role = 'admin'
    from public.bootstrap_admins b
    where lower(p.email) = lower(b.email)
      and p.role is distinct from 'admin';
  perform set_config('agbc.bootstrap_promote', 'off', true);
end;
$$;
