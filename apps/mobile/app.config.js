// Plain JS on purpose: eas-cli's bundled config reader (21.x) cannot evaluate a
// TypeScript app.config during the SDK 57 transition; JSDoc keeps editor typing.
//
// App identity is FROZEN (docs/spec/19, ADR 0002): this app replaces Grace Portal on
// the existing store listings. Never change package/bundleIdentifier, never let
// tooling regenerate credentials, never create new store records. versionCode floor
// is 20 (highest Grace Portal upload is 19).

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
    // Public Firebase client config (committable); the FCM V1 SECRET key lives only
    // in EAS credentials (docs/spec/21 §3).
    googleServicesFile: './google-services.json',
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
