import { Platform } from 'react-native';

// The Directions action on BRANCH-INFO (docs/spec/04): hand the maps app a
// STREET ADDRESS whenever the branch has one and let it geocode precisely.
// branches.lat/lng are city-level points for the global family map (docs/spec
// /02) and can sit a kilometre from the venue (Ayo's report, 2026-07-24), so
// coordinates are only the fallback. A branch with neither hides the action
// (never errors); 0/0 is the useBranches sentinel for "missing".

export interface DirectionsTarget {
  /** Full display address ('line1, line2'); empty string = none. */
  address: string;
  lat: number;
  lng: number;
  /** Venue label for the map pin in the coordinate fallback. */
  label: string;
}

export function hasCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

export function canRouteTo(target: DirectionsTarget): boolean {
  return target.address !== '' || hasCoordinates(target.lat, target.lng);
}

export function directionsUrl(target: DirectionsTarget): string {
  if (target.address !== '') {
    const query = encodeURIComponent(target.address);
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${query}`
      : `geo:0,0?q=${query}`;
  }
  const at = `${String(target.lat)},${String(target.lng)}`;
  const label = encodeURIComponent(target.label);
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${at}`
    : `geo:${at}?q=${at}(${label})`;
}
