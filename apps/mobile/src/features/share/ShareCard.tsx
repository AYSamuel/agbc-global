import { Image } from 'expo-image';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextLayoutEvent,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { fontFamily, palette, shareCard } from '@agbc/shared/theme';

import {
  BookIcon,
  GradientFill,
  HeartIcon,
  SparkleIcon,
  type GradientStop,
} from '@/components/ui';
import { useSignedPhotoUrl } from '@/features/family/useSignedPhotoUrl';

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

/**
 * How long a photo card waits for its picture before giving up and drawing the ink
 * card instead. A signed URL is minted, then the bytes fetched, and on a slow link
 * that is not instant; but a sheet that says "Getting it ready" forever is a member
 * who cannot share at all, and the frame names the ink card as this card's fallback.
 */
export const PHOTO_DEADLINE_MS = 8000;

const u = CARD_SCALE;

/**
 * THE AUTO-FIT LADDER (plan §6): three display sizes, in real px on the finished card
 * (`.scq`, `.scq.sm`, `.scq.xs` in the frames). The quote steps down through them looking
 * for one that fits, and only when the smallest still overflows is it cut. Letter-spacing
 * is `-.015em` on `.scq` and inherited by the smaller rungs, so it scales with the size.
 */
const QUOTE_RUNGS = [
  { fontSize: 75, lineHeight: 100.5 },
  { fontSize: 63, lineHeight: 88.2 },
  { fontSize: 54, lineHeight: 78.3 },
] as const;

/** `.scmore`'s own height plus its margin, reserved before the words are cut so the line
 * that says they were cut does not itself push the footer off the card. */
const CUT_LINE_UNITS = 33 + 42;

type Ground = 'cream' | 'ink' | 'photo';

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
 * IT SAYS WHEN IT IS READY, and the sheet captures then rather than on first layout: a
 * quote has to find its size, a photo has to arrive or give up, and a capture taken
 * before either is a picture of a card that was still being composed. `onReady` fires
 * once per mount.
 *
 * `collapsable={false}` is load-bearing rather than decorative: React Native flattens a
 * View that draws nothing of its own into its parent, and a flattened view has no native
 * view for `captureRef` to rasterise. It is the difference between a PNG and a crash.
 */
export interface ShareCardProps {
  content: ShareContent;
  onReady: () => void;
}

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { content, onReady },
  ref,
) {
  const { t } = useTranslation();

  // The photo's three states. `none` for every card that has no picture to wait for.
  const photoPath = content.kind === 'testimony' ? content.photoPath : null;
  const [photo, setPhoto] = useState<'none' | 'pending' | 'shown' | 'fallback'>(
    photoPath === null ? 'none' : 'pending',
  );
  const [fitted, setFitted] = useState(false);
  // Where the words begin, in dp from the card's top, so a photo's scrim can be dark
  // exactly from there. Null until the block has been measured.
  const [blockTop, setBlockTop] = useState<number | null>(null);

  // Fires once. Both halves can settle in either order, and a re-measure after the
  // capture must not announce a second readiness.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !fitted || photo === 'pending') return;
    announced.current = true;
    onReady();
  }, [fitted, photo, onReady]);

  const ground: Ground =
    content.kind === 'verse' ? 'cream' : photo === 'shown' ? 'photo' : 'ink';
  const tokens = shareCard.ground[ground];

  const kicker =
    content.kind === 'verse' ? (
      <Kicker
        icon={
          <BookIcon size={48 * u} color={tokens.kickerIcon} strokeWidth={1.9} />
        }
        label={t('home:verseEyebrow')}
        color={tokens.kickerLabel}
      />
    ) : content.kind === 'testimony' ? (
      <Kicker
        icon={
          <SparkleIcon
            size={48 * u}
            color={tokens.kickerIcon}
            strokeWidth={1.7}
          />
        }
        label={t('share.kicker.testimony')}
        color={tokens.kickerLabel}
      />
    ) : (
      <Kicker
        icon={
          <HeartIcon
            size={48 * u}
            color={tokens.kickerIcon}
            strokeWidth={1.8}
          />
        }
        label={t('share.kicker.prayer')}
        color={tokens.kickerLabel}
      />
    );

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
        // Only the cream card draws a hairline edge (`.sc-cream{border:1px solid}`).
        borderWidth: ground === 'cream' ? 3 * u : 0,
        borderColor:
          ground === 'cream' ? shareCard.ground.cream.border : undefined,
        overflow: 'hidden',
        paddingVertical: 81 * u,
        paddingHorizontal: 78 * u,
        justifyContent: 'space-between',
      }}
    >
      <GroundLayer
        ground={ground}
        photoPath={photoPath}
        photoState={photo}
        blockTop={blockTop}
        onPhoto={setPhoto}
      />

      {/* `.scrow1` sits at the top of a cream or ink card, where the ground is known. On a
          photo card it moves down into the block with the words (the frame's rule since
          2026-09-13: words on a photograph live at the foot, under the 94% scrim). */}
      {ground === 'photo' ? <View /> : kicker}

      <Middle
        ground={ground}
        content={content}
        kicker={ground === 'photo' ? kicker : null}
        // A card that carries a picture starts the ladder one rung down: the frame's
        // photo testimony is drawn at `.scq.sm`, and on the device the top rung floated
        // the kicker up to where the scrim is still thin over a bright sky. Decided by
        // the path rather than by the ground, because the ground is not known until the
        // picture has loaded and the ladder must not restart when it does.
        startRung={photoPath === null ? 0 : 1}
        onFitted={setFitted}
        onBlockTop={setBlockTop}
      />

      <Footer ground={ground} />
    </View>
  );
});

