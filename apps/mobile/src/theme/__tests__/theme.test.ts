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

// Drift guards: a handful of load-bearing values from the mockup CSS variables
// (entry-flow.html, mirrored in 05's tables). If one of these fails, someone edited
// the token scale away from the design source of truth; change the spec first.
describe('tokens match docs/spec/05', () => {
  test('anchor colors', () => {
    expect(color.light.bg).toBe('#fbf8f3');
    expect(color.light.text).toBe('#14213d');
    expect(color.light.accent).toBe('#ffcf4a');
    expect(color.light.eye).toBe('#b98600');
    expect(color.light.btnBg).toBe('#14213d');
    expect(color.dark.blue).toBe('#5a9bff');
    expect(color.dark.card).toBe('#18212f');
    expect(color.dark.btnBg).toBe('#ffcf4a');
  });

  test('gold holds across both themes', () => {
    expect(color.dark.accent).toBe(color.light.accent);
  });

  test('font families use cross-platform PostScript names', () => {
    expect(fontFamily.display.extraBold).toBe('BricolageGrotesque-ExtraBold');
    expect(fontFamily.body.regular).toBe('HankenGrotesk-Regular');
    expect(fontFamily.body.extraBold).toBe('HankenGrotesk-ExtraBold');
  });

  test('spacing scale is the 05 ladder plus the semantic entries', () => {
    // 4..56 ladder, then gutter (20) and screenTop (16): with the real status
    // inset this reproduces the mockup's frame-top-to-title geometry (Screen).
    expect(Object.values(spacing)).toEqual([
      4, 8, 12, 16, 20, 24, 32, 40, 56, 20, 16,
    ]);
  });
});
