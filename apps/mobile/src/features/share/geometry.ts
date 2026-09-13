import { PixelRatio } from 'react-native';

/**
 * The share card's design space (W4.15).
 *
 * THE CARD IS DRAWN IN 1080-UNIT SPACE AND RENDERED AT A FRACTION OF IT. Every size in
 * `ShareCard` is written as the value it has on the finished 1080 x 1080 PNG and
 * multiplied by `CARD_SCALE`, so the component reads the same as the mockup frame, which
 * is drawn at 360 css px for 1080 (one css px there is three real ones: the 25px quote in
 * `entry-flow.html` is the 75 written here).
 *
 * WHY NOT JUST RENDER AT 1080 LOGICAL PX AND CAPTURE 1:1. Because a logical pixel is not
 * a real one. `react-native-view-shot`'s own README says it plainly ("the snapshot image
 * result is in real pixel size where the width/height defined in a React Native style are
 * defined in point unit"), so a 1080dp card on a 3x phone rasterises at 3240 x 3240,
 * which is a 42 MB bitmap to make a 1080 picture. `width`/`height` would then resize it
 * back down, and that option RESIZES THE RESULT rather than setting the render size
 * ("resized from the View bound"), so it is a second resample on top of the first.
 *
 * So the card is rendered at exactly the dp that lands on 1080 REAL pixels for this
 * device, and captured at its natural size with no resize option at all. On a 3x phone
 * that is 360dp, on a 2.625x phone 411.43dp, and the PNG is 1080 either way. The render
 * is never scaled, so nothing is soft.
 *
 * `roundToNearestPixel` is what keeps the arithmetic honest: it snaps the dp value onto a
 * whole physical pixel, so the capture lands on 1080 rather than 1079.6 and the card's
 * edges stay sharp instead of straddling a pixel boundary.
 */
export const CARD_UNITS = 1080;

/** The card's on-device size in dp. Off-screen, so it may exceed the screen's width. */
export const CARD_RENDER_DP = PixelRatio.roundToNearestPixel(
  CARD_UNITS / PixelRatio.get(),
);

/** Design unit -> dp. Write sizes as their real 1080-card values and multiply. */
export const CARD_SCALE = CARD_RENDER_DP / CARD_UNITS;

/**
 * The real pixel size the capture is expected to produce, for the dev-only check in
 * `capture.ts`. Not a promise the code can keep on its own: it is what the device's own
 * rasteriser does with the view above, which is why it is asserted on a device rather
 * than trusted.
 */
export const CARD_EXPECTED_PX = Math.round(CARD_RENDER_DP * PixelRatio.get());