/** `.scrow1`: the kicker every card opens with, lifted from `.verse .row1` so eleven
 * cards read as one family. */
function Kicker({
  icon,
  label,
  color,
}: {
  icon: ReactNode;
  label: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 * u }}>
      {icon}
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 30 * u,
          letterSpacing: 5.1 * u,
          textTransform: 'uppercase',
          color,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** `rgba(r,g,b,a)` from the token file as the hex + alpha `GradientFill` wants. The
 * tokens stay the frame's literals; this is the one place that has to unpack them. */
function rgbaStop(offset: string, token: string): GradientStop {
  const parts = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(token);
  if (!parts) return { offset, color: token };
  const hex = [parts[1], parts[2], parts[3]]
    .map((c) => Number(c).toString(16).padStart(2, '0'))
    .join('');
  return { offset, color: `#${hex}`, opacity: Number(parts[4]) };
}

/**
 * THE SCRIM FOLLOWS THE WORDS (2026-09-13, measured on the device rather than decided at
 * the frame). The frame's scrim is 30% at the top, 62% at 42% and 94% at the foot, and
 * the words were moved to the foot so they would sit under the 94%. That holds for a
 * short quote. A long one climbs: a four-line testimony at the top rung put its kicker
 * at 18% of the card, where the scrim is 44%, and over a white sky that measured 2.07:1
 * for the gold and 3.04:1 for the white quote line beneath it. So the 94% stop is not
 * fixed at the foot; it sits where the block of words begins, with the 62% stop a short
 * fade above it, and the picture above that keeps the frame's 30%. The frame's stops are
 * what a block at the frame's own height produces, so a short quote still draws exactly
 * the frame.
 */
function photoScrim(blockTop: number | null): GradientStop[] {
  const top =
    blockTop === null ? 0.42 : Math.min(0.94, blockTop / CARD_RENDER_DP);
  const fadeFrom = Math.max(0, top - 0.14);
  const pct = (fraction: number) =>
    `${String(Math.round(fraction * 1000) / 10)}%`;
  return [
    rgbaStop('0%', shareCard.ground.photo.scrimTop),
    rgbaStop(pct(fadeFrom), shareCard.ground.photo.scrimTop),
    rgbaStop(
      pct(Math.max(fadeFrom, top - 0.02)),
      shareCard.ground.photo.scrimMiddle,
    ),
    rgbaStop(pct(top), shareCard.ground.photo.scrimBottom),
    rgbaStop('100%', shareCard.ground.photo.scrimBottom),
  ];
}

/**
 * What the card is drawn on. Cream and ink are the frames' gradients at their own
 * angles. Photo is the picture under `.photo::before`'s scrim, strengthened, because the
 * words sit low and the photograph underneath is one nobody has vetted.
 *
 * THE PICTURE HAS TO ARRIVE BEFORE THE CAPTURE, and it may never arrive: the signed URL
 * can be refused, the fetch can fail, the member can be offline. Every one of those
 * becomes the ink card, which the frame names as this card's fallback, and none of them
 * is an error the member sees: the words are the testimony, the picture was the ground.
 */
