import { pseudoBundle, pseudoString } from '../pseudo';

/**
 * The one way pseudo-localization can do real damage: accenting the parts a
 * string needs in order to work. `{{count}}` accented is not a foreign-looking
 * placeholder, it is a deleted value, and `<1>` accented is a `Trans` tag that no
 * longer matches. Everything else here is cosmetic; these two are not.
 */
describe('pseudo-localization keeps what the string needs to work', () => {
  test('interpolations pass through untouched', () => {
    const out = pseudoString('Welcome to the family, {{name}}.');
    expect(out).toContain('{{name}}');
    expect(out).not.toContain('{{ñàm̀é}}');
  });

  test('plural counts pass through untouched', () => {
    expect(pseudoString('{{count}} weeks')).toContain('{{count}}');
  });

  test('Trans tags pass through untouched', () => {
    // `rhythm:visiting` really carries these.
    const out = pseudoString('Visiting <1>{{branch}}</1> today?');
    expect(out).toContain('<1>');
    expect(out).toContain('</1>');
    expect(out).toContain('{{branch}}');
  });

  test('the words around them are visibly not English', () => {
    const out = pseudoString('Save');
    expect(out).not.toContain('Save');
    expect(out.startsWith('[[')).toBe(true);
    expect(out.endsWith(']]')).toBe(true);
  });

  test('the string grows, so a container that cannot hold it shows', () => {
    const source = 'Read the full privacy policy';
    // Brackets plus padding, on top of the accented body.
    expect(pseudoString(source).length).toBeGreaterThan(source.length * 1.3);
  });
});

describe('a whole bundle keeps its shape', () => {
  test('keys and nesting are unchanged, only the values move', () => {
    const out = pseudoBundle({
      appName: 'AGBC Global',
      brand: { line1: 'Amazing Grace', line2: 'Bible Church' },
      weeks_one: '{{count}} week',
    });

    expect(Object.keys(out)).toEqual(['appName', 'brand', 'weeks_one']);
    expect(Object.keys(out.brand as object)).toEqual(['line1', 'line2']);
    // The plural SUFFIX is part of the key, so it must survive: a pseudo bundle
    // whose `weeks_one` became `wééķš_ôñé` would resolve nothing.
    expect(out.weeks_one).toContain('{{count}}');
  });
});
