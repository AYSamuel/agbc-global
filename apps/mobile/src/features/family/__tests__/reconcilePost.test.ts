import { findOwnPost } from '../reconcilePost';

/**
 * "Did my earlier attempt land?" (W4.18 slice 2). The one boundary this module owns is
 * the read; what the composer DOES with the answer is `compose.test.tsx`'s business.
 * Three answers, and the third is the honest one: a read that could not be made says
 * nothing about the row, so it must not be reported as absent.
 */

type ReadResult = { data: { id: string } | null; error: unknown };

const mockMaybeSingle = jest.fn<Promise<ReadResult>, []>(() =>
  Promise.resolve({ data: null, error: null }),
);
const mockEq = jest.fn<
  { maybeSingle: typeof mockMaybeSingle },
  [string, string]
>(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn<{ eq: typeof mockEq }, [string]>(() => ({
  eq: mockEq,
}));
const mockFrom = jest.fn<{ select: typeof mockSelect }, [string]>(() => ({
  select: mockSelect,
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

const ID = '70000000-0000-4000-8000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
});

test('asks the right table for exactly that row, and only its id', async () => {
  await findOwnPost('testimony', ID);
  expect(mockFrom).toHaveBeenCalledWith('testimonies');
  expect(mockSelect).toHaveBeenCalledWith('id');
  expect(mockEq).toHaveBeenCalledWith('id', ID);

  await findOwnPost('prayer', ID);
  expect(mockFrom).toHaveBeenLastCalledWith('prayers');
});

test('a row means the earlier attempt landed', async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { id: ID }, error: null });
  await expect(findOwnPost('testimony', ID)).resolves.toBe('exists');
});

test('no row and no error means the server has nothing by that id', async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(findOwnPost('prayer', ID)).resolves.toBe('absent');
});

test('a read that failed says nothing about the row', async () => {
  mockMaybeSingle.mockResolvedValueOnce({
    data: null,
    error: { code: '', message: 'AbortError: Aborted' },
  });
  await expect(findOwnPost('testimony', ID)).resolves.toBe('unknown');

  mockMaybeSingle.mockRejectedValueOnce(
    new TypeError('Network request failed'),
  );
  await expect(findOwnPost('testimony', ID)).resolves.toBe('unknown');
});
