-- The forced-update floor becomes per-platform (docs/spec/21 §8, decided 2026-07-30).
--
-- WHY. `app_config.minimum_supported_version` held one global version string for both
-- stores. iOS and Android review on independent timelines, so that shape has a failure mode
-- with no recovery for the person hit by it: raise the floor to 1.3.0 the moment Android
-- 1.3.0 goes live, while iOS 1.3.0 is still in review, and every iOS user on 1.2.0 is hard
-- blocked by a screen telling them to update to a build the App Store will not give them.
-- The gate is a hard block with no dismiss, so that is the app being unusable, not degraded.
--
-- The alternative considered and rejected was an operational rule: "never raise the floor
-- until both stores are live". It works, it costs no code, and it is exactly the kind of
-- guarantee this project has already decided not to rely on. The audit trigger in ADR 0015
-- exists because "a caller that has to remember will eventually forget", and a release
-- checklist is the same shape with a worse blast radius: forgetting locks out real people
-- rather than losing a log row. Ayo chose the structural fix (2026-07-30) after first
-- preferring the global floor.
--
-- BEHAVIOUR IS UNCHANGED BY THIS MIGRATION. The current value is carried to BOTH platforms,
-- so whatever floor was in force stays in force. Today that is "0.0.0", which blocks
-- nothing. Raising the floor remains a config action, never a release.
--
-- The client half: `resolveMinimumVersion()` in apps/mobile/src/features/update-gate/
-- version.ts reads the platform's key and still accepts a bare string as meaning both, so
-- an environment whose row has not been migrated keeps gating instead of silently stopping.
-- Anything malformed resolves to null and FAILS OPEN, which is the rule the whole gate is
-- built on: a bad config value must never be able to lock the app.
--
-- Guarded on `jsonb_typeof(value) = 'string'` so this is idempotent and cannot flatten an
-- already-migrated object back into a string on a re-run.
--
-- Rollback (roll forward): a compensating migration writes `value -> 'ios'` back as a bare
-- string. The client accepts that shape, so it degrades to the old global behaviour rather
-- than breaking.

update public.app_config
   set value = jsonb_build_object('ios', value, 'android', value)
 where key = 'minimum_supported_version'
   and jsonb_typeof(value) = 'string';

comment on table public.app_config is
  'Remote configuration read PRE-AUTH on launch (docs/spec/02). minimum_supported_version is an object keyed by platform ({"ios":"x.y.z","android":"x.y.z"}) because the two stores review independently and one global floor can block a platform whose replacement build is still in review (2026-07-30). A bare string is still honoured by the client as applying to both.';