function GroundLayer({
  ground,
  photoPath,
  photoState,
  blockTop,
  onPhoto,
}: {
  ground: Ground;
  photoPath: string | null;
  photoState: 'none' | 'pending' | 'shown' | 'fallback';
  blockTop: number | null;
  onPhoto: (state: 'shown' | 'fallback') => void;
}) {
  if (ground === 'cream') {
    // `.sc-cream` is linear-gradient(135deg), which is `diagonal` exactly.
    return (
      <GradientFill
        direction="diagonal"
        from={shareCard.ground.cream.from}
        to={shareCard.ground.cream.to}
      />
    );
  }
  if (photoPath === null || photoState === 'fallback') {
    return (
      <GradientFill
        angle={150}
        from={shareCard.ground.ink.from}
        to={shareCard.ground.ink.to}
      />
    );
  }
  return (
    <>
      <GradientFill
        angle={155}
        from={shareCard.ground.photo.from}
        to={shareCard.ground.photo.to}
      />
      <PhotoLayer path={photoPath} onSettled={onPhoto} />
      {photoState === 'shown' ? (
        <GradientFill
          angle={180}
          from={palette.ink}
          to={palette.ink}
          stops={photoScrim(blockTop)}
        />
      ) : null}
    </>
  );
}

function PhotoLayer({
  path,
  onSettled,
}: {
  path: string;
  onSettled: (state: 'shown' | 'fallback') => void;
}) {
  const signed = useSignedPhotoUrl(path);
  const settled = useRef(false);
  const settle = (state: 'shown' | 'fallback') => {
    if (settled.current) return;
    settled.current = true;
    onSettled(state);
  };

  // The mint refused, or the object is gone: the same answer as a fetch that failed.
  const url = signed.data ?? null;
  useEffect(() => {
    if (signed.isError || (signed.data !== undefined && url === null)) {
      settle('fallback');
    }
    // `settle` is stable by construction (a ref-guarded closure over a prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signed.isError, signed.data, url]);

  // The deadline, so a hanging fetch cannot hold the sheet open forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      settle('fallback');
    }, PHOTO_DEADLINE_MS);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (url === null) return null;
  return (
    <Image
      source={{ uri: url }}
      // The suite's handle: the picture is a ground, not a semantic element.
      testID="share-card-photo"
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      // No transition: the capture reads whatever is painted, and a fade-in that is
      // half way through at capture time is a half-bright photograph in the chat.
      transition={0}
      onLoad={() => {
        settle('shown');
      }}
      onError={() => {
        settle('fallback');
      }}
    />
  );
}

/**
 * `.scmid`: the content. Vertically centred on a flat ground, bottom-aligned on a photo
 * (the scrim is 62% at the middle and 94% at the foot, and the picture is one nobody has
 * seen yet), and the place the auto-fit ladder runs.
 *
 * FITS BY MEASURING THE LAID-OUT TEXT, NOT BY COUNTING CHARACTERS (plan §7). The block's
 * height is compared with the room the middle has; when it overflows, the quote steps
 * down a rung, and when the last rung still overflows, the quote is cut on a word
 * boundary to the lines that fit and the card SAYS SO in gold. A truncated quote that
 * pretends to be whole is the one outcome not allowed: this is somebody's testimony.
 */
