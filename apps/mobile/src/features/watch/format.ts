// Display formatting for Watch surfaces. Pure; i18n-frame values are composed
// at call sites with translated units.

export function durationMinutes(durationSec: number | null): number | null {
  if (durationSec === null || durationSec <= 0) return null;
  return Math.max(1, Math.round(durationSec / 60));
}

// "Speaker · 38 min" meta line parts; the separator matches the mockup's ·.
export function joinMeta(parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null && p !== '').join(' · ');
}

// The player's eyebrow when no series exists: the sermon's own date, localized
// (never "Latest message": an old video is not the latest, 2026-07-20).
export function formatPublishedDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
