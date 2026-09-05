import type { AudioLockScreenOptions, AudioMetadata } from 'expo-audio';

/**
 * ONE player owns the lock screen, and WE own the handoff.
 *
 * WHY THIS EXISTS. On 2026-09-05 the app died on a tablet with a FATAL,
 * unhandled crash (Sentry AGBC-MOBILE-3, release 1.0.0 (22), the build then in
 * review at Google):
 *
 *     IllegalStateException: Session ID must be unique. ID=
 *       androidx.media3.session.MediaSession:781          <init>
 *       androidx.media3.session.MediaSession$Builder:508  build
 *       expo.modules.audio.service.AudioControlsService
 *           $setActivePlayerInternal$3:375                invokeSuspend
 *
 * The cause is upstream and it is a RACE, read out of expo-audio 57.0.3's own
 * source rather than guessed at. `AudioControlsService.setActivePlayerInternal`
 * releases the session it is tracking synchronously, but assigns the replacement
 * inside `appContext.mainQueue.launch { }`:
 *
 *     mediaSession?.release()              // now
 *     appContext?.mainQueue?.launch {      // later
 *       val session = MediaSession.Builder(context, sessionPlayer)...build()
 *       mediaSession = session
 *     }
 *
 * That session is built with no `setId`, so its id is the default empty string,
 * and media3 keeps a PROCESS-WIDE registry keyed by id (which is why the crash
 * message ends in a bare `ID=`). Every other session expo-audio makes is safe
 * from this: `buildBasicMediaSession` gives the player's own session a unique
 * `ExpoAudioBasicMediaSession_<hash>`. Only the lock-screen one is anonymous.
 *
 * So two activations that land before the first coroutine body runs BOTH see
 * `mediaSession == null`, both build with id "", and the second `build()`
 * throws on Android's main thread. It is thrown from a coroutine, so no
 * try/catch on our side of the bridge can ever see it: it goes straight to the
 * UncaughtExceptionHandler and takes the app down. Defusing it means never
 * asking for the second activation, which is what this module is for.
 *
 * TWO ACTIVATIONS MEANS TWO PLAYERS, because `useSermonAudio` activates once per
 * player. The app makes a second one whenever the signed URL changes identity
 * (the silent re-mint after a playback error, and the member's retry), and
 * whenever two sermon screens are mounted at once, which the focus effect in
 * `useSermonAudio` already documents happening from a deep link.
 *
 * WHY A MODULE AND NOT A HOOK CLEANUP. A cleanup can only speak for its own
 * component, and the two-screens case is exactly the one where the outgoing
 * player belongs to a DIFFERENT component that is still mounted. The lock screen
 * is process state, so its owner has to be process state too.
 *
 * The handoff is also what makes the race unreachable rather than merely
 * unlikely. When the playback service is still binding, an activation is
 * deferred, and `AudioPlaybackServiceConnection.onServiceConnected` replays it
 * only `if (player.isActiveForLockScreen)`. Standing the old player down clears
 * that flag, so its pending activation is cancelled instead of arriving late and
 * colliding with the new one.
 */

/** The slice of expo-audio's player this module touches. */
export interface LockScreenPlayer {
  setActiveForLockScreen: (
    active: boolean,
    metadata?: AudioMetadata,
    options?: AudioLockScreenOptions,
  ) => void;
}

let owner: LockScreenPlayer | null = null;

/**
 * Give this player the lock screen, taking it off whoever held it first.
 *
 * Re-activating the SAME player is passed straight through: expo-audio's
 * `setPlayerOptions` updates a session in place when the player is already the
 * active one, and standing it down first would rebuild the session for nothing,
 * which is the very thing this module exists to avoid.
 */
export function activateLockScreen(
  player: LockScreenPlayer,
  metadata: AudioMetadata,
  options: AudioLockScreenOptions,
): void {
  if (owner !== null && owner !== player) standDown(owner);
  owner = player;
  player.setActiveForLockScreen(true, metadata, options);
}

/**
 * Hand the lock screen back, if this player still holds it.
 *
 * The guard is load-bearing rather than defensive. A screen that lost the lock
 * screen to a newer one still unmounts eventually, and without the check its
 * cleanup would tear down a session that now belongs to somebody else.
 */
export function releaseLockScreen(player: LockScreenPlayer): void {
  if (owner !== player) return;
  owner = null;
  standDown(player);
}

function standDown(player: LockScreenPlayer): void {
  try {
    player.setActiveForLockScreen(false);
  } catch {
    // By unmount the player is usually already gone: expo-audio's hook
    // registered its release effect first, so its cleanup runs first, and any
    // call into a released shared object throws. A player being destroyed has
    // no lock screen to give back, so there is nothing to do and nothing to
    // report. Same hazard, and the same answer, as the pause in
    // `useSermonAudio`'s focus effect.
  }
}
