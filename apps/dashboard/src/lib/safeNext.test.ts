import { describe, expect, test } from 'vitest';

import { safeNext } from './safeNext';

describe('safeNext', () => {
  test('keeps a same-origin path', () => {
    expect(safeNext('/moderation')).toBe('/moderation');
    expect(safeNext('/moderation?status=pending')).toBe(
      '/moderation?status=pending',
    );
  });

  test('falls back to the root when there is nothing to return to', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  test('refuses an absolute URL', () => {
    expect(safeNext('https://evil.example/harvest')).toBe('/');
    expect(safeNext('http://evil.example')).toBe('/');
  });

  test('refuses a protocol-relative URL', () => {
    // The classic miss: it starts with '/', so a naive check waves it through, and the
    // browser reads it as another origin.
    expect(safeNext('//evil.example/harvest')).toBe('/');
  });

  test('refuses backslashes, which some browsers resolve as slashes', () => {
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('\\\\evil.example')).toBe('/');
  });

  test('takes the first value when the parameter is repeated', () => {
    expect(safeNext(['/moderation', 'https://evil.example'])).toBe(
      '/moderation',
    );
    expect(safeNext(['https://evil.example', '/moderation'])).toBe('/');
  });
});
