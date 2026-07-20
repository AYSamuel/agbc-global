// Live probing (docs/spec/08). API path: search.list with eventType=live costs
// 100 quota units, so it runs ONLY inside service windows (docs/spec/21 §5
// schedules this function "around branch_services windows"; a full Sunday
// window is ~25 probes = 2,500 units against the 10,000/day quota; the nightly
// sync's 1-unit-per-page discipline is unaffected). Keyless fallback scrapes
// the channel /live page; scrape failures are INCONCLUSIVE and never clear a
// possibly-genuine live flag (the client's 15-minute stale bound is the safety
// net, docs/spec/08).

const FETCH_TIMEOUT_MS = 10_000;

export interface LiveProbe {
  liveVideoId: string | null;
  liveTitle: string | null;
  /** False when the probe could not determine state (leave flags untouched). */
  conclusive: boolean;
}

type FetchLike = typeof fetch;

export async function probeLive(
  channelId: string,
  apiKey: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<LiveProbe> {
  if (apiKey) {
    const url =
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
      `&eventType=live&maxResults=1&channelId=${channelId}&key=${apiKey}`;
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { liveVideoId: null, liveTitle: null, conclusive: false };
    const data = (await response.json()) as {
      items?: { id?: { videoId?: string }; snippet?: { title?: string } }[];
    };
    const item = data.items?.[0];
    return {
      liveVideoId: item?.id?.videoId ?? null,
      liveTitle: item?.snippet?.title ?? null,
      conclusive: true,
    };
  }

  try {
    const response = await fetchImpl(
      `https://www.youtube.com/channel/${channelId}/live`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // SOCS pre-consent cookie skips the EU consent interstitial.
        headers: { cookie: 'SOCS=CAI' },
      },
    );
    if (!response.ok) return { liveVideoId: null, liveTitle: null, conclusive: false };
    return parseLivePage(await response.text());
  } catch {
    return { liveVideoId: null, liveTitle: null, conclusive: false };
  }
}

// Exported for tests: the scrape's parsing is the fragile part, so it is pure.
export function parseLivePage(html: string): LiveProbe {
  const isLive = /"isLive"\s*:\s*true/.test(html);
  if (!isLive) {
    // A loaded page without the marker conclusively means "not live now".
    return { liveVideoId: null, liveTitle: null, conclusive: true };
  }
  const videoId =
    /"videoId"\s*:\s*"([A-Za-z0-9_-]{6,20})"/.exec(html)?.[1] ?? null;
  const title = /<meta\s+name="title"\s+content="([^"]*)"/.exec(html)?.[1] ?? null;
  return videoId
    ? { liveVideoId: videoId, liveTitle: title, conclusive: true }
    : { liveVideoId: null, liveTitle: null, conclusive: false };
}
