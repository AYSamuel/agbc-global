// Checks the store listing copy in docs/store/listing.json (W4.8, docs/spec/19).
//
// WHY A CHECKER AND NOT A CAREFUL READ. Store fields have hard character limits,
// and the console enforces them by refusing to save, which is the worst place to
// find out: it happens per locale, in a browser, at submission time, against copy
// nobody can edit thoughtfully under that pressure. Four locales times seven
// fields is 28 chances to be one character over.
//
// Two things it checks beyond length, because both have bitten this project:
//
//   THE LISTING MUST NOT PROMISE WHAT THE APP HIDES. `18`'s MVP cut defers the
//   bookstore, the library and the paid devotional plan, and W4.7 hid their doors
//   behind `apps/mobile/src/lib/features.ts` precisely because "coming soon" is
//   what App Store guideline 2.1 rejects. Listing copy is the one surface a
//   reviewer definitely reads, so a promise there is worse than a stub screen.
//   This fails on those words while the flags are false, and the item that
//   deletes a flag is expected to delete the matching guard here.
//
//   EVERY LOCALE CARRIES EVERY FIELD. A missing German subtitle is not a build
//   error anywhere; it is a listing that silently falls back to English in the
//   one place a German member decides whether to install.
import { readFileSync } from 'node:fs';

const LISTING = 'docs/store/listing.json';
const FEATURES = 'apps/mobile/src/lib/features.ts';

const doc = JSON.parse(readFileSync(LISTING, 'utf8'));
const problems = [];
const tight = [];
const fail = (what) => problems.push(what);

/** Which limit each field is measured against, per store. */
const FIELDS = {
  name: ['play.name', 'apple.name'],
  shortDescription: ['play.shortDescription'],
  subtitle: ['apple.subtitle'],
  keywords: ['apple.keywords'],
  promotionalText: ['apple.promotionalText'],
  fullDescription: ['play.fullDescription', 'apple.description'],
  releaseNotes: ['play.releaseNotes', 'apple.releaseNotes'],
};

const limitOf = (path) => {
  const [store, key] = path.split('.');
  return doc.limits[store][key];
};

const locales = Object.keys(doc.locales);
if (locales.length !== 4) {
  fail(`expected 4 locales, found ${locales.length}: ${locales.join(', ')}`);
}

for (const locale of locales) {
  const bundle = doc.locales[locale];
  for (const [field, limitPaths] of Object.entries(FIELDS)) {
    const value = bundle[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`${locale}: ${field} is missing or empty`);
      continue;
    }
    for (const path of limitPaths) {
      const limit = limitOf(path);
      // Store consoles count characters, not bytes, and count an emoji as one.
      const length = [...value].length;
      if (length > limit) {
        fail(
          `${locale}: ${field} is ${length} characters, over the ${path} limit of ${limit} by ${length - limit}`,
        );
      } else if (length > limit * 0.95) {
        // A WARNING, NOT A FAILURE. Copy that exactly fills its limit is copy no
        // reviewer can improve: the DE, NL and FR reviewers (`22` §4) are asked
        // for wording changes, and a field with one spare character refuses
        // every one of them. Surfaced so the tightness is known in advance
        // rather than discovered halfway through a review.
        tight.push(
          `${locale}: ${field} uses ${length} of ${limit} for ${path}, ${limit - length} to spare`,
        );
      }
    }
  }
}

// ------------------------------------------------- the deferred-surface guard

/**
 * Words that would promise a surface the app currently hides. Kept per flag, so
 * the item that deletes a flag deletes its entry here in the same change and the
 * copy becomes sayable rather than forbidden.
 */
const DEFERRED = {
  store: [/bookstore/i, /buchladen/i, /boekwinkel/i, /librairie/i],
  devotionalPlan: [
    /devotional/i,
    /reading plan/i,
    /andachtsplan/i,
    /leesplan/i,
    /plan de lecture/i,
  ],
};

const featuresSource = readFileSync(FEATURES, 'utf8');
for (const [flag, patterns] of Object.entries(DEFERRED)) {
  // A flag that no longer exists means the feature shipped; the guard retires
  // with it rather than forbidding copy that is now true.
  if (!new RegExp(`\\b${flag}\\b`).test(featuresSource)) continue;
  const off = new RegExp(`${flag}:\\s*false`).test(featuresSource);
  if (!off) continue;
  for (const locale of locales) {
    for (const [field, value] of Object.entries(doc.locales[locale])) {
      if (typeof value !== 'string') continue;
      for (const pattern of patterns) {
        if (pattern.test(value)) {
          fail(
            `${locale}: ${field} promises "${pattern.source}" while features.${flag} is false. The app hides that door (18's MVP cut), so the listing must not offer it.`,
          );
        }
      }
    }
  }
}

// ------------------------------------------------------------------- verdict

if (problems.length > 0) {
  console.error(`store listing: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

if (tight.length > 0) {
  console.warn(
    `store listing: ${tight.length} field(s) with almost no headroom`,
  );
  for (const one of tight) console.warn(`  ${one}`);
  console.warn('');
}

const widest = Object.keys(FIELDS).reduce((a, b) =>
  a.length > b.length ? a : b,
);
console.log(
  `store listing: ${locales.length} locales, all fields within limits.`,
);
for (const locale of locales) {
  const bundle = doc.locales[locale];
  const worst = Object.entries(FIELDS)
    .map(([field, paths]) => {
      const limit = Math.min(...paths.map(limitOf));
      return { field, used: [...bundle[field]].length, limit };
    })
    .sort((a, b) => b.used / b.limit - a.used / a.limit)[0];
  console.log(
    `  ${locale}: tightest is ${worst.field.padEnd(widest.length)} ${worst.used}/${worst.limit}`,
  );
}
