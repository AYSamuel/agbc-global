// Checks that every i18n key the app asks for exists, and that every locale
// carries the forms its own language needs (docs/spec/22 §4, W4.6 slice 1).
//
// THE TWO WAYS A KEY GOES MISSING, and neither was checked before this existed.
//
// 1. A CALL SITE NAMES A KEY THAT IS NOT THERE. i18next renders the last segment
//    of the key and nothing else happens: no warning, no throw, no failing test.
//    W4.7 shipped `t('watch:title')` to a physical device, where the list header
//    drew the literal word "title" while 983 tests stayed green. Locale parity
//    could never have caught it, because the key was missing from all four
//    languages equally. This check found a second live one on its first run:
//    `t('common:loading')` on the notification centre's "show older" button.
//
// 2. A LOCALE IS MISSING A FORM ANOTHER LOCALE HAS. This is the one `22` §4 asks
//    for, and it is the one where the obvious instrument is WRONG.
//
// ON THE OBVIOUS INSTRUMENT BEING WRONG, because it decides the shape of this
// file. Comparing key sets between locales directly reports 16 missing keys and
// 3 extra ones here, and all 19 verdicts are false. English ordinals have four
// CLDR categories (1st, 2nd, 3rd, 4th); German and Dutch have exactly one and
// French has two, so `_ordinal_two` MUST be absent from German. French has a
// `many` cardinal category the other three lack, so `weeks_many` MUST exist only
// there. A check that cries wolf 19 times is a check somebody mutes, and this one
// was hiding 26 real gaps behind that noise. So the required key set is DERIVED
// per language from that language's own categories via `Intl.PluralRules`, never
// copied from English.
//
// WHY A SCRIPT RATHER THAN A JEST TEST. Half of this reads source files, and
// `apps/mobile/tsconfig.json` deliberately allows only `["jest"]` types: pulling
// `@types/node` in for a test would put `process`, `Buffer` and friends into
// scope for every app file, where they typecheck and then crash on a device.
// This is static analysis, not a unit test, and `scripts/*.mjs` is where this
// repo already keeps that.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MOBILE = 'apps/mobile';
const LOCALES = `${MOBILE}/src/i18n/locales`;
const LANGUAGES = ['en', 'de', 'nl', 'fr'];
const SOURCE_DIRS = ['app', 'src'];

// What each language declares it needs. Asserted rather than assumed: if a Node
// or ICU upgrade changes these, this line says so instead of the comparison
// below failing in a way nobody can read.
const EXPECTED_CATEGORIES = {
  en: { cardinal: 'one,other', ordinal: 'one,two,few,other' },
  de: { cardinal: 'one,other', ordinal: 'other' },
  nl: { cardinal: 'one,other', ordinal: 'other' },
  // French differs on BOTH axes: a `many` cardinal English has not, and two
  // ordinal forms where German has one.
  fr: { cardinal: 'one,many,other', ordinal: 'one,other' },
};

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;
const ORDINAL = /^(.*)_ordinal_(zero|one|two|few|many|other)$/;

const problems = [];
const fail = (what) => problems.push(what);

function categories(language) {
  return {
    cardinal: new Intl.PluralRules(language)
      .resolvedOptions()
      .pluralCategories.join(','),
    ordinal: new Intl.PluralRules(language, { type: 'ordinal' })
      .resolvedOptions()
      .pluralCategories.join(','),
  };
}

function flatten(node, prefix = '') {
  if (typeof node === 'string') return [[prefix, node]];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

const NAMESPACES = readdirSync(`${LOCALES}/en`).map((f) =>
  f.replace('.json', ''),
);

const resources = Object.fromEntries(
  LANGUAGES.map((language) => [
    language,
    Object.fromEntries(
      NAMESPACES.map((namespace) => [
        namespace,
        Object.fromEntries(
          flatten(
            JSON.parse(
              readFileSync(`${LOCALES}/${language}/${namespace}.json`, 'utf8'),
            ),
          ),
        ),
      ]),
    ),
  ]),
);

// ---------------------------------------------------------------- categories

for (const language of LANGUAGES) {
  const actual = categories(language);
  const expected = EXPECTED_CATEGORIES[language];
  if (
    actual.cardinal !== expected.cardinal ||
    actual.ordinal !== expected.ordinal
  ) {
    fail(
      `${language}: CLDR categories moved. expected cardinal ${expected.cardinal} / ordinal ${expected.ordinal}, got ${actual.cardinal} / ${actual.ordinal}`,
    );
  }
}

// -------------------------------------------------------------------- parity

/** The keys `language` must carry, given what English says exists. */
function requiredKeys(englishKeys, language) {
  const { cardinal, ordinal } = categories(language);
  const required = new Set();
  for (const key of englishKeys) {
    const asOrdinal = ORDINAL.exec(key);
    if (asOrdinal) {
      for (const category of ordinal.split(',')) {
        required.add(`${asOrdinal[1]}_ordinal_${category}`);
      }
      continue;
    }
    const asPlural = PLURAL.exec(key);
    if (asPlural) {
      for (const category of cardinal.split(',')) {
        required.add(`${asPlural[1]}_${category}`);
      }
      continue;
    }
    required.add(key);
  }
  return required;
}

for (const language of LANGUAGES.filter((l) => l !== 'en')) {
  for (const namespace of NAMESPACES) {
    const english = resources.en[namespace];
    const translated = resources[language][namespace];
    const required = requiredKeys(Object.keys(english), language);
    for (const key of required) {
      if (!(key in translated)) fail(`${language} missing ${namespace}:${key}`);
    }
    for (const key of Object.keys(translated)) {
      // Also catches a key deleted from English and left behind here.
      if (!required.has(key)) fail(`${language} has stray ${namespace}:${key}`);
    }
  }
}

// ---------------------------------------------------------------- call sites

const SKIP = /__tests__|\.test\.tsx?$|[\\/]test[\\/]/;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(path) || SKIP.test(path)) return [];
    return [path];
  });
}

