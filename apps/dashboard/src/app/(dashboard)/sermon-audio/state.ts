/**
 * The shapes the shelf's client panels and server actions exchange, in one place so the
 * two sides cannot drift (the `verses/state.ts` idiom).
 */

/** What the mint action hands the uploader: one machine-minted name, one door. */
export type MintResult =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; reason: 'refused' | 'failed' };

export type MintAction = (extension: string) => Promise<MintResult>;

/**
 * A save that failed in a way the FORM has to explain while keeping what was typed
 * (frontend.md: preserve the user's input on failure). Successes never come back this
 * way: they redirect to the shelf with the outcome in the URL, the house pattern.
 */
export type SaveProblem =
  | 'not_audio'
  // W3.1 slice 5: its own reason rather than folding into `not_audio`, because the two
  // name different files on the same form and "that file is not an MP3" over a rejected
  // picture would send the reader back to re-export the wrong thing.
  | 'not_image'
  | 'missing'
  | 'gone'
  | 'invalid'
  | 'refused'
  | 'offline'
  | 'failed';

export type SaveState =
  { status: 'idle' } | { status: 'failed'; reason: SaveProblem };

export const NOT_SAVED: SaveState = { status: 'idle' };

export type SaveAction = (
  previous: SaveState,
  formData: FormData,
) => Promise<SaveState>;
