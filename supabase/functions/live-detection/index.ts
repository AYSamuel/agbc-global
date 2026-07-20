// Live detection (docs/spec/08, 21 §5): runs every 5 minutes; outside every
// service window it only clears leftover flags and exits WITHOUT touching
// YouTube (quota discipline). Inside a window it probes, stamps the live row
// (is_live + live_checked_at), and clears the rest. Inconclusive probes leave
// flags for the client's 15-minute stale bound to expire.

import { createClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { probeLive } from './live.ts';
import { isWithinServiceWindow, type ServiceWindow } from './windows.ts';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_LIVE_DETECTION');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: hq, error: hqError } = await supabase
      .from('branches')
      .select('id, timezone, youtube_channel_id, branch_services(weekday, start_time, duration_min)')
      .eq('is_hq', true)
      .not('youtube_channel_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (hqError) throw new Error(`branches read failed: ${hqError.message}`);

    const channelId = (hq?.youtube_channel_id as string | undefined) ?? null;
    const services: ServiceWindow[] = (
      (hq?.branch_services as
        | { weekday: number; start_time: string; duration_min: number }[]
        | undefined) ?? []
    ).map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMin: s.duration_min,
    }));

    const now = new Date();
    const inWindow =
      channelId !== null &&
      services.length > 0 &&
      isWithinServiceWindow(now, (hq?.timezone as string) ?? 'UTC', services);

    let liveVideoId: string | null = null;
    let flagsCleared = 0;

    if (!inWindow) {
      // Outside every window nothing can legitimately be live: clear leftovers.
      const { data: cleared, error } = await supabase
        .from('sermons')
        .update({ is_live: false, live_checked_at: now.toISOString() })
        .eq('is_live', true)
        .select('id');
      if (error) throw new Error(`flag clear failed: ${error.message}`);
      flagsCleared = cleared?.length ?? 0;
    } else {
      const probe = await probeLive(channelId, optionalEnv('YOUTUBE_API_KEY'));

      if (probe.conclusive && probe.liveVideoId) {
        liveVideoId = probe.liveVideoId;
        // Ensure the row exists (title refines at the nightly sync), then stamp.
        const { error: upsertError } = await supabase.rpc('sync_upsert_sermons', {
          rows: [
            {
              youtube_id: probe.liveVideoId,
              title: probe.liveTitle ?? 'Live service',
              published_at: now.toISOString(),
              thumbnail_url: `https://i.ytimg.com/vi/${probe.liveVideoId}/hqdefault.jpg`,
              duration_sec: null,
            },
          ],
        });
        if (upsertError) {
          throw new Error(`live upsert failed: ${upsertError.message}`);
        }
        const { error: stampError } = await supabase
          .from('sermons')
          .update({ is_live: true, live_checked_at: now.toISOString() })
          .eq('youtube_id', probe.liveVideoId);
        if (stampError) {
          throw new Error(`live stamp failed: ${stampError.message}`);
        }
        const { data: cleared, error: clearError } = await supabase
          .from('sermons')
          .update({ is_live: false, live_checked_at: now.toISOString() })
          .eq('is_live', true)
          .neq('youtube_id', probe.liveVideoId)
          .select('id');
        if (clearError) {
          throw new Error(`other-flag clear failed: ${clearError.message}`);
        }
        flagsCleared = cleared?.length ?? 0;
      } else if (probe.conclusive) {
        const { data: cleared, error } = await supabase
          .from('sermons')
          .update({ is_live: false, live_checked_at: now.toISOString() })
          .eq('is_live', true)
          .select('id');
        if (error) throw new Error(`flag clear failed: ${error.message}`);
        flagsCleared = cleared?.length ?? 0;
      }
      // Inconclusive: leave flags; the client stale bound covers dead air.
    }

    await pingDeadMan(healthcheckUrl, true);
    return Response.json({
      inServiceWindow: inWindow,
      channelId,
      liveVideoId,
      flagsCleared,
    });
  } catch (error) {
    console.error('live-detection failed:', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'live detection run failed' }, { status: 500 });
  }
});
