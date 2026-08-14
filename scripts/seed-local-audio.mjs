// Puts a playable MP3 on the LOCAL `sermon-audio` shelf and stamps two synced
// sermons with it, so the audio half of SERMON is reachable on a device after a
// reset (docs/spec/08, W3.1 slice 3). Without this, `Audio only` is dimmed on
// every message and the feature looks broken rather than unseeded.
//
// The audio is GENERATED, never committed. A ten-minute file is ~5 MB, which has
// no business in git, and `08`'s acceptance criterion is ten minutes of
// background playback, so a two-second placeholder would not test the thing.
// ffmpeg makes it in a second; without ffmpeg this skips with a note rather than
// failing, because a missing dev convenience must not break `pnpm db:reset`.
//
// Run alone: `pnpm db:seed-audio`. Pass a real sermon MP3 to use that instead:
// `node scripts/seed-local-audio.mjs path/to/message.mp3`.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'sermon-audio';
/** Long enough to prove `08`'s ten-minute background criterion. */
const MINUTES = 12;
/** Object names are `<uuid>.<ext>` by policy: no path traversal, no PII. */
const OBJECT = '00000000-0000-4000-8000-000000000001.mp3';

function have(command) {
  try {
    execSync(`${command} -version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const supplied = process.argv[2];
if (!supplied && !have('ffmpeg')) {
  console.log(
    'seed-local-audio: no ffmpeg and no file given, skipping. Audio-only will be dimmed on device; install ffmpeg or pass an MP3 path.',
  );
  process.exit(0);
}

let statusEnv;
try {
  statusEnv = execSync('supabase status -o env', { encoding: 'utf8' });
} catch {
  console.error(
    'Could not read `supabase status`. Is the local stack running? (supabase start)',
  );
  process.exit(1);
}

const key =
  statusEnv.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?$/m)?.[1] ??
  statusEnv.match(/^SECRET_KEY="?([^"\r\n]+)"?$/m)?.[1];
const url =
  statusEnv.match(/^API_URL="?([^"\r\n]+)"?$/m)?.[1] ??
  'http://127.0.0.1:55321';
if (!key) {
  console.error('No service key in `supabase status -o env` output.');
  process.exit(1);
}

let file = supplied;
let generated = null;
if (!file) {
  generated = join(tmpdir(), `agbc-dev-sermon-${String(MINUTES)}m.mp3`);
  if (!existsSync(generated)) {
    // A quiet 220 Hz tone rather than silence: on a device you have to be able
    // to HEAR that playback is running, especially with the screen off.
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=220:duration=${String(MINUTES * 60)}`,
        '-filter:a',
        'volume=0.08',
        '-b:a',
        '64k',
        '-y',
        generated,
      ],
      { stdio: 'inherit' },
    );
  }
  file = generated;
}

const bytes = readFileSync(file);

// The bucket row itself comes from the migration; this only fills it.
const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'audio/mpeg',
    'x-upsert': 'true',
  },
  body: bytes,
});
if (!upload.ok) {
  console.error(
    `upload failed: HTTP ${String(upload.status)} ${await upload.text()}`,
  );
  process.exit(1);
}

// Two rows, not all of them: the point is to see BOTH states on device, a
// message with audio and one without, and the dimmed toggle is a state too.
const patch = await fetch(
  `${url}/rest/v1/sermons?id=in.(${await twoSermonIds(url, key)})`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ audio_path: OBJECT }),
  },
);
if (!patch.ok) {
  console.error(
    `stamping audio_path failed: HTTP ${String(patch.status)} ${await patch.text()}`,
  );
  process.exit(1);
}
const stamped = await patch.json();
if (generated && generated !== supplied && process.env.KEEP_DEV_AUDIO !== '1') {
  // Kept between runs by default would be fine too; removing keeps tmp tidy and
  // regenerating costs a second.
  rmSync(generated, { force: true });
}
console.log(
  `dev audio on the shelf: ${OBJECT} (${String(Math.round(bytes.length / 1024))} KiB) on ${String(stamped.length)} sermon(s)`,
);

async function twoSermonIds(apiUrl, serviceKey) {
  const res = await fetch(
    `${apiUrl}/rest/v1/sermons?select=id&order=published_at.desc&limit=2`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!res.ok) {
    console.error(`could not read sermons: HTTP ${String(res.status)}`);
    process.exit(1);
  }
  const rows = await res.json();
  if (rows.length === 0) {
    console.error(
      'no sermons to stamp: run `pnpm db:sync-sermons` first (they are synced, never seeded).',
    );
    process.exit(1);
  }
  return rows.map((row) => row.id).join(',');
}
