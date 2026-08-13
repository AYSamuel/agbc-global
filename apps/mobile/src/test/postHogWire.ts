// Reading PostHog's wire traffic in tests (W2.10). Extracted from the consent
// suite so the instrumentation tests read the same wire the same way, instead
// of growing a second decoder that could drift from it.
//
// These helpers exist because the suites drive the REAL posthog-react-native
// and fake only what it talks to, the network (~/.claude/standards/qa-testing.md:
// a hand-rolled stand-in for a library proves the code matches your belief
// about the library, not that it works). Reading the wire needs two things the
// SDK does not advertise, both found by instrumenting rather than guessing: it
// posts a GZIPPED Blob (a string body only for small payloads), and it batches,
// so `waitForEvent` flushes and re-reads until the event shows up rather than
// sleeping on a guessed duration.

const fetchHost = globalThis as unknown as { fetch: typeof fetch };

export interface SentRequest {
  url: string;
  body: BodyInit | null | undefined;
}

export interface BatchEvent {
  event?: string;
  properties?: Record<string, unknown>;
}

/** Spy on fetch, recording every request into `requests` and answering 200. */
export function fakeNetwork(requests: SentRequest[]) {
  return jest
    .spyOn(fetchHost, 'fetch')
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requests.push({ url, body: init?.body });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      } as Response);
    });
}

/** The other half of the fake: a network that only fails. */
export function failNetwork(error: Error) {
  return jest.spyOn(fetchHost, 'fetch').mockRejectedValue(error);
}

/** Just enough of node's zlib to gunzip, typed locally: @types/node is not in this app. */
interface Zlib {
  gunzipSync: (input: Uint8Array) => { toString: (encoding: string) => string };
}

function parseOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Decodes one request body: plain JSON, or the gzipped Blob the SDK prefers. */
async function decode(body: BodyInit | null | undefined): Promise<unknown> {
  if (typeof body === 'string') return parseOrNull(body);
  if (!(body instanceof Blob)) return null;

  const bytes = new Uint8Array(await body.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  if (raw.startsWith('{')) return parseOrNull(raw);
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const zlib = require('zlib') as Zlib;
  return parseOrNull(zlib.gunzipSync(bytes).toString('utf8'));
}

/** Every event actually posted, flattened out of the SDK's batches. */
export async function sentEvents(
  requests: readonly SentRequest[],
): Promise<BatchEvent[]> {
  const all: BatchEvent[] = [];
  for (const request of requests) {
    const payload = (await decode(request.body)) as {
      batch?: BatchEvent[];
    } | null;
    all.push(...(payload?.batch ?? []));
  }
  return all;
}

/**
 * Flush and re-read until a matching event appears, or give up. Returns it, or
 * undefined. `matches` narrows beyond the name when one test sends the same
 * event more than once.
 */
export async function waitForEvent(
  requests: readonly SentRequest[],
  flush: () => Promise<void>,
  name: string,
  matches: (event: BatchEvent) => boolean = () => true,
): Promise<BatchEvent | undefined> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const hit = (await sentEvents(requests)).find(
      (event) => event.event === name && matches(event),
    );
    if (hit) return hit;
  }
  return undefined;
}
