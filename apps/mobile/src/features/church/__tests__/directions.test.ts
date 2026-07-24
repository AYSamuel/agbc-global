import { canRouteTo, directionsUrl, hasCoordinates } from '../directions';

const BERLIN = {
  address: 'Oudenarder Str. 16, 13347 Berlin, Berlin, Germany',
  lat: 52.5502,
  lng: 13.3563,
  label: 'AGBC Lighthouse Berlin',
};

describe('hasCoordinates', () => {
  it('accepts real coordinates and rejects the 0/0 sentinel', () => {
    expect(hasCoordinates(52.55, 13.36)).toBe(true);
    expect(hasCoordinates(0, 0)).toBe(false);
    expect(hasCoordinates(Number.NaN, 13.36)).toBe(false);
  });
});

describe('canRouteTo', () => {
  it('routes with an address, with coordinates, or not at all', () => {
    expect(canRouteTo(BERLIN)).toBe(true);
    expect(canRouteTo({ ...BERLIN, address: '' })).toBe(true);
    expect(canRouteTo({ address: '', lat: 0, lng: 0, label: 'x' })).toBe(false);
  });
});

describe('directionsUrl', () => {
  it('prefers the street address: the stored lat/lng are map-level, not venue-level', () => {
    const url = directionsUrl(BERLIN);
    expect(url).toContain(encodeURIComponent('Oudenarder Str. 16'));
    expect(url).not.toContain('52.5502');
  });

  it('falls back to coordinates with the label when no address exists', () => {
    const url = directionsUrl({ ...BERLIN, address: '' });
    expect(url).toContain('52.5502');
    expect(url).toContain('13.3563');
    expect(url).not.toContain(' ');
  });
});
