import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import {
  color,
  tokens,
  type ColorTokens,
  type ThemeName,
} from '@agbc/shared/theme';

import { resolveTheme, useThemePrefStore, type ThemePref } from './store';

interface ThemeContextValue {
  name: ThemeName;
  colors: ColorTokens;
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const pref = useThemePrefStore((s) => s.pref);
  const setPref = useThemePrefStore((s) => s.setPref);
  const name = resolveTheme(pref, system);

  return (
    <ThemeContext.Provider value={{ name, colors: color[name], pref, setPref }}>
      {/* Status bar re-themes with the theme (05: device chrome must match). */}
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}

// Pins a fixed theme for a subtree regardless of the user preference. Exists for the
// dev gallery (both themes side by side for screenshot checks, W0.8) and for tests;
// never used in product screens.
export function ThemeScope({
  name,
  children,
}: PropsWithChildren<{ name: ThemeName }>) {
  return (
    <ThemeContext.Provider
      value={{
        name,
        colors: color[name],
        pref: name,
        setPref: () => {
          // fixed scope: preference changes are a no-op by design
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export { tokens };
