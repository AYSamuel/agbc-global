import { WORLD_LAND } from './world-land';

// Map geometry for the Family map (docs/spec/09, ADR 0009). Pure math: the same
// equirectangular projection places the coastline rings AND the pins, so a pin at
// a branch's lat/lng lands on the drawn land.
//
// Equirectangular (plate carrée) is deliberate: it is the projection the source
// data is already in (lng/lat map linearly to x/y), so "project" is one multiply
// and the land needs no reprojection. The map is decorative, not navigational, so
// the distortion toward the poles does not matter (ADR 0009).

export interface MapViewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// The world is 360deg wide by 180deg tall (2:1). We fit that to the canvas WIDTH
// and centre it vertically, so the whole family is visible with no horizontal
// crop. A phone's map area is taller than 2:1, so there is letterbox space above
// and below the world band; the sea fill covers it.
export function project(
  lng: number,
  lat: number,
  viewport: MapViewport,
): Point {
  const worldHeight = viewport.width / 2;
  const yOffset = (viewport.height - worldHeight) / 2;
  return {
    x: ((lng + 180) / 360) * viewport.width,
    y: yOffset + ((90 - lat) / 180) * worldHeight,
  };
}

// Build the SVG path `d` for every land ring, projected. One string keeps the
// react-native-svg tree to a single <Path> node rather than 80+.
export function landPath(viewport: MapViewport): string {
  const parts: string[] = [];
  for (const ring of WORLD_LAND) {
    // Step by pairs; the `i + 1 < length` bound guarantees both indices exist
    // (rings are always even-length lng/lat pairs) without an undefined check.
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const { x, y } = project(ring[i], ring[i + 1], viewport);
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    parts.push('Z');
  }
  return parts.join('');
}

export interface BranchPoint {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PlacedPin<T> {
  item: T;
  point: Point;
}

export function placeBranches(
  branches: BranchPoint[],
  viewport: MapViewport,
): PlacedPin<BranchPoint>[] {
  return branches.map((b) => ({
    item: b,
    point: project(b.lng, b.lat, viewport),
  }));
}

// Note: the map draws branch pins only. Separate testimony pins were dropped
// (2026-07-24): a testimony's only location is its branch, so they clustered on
// the branch pins and read as extra branches. The "family, lately" sheet is the
// testimony surface instead.

// ---------------------------------------------------------------------------
// Zoom + fit. A MapView scales and translates the base projection: the land
// (an SVG <G transform>) scales with it, while pins are transformed in JS with
// applyView so their RADII stay constant as you zoom (a scaled <Circle> would
// balloon). scale 1 = the whole world fits the canvas width (docs/spec/09).
// ---------------------------------------------------------------------------

export interface MapView {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY_VIEW: MapView = { scale: 1, tx: 0, ty: 0 };

// scale 1 is the whole world; you cannot zoom out past it. The max is a
// close-in cap so the +/- buttons stop somewhere sensible.
export const MIN_SCALE = 1;
export const MAX_SCALE = 18;
// The default view frames the branches, not the whole world, so a handful of
// churches spread across two continents read clearly; padding keeps them off the
// edges, and this cap stops a tight cluster from zooming in absurdly far.
const FIT_MAX_SCALE = 9;
const FIT_PADDING = 0.62;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function applyView(point: Point, view: MapView): Point {
  return {
    x: point.x * view.scale + view.tx,
    y: point.y * view.scale + view.ty,
  };
}

export function landTransform(view: MapView): string {
  return `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.scale.toFixed(4)})`;
}

// The opening view: centre the branches' bounding box and zoom to fill the
// canvas with padding. A single branch (zero span) falls back to a fixed zoom.
export function fitBranches(
  branches: BranchPoint[],
  viewport: MapViewport,
): MapView {
  if (branches.length === 0 || viewport.width === 0) return IDENTITY_VIEW;
  const points = branches.map((b) => project(b.lng, b.lat, viewport));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const spanScale = Math.min(
    bboxW > 0 ? (viewport.width * FIT_PADDING) / bboxW : FIT_MAX_SCALE,
    bboxH > 0 ? (viewport.height * FIT_PADDING) / bboxH : FIT_MAX_SCALE,
  );
  const scale = clamp(spanScale, MIN_SCALE, FIT_MAX_SCALE);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    scale,
    tx: viewport.width / 2 - cx * scale,
    ty: viewport.height / 2 - cy * scale,
  };
}

// Zoom around the canvas centre (what the +/- buttons do): the point under the
// centre stays put, so it feels like stepping toward what you are looking at.
export function zoomView(
  view: MapView,
  factor: number,
  viewport: MapViewport,
): MapView {
  const nextScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = nextScale / view.scale;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  return {
    scale: nextScale,
    tx: cx - (cx - view.tx) * ratio,
    ty: cy - (cy - view.ty) * ratio,
  };
}

// Categorical colour for a branch by its position (docs/spec/09: nations read
// apart). Stable per branch, cycles if branches ever outnumber the palette.
export function branchColorAt(
  index: number,
  palette: readonly string[],
): string {
  if (palette.length === 0) return '#000000';
  return palette[index % palette.length];
}
