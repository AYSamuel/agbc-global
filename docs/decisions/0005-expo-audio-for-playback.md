# 0005 · expo-audio for sermon audio playback

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/08-FEATURE-Watch-SermonPlayer.md`

## Context

The audio engine needs background playback, lock-screen controls, interruption handling, and resume, inside an Expo managed workflow. `expo-av` is deprecated; community players vary in maintenance.

## Decision

`expo-audio` (the maintained successor), with the background-audio config plugin and `setActiveForLockScreen`. `expo-av` is banned in this codebase.

## Consequences

- Stays inside the managed workflow (no custom native code); follows Expo SDK upgrades.
- Play Console `mediaPlayback` declaration required at release; background + lock-screen behavior must be verified on physical devices for 10+ minutes (`08` acceptance).
