// Plain JS on purpose: eas-cli's bundled config reader (21.x) cannot evaluate a
// TypeScript app.config during the SDK 57 transition; JSDoc keeps editor typing.
//
// App identity is FROZEN (docs/spec/19, ADR 0002): this app replaces Grace Portal on
// the existing store listings. Never change package/bundleIdentifier, never let
// tooling regenerate credentials, never create new store records.
//
// `version` IS THE RELEASE and is the only version number kept here. The BUILD number
// lives on EAS, not in this file: `eas.json` sets `appVersionSource: "remote"` and the
// production profile auto-increments, so an `android.versionCode` here is read by nobody
// and was removed at 1.0.1 while it still said 20 and the real one was 22. The floor that
// mattered is history now: Grace Portal's highest upload was 19, this app started at 20,
// and Play will not accept anything lower ever again. Read the live number with
// `eas build:version:get --platform android`; the release table is in
// docs/runbooks/releases.md.

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
  version: '1.0.1',
  // NO ORIENTATION LOCK IN THE MANIFEST (W4.11). This was 'portrait',
  // which Expo turns into android:screenOrientation="PORTRAIT" on MainActivity and
  // applies to every device on every Android version. That held TABLETS in portrait on
  // Android 15 and below, so the tablet layouts W4.7 built (the rail, Watch's two-pane,
  // Home's dashboard grid) could only ever be reached on Android 16, which ignores the
  // lock. `05` §Tablet has said tablet rendering is not optional since 2026-07-12.
  //
  // The rule now lives in the app, where it can be conditional: portrait on a phone,
  // free on a tablet, and the player may rotate anywhere. See src/lib/orientation.ts,
  // which carries the two costs this trade accepts.
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'agbcglobal',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  ios: {
    bundleIdentifier: 'com.olayinkaademiluka.grace-portal',
    // NO `infoPlist.AppStoreID` YET, and that is what keeps W4.10's update
    // notice inert on iOS rather than wrong. `expo-in-app-updates` reads that key
    // to look the app up in the iTunes Search API; with no id the lookup matches
    // nothing and resolves "no update available", which is the safe answer. The
    // numeric id lives only in App Store Connect (same blocker as the store link
    // in src/lib/links.ts); adding it here turns the iOS half on with no code
    // change.
    //
    // NO `icon` OVERRIDE, deliberately: iOS falls back to the top-level
    // `icon` above, which is the app's own mark. It used to point at
    // './assets/expo.icon', the Icon Composer bundle `create-expo-app`
    // generates, whose art is Expo's blue chevron on a blue gradient. That
    // was never noticed because iOS has not been built once (docs/spec/18
    // defers it: there is no iPhone in the project), so the placeholder sat
    // in config with nothing to render it. Android shipped the same
    // placeholder through `icon.png` and the three adaptive layers until
    // 2026-09-04, when entering the Play listing put the icon on screen
    // beside the church's own logo and the mismatch became obvious.
    // Universal links (docs/spec/15). The other half is an
    // apple-app-site-association file served by the church website at
    // /.well-known/, as JSON with no redirect, carrying the team id and this
    // bundle id. It is NOT served yet: it needs the Apple Team ID, which only
    // App Store Connect has, and a file with a placeholder appID is worse than
    // no file because Apple caches it (Desktop/agbc docs/SPEC-app-links.md
    // carries the template and the steps). Until then iOS silently declines to
    // open these links and the agbcglobal:// scheme still works.
    //
    // ONE HOST, for the reason spelled out on the Android filter below.
    associatedDomains: ['applinks:www.agbcglobal.com'],
  },
  android: {
    package: 'com.oami.agbcapp',
    // Firebase client config. The file ships inside the app binary, so its API key
    // is public by design (Google: safe to include), but it is kept OUT of git so
    // secret-scanning stops flagging it (decision 2026-07-25, reversing the earlier
    // "committable" call). EAS builds get it from the GOOGLE_SERVICES_JSON file
    // secret; locally it falls back to the untracked ./google-services.json. The FCM
    // V1 SECRET key still lives only in EAS credentials (docs/spec/21 §3).
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      // The mockup's --gold, matching backgroundImage. It is the FALLBACK
      // Android paints when the background layer cannot be used, so leaving
      // `create-expo-app`'s pale blue here would have shown a blue ring behind
      // a gold icon on exactly the devices least able to render it.
      backgroundColor: '#ffcf4a',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Android App Links (docs/spec/15). `autoVerify` makes Android check
    // /.well-known/assetlinks.json on the domain at install time and, if it
    // matches, open these URLs in the app WITHOUT the disambiguation dialog.
    //
    // THE FINGERPRINT IN THAT FILE IS THE PLAY APP SIGNING KEY'S SHA-256, NOT
    // THE UPLOAD KEY'S. Google re-signs the AAB, so the upload key's
    // fingerprint verifies against nothing and fails silently: links simply
    // keep opening in the browser with no error anywhere. The value is recorded
    // in docs/spec/19, and the file is served by the website (W4.8).
    //
    // ONLY `www`, AND THE APEX IS EXCLUDED DELIBERATELY (W4.8, 2026-09-03).
    // `agbcglobal.com` answers 308 to everything, including /.well-known/, so it
    // can never serve the association file directly. That is not a host quietly
    // doing nothing: on Android 11 and lower the system makes the app a default
    // handler "only if it finds a matching Digital Asset Links file for ALL
    // hosts in the manifest", and this app supports Android 7 and up, so
    // declaring the apex risks taking the working host down with it. The cost is
    // that a link written to the bare host opens the browser instead of the app,
    // which is why every link the app and the church generate uses `www` (the
    // same rule W4.6 set for the legal links).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'www.agbcglobal.com', pathPrefix: '/app' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
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
    [
      // Push (docs/spec/15). W3.1 slice 2 shipped this plugin BARE so the native half
      // rode that build, leaving "icon, color and the six Android channels" as W3.3's
      // decisions. The channels are now created in JS (features/notifications/channels.ts,
      // where they belong: their names are translated and their importance is a product
      // decision), so what remains here is the tray appearance.
      //
      // `color` tints the small icon and the app name in the shade. Gold is the brand's
      // accent (packages/shared palette.gold) and the one brand colour that holds on both
      // a light and a dark shade; navy would disappear into a dark one.
      //
      // `icon` is the tray's small icon (2026-09-09, `18`'s tray-icon line). Android
      // draws it in ONE colour from a white-on-transparent silhouette, so it is not the
      // app icon and could not be the 432x432 adaptive monochrome layer either: that
      // art is inset for the adaptive mask and lands as a blob at 24dp. It is the same
      // letterform as the icon set, rendered by scripts/render-app-icon.sh at 96x96
      // with the glyph filling ~80% of the canvas, which is Google's own proportion
      // for the small icon. Until it existed Android fell back to the app icon, which
      // rendered acceptably (2026-08-16 shade screenshots). NATIVE, like the rest of
      // the plugin: it reaches a device only in a new build, so its first look is the
      // next store train's, not this PR's.
      'expo-notifications',
      { color: '#ffcf4a', icon: './assets/images/notification-icon.png' },
    ],
    [
      // R8 (W4.11 slice 2). Play's release dashboard carries "App optimization is
      // below our threshold", obfuscation at 1%, with a Feb 2027 deadline, and every
      // upload warns "There is no deobfuscation file associated with this App Bundle".
      // Both are the same fact: nothing was being minified. Option name verified
      // against the installed expo-build-properties 57.0.17 plugin types, not from
      // memory (it used to be `enableProguardInReleaseBuilds`).
      //
      // MINIFY ONLY, NOT `enableShrinkResourcesInReleaseBuilds`. The flagged category
      // is obfuscation, which minification alone answers; resource shrinking removes
      // assets it cannot see referenced, which is a second and unrelated way to break
      // a release for no gain against the thing Play is asking for. It is available
      // the day app size actually matters.
      //
      // NOTHING HAS TO BE UPLOADED FOR THE DEOBFUSCATION WARNING. With minification on,
      // the Android Gradle plugin writes the mapping into the bundle itself
      // (BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map) and Play
      // reads it from there, so crash reports stay readable without a manual step.
      //
      // THE RISK, stated where it will be read: R8 removes classes it cannot see being
      // used, and React Native, Hermes and every Expo module find things by REFLECTION.
      // A stripped class fails at runtime, on the screen that needed it, while the
      // build, the typecheck, the lint and all 1128 tests stay green. The acceptance
      // test is therefore an installed release artifact walked by hand, and no suite
      // can stand in for it. If the walk finds a hole, `extraProguardRules` is where
      // the keep rule goes.
      'expo-build-properties',
      { android: { enableMinifyInReleaseBuilds: true } },
    ],
    // NO `expo-sharing` ENTRY, DELIBERATELY, and this note exists because the CLI asks for
    // one: `npx expo install expo-sharing` prints "Add the following to your Expo config:
    // plugins: ['expo-sharing']" and following that instruction would add a plugin that
    // builds nothing. Verified against the installed 57.0.19 plugin source rather than
    // from memory: `withShareExtension` is for receiving shares INTO the app, both halves
    // default to `enabled: false`, and with no props it applies no config at all. W4.15
    // shares OUT (`Sharing.shareAsync`), which needs no native configuration on either
    // platform. Adding an app-wide share extension is a separate decision nobody has made.
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
