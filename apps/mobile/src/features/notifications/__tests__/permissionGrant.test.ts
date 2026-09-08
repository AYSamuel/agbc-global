import { requestPermission } from '../permission';

// A GRANT HAS TO REGISTER THE TOKEN, and this file exists because it did not.
// The push runtime fetches a token when a MEMBER APPEARS, which has already
// happened by the time anyone answers a sheet raised after sign-in. So the
// member said yes, the OS said yes, and nothing was registered until the next
// cold start: permission granted, still no push (found on the device with Ayo,
// 2026-09-07).

const mockRequest = jest.fn<
  Promise<{ status: string; canAskAgain?: boolean }>,
  []
>();
jest.mock('../expoNotifications', () => ({
  notificationsModule: () => ({
    requestPermissionsAsync: () => mockRequest(),
    getPermissionsAsync: () => mockRequest(),
  }),
}));

const mockRegister = jest.fn<Promise<string | null>, []>(() =>
  Promise.resolve('ExponentPushToken[x]'),
);
jest.mock('../token', () => ({
  registerPushToken: () => mockRegister(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestPermission', () => {
  test('a grant registers the token there and then', async () => {
    mockRequest.mockResolvedValue({ status: 'granted' });

    await expect(requestPermission()).resolves.toBe('granted');
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  test('a refusal registers nothing: there is nothing to deliver to', async () => {
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await expect(requestPermission()).resolves.toBe('denied');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  test('a dialog that never appeared leaves the question open', async () => {
    // `canAskAgain` with no grant is the undetermined case: the member closed
    // the OS dialog without answering, and nothing has been decided.
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: true });

    await expect(requestPermission()).resolves.toBe('undetermined');
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
