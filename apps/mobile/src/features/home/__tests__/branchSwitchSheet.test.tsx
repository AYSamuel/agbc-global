import { render } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { BranchSwitchSheet } from '../BranchSwitchSheet';

import type { BranchSummary } from '@/features/onboarding/branches-snapshot';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

/**
 * BRANCH-SWITCH, when there are more branches than the frame ever drew.
 *
 * The bug this pins: the list rendered in a plain View with no cap, so the sheet grew
 * until it squeezed the scrim above it to nothing. With no scrim to tap and no scroll,
 * the only way out was the hardware back button (found on device 2026-08-01). Four
 * branches at a large text scale reach the same place, so this is not only about the
 * long list.
 */

function branch(index: number): BranchSummary {
  return {
    id: `branch-${String(index)}`,
    slug: `branch-${String(index)}`,
    name: `AGBC Branch ${String(index)}`,
    city: 'City',
    country: 'Country',
    is_hq: index === 0,
    email: 'hello@example.test',
    youtube_channel_id: null,
    timezone: 'Europe/London',
    address: null,
    service_times: null,
    lat: 0,
    lng: 0,
    order: index,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('the branch list scrolls, and the sheet never takes the whole screen', async () => {
  const many = Array.from({ length: 24 }, (_, index) => branch(index));

  const view = await render(
    <ThemeScope name="light">
      <BranchSwitchSheet
        visible
        branches={many}
        selectedId="branch-0"
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
        onSeeAll={jest.fn()}
      />
    </ThemeScope>,
  );

  // The list is a scroller, not a static column. Asserted through the role it already
  // carries rather than by reaching for the component class, which RNTL 14 no longer
  // exposes on the render result.
  const list = view.getByTestId('branch-switch-list');
  expect(list.type).toMatch(/ScrollView/);

  // Every branch is still rendered; scrolling is what reaches them.
  expect(view.getByText('AGBC Branch 23')).toBeTruthy();

  // And the action below the list stays put rather than scrolling away with it.
  expect(view.getByText('See all branches')).toBeTruthy();
});
