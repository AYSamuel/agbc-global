#!/usr/bin/env node
/*
 * PreToolUse(Edit|Write) hook for THIS project only (registered in the repo's
 * .claude/settings.json, so it never runs outside agbc-global).
 * Fires the first time each mobile UI surface (a .tsx under apps/mobile/app,
 * src/features, or src/components) is edited in a session, and injects the
 * mockup-first rule: read the screen's frame in entry-flow.html FIRST-HAND
 * before building. Summaries of the mockup (subagent reports, 05 prose,
 * memory) are never the reference; W1.1, W1.5, and W1.6 all drifted that way.
 * Deterministic (the harness runs it), so it can't be skipped like CLAUDE.md
 * prose. Non-blocking by design: every failure path exits 0. Dependency-free.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function done(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  done();
}

let data = {};
try {
  data = JSON.parse(raw || '{}');
} catch {
  done();
}

const ti = data.tool_input || {};
const file = ti.file_path || ti.path || '';
const sid = data.session_id || 'nosession';
if (!file) done();

// Normalize: lowercase + forward slashes (so Windows backslash paths match).
const lc = String(file).toLowerCase().replace(/\\/g, '/');

// UI surfaces only: screens/routes, feature components, shared primitives.
// Tests and non-tsx logic files (queries.ts, format.ts) have no visual truth.
const isUiSurface =
  /apps\/mobile\/(app|src\/features|src\/components)\/.*\.tsx$/.test(lc);
const isTest = /(\.test\.|\/__tests__\/)/.test(lc);
if (!isUiSurface || isTest) done();

// Once-per-(session, file) markers live in the system temp dir: nothing global,
// nothing written into the repo tree.
const cacheDir = path.join(os.tmpdir(), 'agbc-global-mockup-reminders');
try {
  fs.mkdirSync(cacheDir, { recursive: true });
} catch {
  /* ignore */
}

// Prune markers from sessions older than 7 days so the cache never grows unbounded.
try {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(cacheDir)) {
    const p = path.join(cacheDir, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
} catch {
  /* ignore */
}

// Remind once per (session, file): the first touch of a screen file is exactly
// when its frame must be read.
const rel = lc.slice(lc.indexOf('apps/mobile/'));
const marker = path.join(
  cacheDir,
  `${String(sid).replace(/[^a-zA-Z0-9_.-]/g, '_')}.${rel.replace(/[^a-zA-Z0-9_.-]/g, '_')}`,
);
if (fs.existsSync(marker)) done();
try {
  fs.writeFileSync(marker, '');
} catch {
  /* ignore */
}

const msg =
  `Mockup check (${rel}): this is a mobile UI surface. If it has a frame in ` +
  `docs/spec/design/mockups/entry-flow.html, you MUST have Read that frame's HTML + CSS ` +
  `first-hand in THIS session before building it; a subagent's summary, 05's prose, or ` +
  `memory of the frame is research, never the reference (W1.1, W1.5, W1.6 all drifted ` +
  `this way). Before the surface counts as done, diff it element-by-element against the ` +
  `frame's actual CSS: colors, type sizes, gradients, spacing, static vs data-driven ` +
  `regions, selected/edge states. If it has no frame, flag it to Ayo and compose from ` +
  `the mockup's existing classes (project CLAUDE.md conventions).`;

done({
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg },
});
