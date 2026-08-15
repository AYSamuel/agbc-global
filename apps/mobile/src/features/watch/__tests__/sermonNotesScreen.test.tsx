import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import type { NoteEditor, SermonNote } from '../notes';
import { useNoteDraftStore } from '../notes';
import { usePlaybackStore } from '../playback';
import type { SermonSummary } from '../queries';

import SermonNotes from '../../../../app/sermon/notes/[id]';

// SERMON-NOTES, the screen (docs/spec/08, the four W3.1 slice 4 frames). The
// machine itself is proven in notes.test.ts; here: what each state puts on the
// page, and that the Add line exists exactly when there is a second to name.

void i18n;

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ id: 'aaa' }),
}));

const mockAuthState = jest.fn<{ status: string }, []>(() => ({
  status: 'member',
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

// The real notes module is required below (for its pure helpers and its draft
// store), and it reaches the client at import time.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
  },
}));

const mockSermon = jest.fn<
  { data: SermonSummary | null | undefined; isError: boolean },
  []
>();
jest.mock('../queries', () => ({
  useSermonQuery: () => mockSermon(),
}));

const mockNoteQuery = jest.fn<
  {
    data: SermonNote | null | undefined;
    isPending: boolean;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
const mockEditor = jest.fn<NoteEditor, []>();
const mockHydrated = jest.fn<boolean, []>(() => true);
jest.mock('../notes', () => {
  const actual = jest.requireActual<typeof import('../notes')>('../notes');
  return {
    ...actual,
    useNoteQuery: () => mockNoteQuery(),
    useNoteEditor: () => mockEditor(),
    useDraftsHydrated: () => mockHydrated(),
  };
});

function sermon(): SermonSummary {
  return {
    id: 'aaa',
    title: 'Grace for the Journey',
    speaker: 'Pastor Esther Olayinka',
    youtube_id: 'yt-1',
    audio_path: null,
    artwork_path: null,
    duration_sec: 2280,
    thumbnail_url: '',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    is_live: false,
    live_checked_at: null,
    kind: 'video',
    status: 'available',
  };
}

function editor(overrides: Partial<NoteEditor> = {}): NoteEditor {
  return {
    body: '',
    status: 'idle',
    setBody: jest.fn(),
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <SermonNotes />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.mockReturnValue({ status: 'member' });
  mockSermon.mockReturnValue({ data: sermon(), isError: false });
  mockNoteQuery.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockEditor.mockReturnValue(editor());
  mockHydrated.mockReturnValue(true);
  usePlaybackStore.setState({ positions: {} });
  useNoteDraftStore.setState({ drafts: {} });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
});

test('a guest meets who can read the notes before being asked to sign in', async () => {
  mockAuthState.mockReturnValue({ status: 'guest' });
  await renderScreen();
  expect(screen.getByText('Sign in to keep your notes')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockTrack).toHaveBeenCalledWith('gate_shown', {
    action_type: 'sermon_notes',
  });
  expect(useGateStore.getState().pending).toEqual({
    kind: 'sermon_notes',
    sermonId: 'aaa',
  });
  expect(mockPush).toHaveBeenCalledWith('/auth');
});

test('empty: the placeholder asks the question, the status slot claims nothing', async () => {
  await renderScreen();
  expect(screen.getByText('Grace for the Journey')).toBeOnTheScreen();
  expect(screen.getByText('Pastor Esther Olayinka')).toBeOnTheScreen();
  expect(
    screen.getByPlaceholderText('What is God saying to you in this message?'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Saved ✓')).not.toBeOnTheScreen();
  expect(screen.queryByText('Not saved yet')).not.toBeOnTheScreen();
});

test('the Add line is absent when nothing has played: no second to name', async () => {
  await renderScreen();
  expect(screen.queryByText(/Add a note at/)).not.toBeOnTheScreen();
});

test('the Add line names the paused second and writes it into the page', async () => {
  const ed = editor({ body: 'Grace is a gift.' });
  mockEditor.mockReturnValue(ed);
  usePlaybackStore.setState({
    positions: { aaa: { positionSec: 1601, updatedAt: 1 } },
  });
  await renderScreen();

  const add = screen.getByRole('button', { name: 'Add a note at 26:41' });
  await fireEvent.press(add);
  expect(ed.setBody).toHaveBeenCalledWith('Grace is a gift.\n\n26:41\n');
});

test('written and saved: the header says so in so many words', async () => {
  mockEditor.mockReturnValue(editor({ body: 'words', status: 'saved' }));
  await renderScreen();
  expect(screen.getByText('Saved ✓')).toBeOnTheScreen();
});

test('written offline: Not saved yet, and the promise that nothing is lost', async () => {
  mockEditor.mockReturnValue(editor({ body: 'words', status: 'unsaved' }));
  await renderScreen();
  expect(screen.getByText('Not saved yet')).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Kept on this phone. We will save it when you are back online.',
    ),
  ).toBeOnTheScreen();
});

test('the page waits for the persisted drafts before opening the editor', async () => {
  // The editor decides its opening copy once, at mount, from the draft store.
  // On a cold deep link that store is still reading from disk, so opening early
  // would show the server copy and autosave it over newer offline words.
  mockHydrated.mockReturnValue(false);
  await renderScreen();
  expect(
    screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.queryByPlaceholderText('What is God saying to you in this message?'),
  ).not.toBeOnTheScreen();
});

test('a failed read with no draft waits too, rather than showing the error early', async () => {
  // Same reason: with the drafts still unread, "there is no draft" is not yet
  // a fact, and a draft is exactly what makes a failed read survivable.
  mockHydrated.mockReturnValue(false);
  mockNoteQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: jest.fn(),
  });
  await renderScreen();
  expect(screen.queryByText('Something went wrong')).not.toBeOnTheScreen();
});

test('a failed read with no draft is an honest error, never an empty page', async () => {
  // Autosaving an empty page over a document the app could not fetch would be
  // data loss by politeness; the editor only opens blind when a draft is the
  // newer copy anyway.
  const refetch = jest.fn();
  mockNoteQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch,
  });
  await renderScreen();
  expect(
    screen.queryByPlaceholderText('What is God saying to you in this message?'),
  ).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(refetch).toHaveBeenCalled();
});

test('the same failed read WITH a draft opens the page: the draft is newer', async () => {
  useNoteDraftStore.setState({
    drafts: { aaa: { body: 'flight draft', updatedAt: 5 } },
  });
  mockNoteQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: jest.fn(),
  });
  mockEditor.mockReturnValue(
    editor({ body: 'flight draft', status: 'unsaved' }),
  );
  await renderScreen();
  expect(screen.getByDisplayValue('flight draft')).toBeOnTheScreen();
});
