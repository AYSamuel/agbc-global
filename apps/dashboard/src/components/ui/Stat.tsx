/**
 * The mockup's `.stats .ps`: one number and what it counts.
 *
 * Promoted when the reports inbox would have been the FOURTH private copy (the queue, the
 * requests board, the import preview). The three that existed were byte-identical apart
 * from the import panel's `bad` flag, which turns out to be the frame's own `.ps.low`, so
 * the shared component carries it as a tone rather than leaving one surface with a
 * private variant of a shared thing.
 *
 * `low` is not "error". It means this number is the one to act on: a language running out
 * of verses, a row that cannot be read, an open safeguarding flag. It borrows the red the
 * frame gives `.ps.low`, and the label still says what it is, so the meaning never rests
 * on the colour alone (`05` accessibility contract).
 *
 * Renders `dd`/`dt`, so every caller must place it inside a `dl`. The value comes first
 * visually, which is why `dd` precedes `dt`: HTML allows it, and a reader scanning a row
 * of stats reads numbers before captions.
 */
export function Stat({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: number;
  tone?: 'normal' | 'low';
}) {
  const low = tone === 'low';

  return (
    <div
      className={`min-w-36 flex-1 rounded-card border bg-card px-4 py-3 ${
        low ? 'border-[rgba(224,52,44,0.42)]' : 'border-cardline'
      }`}
    >
      <dd
        className={`font-display text-[1.35rem] font-extrabold ${
          low ? 'text-danger' : ''
        }`}
      >
        {value}
      </dd>
      <dt className="mt-0.5 text-label font-bold tracking-wide text-muted uppercase">
        {label}
      </dt>
    </div>
  );
}
