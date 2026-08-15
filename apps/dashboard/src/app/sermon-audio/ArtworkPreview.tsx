/**
 * The picture at the shape members see it (mockup `.artprev`): 16/9, the slot a YouTube
 * thumbnail stands in. Never a filename in a row, because the reader is choosing what a
 * card LOOKS like and a name proves nothing about that.
 *
 * `plain` is the third thing that can be in the slot, and it is not an absence: it is the
 * branded navy cover the player and every rail draw for a message with no picture, so it
 * is drawn as itself rather than as an empty box.
 *
 * A bare `<img>` rather than `next/image`: the URL is a Supabase public object or a local
 * blob, the size is fixed, and the optimizer would need this host in its allowlist to earn
 * nothing at 176 pixels wide.
 *
 * The two colour values come through `var(--t-*)` rather than a Tailwind utility, which is
 * the same tokens by a different door: `themeVariables()` emits them into `:root` from
 * `packages/shared`, and neither a two-stop gradient nor a translucent overlay has a
 * utility worth minting. What matters is that no value is typed here.
 */

export interface ArtworkSubject {
  /** The public URL of what members see now, or null for the branded fallback. */
  url: string | null;
  kind: 'own' | 'youtube' | 'none';
}

export function ArtworkPreview({
  url,
  caption,
  alt,
  plain = false,
}: {
  url: string | null;
  caption: string;
  /** Never empty: which picture is on the cards is the fact the reader came for. */
  alt: string;
  plain?: boolean;
}) {
  return (
    <div
      className="relative aspect-video w-44 flex-none overflow-hidden rounded-control border border-cardline bg-alt"
      style={
        plain || url === null
          ? // entry-flow's `.pl-art.none`, the same two navies the player falls back to.
            {
              background:
                'linear-gradient(160deg, var(--t-art-from), var(--t-art-to))',
            }
          : undefined
      }
    >
      {plain || url === null ? (
        <span className="sr-only">{alt}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <span
        className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-center text-[0.56rem] font-extrabold tracking-[0.06em] uppercase"
        style={{ background: 'var(--t-tag-bg)', color: 'var(--t-on-ink)' }}
      >
        {caption}
      </span>
    </div>
  );
}
