/**
 * The initials disc from the mockup's `.avatar`.
 *
 * `aria-hidden`, always: the name it abbreviates is rendered right beside it in every
 * frame that uses it, so announcing "T A" first would only make a screen reader read the
 * person twice.
 *
 * Sized in rem rather than px so it grows with the reader's own font setting; a 30px disc
 * next to text scaled to 200% is the kind of mismatch that only shows up on a real
 * machine.
 */
export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[1.875rem] flex-none place-items-center rounded-full bg-linear-to-br from-blue to-navy text-label font-bold text-on-ink"
    >
      {initials(name)}
    </span>
  );
}

/**
 * First letters of the first two words. Deliberately naive about names: it makes no
 * assumption about which part is a family name, because it does not need to and would be
 * wrong across the four countries this ministry gathers in.
 */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
