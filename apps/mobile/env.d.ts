// Expo generates expo-env.d.ts locally (gitignored per the Expo template), which is
// what types process.env.EXPO_PUBLIC_* as string | undefined. CI never runs expo, so
// without this committed reference those reads are `any` and typed lint fails there
// while passing locally. Same directive, committed.
/// <reference types="expo/types" />
