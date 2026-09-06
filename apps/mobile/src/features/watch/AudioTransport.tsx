import { useMemo, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  fontFamily,
  media,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from '@/components/ui';
import { useTheme } from '@/theme';

import {
  formatClock,
  formatRemaining,
  scrubFraction,
  secondsAtFraction,
  shouldSeekAfterTouch,
} from './audio';

// Mockup `.pl-scrub` + `.pl-transport` (the W3.1 audio frames, knob added W4.9
// slice 2, frame approved 2026-09-06). Presentational: every value arrives as a
// prop, so the engine can be tested without a renderer and this without a player.
//
// The bar is a SEEK CONTROL now. Going back to the 30th minute of a 96-minute
// message was 120 taps of the ±15s pair, so the bar takes a drag anywhere and a
// tap anywhere, and wears a knob at the played edge so it looks like something
// you can hold. While a finger is on it, the fill and the clock follow the FINGER
// rather than the player, and the seek is issued once, when the finger leaves: a
// player asked for a hundred seeks a second stutters, and a member is choosing a
// place, not scrubbing audio.
//
// WHY A GESTURE HANDLER AND NOT THE RESPONDER PROPS. The first build used
// `onResponderGrant/Move/Release` on the view. On the tablet a drag whose finger
// drifted a few points up or down snapped the bar back: Android's native scroll
// view intercepts a vertical move within the first few events, whatever the JS
// responder's termination request says, and a `scrollEnabled={false}` set from
// the grant reaches the native side a frame too late to stop it. A pan gesture
// that has activated is claimed NATIVELY, so the scroll view cannot take it; and
// `activeOffsetX` of 2 points means any sideways movement claims it. A vertical
// swipe that starts on the bar still scrolls the page, which is what it meant.

/** The frame draws 5px; this is the 44px target the standards require. */
const BAR_HEIGHT = 5;
const TARGET_HEIGHT = 44;
const KNOB = 14;

export interface AudioTransportProps {
  playing: boolean;
  currentSec: number;
  durationSec: number;
  skipSec: number;
  onToggle: () => void;
  onSkip: (deltaSec: number) => void;
  /** An absolute seek, in seconds, issued once per drag or tap on the bar. */
  onSeek: (sec: number) => void;
  /**
   * A finger is on the bar (true) or has left it (false). The screen that
   * scrolls stops scrolling while it is true: belt to the gesture's braces for
   * the moment between touch-down and the pan activating.
   */
  onScrubbing?: (active: boolean) => void;
  labels: {
    play: string;
    pause: string;
    back: string;
    forward: string;
    /** e.g. "15s", drawn under both skip glyphs. */
    skip: string;
    /** Accessible name + value for the seek bar. */
    progress: string;
  };
}

export function AudioTransport({
  playing,
  currentSec,
  durationSec,
  skipSec,
  onToggle,
  onSkip,
  onSeek,
  onScrubbing,
  labels,
}: AudioTransportProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  // Where the finger is, as a fraction of the bar, or null when nobody is
  // holding it. The one visible fact the bar shows has one owner at a time: the
  // finger while it is down, the player otherwise (the W2.4 rule).
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  // The gesture's own record of the touch, read when it finalizes: where the
  // finger last was, and whether the pan ever activated (a tap never does).
  const touchRef = useRef<{ fraction: number; activated: boolean } | null>(
    null,
  );

  const fraction = dragFraction ?? scrubFraction(currentSec, durationSec);
  const shownSec =
    dragFraction === null
      ? currentSec
      : secondsAtFraction(dragFraction, durationSec);
  const elapsed = formatClock(shownSec);
  const remaining = formatRemaining(shownSec, durationSec);

  // The gesture is built once per width and duration. Its callbacks run on touch
  // events, never during render, so the ref reads inside them are the ordinary
  // event-handler kind; the refs rule cannot see that through a builder chain.
  /* eslint-disable react-hooks/refs -- gesture callbacks are event handlers */
  const pan = useMemo(() => {
    const fractionAt = (x: number) =>
      width > 0 ? Math.min(1, Math.max(0, x / width)) : 0;
    return (
      Gesture.Pan()
        .withTestId('seek-bar')
        // Callbacks touch React state, so they run on the JS thread.
        .runOnJS(true)
        .activeOffsetX([-2, 2])
        .onBegin((event) => {
          const at = fractionAt(event.x);
          touchRef.current = { fraction: at, activated: false };
          setDragFraction(at);
          onScrubbing?.(true);
        })
        .onStart(() => {
          if (touchRef.current) touchRef.current.activated = true;
        })
        .onUpdate((event) => {
          const at = fractionAt(event.x);
          if (touchRef.current) touchRef.current.fraction = at;
          setDragFraction(at);
        })
        .onEnd((event) => {
          if (touchRef.current) touchRef.current.fraction = fractionAt(event.x);
        })
        .onFinalize((event, success) => {
          const touch = touchRef.current;
          touchRef.current = null;
          setDragFraction(null);
          onScrubbing?.(false);
          // Nothing to land in until the header has been read.
          if (!touch || durationSec <= 0) return;
          // What the finger meant is one decision, kept in audio.ts where it is
          // tested without a gesture: a tap, a finished drag and a drag the
          // system took away all seek; a scroll that happened to start here does
          // not.
          if (
            shouldSeekAfterTouch({
              activated: touch.activated,
              success,
              translationY: event.translationY,
            })
          ) {
            onSeek(secondsAtFraction(touch.fraction, durationSec));
          }
        })
    );
  }, [width, durationSec, onSeek, onScrubbing]);
  /* eslint-enable react-hooks/refs */

  function onAction(event: AccessibilityActionEvent) {
    const { actionName } = event.nativeEvent;
    if (actionName === 'increment') onSkip(skipSec);
    else if (actionName === 'decrement') onSkip(-skipSec);
  }

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          accessible
          // Adjustable, not progressbar: it can be moved, and a screen-reader
          // user moves it by the same 15s steps the buttons give (frontend.md:
          // full keyboard and assistive operability for anything a finger can do).
          accessibilityRole="adjustable"
          accessibilityLabel={labels.progress}
          accessibilityValue={{
            min: 0,
            max: Math.max(1, Math.floor(durationSec)),
            now: Math.floor(shownSec),
            text: remaining === '' ? elapsed : `${elapsed} ${remaining}`,
          }}
          accessibilityActions={[
            { name: 'increment', label: labels.forward },
            { name: 'decrement', label: labels.back },
          ]}
          onAccessibilityAction={onAction}
          onLayout={(event: LayoutChangeEvent) => {
            setWidth(event.nativeEvent.layout.width);
          }}
          style={{
            // The drawn bar stays 5px where the frame puts it; the padding is
            // the touch target, and the negative margin gives back what the
            // padding would otherwise add to the frame's vertical rhythm.
            paddingVertical: (TARGET_HEIGHT - BAR_HEIGHT) / 2,
            marginTop: -((TARGET_HEIGHT - BAR_HEIGHT) / 2),
            justifyContent: 'center',
          }}
        >
          {/* Two flex children rather than a percentage width: a computed
              percentage has to be built as a string, and RN's DimensionValue
              only accepts the `${number}%` literal form, so the string version
              costs a cast for nothing. */}
          <View
            pointerEvents="none"
            style={{
              height: BAR_HEIGHT,
              borderRadius: radius.full,
              backgroundColor: media.track,
              flexDirection: 'row',
            }}
          >
            <View
              style={{
                flex: fraction,
                borderRadius: radius.full,
                backgroundColor: palette.gold,
              }}
            />
            <View style={{ flex: 1 - fraction }} />
          </View>
          {/* The knob: `.pl-scrub .bar i::after`. Drawn only once the bar has a
              width to place it on, otherwise the first frame would park it at
              the left edge for a message half played. */}
          {width > 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: fraction * width - KNOB / 2,
                top: (TARGET_HEIGHT - KNOB) / 2,
                width: KNOB,
                height: KNOB,
                borderRadius: radius.full,
                backgroundColor: palette.gold,
                shadowColor: media.knobShadow,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 1,
                shadowRadius: 3,
                elevation: 2,
              }}
            />
          ) : null}
        </View>
      </GestureDetector>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          // The frame's 8px sits under the 5px bar; the target's padding
          // already supplies most of it.
          marginTop: spacing.sm - (TARGET_HEIGHT - BAR_HEIGHT) / 2,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 11.5,
            color: colors.muted,
          }}
        >
          {elapsed}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 11.5,
            color: colors.muted,
          }}
        >
          {remaining}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 30,
          marginVertical: spacing.xl,
        }}
      >
        <SkipButton
          label={labels.back}
          value={labels.skip}
          onPress={() => {
            onSkip(-skipSec);
          }}
          icon={<SkipBackIcon size={26} color={colors.text} />}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? labels.pause : labels.play}
          onPress={onToggle}
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: radius.full,
            backgroundColor: palette.gold,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {/* Filled, as the frame draws them inside the disc; Lucide's own
              default is an outline. */}
          {playing ? (
            <PauseIcon
              size={26}
              color={palette.navy}
              fill={palette.navy}
              stroke="none"
            />
          ) : (
            <PlayIcon
              size={26}
              color={palette.navy}
              fill={palette.navy}
              stroke="none"
            />
          )}
        </Pressable>
        <SkipButton
          label={labels.forward}
          value={labels.skip}
          onPress={() => {
            onSkip(skipSec);
          }}
          icon={<SkipForwardIcon size={26} color={colors.text} />}
        />
      </View>
    </View>
  );
}

function SkipButton({
  label,
  value,
  onPress,
  icon,
}: {
  label: string;
  value: string;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // The frame draws a 26px glyph with a 9px label under it, which is about
      // 40 tall and 26 wide: under the 44 floor. hitSlop buys the target back
      // without moving anything the design placed.
      hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 3,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text
        // A control label, so it caps at 1.3x and stays one line (docs/spec/05).
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 9,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
}