const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(MOBILE, dir)));

// Without this, deleting a source directory would make the sweep pass by
// finding nothing to sweep.
if (files.length < 150) {
  fail(
    `only ${files.length} source files found; the scan is not reaching the app`,
  );
}

/** `t('key')` and `t("key")`, including i18next's `i18n.t('key')`. */
const LITERAL_CALL = /\bt\(\s*(['"])([^'"\n]+)\1/g;
/** ``t(`some.prefix.${value}`)``: the part that is fixed before the hole. */
const TEMPLATE_CALL = /\bt\(\s*`([^`$\n]+)\$\{/g;
/** Any `t(` whose first argument is not a plain literal. */
const DYNAMIC_CALL = /\bt\(\s*[`a-zA-Z_$]/g;
const DEFAULT_NS = /useTranslation\(\s*['"]([a-z]+)['"]/g;

function resolves(namespace, key) {
  const english = resources.en[namespace];
  if (!english) return false;
  if (key in english) return true;
  // A plural call site names the BASE: `t('church:branches', { count })` is
  // satisfied by `branches_one`/`branches_other`, and never by `branches`.
  return Object.keys(english).some(
    (candidate) =>
      candidate.startsWith(`${key}_`) &&
      (PLURAL.test(candidate) || ORDINAL.test(candidate)),
  );
}

let opaque = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const where = relative(MOBILE, file).replace(/\\/g, '/');
  // The namespaces this file reads bare keys from. A file that names none is
  // reading `common`, which is i18next's `defaultNS` here.
  const named = [...source.matchAll(DEFAULT_NS)].map((m) => m[1]);
  const bare = named.length > 0 ? named : ['common'];

  for (const [, , literal] of source.matchAll(LITERAL_CALL)) {
    const colon = literal.indexOf(':');
    const namespaces = colon === -1 ? bare : [literal.slice(0, colon)];
    const key = colon === -1 ? literal : literal.slice(colon + 1);
    if (!namespaces.some((namespace) => resolves(namespace, key))) {
      fail(`${where} asks for a key that is not there: ${literal}`);
    }
  }

  // A runtime-built key is not wholly unknowable. `t(`academy:status.${s}`)`
  // cannot be resolved without knowing `s`, but the fixed part in front of the
  // hole either names a real group of keys or names nothing, and the second is
  // the typo this catches. It reaches about a third of what the literal scan
  // cannot.
  for (const [, prefix] of source.matchAll(TEMPLATE_CALL)) {
    const colon = prefix.indexOf(':');
    const namespaces = colon === -1 ? bare : [prefix.slice(0, colon)];
    const stem = colon === -1 ? prefix : prefix.slice(colon + 1);
    const found = namespaces.some((namespace) =>
      Object.keys(resources.en[namespace] ?? {}).some((key) =>
        key.startsWith(stem),
      ),
    );
    if (!found) {
      fail(`${where} builds keys from a prefix nothing lives under: ${prefix}`);
    }
  }

  opaque +=
    [...source.matchAll(DYNAMIC_CALL)].length -
    [...source.matchAll(TEMPLATE_CALL)].length;
}

// Not a budget, a tripwire. These are the call sites whose key is chosen by a
// variable, a ternary or a helper, so nothing static can reach them: they are
// covered, if at all, by the tests of the screens that own them. If this moves,
// a new family of runtime-built keys exists and wants that coverage. Update it
// deliberately, never to make a build pass.
const OPAQUE_CALL_SITES = 35;
if (opaque !== OPAQUE_CALL_SITES) {
  fail(
    `${opaque} keys are built at runtime, expected ${OPAQUE_CALL_SITES}. If that is intended, update OPAQUE_CALL_SITES and say why in the commit.`,
  );
}

// ------------------------------------------------------------------- verdict

if (problems.length > 0) {
  console.error(`i18n key check: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `i18n key check: ${files.length} files, ${NAMESPACES.length} namespaces, ${LANGUAGES.length} languages, ${opaque} runtime-built keys. All good.`,
);
