import { copy } from '@/copy/en';

/**
 * What the shelf's redirects say when they land (the house pattern: a success redirects
 * with its outcome in the URL, so a refresh re-submits nothing).
 *
 * Lifted out of `Shelf.tsx` when the manage screen gained its own redirects (W3.1 slice 5):
 * two screens reading the same codes from two maps is a map that drifts, and an outcome
 * that renders nothing is indistinguishable from an action that did nothing.
 */
export interface SpokenOutcome {
  text: string;
  bad: boolean;
}

export const OUTCOMES: Record<string, SpokenOutcome> = {
  saved: { text: copy.sermonAudio.outcome.saved, bad: false },
  replaced: { text: copy.sermonAudio.outcome.replaced, bad: false },
  created: { text: copy.sermonAudio.outcome.created, bad: false },
  removed: { text: copy.sermonAudio.outcome.removed, bad: false },
  artwork_set: { text: copy.sermonAudio.outcome.artworkSet, bad: false },
  artwork_replaced: {
    text: copy.sermonAudio.outcome.artworkReplaced,
    bad: false,
  },
  artwork_removed: {
    text: copy.sermonAudio.outcome.artworkRemoved,
    bad: false,
  },
  no_artwork: { text: copy.sermonAudio.outcome.noArtwork, bad: false },
  no_audio: { text: copy.sermonAudio.outcome.noAudio, bad: false },
  gone: { text: copy.sermonAudio.outcome.gone, bad: false },
  audio_only: { text: copy.sermonAudio.outcome.audioOnly, bad: false },
  // The picture's byte check refusing, arriving as a redirect rather than as form state
  // because the manage screen has nothing typed to preserve. It carries its own wording
  // for that reason: the forms pair the body with a Notice title that names the problem,
  // and an alert on its own has to name it itself.
  not_image: { text: copy.sermonAudio.outcome.artworkNotImage, bad: true },
  missing: { text: copy.sermonAudio.attach.uploadFailed, bad: true },
  refused: { text: copy.sermonAudio.outcome.refused, bad: true },
  failed: { text: copy.sermonAudio.outcome.failed, bad: true },
};
