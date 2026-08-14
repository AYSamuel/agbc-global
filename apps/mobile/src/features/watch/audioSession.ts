import { setAudioModeAsync } from 'expo-audio';

/**
 * The audio session (docs/spec/08). `shouldPlayInBackground` is only half the
 * promise; the other half is `setActiveForLockScreen` on the player itself,
 * without which Android stops the audio after about three minutes with the screen
 * off. `doNotMix` is required for the lock-screen controls to bind to our player
 * at all (expo-audio's own note on `setActiveForLockScreen`), and it happens to be
 * the right posture for a sermon anyway: this is speech to listen to, not a sound
 * effect to layer over somebody's music.
 *
 * Its own module so `audio.ts` can stay import-free and unit-testable; the native
 * module is the only reason this line needs a device.
 *
 * Idempotent, and called on each entry into audio mode rather than once at
 * startup: the session is global state that another screen could have changed.
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
}
