// Jest auto-mock for AsyncStorage (the library's documented pattern): tests exercise
// the in-memory mock instead of the absent native module. Do not override jest-expo's
// setupFiles for this; project-level setupFiles REPLACES the preset's own.
export { default } from '@react-native-async-storage/async-storage/jest/async-storage-mock';
