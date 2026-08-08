import { render, screen } from '@testing-library/react-native';

import { color } from '@agbc/shared/theme';

import { ThemeScope } from '@/theme';

import { StatusPanel } from '../StatusPanel';

// The ink band (mockup `.rhythm`). Its one theme-dependent property is the edge:
// in dark the page behind it is the SAME ink, so without a hairline the band
// stops being a surface and becomes floating text (seen on a device, 2026-08-08).

const LABEL = '6-week rhythm. Next milestone: 12 weeks';

async function panelStyle(theme: 'light' | 'dark') {
  await render(
    <ThemeScope name={theme}>
      <StatusPanel
        label="Your rhythm"
        title="6-week rhythm"
        note="Next milestone: 12 weeks"
        ring={{ label: '6', fraction: 0.25 }}
        accessibilityLabel={LABEL}
      />
    </ThemeScope>,
  );
  return screen.getByLabelText(LABEL).props.style as {
    borderWidth: number;
    borderColor: string;
  };
}

describe('the ink band keeps its edge in dark', () => {
  test('dark draws a hairline in the card-line token', async () => {
    const style = await panelStyle('dark');
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(color.dark.cardline);
  });

  test('light draws none: the warm page already separates it', async () => {
    const style = await panelStyle('light');
    expect(style.borderColor).toBe('transparent');
  });

  test('the box measures the same either way, so nothing shifts with the theme', async () => {
    // The border is always present and only its colour changes; a border that
    // appeared only in dark would move the content by a pixel per side.
    const light = await panelStyle('light');
    await screen.unmount();
    const dark = await panelStyle('dark');
    expect(light.borderWidth).toBe(dark.borderWidth);
  });
});
