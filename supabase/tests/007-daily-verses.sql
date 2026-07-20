-- daily_verses policy matrix + invariants (docs/spec/02, 07): public content,
-- no client writes, one verse per day per language.
-- Dates sit far outside the dev seed's window (current_date -7..+82) so the
-- suite never collides with seeded rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_verses'::regclass),
  true, 'daily_verses: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.daily_verses'::regclass),
  true, 'daily_verses: RLS forced');

-- Test-owned rows (no shared fixtures).
insert into public.daily_verses (date, reference, text)
values
  ('2031-03-01', 'Psalm 23:1', 'Yahweh is my shepherd: I shall lack nothing.'),
  ('2031-03-02', 'Romans 8:28', 'We know that all things work together for good.');

select is(
  (select translation from public.daily_verses where date = '2031-03-01'),
  'WEB', 'translation defaults to WEB (public domain, docs/spec/07)');
select is(
  (select language from public.daily_verses where date = '2031-03-01'),
  'en', 'language defaults to en');

-- One verse per day per language; the same date in another language is fine.
select throws_ok(
  $$insert into public.daily_verses (date, reference, text)
    values ('2031-03-01', 'Duplicate', 'Second verse for the same day')$$,
  '23505', null,
  'a second verse for the same day and language is rejected');
select lives_ok(
  $$insert into public.daily_verses (date, reference, text, language)
    values ('2031-03-01', 'Psalm 23:1', 'Jahwe ist mein Hirte.', 'de')$$,
  'the same date in another language is allowed (docs/spec/02)');
select throws_ok(
  $$insert into public.daily_verses (date, reference, text, language)
    values ('2031-03-03', 'Bad locale', 'x', 'es')$$,
  '23514', null,
  'an unsupported language is rejected');

-- Anonymous: the verse is public content, read-only.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select count(*) from public.daily_verses
    where date between '2031-03-01' and '2031-03-31')::int,
  3, 'anon reads the verses (guest-first)');
select is(
  (select reference from public.daily_verses
    where date = '2031-03-01' and language = 'en'),
  'Psalm 23:1', 'anon reads a verse by date + language (the Home read path)');
select throws_ok(
  $$insert into public.daily_verses (date, reference, text)
    values ('2031-04-01', 'Rogue', 'anon wrote this')$$,
  '42501', null, 'anon cannot insert verses');
-- An UPDATE blocked by RLS matches zero rows rather than raising (unlike
-- INSERT, which always errors): prove the row survives untouched.
select lives_ok(
  $$update public.daily_verses set text = 'defaced'
    where date = '2031-03-01'$$,
  'anon update executes without error (RLS scopes it to zero rows)');

reset role;
select is(
  (select text from public.daily_verses
    where date = '2031-03-01' and language = 'en'),
  'Yahweh is my shepherd: I shall lack nothing.',
  'the verse text is unchanged after the anon write attempt');

select * from finish();
rollback;
