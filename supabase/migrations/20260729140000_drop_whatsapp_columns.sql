-- Drop the two columns that existed only to serve WhatsApp Cloud API broadcasts
-- (ADR 0014, docs/decisions/0014-push-only-broadcasts.md). Broadcasts are push +
-- in-app, so neither column will ever be written.
--
-- Why now rather than "some day": a column drop is destructive and the database
-- standard rightly treats it as a multi-release operation when it holds data. These
-- hold none, anywhere:
--
--   * `profiles.phone` is written at exactly one moment in the design, WhatsApp
--     broadcast opt-in (docs/spec/02), which was never built. No app code, test or seed
--     references it (checked repo-wide 2026-07-29).
--   * `notification_prefs.whatsapp_opt_in` has the same story: no reader, no writer.
--
-- And the app schema does not exist in production yet. Prod is the shared project that
-- still serves the church website; the app's tables arrive there through the Track P
-- migration (docs/spec/19), replaying this whole history at once. So these columns will
-- simply never exist in prod, rather than being dropped from under live data. Waiting
-- would turn a free change into exactly the multi-release operation the standard warns
-- about.
--
-- Rollback (roll forward, per the database standard): a compensating migration re-adds
-- both columns with their original types and defaults. Nothing is lost by doing so,
-- because nothing was ever stored in them.
--
-- Privacy: this is also the point where the app stops carrying any phone number at all
-- (docs/spec/20, GDPR Art. 5(1)(c) data minimisation). The column and its UNIQUE index
-- go together.

alter table public.profiles drop column phone;

alter table public.notification_prefs drop column whatsapp_opt_in;
