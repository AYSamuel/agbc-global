import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeScope } from '@/theme';

import { ListScreen, type ListScreenProps } from '../ListScreen';
import { CAPPED_MAX_WIDTH } from '../Screen';

/**
 * `ListScreen` is the virtualized twin of `Screen` (W4.7 slice 3), and what it
 * has to get right is the chrome rather than the rows: the same capped measure,
 * the same header-scrolls-with-content behaviour, and an empty state that shows
 * only when there is genuinely nothing.
 *
 * The rows themselves are covered where they mean something, on each converted
 * screen's own suite.
 */

jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- documented jest.mock factory shape
  () => require('react-native-safe-area-context/jest/mock').default,
);

interface Row {
  id: string;
  label: string;
}

const rows: Row[] = [
  { id: 'a', label: 'First' },
  { id: 'b', label: 'Second' },
];

type ListProps = Partial<Omit<ListScreenProps<Row>, 'data' | 'keyExtractor' | 'renderItem'>>;

function renderList(props: ListProps = {}) {
  return render(
    <ThemeScope name="light">
      <ListScreen
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.label}</Text>}
        {...props}
      />
    </ThemeScope>,
  );
}

// RNTL v14: render and events are async (React 19 act semantics); always await.
test('draws the rows it is given', async () => {
  await renderList();
  expect(screen.getByText('First')).toBeOnTheScreen();
  expect(screen.getByText('Second')).toBeOnTheScreen();
});

test('the header scrolls with the rows rather than sitting above them', async () => {
  await renderList({ header: <Text>Header</Text> });
  expect(screen.getByText('Header')).toBeOnTheScreen();
  expect(screen.getByText('First')).toBeOnTheScreen();
});

test('the empty state shows only when there is nothing, and never beside rows', async () => {
  await renderList({ empty: <Text>Nothing here</Text> });
  expect(screen.queryByText('Nothing here')).not.toBeOnTheScreen();

  await screen.rerender(
    <ThemeScope name="light">
      <ListScreen
        data={[] as Row[]}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.label}</Text>}
        empty={<Text>Nothing here</Text>}
      />
    </ThemeScope>,
  );
  expect(screen.getByText('Nothing here')).toBeOnTheScreen();
  expect(screen.queryByText('First')).not.toBeOnTheScreen();
});

test('an empty list still draws its header, so a screen never loses its title', async () => {
  await render(
    <ThemeScope name="light">
      <ListScreen
        data={[] as Row[]}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.label}</Text>}
        header={<Text>Header</Text>}
        empty={<Text>Nothing here</Text>}
      />
    </ThemeScope>,
  );
  expect(screen.getByText('Header')).toBeOnTheScreen();
  expect(screen.getByText('Nothing here')).toBeOnTheScreen();
});

test('the capped width class holds the same measure Screen does', async () => {
  await renderList({ widthClass: 'capped', testID: 'list' });
  const styles = screen.getByTestId('list').props
    .contentContainerStyle as unknown[];
  // Flattened by the renderer into the array ListScreen builds; the cap is the
  // number `Screen` exports, not a copy of it.
  const flat = styles.flat().filter((s) => s !== false && s !== null);
  expect(JSON.stringify(flat)).toContain(String(CAPPED_MAX_WIDTH));
});

test('without the capped class it does not impose a measure', async () => {
  await renderList({ testID: 'list' });
  const styles = screen.getByTestId('list').props
    .contentContainerStyle as unknown[];
  const flat = styles.flat().filter((s) => s !== false && s !== null);
  expect(JSON.stringify(flat)).not.toContain(String(CAPPED_MAX_WIDTH));
});
