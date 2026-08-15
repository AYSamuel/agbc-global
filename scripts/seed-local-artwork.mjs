// Puts a picture on the LOCAL `sermon-artwork` shelf and stamps ONE synced sermon
// with it (docs/spec/08, W3.1 slice 5). Without this, every message on device
// shows its YouTube thumbnail and the one thing this slice changed is invisible.
//
// ONE sermon, deliberately, and the newest one that also carries dev audio: the
// state worth seeing on a device is OUR picture winning over a YouTube thumbnail
// that exists, which needs a message that has both. The message beside it keeps
// its thumbnail, so the rails show the two side by side.
//
// The audio-only case (a message with our artwork and no YouTube half at all) is
// NOT seeded on purpose: it is created through the dashboard, which is the flow
// this slice exists for and the better thing to exercise before calling it done.
//
// The picture is GENERATED, never committed, for the same reason as the audio:
// ffmpeg makes it in a second, and a binary in git is a binary to maintain.
// Without ffmpeg this skips with a note rather than failing, because a missing
// dev convenience must not break `pnpm db:reset`.
//
// Run alone: `pnpm db:seed-artwork`. Pass a real image to use that instead:
// `node scripts/seed-local-artwork.mjs path/to/cover.jpg`.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'sermon-artwork';
/** Object names are `<uuid>.<ext>` by policy: no path traversal, no PII. */
const OBJECT = '00000000-0000-4000-8000-000000000002.jpg';
/** 16/9 at the size the dashboard's hint asks for, so the seed matches the advice. */
const SIZE = '1600x900';

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
    'seed-local-artwork: no ffmpeg and no file given, skipping. Every message will show its YouTube thumbnail; install ffmpeg or pass an image path.',
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
  generated = join(tmpdir(), `agbc-dev-artwork-${SIZE}.jpg`);
  if (!existsSync(generated)) {
    // The mockup's own gold-to-navy cover (`.artprev.own`), so what lands on the
    // device is the thing the frame promised rather than a grey rectangle.
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `gradients=s=${SIZE}:c0=0xb98600:c1=0x14213d:x0=0:y0=0:x1=1600:y1=900:d=1`,
        '-frames:v',
        '1',
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
    'Content-Type': 'image/jpeg',
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

const patch = await fetch(
  `${url}/rest/v1/sermons?id=eq.${await newestWithAudio(url, key)}`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ artwork_path: OBJECT }),
  },
);
if (!patch.ok) {
  console.error(
    `stamping artwork_path failed: HTTP ${String(patch.status)} ${await patch.text()}`,
  );
  process.exit(1);
}
const stamped = await patch.json();
if (
  generated &&
  generated !== supplied &&
  process.env.KEEP_DEV_ARTWORK !== '1'
) {
  rmSync(generated, { force: true });
}
console.log(
  `dev artwork on the shelf: ${OBJECT} (${String(Math.round(bytes.length / 1024))} KiB) on ${String(stamped.length)} sermon(s)`,
);

async function newestWithAudio(apiUrl, serviceKey) {
  // Ordered the same way seed-local-audio stamps, so the two scripts agree on
  // which message is "the newest one" without either reading the other's state.
  const res = await fetch(
    `${apiUrl}/rest/v1/sermons?select=id&audio_path=not.is.null&order=published_at.desc&limit=1`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!res.ok) {
    console.error(`could not read sermons: HTTP ${String(res.status)}`);
    process.exit(1);
  }
  const rows = await res.json();
  if (rows.length === 0) {
    console.error(
      'no sermon carries audio yet: run `pnpm db:seed-audio` first (sermons are synced, never seeded).',
    );
    process.exit(1);
  }
  return rows[0].id;
}