function Middle({
  ground,
  content,
  kicker,
  startRung,
  onFitted,
  onBlockTop,
}: {
  ground: Ground;
  content: ShareContent;
  kicker: ReactNode;
  startRung: 0 | 1;
  onFitted: (fitted: boolean) => void;
  /** The block's top edge, in dp from the card's top, whenever it is laid out. */
  onBlockTop: (top: number) => void;
}) {
  const { t } = useTranslation();
  const tokens = shareCard.ground[ground];
  const [rung, setRung] = useState<number>(startRung);
  const [cut, setCut] = useState<string | null>(null);
  // The measurements live in refs and the decision runs from the layout events that
  // change them, never from an effect: every step here is "a measurement arrived, so
  // decide", which is exactly what an event handler is for, and setting state from an
  // effect body is the cascade React's own lint rule refuses.
  const room = useRef<number | null>(null);
  const needed = useRef<number | null>(null);
  const middleTop = useRef(0);
  const lines = useRef<TextLayoutEvent['nativeEvent']['lines'] | null>(null);

  const fullText =
    content.kind === 'verse'
      ? `“${content.text}”`
      : content.kind === 'testimony'
        ? `“${content.body}”`
        : // A prayer request is not a quotation. It is somebody asking.
          content.body;
  const shown = cut ?? fullText;
  const size = QUOTE_RUNGS[rung];

  const reconcile = () => {
    if (room.current === null || needed.current === null) return;
    // The cut line is reserved as soon as a cut becomes possible, so that adding it
    // cannot itself be what pushes the footer off the card.
    const lastRung = rung === QUOTE_RUNGS.length - 1;
    const reserve = lastRung && cut === null ? CUT_LINE_UNITS * u : 0;
    const overflow = needed.current + reserve - room.current;
    if (overflow <= 0) {
      onFitted(true);
      return;
    }
    onFitted(false);
    if (!lastRung) {
      lines.current = null;
      needed.current = null;
      setRung(rung + 1);
      return;
    }
    const measured = lines.current;
    if (measured === null || measured.length <= 1) return;
    const lineHeight = size.lineHeight * u;
    const drop = Math.max(1, Math.ceil(overflow / lineHeight));
    const keep = Math.max(1, measured.length - drop);
    const kept = measured
      .slice(0, keep)
      .map((line) => line.text)
      .join('')
      .trimEnd();
    // Back to the last word boundary, so a forwarded testimony never ends mid-word.
    const boundary = kept.lastIndexOf(' ');
    const text = (boundary > 0 ? kept.slice(0, boundary) : kept).replace(
      /[\s,;:]+$/,
      '',
    );
    lines.current = null;
    needed.current = null;
    setCut(`${text}…`);
  };

  // Composed outside JSX: the i18n lint rule bans literals in markup, and a reference
  // plus its translation are data, not translatable copy (the `VerseCard` precedent).
  const verseAttribution =
    content.kind === 'verse'
      ? `${content.reference} · ${content.translation}`
      : null;

  const attribution =
    verseAttribution !== null ? (
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 39 * u,
          marginTop: 48 * u,
          color: tokens.attribution,
        }}
      >
        {verseAttribution}
      </Text>
    ) : content.kind === 'verse' ? null : (
      <ByLine
        name={content.authorName ?? t('family:aMember')}
        // AN ANONYMOUS REQUEST DROPS THE BRANCH (plan §5), and this is a deliberate
        // departure from the feed, where "A member" already sits inside a branch-scoped
        // list the reader had to be in. On a card that gets forwarded, naming the branch
        // narrows an anonymous and possibly medical request to a few dozen people.
        branch={
          content.kind === 'prayer' && content.anonymous
            ? null
            : content.branchName
        }
        ground={ground}
      />
    );

  return (
    <View
      testID="share-card-middle"
      onLayout={(event: LayoutChangeEvent) => {
        // The room is the middle's own height less its vertical padding.
        room.current = event.nativeEvent.layout.height - 2 * 48 * u;
        middleTop.current = event.nativeEvent.layout.y;
        reconcile();
      }}
      style={{
        flex: 1,
        justifyContent: ground === 'photo' ? 'flex-end' : 'center',
        paddingVertical: 48 * u,
        // The block inside has to report its TRUE height, and inside a column with a
        // definite height Yoga measures a child with an at-most constraint, so a block
        // taller than the middle reported the middle's height (200dp for 14, 12 and 10
        // lines alike, on the device) and the ladder was cutting by estimate. `scroll`
        // is Yoga's word for "measure the children unbounded on the main axis"; nothing
        // here scrolls, and the card's own `overflow: hidden` still clips the picture.
        overflow: 'scroll',
      }}
    >
      <View
        // REMOUNTED ON EVERY STEP of the ladder, and that is the mechanism rather than
        // a tidy-up: React Native only dispatches `onLayout` when it sees a size change,
        // and on the device the block's second layout after a rung change never came,
        // which left the sheet on "Getting it ready" for good. A fresh mount always
        // measures, so every rung and every cut starts from a real number.
        key={`${String(rung)}:${cut ?? ''}`}
        testID="share-card-content"
        onLayout={(event: LayoutChangeEvent) => {
          needed.current = event.nativeEvent.layout.height;
          onBlockTop(middleTop.current + event.nativeEvent.layout.y);
          reconcile();
        }}
      >
        {kicker ? <View style={{ marginBottom: 42 * u }}>{kicker}</View> : null}
        <Text
          testID="share-card-quote"
          allowFontScaling={false}
          onTextLayout={(event) => {
            lines.current = event.nativeEvent.lines;
            reconcile();
          }}
          style={{
            fontFamily: fontFamily.display.bold,
            fontSize: size.fontSize * u,
            lineHeight: size.lineHeight * u,
            letterSpacing: -0.015 * size.fontSize * u,
            color: tokens.quote,
          }}
        >
          {shown}
        </Text>
        {cut !== null ? (
          // `.scmore`: said only when the words were actually cut. Gold, so it reads as
          // the one thing on the card worth acting on, and honest, so a forwarded
          // testimony never pretends to be complete.
          <Text
            allowFontScaling={false}
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 34.5 * u,
              letterSpacing: 1.035 * u,
              marginTop: 33 * u,
              color: shareCard.accent,
            }}
          >
            {t('share.readItAll')}
          </Text>
        ) : null}
        {content.kind === 'prayer' ? (
          // `.scask`: a quiet line, not a button. A picture has no controls, and drawing
          // one that cannot be pressed is a lie the card tells in every chat it lands in.
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 21 * u,
              marginTop: 45 * u,
            }}
          >
            <HeartIcon
              size={42 * u}
              color={shareCard.accent}
              strokeWidth={2.2}
            />
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 36 * u,
                letterSpacing: 0.72 * u,
                color: shareCard.accent,
              }}
            >
              {t('share.willYouPray')}
            </Text>
          </View>
        ) : null}
        {attribution}
      </View>
    </View>
  );
}

