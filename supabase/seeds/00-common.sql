-- 00-common.sql · seed data that is true in EVERY environment (local, dev,
-- prod-via-reviewed-step). Idempotent: upserts keyed on stable ids/slugs.
--
-- Branches: the website JSON (agbc/src/content/branches/*.json) merged with the
-- hand-built AUGMENTATION MAP below (docs/spec/02 §seeding reality check): the JSON
-- carries no slug/lat/lng/timezone. Coordinates are venue/city-level approximations
-- for the decorative world map (docs/spec/09); refine if the map design demands it.

insert into public.branches
  (id, slug, name, city, country, is_hq, timezone, languages, youtube_channel_id,
   email, lat, lng, service_times, address, lead, leaders, welcome, quote, "order")
values
  (
    '00000000-0000-4000-8000-000000000001',
    'glasgow',
    'AGBC Glasgow',
    'Glasgow',
    'Scotland, UK',
    true,
    'Europe/London',
    'English',
    -- Olayinka Ademiluka Ministries International (docs/spec/01 §4); the sync
    -- and live-detection jobs read this (W1.3). Verified via the channel's RSS
    -- feed 2026-07-20.
    'UCTwx8j2Z0DZPlUhPyqfilfA',
    'oami.gospel@gmail.com',
    55.8622, -4.0245, -- Summerlee Museum, Coatbridge (venue-level approximation)
    '{"sunday": "12:00 PM", "midweek": "Wednesdays 6:00 PM (UK time)"}'::jsonb,
    '{"line1": "Summerlee Museum of Scottish Industrial Life", "line2": "Heritage Way, Coatbridge ML5 1QD"}'::jsonb,
    '{"name": "Pastor Esther Olayinka", "role": "Founder & Lead Pastor", "bio": "Founder of Amazing Grace Bible Church, leading our headquarters in Glasgow with a heart to raise disciples who are sound in the Word, alive in the Spirit, Christlike in character and equipped for mission."}'::jsonb,
    '[{"name": "Grace Bello", "role": "Worship Lead"}, {"name": "Sarah McKay", "role": "Kids & Family"}]'::jsonb,
    'There is a seat saved for you in Glasgow.',
    'I came in a stranger and left feeling like family.',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'berlin',
    'AGBC Lighthouse Berlin',
    'Berlin',
    'Germany',
    false,
    'Europe/Berlin',
    'Deutsch / English / Français',
    null,
    'agbc.lighthouse@gmail.com',
    52.5502, 13.3563, -- Oudenarder Str. 16, Wedding (venue-level approximation)
    '{"sunday": "11:00 AM", "midweek": "Mittwochs 19:00 Uhr (CET)"}'::jsonb,
    '{"line1": "AGBC Lighthouse Berlin", "line2": "Oudenarder Str. 16, 13347 Berlin"}'::jsonb,
    '{"name": "Pastor AY Samuel", "role": "Lead Pastor, Lighthouse Berlin"}'::jsonb,
    '[]'::jsonb,
    'Willkommen. You belong here in Berlin.',
    null,
    2
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'emmen',
    'AGBC Emmen',
    'Emmen',
    'Netherlands',
    false,
    'Europe/Amsterdam',
    'Nederlands / English',
    null,
    'oami.gospel@gmail.com',
    52.7862, 6.8917, -- Flintstraat, Emmen (venue-level approximation)
    '{"sunday": "11:00 AM", "midweek": "Woensdag 19:00 uur (CET)"}'::jsonb,
    '{"line1": "Amazing Grace Emmen", "line2": "Flintstraat 29C05, 7815 RE Emmen"}'::jsonb,
    '{"name": "Pastor Blossom Anukposi", "role": "Lead Pastor, Emmen"}'::jsonb,
    '[]'::jsonb,
    'Welkom. There is a place for you in Emmen.',
    null,
    3
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'ogbomosho',
    'Miracle center Ogbomosho',
    'Ogbomosho',
    'Nigeria',
    false,
    'Africa/Lagos',
    'English / Yoruba',
    null,
    'oami.gospel@gmail.com',
    8.1335, 4.2407, -- Ogbomosho, Oyo State (city-level approximation)
    '{"sunday": "11:00 AM", "midweek": "Wednesdays 7:00 PM (WAT)"}'::jsonb,
    '{"line1": "AGBC Miracle Centre", "line2": "Adjacent Alajikii Mosque, Tarkii, Ogbomosho, Oyo State"}'::jsonb,
    '{"name": "Pastor Taiwo Falayi", "role": "Lead Pastor, Miracle Centre"}'::jsonb,
    '[]'::jsonb,
    'E ku abo. Welcome home to Ogbomosho.',
    null,
    4
  )
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  country = excluded.country,
  is_hq = excluded.is_hq,
  timezone = excluded.timezone,
  languages = excluded.languages,
  youtube_channel_id = excluded.youtube_channel_id,
  email = excluded.email,
  lat = excluded.lat,
  lng = excluded.lng,
  service_times = excluded.service_times,
  address = excluded.address,
  lead = excluded.lead,
  leaders = excluded.leaders,
  welcome = excluded.welcome,
  quote = excluded.quote,
  "order" = excluded."order";

-- Machine-readable schedule (weekday 0 = Sunday). Derived from the display strings
-- above; the source of truth for reminders, service_date, and live windows.
insert into public.branch_services (id, branch_id, weekday, start_time, kind, duration_min, label)
values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', 0, '12:00', 'sunday', 120, 'Sunday Worship'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', 3, '18:00', 'midweek', 90, 'Midweek Prayer'),
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000002', 0, '11:00', 'sunday', 120, 'Sunday Worship'),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000002', 3, '19:00', 'midweek', 90, 'Midweek Prayer'),
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000003', 0, '11:00', 'sunday', 120, 'Sunday Worship'),
  ('00000000-0000-4000-8000-000000000132', '00000000-0000-4000-8000-000000000003', 3, '19:00', 'midweek', 90, 'Midweek Prayer'),
  ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000004', 0, '11:00', 'sunday', 120, 'Sunday Worship'),
  ('00000000-0000-4000-8000-000000000142', '00000000-0000-4000-8000-000000000004', 3, '19:00', 'midweek', 90, 'Midweek Prayer')
on conflict (id) do update set
  branch_id = excluded.branch_id,
  weekday = excluded.weekday,
  start_time = excluded.start_time,
  kind = excluded.kind,
  duration_min = excluded.duration_min,
  label = excluded.label;

-- Giving configuration from the website's site.ts (public-by-design values shown
-- with copy buttons; server-side so bank changes never require a release, docs/spec/12).
insert into public.giving_config (id, accounts)
values (
  '00000000-0000-4000-8000-000000000201',
  '{
    "paypalUrl": "https://paypal.me/agbcglobal",
    "cancellationEmail": "oami.gospel@gmail.com",
    "currencies": {
      "gbp": {"code": "gbp", "symbol": "£", "tiers": [10, 25, 50, 100], "min": 2, "max": 10000},
      "eur": {"code": "eur", "symbol": "€", "tiers": [10, 25, 50, 100], "min": 2, "max": 10000},
      "ngn": {"code": "ngn", "symbol": "₦", "tiers": [5000, 10000, 25000, 50000], "min": 1000, "max": 5000000}
    },
    "accounts": [
      {"code": "GBP", "symbol": "£", "holder": "Amazing Grace Bible Church Global Ltd", "fields": [
        {"label": "Account number", "value": "51672549"},
        {"label": "Sort code", "value": "23-08-01"},
        {"label": "IBAN", "value": "GB81 TRWI 2308 0151 6725 49"}
      ]},
      {"code": "EUR", "symbol": "€", "holder": "Amazing Grace Bible Church Global Ltd", "fields": [
        {"label": "IBAN", "value": "BE53 9051 2105 0953"}
      ]},
      {"code": "USD", "symbol": "$", "holder": "Amazing Grace Bible Church Global Ltd", "fields": [
        {"label": "Account number", "value": "664108655887707"},
        {"label": "ACH & Wire routing", "value": "084009519"}
      ]},
      {"code": "HUF", "symbol": "Ft", "holder": "Amazing Grace Bible Church Global Ltd", "fields": [
        {"label": "Account number", "value": "12600016-10798549-03467568"}
      ]},
      {"code": "NGN", "symbol": "₦", "holder": "Olayinka Ademiluka Ministries International", "fields": [
        {"label": "Account number", "value": "1027814748"},
        {"label": "Bank", "value": "UBA"}
      ]}
    ]
  }'::jsonb
)
on conflict (id) do update set accounts = excluded.accounts;

-- Forced-update gate placeholder (docs/spec/21 §8): W1.2 reads this on launch.
-- 0.0.0 blocks nothing; raising it is a dashboard/config action, never a release.
insert into public.app_config (key, value)
values ('minimum_supported_version', '"0.0.0"'::jsonb)
on conflict (key) do nothing;
