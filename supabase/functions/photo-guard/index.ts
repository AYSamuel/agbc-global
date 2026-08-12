// photo-guard: the server opens every testimony photo before anything may point
// at it (W2.3 slice 3; docs/spec/02 §Storage, ~/.claude/standards/security.md
// §File uploads).
//
// Storage enforces the size cap and the mime ALLOWLIST, but the mime it checks is
// the one the uploader declared. This function reads the object's leading bytes
// and decides what the file actually is. On a mismatch the object is deleted
// immediately; on a pass it is recorded in `testimony_photo_validations`, and the
// testimony insert/update guards refuse any `image_path` without such a record
// (decided with Ayo 2026-07-27: skipping the check has to be a failed insert, not
// an unchecked upload).
//
// Client-called with the MEMBER's JWT, not the anon key: `verify_jwt` admits any
// project token, so the handler resolves the real user and refuses a path outside
// their own folder. Thin handler; the decisions live in core.ts (deno-tested).
//
// Logs carry the outcome and never the path: the first path segment is a member
// id (docs/spec/20).

import { createClient } from '@supabase/supabase-js';

import {
  TESTIMONY_PHOTO_BUCKET,
  type PhotoGuardError,
} from '../../../packages/shared/src/contracts/family.ts';
import { requiredEnv } from '../_shared/env.ts';
import { clientKey, createRateLimiter } from '../_shared/rateLimit.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { judge, ownsPath, parsePhotoGuard, SNIFF_BYTES } from './core.ts';

const MAX_BODY_BYTES = 4 * 1024;
const STORAGE_TIMEOUT_MS = 10_000;
// A member attaches one photo per testimony and the content quota is 5 posts per
// rolling 24h, so a legitimate caller lands here a handful of times an hour even
// after re-picking. Keyed by user id where there is one (an IP is shared by a
// whole church hall on a Sunday).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60_000;

const allowRequest = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW_MS,
});

function fail(error: PhotoGuardError, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

const admin = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Total object size from a ranged response: `bytes 0-7/12345`. Falls back to
 * content-length for a server that ignored the Range header and sent it all. */
function totalSize(response: Response): number | null {
  const range = response.headers.get('content-range');
  const fromRange = range?.split('/')[1];
  if (fromRange && fromRange !== '*') {
    const parsed = Number(fromRange);
    if (Number.isFinite(parsed)) return parsed;
  }
  const length = Number(response.headers.get('content-length') ?? '');
  return Number.isFinite(length) ? length : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('invalid', 405);

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return fail('invalid', 413);

  const jwt = (req.headers.get('authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!jwt) return fail('invalid', 401);

  const { data: caller } = await admin.auth.getUser(jwt);
  const callerId = caller.user?.id ?? null;
  // No user behind the token means the anon key: browsing never needs auth, but
  // uploading a photo does.
  if (callerId === null) return fail('invalid', 401);

  if (!allowRequest(clientKey(callerId))) {
    return Response.json(
      { ok: false, error: 'rate_limited' satisfies PhotoGuardError },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('invalid', 400);
  }

  const request = parsePhotoGuard(raw);
  if (request === null) return fail('invalid', 422);
  if (!ownsPath(request.path, callerId)) return fail('invalid', 403);

  // Ranged read: the verdict needs 8 bytes, and the object may be 5 MiB. The
  // response headers carry the total size and the declared type, so this is also
  // the only round trip needed to gather the facts.
  let head: Uint8Array;
  let response: Response;
  try {
    response = await fetch(
      `${requiredEnv('SUPABASE_URL')}/storage/v1/object/${TESTIMONY_PHOTO_BUCKET}/${request.path}`,
      {
        headers: {
          Authorization: `Bearer ${requiredEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
          Range: `bytes=0-${SNIFF_BYTES - 1}`,
        },
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.warn(`photo-guard: object unreadable (${response.status})`);
      return fail(response.status === 404 ? 'invalid' : 'failed', 404);
    }
    head = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error(
      'photo-guard: storage read failed:',
      error instanceof Error ? error.name : 'unknown',
    );
    await captureEdgeError('photo-guard', error);
    return fail('failed', 502);
  }

  const size = totalSize(response);
  const verdict = judge(
    {
      // An unreadable size is treated as over the cap rather than waved through:
      // fail closed (~/.claude/standards/backend.md).
      sizeBytes: size ?? Number.POSITIVE_INFINITY,
      declaredType: response.headers.get('content-type'),
    },
    head,
  );

  if (!verdict.ok) {
    // The object is refused, so it does not get to sit in the bucket waiting for
    // someone to find a use for it.
    const { error } = await admin.storage
      .from(TESTIMONY_PHOTO_BUCKET)
      .remove([request.path]);
    if (error) {
      console.error('photo-guard: could not delete a refused object');
    }
    console.info(`photo-guard: refused (${verdict.reason})`);
    return fail(verdict.reason, 422);
  }

  // The record is written by a SECURITY DEFINER function rather than an insert
  // from here: it reads the object's identity and version straight from
  // storage.objects, which is not exposed through the API, and which is the only
  // copy of those values that cannot have been passed through a client.
  const { error } = await admin.rpc('record_photo_validation', {
    object_name: request.path,
    content_type: verdict.contentType,
  });
  if (error) {
    console.error(`photo-guard: recording failed (${error.code ?? 'unknown'})`);
    return fail('failed', 502);
  }

  console.info('photo-guard: accepted');
  return Response.json({ ok: true });
});
