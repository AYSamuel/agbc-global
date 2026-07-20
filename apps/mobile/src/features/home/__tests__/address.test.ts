import { branchInitial } from '@/features/onboarding/branchInitial';

import { resolveAddressLine } from '../address';

// Both helpers exist because of device findings on 2026-07-20.

describe('resolveAddressLine', () => {
  test('joins both lines into the full address (the header carries the name)', () => {
    expect(
      resolveAddressLine(
        { line1: 'Oudenarder Str. 16', line2: '13347 Berlin' },
        'AGBC Lighthouse Berlin',
      ),
    ).toBe('Oudenarder Str. 16, 13347 Berlin');
  });

  test('never echoes the branch name back as part of its address', () => {
    expect(
      resolveAddressLine(
        { line1: 'AGBC Lighthouse Berlin', line2: 'Oudenarder Str. 16' },
        'AGBC Lighthouse Berlin',
      ),
    ).toBe('Oudenarder Str. 16');
  });

  test('skips blank lines', () => {
    expect(
      resolveAddressLine(
        { line1: '   ', line2: '7815 RE Emmen' },
        'AGBC Emmen',
      ),
    ).toBe('7815 RE Emmen');
  });

  test('yields null when there is nothing usable', () => {
    expect(resolveAddressLine(null, 'AGBC Emmen')).toBeNull();
    expect(resolveAddressLine({}, 'AGBC Emmen')).toBeNull();
    expect(
      resolveAddressLine({ line1: 'AGBC Emmen' }, 'agbc emmen'),
    ).toBeNull();
  });
});

describe('branchInitial', () => {
  test('drops the org prefix so sibling branches stay distinct', () => {
    expect(branchInitial('AGBC Glasgow')).toBe('G');
    expect(branchInitial('AGBC Lighthouse Berlin')).toBe('L');
    expect(branchInitial('AGBC Emmen')).toBe('E');
    expect(branchInitial('Miracle center Ogbomosho')).toBe('M');
  });

  test('handles odd input without crashing', () => {
    expect(branchInitial('AGBC')).toBe('A');
    expect(branchInitial('  spaced  name ')).toBe('S');
    expect(branchInitial('')).toBe('?');
  });
});
