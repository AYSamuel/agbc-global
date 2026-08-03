import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { MyPostCard } from '../MyPostCard';
import { mergeNewestFirst, type MyPost } from '../myPosts';

// The module reaches for the client at import time; nothing here makes a request, so the
// stub only has to exist (the shape the other family tests use).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

/**
 * The author's pipeline: what each status says, and which of them offer a way on.
 *
 * What a member is ALLOWED to read of their own row is the database's question and is
 * answered in pgTAP (`017`, after 20260803140000). The private moderation note is not among
 * it, which is why `MyPost` has no field for it and this file cannot assert one.
 */

const BASE: MyPost = {
  id: 'post-1',
  kind: 'testimony',
  body: 'God restored my family after years of distance.',
  status: 'approved',
  rejectionReason: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  imagePath: null,
  answeredAt: null,
};

const noop = () => undefined;

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

/** The card reads the theme and the copy, so both are real here. RNTL v14 renders async. */
async function renderCard(post: MyPost, handlers: Partial<Handlers> = {}) {
  return render(
    <ThemeScope name="light">
      <MyPostCard
        post={post}
        onEdit={handlers.onEdit ?? noop}
        onContact={handlers.onContact ?? noop}
      />
    </ThemeScope>,
  );
}

interface Handlers {
  onEdit: (post: MyPost) => void;
  onContact: () => void;
}

test('a live post says so and asks nothing of the author', async () => {
  await renderCard(BASE);

  expect(screen.getByText('Live')).toBeTruthy();
  expect(screen.queryByText('Edit and resubmit')).toBeNull();
  expect(screen.queryByText(/Contact your branch leader/)).toBeNull();
});

test('a post in review is a status, not a worry, and asks for nothing', async () => {
  await renderCard({ ...BASE, status: 'pending' });

  expect(screen.getByText('In review')).toBeTruthy();
  expect(screen.queryByText('Edit and resubmit')).toBeNull();
});

test('needs changes carries the leader words and the way to answer them', async () => {
  const onEdit = jest.fn();
  await renderCard(
    {
      ...BASE,
      status: 'rejected',
      rejectionReason: 'please remove the full name mentioned.',
    },
    { onEdit },
  );

  expect(screen.getByText('Needs changes')).toBeTruthy();
  // The reason is a leader talking to the author, so it is framed as such rather than
  // pasted bare (the frame's `.reason`).
  expect(
    screen.getByText('A leader asked: please remove the full name mentioned.'),
  ).toBeTruthy();

  await fireEvent.press(screen.getByText('Edit and resubmit'));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

test('removed offers a person rather than a button that would be refused', async () => {
  const onContact = jest.fn();
  const onEdit = jest.fn();
  await renderCard(
    { ...BASE, status: 'removed', rejectionReason: 'not shown here' },
    { onEdit, onContact },
  );

  expect(screen.getByText('Removed')).toBeTruthy();
  // `removed` is terminal for the author: the database refuses their edits (docs/spec/02),
  // so offering Edit here would be offering a refusal.
  expect(screen.queryByText('Edit and resubmit')).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText(/Contact your branch leader/));
  expect(onContact).toHaveBeenCalledTimes(1);
});

test('a prayer and a testimony from the same afternoon interleave by time', () => {
  // Two tables, one pipeline. Sorting is the only logic on this screen, and a render test
  // would not notice it silently grouping by kind.
  const merged = mergeNewestFirst(
    [
      { ...BASE, id: 't-old', createdAt: '2026-08-01T09:00:00.000Z' },
      { ...BASE, id: 't-new', createdAt: '2026-08-01T17:00:00.000Z' },
    ],
    [
      {
        ...BASE,
        id: 'p-mid',
        kind: 'prayer',
        createdAt: '2026-08-01T13:00:00.000Z',
      },
    ],
  );

  expect(merged.map((post) => post.id)).toEqual(['t-new', 'p-mid', 't-old']);
});
