// Plain JS on purpose: eas-cli's bundled config reader (21.x) cannot evaluate a
// TypeScript app.config during the SDK 57 transition; JSDoc keeps editor typing.
//
// App identity is FROZEN (docs/spec/19, ADR 0002): this app replaces Grace Portal on
// the existing store listings. Never change package/bundleIdentifier, never let
// tooling regenerate credentials, never create new store records. versionCode floor
// is 20 (highest Grace Portal upload is 19).

// Sourcemap upload needs an org and a project, and the plugin fails a build when it has
// neither. Conditional so a local prebuild and anyone else's checkout still work: the
// plugin joins in only where SENTRY_ORG + SENTRY_PROJECT are set (EAS env, `21` §4), and
// the auth token stays a secret there. Without it a release build still succeeds, with
// minified stack traces, which the PR states rather than leaving to be discovered.
const sentryPlugin =
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        [
          '@sentry/react-native/expo',
          {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
          },
        ],
      ]
    : [];

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'AGBC Global',
  slug: 'agbc-global',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'agbcglobal',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  ios: {
    bundleIdentifier: 'com.olayinkaademiluka.grace-portal',
    icon: './assets/expo.icon',
  },
  android: {
    package: 'com.oami.agbcapp',
    versionCode: 20,
    // Firebase client config. The file ships inside the app binary, so its API key
    // is public by design (Google: safe to include), but it is kept OUT of git so
    // secret-scanning stops flagging it (decision 2026-07-25, reversing the earlier
    // "committable" call). EAS builds get it from the GOOGLE_SERVICES_JSON file
    // secret; locally it falls back to the untracked ./google-services.json. The FCM
    // V1 SECRET key still lives only in EAS credentials (docs/spec/21 §3).
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    // Session-key storage for LargeSecureStore (docs/spec/03); links at the
    // next EAS build (dev clients older than that fall back, see largeSecureStore.ts).
    'expo-secure-store',
    [
      'expo-font',
      {
        // Embedded at build time per docs/spec/05 (runtime loading causes a font
        // flash). Filenames = ttf PostScript names so Android (filename) and iOS
        // (embedded name) resolve the same fontFamily.
        fonts: [
          './assets/fonts/BricolageGrotesque-Bold.ttf',
          './assets/fonts/BricolageGrotesque-ExtraBold.ttf',
          './assets/fonts/HankenGrotesk-Regular.ttf',
          './assets/fonts/HankenGrotesk-Medium.ttf',
          './assets/fonts/HankenGrotesk-SemiBold.ttf',
          './assets/fonts/HankenGrotesk-Bold.ttf',
          './assets/fonts/HankenGrotesk-ExtraBold.ttf',
        ],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#14213D',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      // Testimony photos (docs/spec/09, W2.3 slice 3). The app only ever PICKS an
      // existing image, so the camera and microphone permissions are blocked
      // outright rather than left to the plugin's defaults: declaring a permission
      // the app never uses is both a store-privacy lie and a needless prompt
      // (docs/spec/20, ~/.claude/standards/mobile.md "request the minimum scope").
      // Option names verified against the installed expo-image-picker 57.0.6
      // plugin types, not from memory.
      'expo-image-picker',
      {
        photosPermission:
          'AGBC Global uses your photos only so you can attach one to a testimony you choose to share.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      // Background listening (docs/spec/08, W3.1 slice 2): UIBackgroundModes audio on
      // iOS; FOREGROUND_SERVICE + FOREGROUND_SERVICE_MEDIA_PLAYBACK and the media
      // session service on Android, which is what keeps audio alive past ~3 minutes
      // with the screen off. The app PLAYS and never records, so the recording half is
      // switched off outright: recordAudioAndroid=false drops RECORD_AUDIO, and
      // microphonePermission=false blocks the iOS mic string (the expo-image-picker
      // precedent: a permission the app never uses is a store-privacy lie). Option
      // names verified against the installed expo-audio 57.0.3 plugin source, not
      // from memory.
      'expo-audio',
      {
        enableBackgroundPlayback: true,
        recordAudioAndroid: false,
        microphonePermission: false,
      },
    ],
    // Push (docs/spec/15) is W3.3's item; only the NATIVE half rides this build so the
    // dev clients need one rebuild instead of two (decided with Ayo 2026-08-14, the
    // same trick W2.10 used with Sentry). Bare on purpose: icon, color and the six
    // Android channels are W3.3's decisions, made when the sending side exists.
    'expo-notifications',
    ...sentryPlugin,
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: '16356acf-94dd-4ef1-9871-539270291801',
    },
  },
};

export default config;
