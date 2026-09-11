// Checks how much JavaScript the dashboard makes every page load (W4.14, `25` §5).
//
// WHY A BUDGET AND NOT A CAREFUL EYE. `~/.claude/standards/frontend.md` has asked for a JS
// budget in CI since it was written and this repo has never had one, which is how the
// dashboard arrived at W4.12 shipping 696 KB raw / 208 KB gzipped on EVERY page without
// anyone deciding to. Nothing was careless: a bundle grows one reasonable import at a time,
// each one small, and no single PR ever looks like the problem. A number in a file is the
// only thing that notices the sum.
//
// WHAT IS MEASURED, AND WHY IT IS THIS. `rootMainFiles` in the build manifest is the shared
// entry every route loads before any of its own code, so it is the one cost paid by the
// moderation queue, the sign-in page and everything between. Gzipped, because that is what
// crosses the wire; the raw number is printed too, since it is what the browser must parse
// and on a slow device parsing is the part you feel.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO. It does not budget per route: App Router splits
// per-segment and those chunks are small next to the shared entry, so a per-route budget
// would be noise around the number that matters. And it does not name chunks, because their
// filenames are content-hashed and change on every build; only the total is stable enough to
// assert on.
//
// RAISING THE BUDGET IS ALLOWED AND IS THE POINT. It is a decision, not a failure: change
// BUDGET_GZ_KB in the same PR that spends it, and say in the commit message what was bought.
// What must not happen is the number drifting up while nobody is asked.
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/dashboard/.next';
const MANIFEST = join(DIR, 'build-manifest.json');

/**
 * The ceiling, in gzipped KB, for the JavaScript every dashboard page loads.
 *
 * 208 KB measured at W4.13 (2026-09-11), so this carries about 6% of headroom: ordinary churn
 * passes, and a new library of any size does not. **128 KB of the 208 is Sentry's browser SDK**,
 * which is on the critical path against the frontend standard's rule that third parties never
 * get the main thread first. Getting it off is tracked on W4.12's deferred backlog; when that
 * lands, this number should drop a long way and this comment should say so.
 */
const BUDGET_GZ_KB = 220;

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {
  console.error(
    `Could not read ${MANIFEST}.\n` +
      'The budget is measured from a real build, so run `pnpm --filter dashboard build` first.',
  );
  process.exit(1);
}

const files = manifest.rootMainFiles ?? [];
if (files.length === 0) {
  // Not "nothing to check": the manifest changed shape under us, and a guard that quietly
  // measures an empty list would pass forever while guarding nothing.
  console.error(
    `${MANIFEST} has no rootMainFiles. The manifest shape changed; this checker needs updating.`,
  );
  process.exit(1);
}

const chunks = files.map((file) => {
  const bytes = readFileSync(join(DIR, file));
  return { file, raw: bytes.length, gz: gzipSync(bytes, { level: 9 }).length };
});

const kb = (bytes) => Math.round(bytes / 1024);
const totalGz = kb(chunks.reduce((sum, c) => sum + c.gz, 0));
const totalRaw = kb(chunks.reduce((sum, c) => sum + c.raw, 0));

console.log(
  `Dashboard shared JS: ${String(totalRaw)} KB raw / ${String(totalGz)} KB gz ` +
    `(budget ${String(BUDGET_GZ_KB)} KB gz)`,
);

if (totalGz > BUDGET_GZ_KB) {
  // The breakdown only on failure, because that is the only time anyone needs it, and it is
  // the first question they will ask.
  console.error('\nOver budget. What every page is loading, largest first:\n');
  for (const c of [...chunks].sort((a, b) => b.gz - a.gz)) {
    console.error(`  ${String(kb(c.gz)).padStart(4)} KB gz   ${c.file}`);
  }
  console.error(
    `\nTotal ${String(totalGz)} KB gz exceeds the ${String(BUDGET_GZ_KB)} KB budget by ` +
      `${String(totalGz - BUDGET_GZ_KB)} KB.\n` +
      'Either take something off the critical path, or raise BUDGET_GZ_KB in\n' +
      'scripts/check-js-budget.mjs in this PR and say in the commit message what it bought.',
  );
  process.exit(1);
}

console.log(`Within budget, ${String(BUDGET_GZ_KB - totalGz)} KB to spare.`);
