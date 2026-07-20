-- 10-dev-only.sql · fixture data for local/dev ONLY: never applied to prod.
-- Prod seeding goes through the reviewed step in docs/spec/19 instead.
--
-- No sermon fixtures (removed 2026-07-20 on Ayo's direction): the youtube-sync
-- function fills real channel data on dev, and fake titles polluted the Watch
-- surfaces. pgTAP suites create their own rows (qa standard: builders over
-- shared fixtures). Pre-approved testimonies/prayers land here at W1.5.

-- Daily verses (W1.4): 90 date-relative days so the rollover, the "no verse
-- today" fallback, and the queue monitor (docs/spec/21 §5) all have data. Real
-- content comes from the pastor's quarterly batch via the dashboard
-- (docs/spec/22); this pool cycles verified WEB text (public domain).
with pool (idx, reference, verse_text) as (
  values
    (0, 'Psalm 23:1', 'Yahweh is my shepherd: I shall lack nothing.'),
    (1, 'Philippians 4:19', 'And my God will supply every need of yours according to his riches in glory in Christ Jesus.'),
    (2, 'Romans 8:28', 'We know that all things work together for good for those who love God, to those who are called according to his purpose.'),
    (3, 'Isaiah 41:10', 'Don''t you be afraid, for I am with you. Don''t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.'),
    (4, 'Philippians 4:6', 'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.'),
    (5, 'Philippians 4:7', 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.'),
    (6, 'Psalm 23:4', 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.'),
    (7, 'Romans 8:31', 'What then shall we say about these things? If God is for us, who can be against us?'),
    (8, 'Philippians 4:13', 'I can do all things through Christ, who strengthens me.'),
    (9, 'Psalm 23:6', 'Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh''s house forever.'),
    (10, 'Romans 8:37', 'No, in all these things, we are more than conquerors through him who loved us.'),
    (11, 'Philippians 4:4', 'Rejoice in the Lord always! Again I will say, "Rejoice!"'),
    (12, 'Romans 8:32', 'He who didn''t spare his own Son, but delivered him up for us all, how would he not also with him freely give us all things?'),
    (13, 'Psalm 23:2', 'He makes me lie down in green pastures. He leads me beside still waters.'),
    (14, 'Philippians 4:8', 'Finally, brothers, whatever things are true, whatever things are honorable, whatever things are just, whatever things are pure, whatever things are lovely, whatever things are of good report; if there is any virtue, and if there is any praise, think about these things.'),
    (15, 'Romans 8:39', 'nor height, nor depth, nor any other created thing, will be able to separate us from God''s love, which is in Christ Jesus our Lord.'),
    (16, 'Psalm 23:3', 'He restores my soul. He guides me in the paths of righteousness for his name''s sake.'),
    (17, 'Philippians 4:5', 'Let your gentleness be known to all men. The Lord is at hand.'),
    (18, 'Romans 8:34', 'Who is he who condemns? It is Christ who died, yes rather, who was raised from the dead, who is at the right hand of God, who also makes intercession for us.'),
    (19, 'Philippians 4:9', 'The things which you learned, received, heard, and saw in me: do these things, and the God of peace will be with you.')
),
-- A week of history plus 82 future days: exercises "today" and leaves the
-- queue monitor comfortably above its 14-day floor.
days (offset_days) as (
  select generate_series(-7, 82)
)
insert into public.daily_verses (date, reference, text, translation, language)
select
  current_date + d.offset_days,
  p.reference,
  p.verse_text,
  'WEB',
  'en'
from days d
join pool p on p.idx = (((d.offset_days % 20) + 20) % 20)
on conflict (date, language) do nothing;
