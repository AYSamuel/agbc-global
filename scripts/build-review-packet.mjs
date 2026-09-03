// Builds a translation review packet for one language (W4.8 slice 7, `22` §4).
//
// `22` §4 names a reviewer per language and asks the data-protection contact to
// read the legal strings in all four before release. Neither happens if the ask
// is "please check the app": a reviewer needs the words, next to the English
// they came from, in one file they can mark up and send back.
//
// TWO THINGS DECIDE THE SHAPE.
//
//   THE LEGAL STRINGS COME FIRST, and they are the ones with a named owner in
//   `20`. A reviewer who runs out of time should have spent it on the consent
//   step, the privacy summary and the deletion copy rather than on tab labels.
//
//   IT SHOWS THE ENGLISH BESIDE EVERY LINE. A reviewer who cannot see the source
//   is guessing at intent, and the commonest bad translation here would be one
//   that reads beautifully and says something the English does not.
//
// Usage: node scripts/build-review-packet.mjs <de|nl|fr>
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const LOCALES = 'apps/mobile/src/i18n/locales';
const OUT_DIR = 'docs/store';

const language = process.argv[2];
const NAMES = { de: 'German', nl: 'Dutch', fr: 'French' };
if (!Object.hasOwn(NAMES, language)) {
  console.error('Usage: node scripts/build-review-packet.mjs <de|nl|fr>');
  process.exit(1);
}

/** The register each language settled on (W4.6 slice 4). */
const REGISTER = {
  de: '`du`, never `Sie`',
  nl: '`je`, never `u`',
  fr: '`tu`, never `vous` (settled 2026-09-03; two plural-you exceptions are allowlisted in the checker)',
};

const flatten = (node, prefix = '') =>
  typeof node === 'string'
    ? [[prefix, node]]
    : Object.entries(node).flatMap(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k),
      );

const load = (lang, ns) =>
  Object.fromEntries(
    flatten(JSON.parse(readFileSync(`${LOCALES}/${lang}/${ns}.json`, 'utf8'))),
  );

const namespaces = readdirSync(`${LOCALES}/en`).map((f) =>
  f.replace('.json', ''),
);

/**
 * The strings `20` and `22` §4 call legal: what somebody consents to, what the
 * app says it collects, and what deleting an account does. Matched on key rather
 * than listed by hand so a new consent string joins the priority section by
 * being named like one.
 */
const LEGAL = [
  /^settings:privacyScreen\./,
  /^settings:delete\./,
  /^settings:analytics\./,
  /^family:consent/,
  /^family:errorConsentStale/,
  /^common:onboarding\.legal/,
  /^common:onboarding\.(terms|privacy)$/,
  /^auth:(emailNote|ageInvalid|agePrompt|profileLead)$/,
];

const rows = [];
for (const ns of namespaces) {
  const english = load('en', ns);
  const target = load(language, ns);
  for (const [key, source] of Object.entries(english)) {
    const id = `${ns}:${key}`;
    const translated = target[key];
    if (translated === undefined) continue; // plural forms this language lacks
    rows.push({
      id,
      ns,
      source,
      translated,
      legal: LEGAL.some((p) => p.test(id)),
      identical: translated === source,
    });
  }
}

const legalRows = rows.filter((r) => r.legal);
const otherRows = rows.filter((r) => !r.legal);
const identicalCount = rows.filter((r) => r.identical).length;

const cell = (s) => s.replaceAll('|', '\\|').replaceAll('\n', '<br>');

function table(list) {
  const out = ['| Key | English | ' + NAMES[language] + ' |', '|---|---|---|'];
  for (const r of list) {
    const flag = r.identical ? ' _(unchanged from English)_' : '';
    out.push(
      `| \`${r.id}\` | ${cell(r.source)} | ${cell(r.translated)}${flag} |`,
    );
  }
  return out.join('\n');
}

const doc = `# ${NAMES[language]} review packet

Every string the app shows in ${NAMES[language]}, beside the English it came from.
Generated from the app itself, so it cannot drift from what ships:
\`node scripts/build-review-packet.mjs ${language}\`.

**${rows.length} strings.** ${legalRows.length} of them are legal or consent copy and are in
the first table, because those are the ones \`20\` asks the data-protection contact to read in
every language.

## What we need from you

1. **Correctness first, then tone.** A line that reads well and means something the English
   does not is the failure that matters; an awkward but accurate line is fixable later.
2. **The register is settled**: ${REGISTER[language]}. Please keep it rather than changing it
   back, and tell us if it reads wrong for a church audience rather than editing line by line.
3. **Leave \`{{placeholders}}\` and \`<1>tags</1>\` exactly as they are.** They are replaced at
   runtime with names, counts and branch names. Moving them around a sentence is fine and often
   necessary; deleting or renaming one breaks the line.
4. **Some lines are meant to be identical to English** and are marked: proper nouns
   (\`AGBC Global\`, \`Grace Academy\`, \`PayPal\`), lines that are only a placeholder, and real
   cognates. ${identicalCount} lines are flagged that way. Please only query the ones that look
   wrong, rather than translating them all.
5. **Send it back however suits you**: this file with edits, a list of keys and corrections, or
   a call while somebody types.

## Legal and consent copy (please read this table first)

These are what somebody agrees to before sharing a testimony, what the app says it collects,
and what deleting an account does.

${table(legalRows)}

## Everything else, by screen

${table(otherRows)}
`;

mkdirSync(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}/review-packet-${language}.md`;
writeFileSync(out, doc, 'utf8');
console.log(
  `${out}: ${rows.length} strings (${legalRows.length} legal, ${identicalCount} identical to English)`,
);
