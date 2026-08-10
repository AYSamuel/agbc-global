// Convert the website's course content into the app's course seed (W2.9 slice 2;
// docs/spec/02 §Academy, ADR 0017).
//
// Source of truth: Desktop/agbc's content collections. The website stores fees as
// symbol majors ("£", 25) with region overrides in MAJOR units ({ nigeria: 5000 });
// the app stores minor units + an ISO 4217 code (docs/spec/02: never symbol-in-jsonb).
// This script does that conversion ONCE, at seed-generation time, and writes
// supabase/seeds/05-courses.sql, which is COMMITTED: CI and a fresh `pnpm db:reset`
// must not depend on a sibling checkout existing.
//
// Re-run when the website's content changes:  pnpm db:convert-courses
// (set AGBC_WEBSITE_DIR if the website repo lives somewhere other than ../agbc)
//
// Courses rows are the union of the academy levels: a level with a course file gets
// the full catalog entry; an upcoming level without one still gets a row (13: "Notify
// me" needs a course_interest FK target, so upcoming levels are rows, not gaps).
// Ids are deterministic (derived from the slug) so dev fixtures can reference them
// and re-seeding is a stable upsert.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const websiteDir = path.resolve(
  repoRoot,
  process.env.AGBC_WEBSITE_DIR ?? path.join('..', 'agbc'),
);
const coursesDir = path.join(websiteDir, 'src', 'content', 'courses');
const academyDir = path.join(websiteDir, 'src', 'content', 'academy');
const outFile = path.join(repoRoot, 'supabase', 'seeds', '05-courses.sql');

// The website renders symbols; the app stores ISO codes (docs/spec/02).
const CURRENCY_BY_SYMBOL = { '£': 'GBP', '€': 'EUR', $: 'USD' };
// The website keys region overrides by a lowercase country word; the app stores
// ISO 3166-1 alpha-2 + the currency that region pays in.
const REGION_MAP = { nigeria: { countryCode: 'NG', currency: 'NGN' } };
// GBP, EUR, NGN are all two-decimal currencies (kobo included): majors × 100.
const MINOR_FACTOR = 100;

