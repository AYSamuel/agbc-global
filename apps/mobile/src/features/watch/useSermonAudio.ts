import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { SKIP_SEC, skipTarget } from './audio';
import { configureAudioSession } from './audioSession';
import { shouldSave, usePlaybackStore } from './playback';
import { saveServerPosition } from './serverPosition';

// The engine behind audio mode (docs/spec/08, W3.1 slice 3). Owns the player, the
// lock screen, the resume seek and the position writes; the components above it
// only draw. Mounted ONLY in audio mode, which is why it can be a hook at all.

/** 08: write every ~10s, plus pause, exit and backgrounding. */
const SAMPLE_MS = 10_000;

export interface SermonAudioControls {
  playing: boolean;
  /** Nothing to hear yet: still loading the source, or re-buffering. */
  busy: boolean;
  /** The source failed twice, once after a fresh URL. Offer the retry. */
  failed: boolean;
  currentSec: number;
  durationSec: number;
  toggle: () => void;
  skip: (deltaSec: number) => void;
  retry: () => void;
}

export interface SermonAudioOptions {
  sermonId: string;
  signedUrl: string;
  /** Lock-screen metadata. `08` makes this mandatory on Android: without the
   * lock-screen controls bound, background audio stops after ~3 minutes. */
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** Where to start, already decided by `preferredPosition` + `resumeTarget`. */
  startAtSec: number;
  /** Members sync the position server-side; guests keep the device-local layer. */
  isMember: boolean;
  /** Mint a fresh URL. Called once, silently, on the first playback error. */
  onRemint: () => void;
}

export function useSermonAudio({
  sermonId,
  signedUrl,
  title,
  artist,
  artworkUrl,
  startAtSec,
  isMember,
  onRemint,
}: SermonAudioOptions): SermonAudioControls {
  const player = useAudioPlayer(signedUrl, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const savePosition = usePlaybackStore((s) => s.save);
  const clearPosition = usePlaybackStore((s) => s.clear);
  // Read, never written here: the tile on the screen owns the choice and the
  // store holds it, so speed has one owner and this only obeys it.
  const speed = usePlaybackStore((s) => s.speed);
  const [failed, setFailed] = useState(false);

  // The furthest known real position. Read at three moments the player itself
  // cannot answer: the seek after a re-mint (a new player starts at 0), and the
  // final write on unmount, which runs AFTER expo-audio has already released the
  // player object, so `player.currentTime` would be reading a corpse.
  const positionRef = useRef(startAtSec);
  // Keyed by player identity: a re-mint builds a NEW player, and that one needs
  // its own seek back to where the listening actually was.
  const seekedForRef = useRef<string | null>(null);
  const remintedRef = useRef(false);

  useEffect(() => {
    if (status.isLoaded && status.currentTime > 0) {
      positionRef.current = status.currentTime;
    }
  }, [status.isLoaded, status.currentTime]);

  const capture = useCallback(() => {
    const at = positionRef.current;
    if (!shouldSave(at)) return;
    savePosition(sermonId, at);
    if (isMember) void saveServerPosition(sermonId, at);
  }, [isMember, sermonId, savePosition]);

  // Configure the session, seek to the resume point, then play. All three belong
  // together and all three run again after a re-mint, because the new player
  // inherits none of it.
  useEffect(() => {
    if (!status.isLoaded) return;
    if (seekedForRef.current === player.id) return;
    seekedForRef.current = player.id;
    // A holder rather than a plain `let`: the only write is in the cleanup
    // below, which the checker cannot see from inside the closure, so a bare
    // boolean reads as permanently false there.
    const run = { cancelled: false };
    void (async () => {
      await configureAudioSession();
      // Mandatory on Android before sustained background playback, not a nicety
      // (docs/spec/08). The seek controls are the same ±15s pair the screen
      // draws, so the lock screen and the app agree on what the buttons do.
      player.setActiveForLockScreen(
        true,
        {
          title,
          artist,
          ...(artworkUrl === null ? {} : { artworkUrl }),
        },
        { showSeekForward: true, showSeekBackward: true },
      );
      if (positionRef.current > 0) await player.seekTo(positionRef.current);
      if (run.cancelled) return;
      player.play();
    })();
    return () => {
      run.cancelled = true;
    };
  }, [status.isLoaded, player, title, artist, artworkUrl]);

  // Speed is applied wherever it comes from: the tile changing it mid-listen,
  // and a fresh player inheriting the member's standing choice.
  useEffect(() => {
    if (!status.isLoaded) return;
    player.setPlaybackRate(speed);
  }, [speed, player, status.isLoaded]);

  // A playback error gets ONE silent re-mint, then the retry state. We do not
  // sniff the message for "expired": that text comes from ExoPlayer on Android
  // and AVFoundation on iOS, differs between them, and is not part of either
  // contract, so matching on it would rot silently. A fresh URL is cheap and
  // fixes the only failure we can fix from here; anything that survives it is
  // something the member has to be told about.
  useEffect(() => {
    if (status.error === null) return;
    if (remintedRef.current) {
      setFailed(true);
      return;
    }
    remintedRef.current = true;
    onRemint();
  }, [status.error, onRemint]);

  // Finished: 08 treats the end as "start over", so the stored position goes.
  useEffect(() => {
    if (!status.didJustFinish) return;
    positionRef.current = 0;
    clearPosition(sermonId);
  }, [status.didJustFinish, sermonId, clearPosition]);

  // The ~10s cadence, the backgrounding write, and the one on the way out.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') capture();
    });
    const ticker = setInterval(capture, SAMPLE_MS);
    return () => {
      capture();
      clearInterval(ticker);
      subscription.remove();
    };
  }, [capture]);

  // Leaving the SCREEN stops the audio (found on the device: opening a second
  // message from a deep link pushes a new screen and leaves the first one
  // mounted, so its sermon kept playing under a player showing something else,
  // with no control for it anywhere in the app).
  //
  // This is `useFocusEffect` and not the AppState listener above on purpose:
  // navigation blurs a screen, backgrounding the app does not, so the ten-minute
  // background promise is untouched. Pause rather than release, so coming back
  // finds the message where it was left rather than at the top.
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          player.pause();
        } catch {
          // The same cleanup also runs on UNMOUNT, and by then expo-audio has
          // already released the player (its hook registered its effect first,
          // so its cleanup runs first), where any call into the shared object
          // throws "Cannot use shared object that was already released" and
          // takes the screen down with it. A player being destroyed does not
          // need pausing; blur, the case this exists for, is unaffected.
          // Found on the device: a back-press out of the player crashed it.
        }
        capture();
      };
    }, [player, capture]),
  );

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      // 08: on pause, not only on the ticker.
      capture();
    } else {
      player.play();
    }
  }, [capture, player, status.playing]);

  const skip = useCallback(
    (deltaSec: number) => {
      const target = skipTarget(status.currentTime, deltaSec, status.duration);
      positionRef.current = target;
      void player.seekTo(target);
    },
    [player, status.currentTime, status.duration],
  );

  const retry = useCallback(() => {
    setFailed(false);
    remintedRef.current = false;
    onRemint();
  }, [onRemint]);

  return {
    playing: status.playing,
    busy: !status.isLoaded || status.isBuffering,
    failed,
    currentSec: status.currentTime,
    durationSec: status.duration,
    toggle,
    skip,
    retry,
  };
}

export { SKIP_SEC };
