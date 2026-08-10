// Fee display (docs/spec/13, decided 2026-08-10): the chip always shows the
// course's BASE fee, and where course_fees_regional has an override the COURSE
// detail adds one note line ("₦5,000 in Nigeria"). Display truth only: the
// website recomputes its own price server-side at checkout, so the app never
// claims to know what a particular person will pay.

import type { RegionalFee } from './queries';

/**
 * Minor units + ISO code → "£25" / "₦5,000" / "£12.50". Whole amounts drop the
 * fraction digits (the mockup shows "£25", never "£25.00"); currency codes
 * arrive uppercase from courses and lowercase from Stripe rows, so normalize.
 * narrowSymbol first: Hermes' default 'symbol' display renders NGN as the code
 * ("NGN 5,000") where the frame shows "₦5,000"; the guard falls back for any
 * runtime whose partial ICU rejects the option.
 */
export function formatFeeMinor(
  feeMinor: number,
  currency: string,
  locale: string,
): string {
  const whole = feeMinor % 100 === 0;
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  };
  try {
    return new Intl.NumberFormat(locale, {
      ...options,
      currencyDisplay: 'narrowSymbol',
    }).format(feeMinor / 100);
  } catch {
    return new Intl.NumberFormat(locale, options).format(feeMinor / 100);
  }
}

/** The overrides for one course, in a stable order. */
export function regionalFeesFor(
  fees: readonly RegionalFee[] | undefined,
  courseId: string,
): RegionalFee[] {
  if (fees === undefined) return [];
  return fees
    .filter((fee) => fee.courseId === courseId)
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}
