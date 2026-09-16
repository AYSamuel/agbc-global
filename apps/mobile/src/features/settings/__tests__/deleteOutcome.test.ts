import {
  classifyDeleteError,
  type DeleteAttempt,
  type DeleteOutcome,
} from '../deleteOutcome';

/**
 * What a failed `delete_my_account` call means (W4.18 slice 1; docs/spec/16 §DELETE).
 *
 * The three refusals below are the ONLY ones the erasure raises (20260901160000 lines 121,
 * 134, 421), and the wire shapes are the ones postgrest-js actually produces: an aborted
 * request gets `code: ''` with a hint, a gateway error with a non-JSON body arrives as
 * `{ message }` with no code at all, and a Postgres error carries its SQLSTATE.
 *
 * The rows that matter most are the PAIRS: the same error on a first attempt and on a
 * confirming one, classified differently, because the erasure deletes the member's
 * sessions and a session error on the second call may be the erasure's own footprint.
 */

const ALREADY_ERASED = { code: 'P0002', message: 'no live account to erase' };
const LAST_ADMIN = {
  code: 'P0001',
  message:
    'the last admin cannot delete their account; appoint another admin first',
};
const NOT_SIGNED_IN = {
  code: '42501',
  message: 'sign in to delete your account',
};
const PERMISSION_DENIED = {
  code: '42501',
  message: 'permission denied for function delete_my_account',
};
const JWT_EXPIRED = { code: 'PGRST301', message: 'JWT expired' };
const STATEMENT_TIMEOUT = {
  code: '57014',
  message: 'canceling statement due to statement timeout',
};
const ABORTED = {
  code: '',
  message: 'AbortError: Aborted',
  details: '',
  hint: 'Request was aborted (timeout or manual cancellation)',
};
const GATEWAY_HTML = {
  message: '<html><body>504 Gateway Time-out</body></html>',
};

const table: [string, DeleteAttempt, unknown, DeleteOutcome][] = [
  // Proof the account is gone, on either attempt, by code or by message.
  ['already erased, first attempt', 'first', ALREADY_ERASED, 'erased'],
  ['already erased, confirming', 'confirm', ALREADY_ERASED, 'erased'],
  [
    'already erased by message alone',
    'confirm',
    { message: 'no live account to erase' },
    'erased',
  ],

  // Proof the account is intact: the one refusal only a live account can produce.
  ['last admin, first attempt', 'first', LAST_ADMIN, 'refused'],
  ['last admin, confirming', 'confirm', LAST_ADMIN, 'refused'],

  // A first attempt the server refused before doing anything: nothing changed.
  ['not signed in, first attempt', 'first', NOT_SIGNED_IN, 'refused'],
  ['permission denied, first attempt', 'first', PERMISSION_DENIED, 'refused'],
  ['JWT expired, first attempt', 'first', JWT_EXPIRED, 'refused'],
  [
    'statement timeout, first attempt (rolled back)',
    'first',
    STATEMENT_TIMEOUT,
    'refused',
  ],

  // THE SAME ERRORS ON A CONFIRMING CALL PROVE NOTHING. The erasure deletes
  // auth.sessions and auth.refresh_tokens, so "permission denied" or "JWT expired"
  // there may be the first attempt having succeeded.
  [
    'permission denied, confirming',
    'confirm',
    PERMISSION_DENIED,
    'unconfirmed',
  ],
  ['JWT expired, confirming', 'confirm', JWT_EXPIRED, 'unconfirmed'],
  [
    'statement timeout, confirming',
    'confirm',
    STATEMENT_TIMEOUT,
    'unconfirmed',
  ],
  [
    'a different raise_exception is not the last-admin rule',
    'confirm',
    { code: 'P0001', message: 'something else' },
    'unconfirmed',
  ],

  // The database never spoke: the request may have run.
  ['aborted by the client budget', 'first', ABORTED, 'unconfirmed'],
  ['gateway error, non-JSON body', 'first', GATEWAY_HTML, 'unconfirmed'],
  [
    'fetch threw',
    'first',
    new TypeError('Network request failed'),
    'unconfirmed',
  ],
  ['null', 'first', null, 'unconfirmed'],
  ['a bare string', 'first', 'boom', 'unconfirmed'],
];

test.each(table)('%s', (_name, attempt, error, expected) => {
  expect(classifyDeleteError(attempt, error)).toBe(expected);
});

// The mutation check the plan asks for: the asymmetry is load-bearing, so a version
// of the classifier that ignored `attempt` must fail here, not pass by luck.
test('the attempt changes the answer for the same error', () => {
  expect(classifyDeleteError('first', PERMISSION_DENIED)).not.toBe(
    classifyDeleteError('confirm', PERMISSION_DENIED),
  );
});