/** Deterministic uuid from a slug: stable across regenerations, valid v4 shape. */
function slugUuid(slug) {
  const hex = createHash('md5').update(`agbc-course:${slug}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function readJsonDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      slug: path.basename(f, '.json'),
      data: JSON.parse(readFileSync(path.join(dir, f), 'utf8')),
    }));
}

function sqlText(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  if (value === null || value === undefined) return 'null';
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function toMinor(major, what) {
  if (typeof major !== 'number' || !Number.isFinite(major) || major <= 0) {
    throw new Error(
      `${what}: fee amount must be a positive number, got ${major}`,
    );
  }
  return Math.round(major * MINOR_FACTOR);
}

const courseFiles = new Map(
  readJsonDir(coursesDir).map((c) => [c.slug, c.data]),
);
const academyLevels = readJsonDir(academyDir).sort(
  (a, b) => a.data.order - b.data.order,
);

const courseRows = [];
const feeRows = [];

for (const levelEntry of academyLevels) {
  const level = levelEntry.data;
  const courseSlug = level.course ?? levelEntry.slug.replace(/^\d+-/, '');
  const course = level.course ? courseFiles.get(level.course) : undefined;
  if (level.course && !course) {
    throw new Error(
      `academy level ${levelEntry.file} names missing course ${level.course}`,
    );
  }

  const id = slugUuid(courseSlug);

  if (course) {
    const currency = CURRENCY_BY_SYMBOL[course.fee.currency];
    if (!currency) {
      throw new Error(
        `${courseSlug}: unknown currency symbol ${course.fee.currency}`,
      );
    }
    courseRows.push({
      id,
      slug: courseSlug,
      name: course.name,
      level: course.level,
      levelName: course.levelName,
      step: course.step,
      summary: course.summary,
      pathwaySummary: level.summary ?? null,
      outline: course.outline,
      gains: course.gains,
      formats: {
        intensive: course.formats.intensive,
        part_time: course.formats.partTime,
      },
      prereqSlug: course.prerequisite ?? null,
      feeMinor: toMinor(course.fee.amount, courseSlug),
      feeCurrency: currency,
      feeNote: course.fee.note ?? null,
      upcoming: Boolean(level.upcoming),
      order: level.order,
    });

    for (const [region, majorAmount] of Object.entries(
      course.fee.regions ?? {},
    )) {
      const mapped = REGION_MAP[region];
      if (!mapped) {
        throw new Error(
          `${courseSlug}: unmapped fee region "${region}"; extend REGION_MAP`,
        );
      }
      feeRows.push({
        courseId: id,
        countryCode: mapped.countryCode,
        feeMinor: toMinor(majorAmount, `${courseSlug}/${region}`),
        currency: mapped.currency,
      });
    }
  } else {
    // An upcoming level with no course file yet: enough of a row for the pathway card
    // and for course_interest to point at. learn[] titles stand in as outline stubs.
    courseRows.push({
      id,
      slug: courseSlug,
      name: level.name,
      level: level.level,
      levelName: level.tag,
      step: '',
      summary: level.summary,
      pathwaySummary: level.summary,
      outline: (level.learn ?? []).map((title) => ({ title })),
      gains: [],
      formats: null,
      prereqSlug: null,
      feeMinor: null,
      feeCurrency: null,
      feeNote: null,
      upcoming: Boolean(level.upcoming),
      order: level.order,
    });
  }
}

// Prerequisites reference courses.slug: parents must land first within the statement's
// FK check, so sort prereq-free rows ahead of their dependents.
courseRows.sort(
  (a, b) => Number(Boolean(a.prereqSlug)) - Number(Boolean(b.prereqSlug)),
);

const courseValues = courseRows
  .map(
    (r) => `  (
    '${r.id}',
    ${sqlText(r.slug)},
    ${sqlText(r.name)},
    ${sqlText(r.level)},
    ${sqlText(r.levelName)},
    ${sqlText(r.step)},
    ${sqlJson(r.summary)},
    ${sqlJson(r.pathwaySummary)},
    ${sqlJson(r.outline)},
    ${sqlJson(r.gains)},
    ${sqlJson(r.formats)},
    ${sqlText(r.prereqSlug)},
    ${r.feeMinor ?? 'null'},
    ${sqlText(r.feeCurrency)},
    ${sqlJson(r.feeNote)},
    ${r.upcoming},
    ${r.order}
  )`,
  )
  .join(',\n');

const feeValues = feeRows
  .map(
    (r) =>
      `  ('${r.courseId}', ${sqlText(r.countryCode)}, ${r.feeMinor}, ${sqlText(r.currency)})`,
  )
  .join(',\n');

const sql = `-- 05-courses.sql · GENERATED by scripts/convert-course-seeds.mjs; do not edit by hand.
-- Source: the website's content collections (Desktop/agbc src/content/{academy,courses});
-- fees converted from symbol majors to minor units + ISO 4217 (docs/spec/02, ADR 0017).
-- Regenerate with: pnpm db:convert-courses

insert into public.courses
  (id, slug, name, level, level_name, step, summary, pathway_summary, outline, gains,
   formats, prereq_slug, fee_minor, fee_currency, fee_note, upcoming, "order")
values
${courseValues}
on conflict (slug) do update set
  name = excluded.name,
  level = excluded.level,
  level_name = excluded.level_name,
  step = excluded.step,
  summary = excluded.summary,
  pathway_summary = excluded.pathway_summary,
  outline = excluded.outline,
  gains = excluded.gains,
  formats = excluded.formats,
  prereq_slug = excluded.prereq_slug,
  fee_minor = excluded.fee_minor,
  fee_currency = excluded.fee_currency,
  fee_note = excluded.fee_note,
  upcoming = excluded.upcoming,
  "order" = excluded."order",
  updated_at = now();

insert into public.course_fees_regional (course_id, country_code, fee_minor, currency)
values
${feeValues}
on conflict (course_id, country_code) do update set
  fee_minor = excluded.fee_minor,
  currency = excluded.currency;
`;

writeFileSync(outFile, sql, 'utf8');
console.log(
  `wrote ${path.relative(repoRoot, outFile)}: ${courseRows.length} courses, ${feeRows.length} regional fees`,
);
