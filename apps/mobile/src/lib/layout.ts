import { useWindowDimensions } from 'react-native';

/**
 * The one place the app decides it is on a big screen (W4.7 slice 4).
 *
 * `05` (decision 2026-07-12) says v1 ships real tablet layouts rather than a
 * capped column, and puts the line at "above ~600dp width": above it, list-heavy
 * tabs move to master-detail or multi-column grids and the bottom tab bar
 * becomes a nav rail.
 *
 * WHY A HOOK AND NOT A CONSTANT. It reads `useWindowDimensions`, so it answers
 * again when the window changes: a tablet rotating, and on current Android a
 * FREE-FORM or split-screen window, which the platform can resize at any moment
 * and which ignores an app's orientation lock outright (mobile standard, and
 * `05` says the same). A layout decided once at launch is wrong the first time
 * somebody turns the device.
 *
 * 600dp is the same line Android's own `sw600dp` resource qualifier draws, so a
 * device that the platform calls a tablet and a device that this app calls a
 * tablet are the same device. `sw` is SMALLEST width, and that word is
 * load-bearing: it is the shorter side, so it does not change when the device
 * turns.
 *
 * MEASURING THE CURRENT WIDTH INSTEAD WAS A BUG, caught while writing the
 * two-pane tests (2026-09-02). A large phone in landscape is over 1000dp wide,
 * so it would have been handed the rail and the master-detail layout. The only
 * screen this app lets a phone rotate to is the sermon player, where turning the
 * device means "make the video bigger" and emphatically not "spend 396dp on a
 * list". Smallest-width keeps a phone a phone in both orientations.
 */
export const TABLET_MIN_WIDTH = 600;

export interface Layout {
  /** The device's SMALLEST side is at least `TABLET_MIN_WIDTH`: rail instead of
   *  tabs, panes instead of a single column. Stable across rotation. */
  isTablet: boolean;
  /** Wider than tall. Two-pane layouts want landscape; portrait tablets get the
   *  centred column instead (the mockup draws both). */
  isLandscape: boolean;
  width: number;
  height: number;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return {
    // The SHORTER side, so turning the device cannot change what kind of device
    // this is (Android's own `sw600dp`).
    isTablet: Math.min(width, height) >= TABLET_MIN_WIDTH,
    isLandscape: width > height,
    width,
    height,
  };
}
