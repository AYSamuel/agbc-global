import {
  applyView,
  branchColorAt,
  fitBranches,
  MAX_SCALE,
  MIN_SCALE,
  placeBranches,
  project,
  zoomView,
  type BranchPoint,
  type MapViewport,
} from '../mapProjection';

// Equirectangular projection (docs/spec/09, ADR 0009). The one property that must
// hold: a branch's lat/lng lands where the coastline for that lat/lng is drawn,
// because both use this same function. So the tests assert the geometry directly.

const vp: MapViewport = { width: 360, height: 360 };

describe('project', () => {
  test('longitude maps linearly across the full width', () => {
    // -180 at the left edge, +180 at the right, 0 in the middle.
    expect(project(-180, 0, vp).x).toBeCloseTo(0);
    expect(project(180, 0, vp).x).toBeCloseTo(360);
    expect(project(0, 0, vp).x).toBeCloseTo(180);
  });

  test('the world band is centred vertically, 2:1', () => {
    // width 360 -> world height 180, centred in height 360 -> 90px letterbox.
    // The equator sits at the band's middle.
    expect(project(0, 0, vp).y).toBeCloseTo(90 + 90);
    // North pole at the top of the band, south pole at the bottom.
    expect(project(0, 90, vp).y).toBeCloseTo(90);
    expect(project(0, -90, vp).y).toBeCloseTo(270);
  });

  test('a northern-hemisphere point sits above the equator (smaller y)', () => {
    // Glasgow (~56N) must be well above Ogbomosho (~8N).
    expect(project(-4, 56, vp).y).toBeLessThan(project(4, 8, vp).y);
  });

  test('the two hemispheres land on the correct sides', () => {
    // Berlin (13E) is east of Glasgow (4W): larger x.
    expect(project(13.36, 52.55, vp).x).toBeGreaterThan(
      project(-4.02, 55.86, vp).x,
    );
  });
});

const branches: BranchPoint[] = [
  { id: 'gla', slug: 'glasgow', name: 'AGBC Glasgow', lat: 55.86, lng: -4.02 },
  { id: 'ogb', slug: 'ogbomosho', name: 'Ogbomosho', lat: 8.13, lng: 4.24 },
];

describe('placeBranches', () => {
  test('projects each branch to a point', () => {
    const placed = placeBranches(branches, vp);
    expect(placed).toHaveLength(2);
    expect(placed[0]?.item.id).toBe('gla');
    expect(placed[0]?.point).toEqual(project(-4.02, 55.86, vp));
  });
});

describe('view: fit + zoom (docs/spec/09 zoom)', () => {
  test('fitBranches centres the branch bounding box in the canvas', () => {
    const view = fitBranches(branches, vp);
    // The centre of the two branches must land at the canvas centre.
    const centre = {
      x: (project(-4.02, 55.86, vp).x + project(4.24, 8.13, vp).x) / 2,
      y: (project(-4.02, 55.86, vp).y + project(4.24, 8.13, vp).y) / 2,
    };
    const screen = applyView(centre, view);
    expect(screen.x).toBeCloseTo(vp.width / 2, 0);
    expect(screen.y).toBeCloseTo(vp.height / 2, 0);
  });

  test('fitBranches zooms IN past the whole-world view for a small cluster', () => {
    // Two churches a few thousand km apart occupy a fraction of the globe, so
    // the fit must be well above scale 1 (the whole world).
    expect(fitBranches(branches, vp).scale).toBeGreaterThan(MIN_SCALE);
  });

  test('zoom in raises the scale and zoom out lowers it, both clamped', () => {
    const base = fitBranches(branches, vp);
    const inOne = zoomView(base, 1.6, vp);
    expect(inOne.scale).toBeGreaterThan(base.scale);
    // Zooming out repeatedly cannot go below the whole-world scale.
    let v = base;
    for (let i = 0; i < 20; i++) v = zoomView(v, 0.5, vp);
    expect(v.scale).toBe(MIN_SCALE);
    // Zooming in repeatedly cannot exceed the max.
    let w = base;
    for (let i = 0; i < 40; i++) w = zoomView(w, 2, vp);
    expect(w.scale).toBe(MAX_SCALE);
  });

  test('zoom keeps the canvas centre fixed', () => {
    const base = fitBranches(branches, vp);
    // Whatever base point sits under the canvas centre stays there after a zoom.
    const centreBase = {
      x: (vp.width / 2 - base.tx) / base.scale,
      y: (vp.height / 2 - base.ty) / base.scale,
    };
    const zoomed = zoomView(base, 1.6, vp);
    const after = applyView(centreBase, zoomed);
    expect(after.x).toBeCloseTo(vp.width / 2, 1);
    expect(after.y).toBeCloseTo(vp.height / 2, 1);
  });
});

describe('branchColorAt', () => {
  const pal = ['#a', '#b', '#c'];
  test('assigns a stable colour per index and cycles past the end', () => {
    expect(branchColorAt(0, pal)).toBe('#a');
    expect(branchColorAt(2, pal)).toBe('#c');
    expect(branchColorAt(3, pal)).toBe('#a');
  });
});
