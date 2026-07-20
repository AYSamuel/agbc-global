// Dead-man ping (docs/spec/21 §5): success pings the check, failure pings /fail
// so healthchecks records failed runs distinctly. Absent env (local dev) = no-op.
export async function pingDeadMan(
  url: string | null,
  ok: boolean,
): Promise<void> {
  if (!url) return;
  try {
    await fetch(ok ? url : `${url}/fail`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Deliberate: a monitoring outage must never fail the job itself.
  }
}
