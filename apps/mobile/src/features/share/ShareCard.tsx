import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { fontFamily, shareCard } from '@agbc/shared/theme';

import { BookIcon, GradientFill } from '@/components/ui';

import type { ShareContent } from './content';
import { CARD_RENDER_DP, CARD_SCALE } from './geometry';

/**
 * THE ONE PLACE THE CARD'S DESTINATION IS WRITTEN (W4.15, Ayo 2026-09-12).
 *
 * The church's front door, chosen against what exists rather than as a preference. The
 * two destinations that would be better are a page that routes to the app store and a
 * per-content deep link, and the website can support neither today: it has no page per
 * testimony or event. Revisit the moment it grows either.
 *
 * ONE CONSTANT because eleven layouts will print it and a change must be a one-line edit.
 * If the QR proves unscannable after a real forward (plan §10), the lever is this string
 * rather than the code's size: 14 bytes or fewer encodes as a 21-module version 1 instead
 * of 25, which is 14% bigger modules at no cost in card space, and `agbcglobal.com`
 * without the scheme is exactly 14. That is the fallback, not the default: an explicit
 * `https://` is the more reliably parsed of the two, and reliability is this element's
 * whole job.
 */
export const SHARE_URL = 'https://agbcglobal.com';

/** What the footer PRINTS, which is the address without its scheme. Derived, never a
 * second literal: the printed words and the scanned target are one fact. */
const SHARE_URL_LABEL = SHARE_URL.replace(/^https?:\/\//, '');

const u = CARD_SCALE;

/**
 * The share card (W4.15), drawn from the mockup's `.sc` frames.
 *
 * NOT THEME-AWARE, and `shareCard`'s own header says why at length: this view becomes a
 * PNG that leaves the app, so it has no theme to follow. It takes no colours from
 * `useTheme()` and must not start to.
 *
 * NO FONT SCALING, ANYWHERE. Every other surface in this app honours the device's text
 * setting up to 200% and must; this one is a fixed 1080 canvas, and at 200% the words
 * would simply leave the picture. A member's own setting is honoured by the other button
 * on the sheet, which sends text their reader can size, speak and translate (plan §6).
 *
 * `collapsable={false}` is load-bearing rather than decorative: React Native flattens a
 * View that draws nothing of its own into its parent, and a flattened view has no native
 * view for `captureRef` to rasterise. It is the difference between a PNG and a crash.
 */
export const ShareCard = forwardRef<View, { content: ShareContent }>(
  function ShareCard({ content }, ref) {
    const { t } = useTranslation();
    const ground = shareCard.ground.cream;

    // Composed outside JSX: the i18n lint rule bans literals in markup, and scripture
    // plus its reference are data, not translatable copy (the `VerseCard` precedent).
    const quoted = `“${content.text}”`;
    const attribution = `${content.reference} · ${content.translation}`;

    return (
      <View
        ref={ref}
        collapsable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: CARD_RENDER_DP,
          height: CARD_RENDER_DP,
          borderRadius: 60 * u,
          borderWidth: 3 * u,
          borderColor: ground.border,
          overflow: 'hidden',
          paddingVertical: 81 * u,
          paddingHorizontal: 78 * u,
          justifyContent: 'space-between',
        }}
      >
        {/* `.sc-cream` is linear-gradient(135deg), which is `diagonal` exactly. */}
        <GradientFill direction="diagonal" from={ground.from} to={ground.to} />

        {/* `.scrow1`: the kicker every card opens with, lifted from `.verse .row1` so
            eleven cards read as one family. */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * u }}
        >
          <BookIcon size={48 * u} color={ground.kickerIcon} strokeWidth={1.9} />
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 30 * u,
              letterSpacing: 5.1 * u,
              textTransform: 'uppercase',
              color: ground.kickerLabel,
            }}
          >
            {t('home:verseEyebrow')}
          </Text>
        </View>

        {/* `.scmid`: the content, vertically centred on a flat ground. */}
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingVertical: 48 * u,
          }}
        >
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fontFamily.display.bold,
              fontSize: 75 * u,
              lineHeight: 100.5 * u,
              letterSpacing: -1.125 * u,
              color: ground.quote,
            }}
          >
            {quoted}
          </Text>
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 39 * u,
              marginTop: 48 * u,
              color: ground.attribution,
            }}
          >
            {attribution}
          </Text>
        </View>

        {/* `.scfoot`: the mark, the address and the QR. On EVERY card, and forced rather
            than chosen: `expo-sharing` sends a file and nothing else, so on Android no
            caption, no link and no app name travels beside the picture, and whatever a
            stranger needs in order to find us has to be printed here (plan §3). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 36 * u,
            paddingTop: 39 * u,
            borderTopWidth: 3 * u,
            borderTopColor: ground.footLine,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 27 * u,
              minWidth: 0,
            }}
          >
            <View
              style={{
                width: 81 * u,
                height: 81 * u,
                borderRadius: 24 * u,
                backgroundColor: shareCard.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                allowFontScaling={false}
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 48 * u,
                  color: shareCard.onAccent,
                }}
              >
                {t('brand.monogram')}
              </Text>
            </View>
            <View style={{ minWidth: 0 }}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 40.5 * u,
                  letterSpacing: -0.405 * u,
                  color: ground.wordmark,
                }}
              >
                {t('appName')}
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 31.5 * u,
                  letterSpacing: 0.63 * u,
                  marginTop: 3 * u,
                  color: ground.url,
                }}
              >
                {SHARE_URL_LABEL}
              </Text>
            </View>
          </View>
          <ShareCardQr />
        </View>
      </View>
    );
  },
);

/**
 * The QR, and THE ONLY ELEMENT ON THE CARD A RECIPIENT CAN ACT ON. The card is a PNG, so
 * the printed address carries the information but not the route: somebody has to read it,
 * leave the chat and type it. This is scannable straight off the received image.
 *
 * SIZED BY ARITHMETIC AND TIGHTER THAN IT LOOKS. 138 units is 138 real px on the finished
 * card, and `https://agbcglobal.com` is 22 bytes, which encodes as a 25-module version 2
 * at error correction M. With a 4-module quiet zone each side that is 33 module-widths
 * across 138px, so a module is 4.2px: comfortable at full size, and NOT what a recipient
 * gets. Chat apps recompress, and at an 800px downscale a module falls to 3.1px, at or
 * under what a scanner resolves. Drawn bigger than the footer really wants for exactly
 * that reason, and the acceptance test is scanning the card AFTER it has been through
 * WhatsApp, never the PNG we produced (plan §10).
 */
function ShareCardQr() {
  const size = 138 * u;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 15 * u,
        overflow: 'hidden',
        backgroundColor: shareCard.qrBackground,
      }}
    >
      <QRCode
        value={SHARE_URL}
        // `size` is the WHOLE box: the component expands its viewBox by `quietZone` and
        // still renders at `size` px, so the margin comes out of the code rather than
        // growing the element. 4 modules of 25 is the standard quiet zone.
        size={size}
        quietZone={(size * 4) / 25}
        color={shareCard.qrModules}
        backgroundColor={shareCard.qrBackground}
        // Stated rather than left to the default. M is what the frame's own code uses and
        // what 22 bytes fits in 25 modules; H would survive more damage at the cost of a
        // denser code, which is the wrong trade when the threat is downscaling.
        ecl="M"
      />
    </View>
  );
}
