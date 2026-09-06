import {
  type AudioPlayer,
  createAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useAuthStore } from '@/state/auth';

import { SKIP_SEC, seekTarget, skipTarget } from './audio';
import { configureAudioSession } from './audioSession';
import { mintSermonAudioUrl } from './audioSource';
import { activateLockScreen, releaseLockScreen } from './lockScreen';
import { shouldSave, usePlaybackStore } from './playback';
import { saveServerPosition } from './serverPosition';

/**
 * ONE player for the app's life, owned above every screen (W4.9 slice 3, frames
 * approved 2026-09-06). Until this, the player was the sermon screen's own hook,
 * paused on blur: a member who tapped back to read the verse of the day lost the
 * message. Now the screen is a VIEW of the player, and `NowPlayingBar` is the
 * way back to it from wherever they went.
 *
 * What moved here from `useSermonAudio` moved unchanged: the resume seek (the
 * newer of the two stored layers, decided by the screen and handed in as
 * `startAtSec`), the throttled position writes and the one on the way out, the
 * silent re-mint on the first playback error, the finish-means-start-over rule,
 * and the speed the store holds. What changed is who owns the LOCK SCREEN.
 *
 * THE LOCK SCREEN HAS EXACTLY ONE OWNER, AND THE HANDOFF IS OURS (PR #252,
 * `lockScreen.ts`). Loading a second message replaces the first, and that
 * replacement is the two-player handoff that killed the app on 2026-09-05: the
 * outgoing player is stood down (`releaseLockScreen`) BEFORE the incoming one
 * activates, and the same stand-down runs on dismiss, on sign-out, on deletion
 * and when this provider unmounts. The release effect is keyed on the player
 * alone, never on its metadata: a title or a picture changing must update the
 * session in place (`updateLockScreenMetadata`), never rebuild it, or the race
 * is back.
 *
 * ONE WRITER FOR THE POSITION. This provider writes the local and server
 * position; the screens read. A second writer was the W2.4 lesson and the rule
 * in CLAUDE.md, and it is why the sermon screen keeps no position of its own
 * for audio any more.
 */

/** 08: write every ~10s, plus pause, exit and backgrounding. */
const SAMPLE_MS = 10_000;

export interface NowPlayingItem {
  sermonId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** The object path, for the silent re-mint after a playback error. */
  audioPath: string;
  signedUrl: string;
}

export interface NowPlayingStatus {
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  error: string | null;
}

const IDLE: NowPlayingStatus = {
  playing: false,
  isLoaded: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
  error: null,
};

export interface NowPlayingValue {
  /** What is loaded, or null when nothing is: the bar is absent then. */
  item: NowPlayingItem | null;
  status: NowPlayingStatus;
  /** The source failed twice, once after a fresh URL. Offer the retry. */
  failed: boolean;
  /**
   * Load a message. The same message is a no-op that keeps playing; a
   * different one replaces the first, which is the handoff described above.
   */
  load: (item: NowPlayingItem, options: { startAtSec: number }) => void;
  /**
   * The loaded message's facts changed under it (a title corrected on the
   * dashboard, a picture added): the lock screen follows, in place.
   */
  refreshMetadata: (
    facts: Pick<NowPlayingItem, 'title' | 'artist' | 'artworkUrl'>,
  ) => void;
  toggle: () => void;
  skip: (deltaSec: number) => void;
  seekTo: (sec: number) => void;
  retry: () => void;
  /** Stop, write the position, and unload: the bar goes away. */
  stop: () => void;
}

const NowPlayingContext = createContext<NowPlayingValue | null>(null);

interface Loaded {
  item: NowPlayingItem;
  player: AudioPlayer;
}

/** Played to the end: the finish flag, or a position sitting on the duration. */
function atEnd(status: NowPlayingStatus): boolean {
  return (
    status.didJustFinish ||
    (status.duration > 0 && status.currentTime >= status.duration - 0.5)
  );
}

/**
 * Subscribes to one player's status and reports it up. A component rather than
 * a hook in the provider, because `useAudioPlayerStatus` needs a player to
 * subscribe to and the provider spends most of the app's life without one.
 */
function StatusBridge({
  player,
  onStatus,
}: {
  player: AudioPlayer;
  onStatus: (status: NowPlayingStatus) => void;
}) {
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    onStatus({
      playing: status.playing,
      isLoaded: status.isLoaded,
      isBuffering: status.isBuffering,
      currentTime: status.currentTime,
      duration: status.duration,
      didJustFinish: status.didJustFinish,
      error: status.error,
    });
  }, [status, onStatus]);
  return null;
}

/** Release a native player that may already be gone; see `lockScreen.ts`. */
function removePlayer(player: AudioPlayer): void {
  try {
    player.remove();
  } catch {
    // Already released by expo-audio: nothing to give back, nothing to report.
  }
}