/** `.scby` with its `.b` line: who, and where. */
function ByLine({
  name,
  branch,
  ground,
}: {
  name: string;
  branch: string | null;
  ground: Ground;
}) {
  const tokens = shareCard.ground[ground];
  // The cream card has no `.b` line in any frame (a verse carries a reference, never a
  // branch), so it has no sub colour of its own; the attribution's serves if one ever
  // appears rather than a colour invented here.
  const sub =
    ground === 'cream'
      ? shareCard.ground.cream.attribution
      : shareCard.ground[ground].attributionSub;
  return (
    <View style={{ marginTop: 48 * u }}>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 39 * u,
          color: tokens.attribution,
        }}
      >
        {name}
      </Text>
      {branch ? (
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: fontFamily.body.semiBold,
            fontSize: 36 * u,
            marginTop: 9 * u,
            color: sub,
          }}
        >
          {branch}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * `.scfoot`: the mark, the address and the QR. On EVERY card, and forced rather than
 * chosen: `expo-sharing` sends a file and nothing else, so on Android no caption, no link
 * and no app name travels beside the picture, and whatever a stranger needs in order to
 * find us has to be printed here (plan §3).
 */
function Footer({ ground }: { ground: Ground }) {
  const { t } = useTranslation();
  const tokens = shareCard.ground[ground];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 36 * u,
        paddingTop: 39 * u,
        borderTopWidth: 3 * u,
        borderTopColor: tokens.footLine,
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
              color: tokens.wordmark,
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
              color: tokens.url,
            }}
          >
            {SHARE_URL_LABEL}
          </Text>
        </View>
      </View>
      <ShareCardQr />
    </View>
  );
}

/**
 * The QR, and THE ONLY ELEMENT ON THE CARD A RECIPIENT CAN ACT ON. The card is a PNG, so
 * the printed address carries the information but not the route: somebody has to read it,
 * leave the chat and type it. This is scannable straight off the received image.
 *
 * SIZED BY ARITHMETIC AND TIGHTER THAN IT LOOKS. 138 units is 138 real px on the finished
 * card, and `https://agbcglobal.com` is 22 bytes, which encodes as a 25-module version 2
 * at error correction M. With a 4-module quiet zone each side that is 33 module-widths
 * across 138px, so a module is 4.2px. Driven through WhatsApp at slice 1: the app keeps a
 * 1080 square at 1080, and the code still decodes from its recompressed copy down to a
 * 400px downscale (plan §10). Drawn bigger than the footer really wants all the same,
 * because the next chat app may not be as kind.
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
