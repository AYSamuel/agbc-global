import { writeHandlers } from '../writeQueueHandlers';

// What a queued "I'm here" does when it reaches the server (W2.8).
//
// The load-bearing part is WHICH DAY it lands on. The server believes a device
// clock only inside 72 hours and silently uses its own now() outside that
// (20260807120000), so a wish replayed a week late would be recorded as
// attendance today: a week the member was never there, inflating a rhythm that
// is supposed to be true. The queue knows when the tap happened, so the queue
// is what has to stop.

const mockRpc = jest.fn<
  Promise<{ data: unknown; error: unknown }>,
  [string, unknown]
>();
const mockGetSession = jest.fn<Promise<unknown>, []>();
const mockAnswer = jest.fn<undefined, [string, unknown]>();
const mockInvalidateRhythm = jest.fn<undefined, []>();
const mockInvalidateMilestones = jest.fn<undefined, []>();
const mockAnnounce = jest.fn<undefined, [string]>();

jest.mock('@/features/rhythm/rhythmCache', () => ({
  applyRhythmAnswer: (branchId: string, next: unknown) => {
    mockAnswer(branchId, next);
  },
  invalidateRhythm: () => {
    mockInvalidateRhythm();
  },
  invalidateMilestones: () => {
    mockInvalidateMilestones();
  },
}));

jest.mock('@/features/rhythm/announce', () => ({
  announceCheckIn: (announcement: string) => {
    mockAnnounce(announcement);
  },
}));

jest.mock('@/features/family/gloryCache', () => ({
  applyGloryToCaches: () => undefined,
}));

jest.mock('@/lib/queryPersist', () => ({
  queryClient: { invalidateQueries: () => Promise.resolve() },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  },
}));

const NOW = new Date('2026-08-09T11:15:00Z').getTime();

/** A tap made `hoursAgo` before the frozen now, at branch b1. */
function wish(hoursAgo: number) {
  return {
    kind: 'attendance',
    entityId: '2026-08-09',
    state: 'b1',
    queuedAt: NOW - hoursAgo * 60 * 60_000,
  } as const;
}

const ANSWER = {
  recorded: true,
  today: '2026-08-09',
  checked_in: true,
  state: 'active',
  current_weeks: 5,
  longest_weeks: 11,
  last_service_date: '2026-08-09',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
  });
  mockRpc.mockResolvedValue({ data: [ANSWER], error: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the attendance handler', () => {
  test('sends the moment of the TAP, not the moment of the replay', async () => {
    // A Sunday tap replayed on Monday still records Sunday, which is the whole
    // reason the clamp exists (docs/spec/02).
    await expect(writeHandlers.attendance(wish(20))).resolves.toBe('done');
    expect(mockRpc).toHaveBeenCalledWith('record_attendance', {
      p_branch_id: 'b1',
      p_client_taken_at: new Date(NOW - 20 * 60 * 60_000).toISOString(),
    });
  });

  test('records at the branch the member was standing in', async () => {
    await writeHandlers.attendance(wish(0));
    expect(mockRpc.mock.calls[0]?.[1]).toMatchObject({ p_branch_id: 'b1' });
  });

  test('the whole answer replaces the row, so the counts are never guessed', async () => {
    await writeHandlers.attendance(wish(1));
    expect(mockAnswer).toHaveBeenCalledWith('b1', {
      today: '2026-08-09',
      checkedIn: true,
      phase: 'active',
      currentWeeks: 5,
      longestWeeks: 11,
      lastServiceDate: '2026-08-09',
    });
  });

  test('a landed check-in asks whether it earned a milestone (W2.8 slice 4)', async () => {
    // `record_attendance` answers with the rhythm and says nothing about
    // milestones, but the insert may have awarded one on the way past
    // (`attendance_after_insert`). Asking again is the only way to find out, and
    // it is what turns a fourth Sunday into a celebration.
    await writeHandlers.attendance(wish(1));
    expect(mockInvalidateMilestones).toHaveBeenCalled();
  });

  test('a first check-in says nothing more: the tap already said it', async () => {
    await writeHandlers.attendance(wish(1));
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  test('a day already recorded is the one correction only the server can make', async () => {
    // Another device, or a replay this app has forgotten about (docs/spec/10).
    mockRpc.mockResolvedValue({
      data: [{ ...ANSWER, recorded: false }],
      error: null,
    });
    await expect(writeHandlers.attendance(wish(1))).resolves.toBe('done');
    expect(mockAnnounce).toHaveBeenCalledWith('already');
  });

  test('a tap older than 72 hours is dropped rather than sent', async () => {
    // The server would clamp it forward and record TODAY: a week the member was
    // never there. Refused ends the wish; nothing reaches the server.
    await expect(writeHandlers.attendance(wish(80))).resolves.toBe('refused');
    expect(mockRpc).not.toHaveBeenCalled();
    // The optimistic tick has to come off, and only the server can say what is
    // true now.
    expect(mockInvalidateRhythm).toHaveBeenCalled();
  });

  test('a tap just inside the window is still sent', async () => {
    await expect(writeHandlers.attendance(wish(71))).resolves.toBe('done');
    expect(mockRpc).toHaveBeenCalled();
  });

  test('a refusal takes the tick back off', async () => {
    // Not onboarded, or the branch is gone: the server will keep saying no.
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(writeHandlers.attendance(wish(1))).resolves.toBe('refused');
    expect(mockInvalidateRhythm).toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  test('a transport failure keeps the wish, and leaves the screen alone', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await expect(writeHandlers.attendance(wish(1))).resolves.toBe('retry');
    expect(mockInvalidateRhythm).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  test('signed out between the tap and the replay: keep the wish, decide nothing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(writeHandlers.attendance(wish(1))).resolves.toBe('retry');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