export function NowPlayingProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<NowPlayingStatus>(IDLE);
  const [failed, setFailed] = useState(false);
  const isMember = useAuthStore((s) => s.status === 'member');
  const authStatus = useAuthStore((s) => s.status);
  const savePosition = usePlaybackStore((s) => s.save);
  const clearPosition = usePlaybackStore((s) => s.clear);
  const speed = usePlaybackStore((s) => s.speed);

  // The furthest known real position. Read at the moments the player itself
  // cannot answer: the seek after a re-mint (a new player starts at 0) and the
  // final write on stop, which runs after the native object is released.
  const positionRef = useRef(0);
  // Keyed by player identity: a re-mint builds a NEW player, and that one needs
  // its own session, lock screen and seek back to where the listening was.
  const activatedForRef = useRef<string | null>(null);
  const remintedRef = useRef(false);
  // The callbacks below are stable so consumers can key effects on them; they
  // read what is loaded through this ref, kept current after every commit.
  const loadedRef = useRef<Loaded | null>(null);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  const player = loaded?.player ?? null;
  const item = loaded?.item ?? null;
  const sermonId = item?.sermonId ?? null;

  useEffect(() => {
    if (status.isLoaded && status.currentTime > 0) {
      positionRef.current = status.currentTime;
    }
  }, [status.isLoaded, status.currentTime]);

  const capture = useCallback(() => {
    if (sermonId === null) return;
    const at = positionRef.current;
    if (!shouldSave(at)) return;
    savePosition(sermonId, at);
    if (isMember) void saveServerPosition(sermonId, at);
  }, [isMember, sermonId, savePosition]);

  /** Stand the current player down: position written, lock screen back, native object gone. */
  const unload = useCallback(() => {
    const current = loadedRef.current;
    if (!current) return;
    capture();
    releaseLockScreen(current.player);
    removePlayer(current.player);
    activatedForRef.current = null;
    setLoaded(null);
    setStatus(IDLE);
    setFailed(false);
  }, [capture]);

  const stop = useCallback(() => {
    unload();
  }, [unload]);

  const load = useCallback<NowPlayingValue['load']>(
    (next, { startAtSec }) => {
      const current = loadedRef.current;
      if (current && current.item.sermonId === next.sermonId) {
        // The same message, opened again: keep playing where it is. A fresher
        // signed URL is kept for the re-mint path and nothing else.
        setLoaded({
          item: { ...current.item, signedUrl: next.signedUrl },
          player: current.player,
        });
        return;
      }
      // The handoff: the outgoing player is stood down before the incoming
      // one exists, so two activations can never be live together.
      unload();
      positionRef.current = startAtSec;
      remintedRef.current = false;
      const created = createAudioPlayer(next.signedUrl, {
        updateInterval: 500,
      });
      setLoaded({ item: next, player: created });
    },
    [unload],
  );

  // Configure the session, bind the lock screen and seek to the resume point,
  // once per player. What deliberately does NOT happen here is playing
  // (2026-08-15, Ayo's call): loading a message is choosing it, not pressing
  // play, and a message that starts talking by itself is talking to a room that
  // did not ask for it.
  useEffect(() => {
    if (!player || !item || !status.isLoaded) return;
    if (activatedForRef.current === player.id) return;
    activatedForRef.current = player.id;
    const run = { cancelled: false };
    void (async () => {
      await configureAudioSession();
      if (run.cancelled) return;
      // Mandatory on Android before sustained background playback (docs/spec/08).
      activateLockScreen(
        player,
        {
          title: item.title,
          artist: item.artist,
          ...(item.artworkUrl === null ? {} : { artworkUrl: item.artworkUrl }),
        },
        { showSeekForward: true, showSeekBackward: true },
      );
      if (positionRef.current > 0) await player.seekTo(positionRef.current);
    })();
    return () => {
      run.cancelled = true;
    };
    // `item` is read for the metadata but is deliberately not a dependency:
    // its later changes go through `refreshMetadata`, in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isLoaded, player]);

  // Hand the lock screen back when this player goes away. Keyed on the PLAYER
  // alone (see the module comment and `lockScreen.ts`).
  useEffect(() => {
    if (!player) return;
    return () => {
      releaseLockScreen(player);
    };
  }, [player]);

  // The lock screen follows a metadata change in place. Found by #252: the app
  // had never called this, so a picture added to a message someone was
  // listening to stayed stale until the player was rebuilt. Re-activating to
  // refresh is exactly what must never happen.
  const refreshMetadata = useCallback<NowPlayingValue['refreshMetadata']>(
    (facts) => {
      const current = loadedRef.current;
      if (!current) return;
      const before = current.item;
      if (
        before.title === facts.title &&
        before.artist === facts.artist &&
        before.artworkUrl === facts.artworkUrl
      ) {
        return;
      }
      setLoaded({ item: { ...before, ...facts }, player: current.player });
      if (activatedForRef.current !== current.player.id) return;
      try {
        current.player.updateLockScreenMetadata({
          title: facts.title,
          artist: facts.artist,
          ...(facts.artworkUrl === null
            ? {}
            : { artworkUrl: facts.artworkUrl }),
        });
      } catch {
        // A released player has no lock screen to update.
      }
    },
    [],
  );

  // Speed is applied wherever it comes from: the tile changing it mid-listen,
  // and a fresh player inheriting the member's standing choice.
  useEffect(() => {
    if (!player || !status.isLoaded) return;
    player.setPlaybackRate(speed);
  }, [speed, player, status.isLoaded]);

  // A playback error gets ONE silent re-mint, then the retry state. The fresh
  // URL means a fresh player, which inherits the position through the ref.
  const remint = useCallback(() => {
    const current = loadedRef.current;
    if (!current) return;
    void mintSermonAudioUrl(current.item.audioPath)
      .then((signedUrl) => {
        const still = loadedRef.current;
        if (!still || still.item.sermonId !== current.item.sermonId) return;
        releaseLockScreen(still.player);
        removePlayer(still.player);
        activatedForRef.current = null;
        const created = createAudioPlayer(signedUrl, { updateInterval: 500 });
        setLoaded({ item: { ...still.item, signedUrl }, player: created });
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    if (status.error === null) return;
    if (remintedRef.current) {
      setFailed(true);
      return;
    }
    remintedRef.current = true;
    remint();
  }, [status.error, remint]);

  // Finished: 08 treats the end as "start over", so the stored position goes.
  useEffect(() => {
    if (!status.didJustFinish || sermonId === null) return;
    positionRef.current = 0;
    clearPosition(sermonId);
  }, [status.didJustFinish, sermonId, clearPosition]);

  // The ~10s cadence and the backgrounding write, while something is loaded.
  useEffect(() => {
    if (!player) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') capture();
    });
    const ticker = setInterval(capture, SAMPLE_MS);
    return () => {
      capture();
      clearInterval(ticker);
      subscription.remove();
    };
  }, [player, capture]);

  // Sign-out and deletion both land on `guest`; the listening goes with the
  // rest of the member's state (`03`, `16`).
  const wasMemberRef = useRef(authStatus === 'member');
  useEffect(() => {
    if (wasMemberRef.current && authStatus === 'guest') unload();
    wasMemberRef.current = authStatus === 'member';
  }, [authStatus, unload]);

  // The provider's own unmount: the app is going away, the position is written
  // and the lock screen handed back.
  useEffect(() => {
    return () => {
      unload();
    };
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => {
    if (!player) return;
    if (status.playing) {
      player.pause();
      // 08: on pause, not only on the ticker.
      capture();
    } else if (atEnd(status)) {
      // 08 treats the end as "start over", and the native player does not:
      // `play()` on a finished player stays put (found on the tablet,
      // 2026-09-06, the bar's disc doing nothing after a message ended). The
      // stored position is already cleared; the player has to be moved too.
      positionRef.current = 0;
      void player.seekTo(0).then(() => {
        player.play();
      });
    } else {
      player.play();
    }
  }, [capture, player, status]);

  const skip = useCallback(
    (deltaSec: number) => {
      if (!player) return;
      const target = skipTarget(status.currentTime, deltaSec, status.duration);
      positionRef.current = target;
      void player.seekTo(target);
    },
    [player, status.currentTime, status.duration],
  );

  const seekTo = useCallback(
    (sec: number) => {
      if (!player) return;
      const target = seekTarget(sec, status.duration);
      positionRef.current = target;
      void player.seekTo(target);
    },
    [player, status.duration],
  );

  const retry = useCallback(() => {
    setFailed(false);
    remintedRef.current = false;
    remint();
  }, [remint]);

  const value = useMemo<NowPlayingValue>(
    () => ({
      item,
      status,
      failed,
      load,
      refreshMetadata,
      toggle,
      skip,
      seekTo,
      retry,
      stop,
    }),
    [
      item,
      status,
      failed,
      load,
      refreshMetadata,
      toggle,
      skip,
      seekTo,
      retry,
      stop,
    ],
  );

  return (
    <NowPlayingContext.Provider value={value}>
      {player ? (
        <StatusBridge key={player.id} player={player} onStatus={setStatus} />
      ) : null}
      {children}
    </NowPlayingContext.Provider>
  );
}

export function useNowPlaying(): NowPlayingValue {
  const value = useContext(NowPlayingContext);
  if (!value) {
    throw new Error('useNowPlaying needs NowPlayingProvider above it');
  }
  return value;
}

export { SKIP_SEC };
