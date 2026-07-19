import { color, fontFamily, spacing } from '@agbc/shared/theme';

import { resolveTheme } from '../store';

describe('resolveTheme', () => {
  test('system pref follows the OS scheme', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  test('system pref falls back to light when the OS reports none', () => {
    expect(resolveTheme('system', null)).toBe('light');
    expect(resolveTheme('system', undefined)).toBe('light');
  });

  test('explicit pref wins over the OS scheme', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});

// Drift guards: a handful of load-bearing 05 values. If one of these fails, someone
// edited the token scale away from docs/spec/05; change the spec first, then the token.
describe('tokens match docs/spec/05', () => {
  test('anchor colors', () => {
    expect(color.light.bg).toBe('#fbf8f3');
    expect(color.light.text).toBe('#14213d');
    expect(color.light.accent).toBe('#ffcf4a');
    expect(color.dark.blue).toBe('#5a9bff');
    expect(color.dark.card).toBe('#17202f');
  });

  test('gold holds across both themes', () => {
    expect(color.dark.accent).toBe(color.light.accent);
  });

  test('font families use cross-platform PostScript names', () => {
    expect(fontFamily.display.extraBold).toBe('BricolageGrotesque-ExtraBold');
    expect(fontFamily.body.regular).toBe('HankenGrotesk-Regular');
  });

  test('spacing scale is the 05 ladder', () => {
    expect(Object.values(spacing)).toEqual([
      4, 8, 12, 16, 20, 24, 32, 40, 56, 20,
    ]);
  });
});
