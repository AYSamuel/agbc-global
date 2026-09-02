import { StatusBar } from 'expo-status-bar';

import { useLayout } from '@/lib/layout';
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
  const { isTablet } = useLayout();
  const pref = useThemePrefStore((s) => s.pref);
  const setPref = useThemePrefStore((s) => s.setPref);
  const name = resolveTheme(pref, system);

  return (
    <ThemeContext.Provider value={{ name, colors: color[name], pref, setPref }}>
      {/* Status bar re-themes with the theme (05: device chrome must match),
          and is HIDDEN on a tablet (Ayo, 2026-09-02). The mockup's tablet frames
          draw their own `.tstatus` strip and the app's own chrome starts at the
          very top of the screen: the rail runs the full height and the two-pane
          reaches the top edge, so the system bar sat on top of a layout that had
          already accounted for that space. A phone keeps it, because a phone is
          held one-handed and glanced at, and the clock and battery are part of
          what it is for. */}
      <StatusBar
        style={name === 'dark' ? 'light' : 'dark'}
        hidden={isTablet}
      />
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
