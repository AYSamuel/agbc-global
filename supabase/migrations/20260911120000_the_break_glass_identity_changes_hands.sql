-- The break-glass admin identity changes hands (Ayo's decision, 2026-09-11).
--
-- Out: `oami.gospel@gmail.com`. In: `agbc.noreply@gmail.com`. This is the shape
-- `docs/runbooks/credentials.md` already describes for changing this identity, "one more
-- `bootstrap_admins` row plus a demotion of the old one", and it is the compensating migration
-- `20260730150000` said its rollback would take.
--
-- THE ACCOUNT WAS ALREADY DELETED BY ITS HOLDER, on 2026-09-11, through the app's own erasure
-- before this file was applied. That is why the demotion below looks like it does nothing, and
-- it is worth being exact about what erasure did and did not do:
--
--   * It set `deleted_at`, and NULLED `email` and `display_name` (`20260901160000`). So the
--     profile no longer matches by address, every authority check already refuses it
--     (`authorize()` answers `account_closed`, `caller_is_admin_live()` filters `deleted_at`),
--     and the role left on that row is inert.
--   * It did NOT touch `bootstrap_admins`. That table sits deliberately outside `profiles`'
--     cascade so that closing an app account cannot silently revoke an admin grant, which is
--     right, and which here means the LICENCE OUTLIVED THE ACCOUNT. Between the erasure and
--     this migration, anyone signing up with that address is promoted straight back to admin by
--     `profiles_bootstrap_admin`, with nobody deciding anything. Closing that is the urgent
--     half of this file.
--
-- THE DEMOTION IS KEPT ANYWAY, and it is not dead code. It matches on the address, which the
-- erasure has already nulled in production, so there it updates nothing. It still has to be
-- here because this file must also be correct against a database restored from before the
-- erasure (`docs/runbooks/restore-from-backup.md` makes that a drill we actually run), and
-- against any environment where the account was demoted rather than deleted.
--
-- WHAT THE NEW IDENTITY IS, stated plainly so nobody reads more into it later. It is a
-- break-glass account: a second identity HELD BY THE SAME PERSON, which fixes availability and
-- recovery. It is NOT separation of duties, for the same reason the address it replaces was
-- not: a second account held by one person cannot review that person's actions. The open action
-- in `credentials.md` to name a second HUMAN admin (a trustee or officer), which is the only
-- thing that provides real oversight of Art. 9 data, is untouched by this change and stays
-- open. The custody caveat carries over unchanged too: a personal-provider mailbox is
-- controlled by whoever holds that provider account rather than by the ministry, so it does not
-- outlive its holder the way a church-domain mailbox would.
--
-- ONE OPERATIONAL PRECONDITION THIS FILE CANNOT ENFORCE, and it decides whether any of this
-- works: sign-in is email OTP and nothing else, so that mailbox has to RECEIVE mail and be
-- read. An address named "noreply" that nobody monitors is an admin identity that can never
-- sign in, and it would fail at exactly the moment a break-glass account exists for. Raised
-- with Ayo on 2026-09-11 and confirmed.
--
-- Retention (docs/spec/20): deletes one row of personal data and writes another, each an email,
-- kept only while the grant stands, on the same lawful basis as the rows before them.
--
-- DESTRUCTIVE OPERATION, flagged for review as the database standard asks: the DELETE below
-- removes a live admin grant from production. It is one row and it is reversible by
-- re-inserting it, but between this migration and a replacement signing in there is exactly
-- ONE live admin, so it must not be applied while `aysamuel007@gmail.com` is unreachable.
--
-- ROLLBACK (roll forward, never a down-migration): a compensating migration that deletes the
-- `agbc.noreply@gmail.com` row, re-inserts the `oami.gospel@gmail.com` one, AND demotes
-- whichever account the first row promoted with an explicit UPDATE. The demotion is the half
-- that is easy to forget and the reason this file carries two halves itself: deleting an
-- allowlist row demotes nobody, because the promotion is already written to `profiles.role`.
-- Note that the outgoing account cannot be restored by any migration: its holder erased it, and
-- erasure is not reversible.

-- The guard the function layer has and a migration does not.
--
-- Every ordinary door out of the admin role refuses to reach zero: `set_member_role` counts
-- live admins and `erase_profile` repeats the rule for the deletion door. A direct UPDATE in a
-- migration goes around both, so the invariant is restated here or this file is the one way to
-- lock the ministry out of its own dashboard, with a database console as the only way back.
--
-- It counts admins OTHER than the target, so it stays silent both on a database where the
-- account is already gone (production, after the erasure) and on one where no profile exists at
-- all. The second case is the normal local one: `pnpm db:reset` starts with an empty `profiles`
-- and rows appear when people sign in, so a guard that failed there would break every reset and
-- every CI run while protecting nothing.
do $$
declare
  v_target_is_admin boolean;
  v_other_admins integer;
begin
  select exists (
    select 1 from public.profiles
     where lower(email) = 'oami.gospel@gmail.com'
       and role = 'admin'
       and deleted_at is null
  ) into v_target_is_admin;

  if v_target_is_admin then
    select count(*)::integer into v_other_admins
      from public.profiles
     where role = 'admin'
       and deleted_at is null
       and lower(email) <> 'oami.gospel@gmail.com';

    if v_other_admins = 0 then
      raise exception
        'refusing to demote the last admin: appoint another admin before applying this migration'
        using errcode = 'check_violation';
    end if;
  end if;
end;
$$;

-- Out: the licence.
delete from public.bootstrap_admins where email = 'oami.gospel@gmail.com';

-- Out: the grant already written to the profile, where it still is.
--
-- 'member' rather than 'leader': a demotion must not quietly hand out a smaller authority
-- nobody asked for, and must not move anyone between branches, so `branch_id` is untouched.
--
-- The bootstrap flag is raised for the same reason `20260730150000` raised it: this is a
-- server-owned change authorised by a reviewed file in git, not by whoever happens to be
-- connected, so `profiles_audit` records it with a NULL actor rather than inventing one.
do $$
begin
  perform set_config('agbc.bootstrap_promote', 'on', true);
  update public.profiles
     set role = 'member'
   where lower(email) = 'oami.gospel@gmail.com'
     and role is distinct from 'member';
  perform set_config('agbc.bootstrap_promote', 'off', true);
end;
$$;

-- In: the replacement licence.
insert into public.bootstrap_admins (email, note)
values (
  'agbc.noreply@gmail.com',
  'Break-glass admin (ADR 0015; identity changed 2026-09-11, replacing oami.gospel@gmail.com). Second admin identity so the erasure lockout and the 48-hour fallback approver are not one account. Held by Ayo; availability and recovery, NOT separation of duties. TOTP seed offline per docs/runbooks/credentials.md.'
)
on conflict (email) do nothing;

-- Order must not matter: if the profile already exists when this runs, promote it now. The
-- grant otherwise lands when the account first signs in and AUTH-3 creates its profile, which
-- is the normal case here, because that address has never signed in.
--
-- `deleted_at is null` is not in the migration this is modelled on, and is here because this
-- file now runs in a world where an erased profile exists: a closed account must never be
-- promoted back into authority by a later allowlist row.
do $$
begin
  perform set_config('agbc.bootstrap_promote', 'on', true);
  update public.profiles p
     set role = 'admin'
    from public.bootstrap_admins b
   where lower(p.email) = lower(b.email)
     and p.deleted_at is null
     and p.role is distinct from 'admin';
  perform set_config('agbc.bootstrap_promote', 'off', true);
end;
$$;
