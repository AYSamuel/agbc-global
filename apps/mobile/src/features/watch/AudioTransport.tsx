import { Pressable, Text, View } from 'react-native';

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

import { formatClock, formatRemaining, scrubFraction } from './audio';

// Mockup `.pl-scrub` + `.pl-transport` (the W3.1 audio frames). Presentational:
// every value arrives as a prop, so the engine can be tested without a renderer
// and this without a player.
//
// The bar SHOWS progress and does not take a drag. The frame draws no handle, and
// `08`'s seek is the ±15s pair underneath it, which is also the tap alternative a
// drag would have owed anyway.

export interface AudioTransportProps {
  playing: boolean;
  currentSec: number;
  durationSec: number;
  skipSec: number;
  onToggle: () => void;
  onSkip: (deltaSec: number) => void;
  labels: {
    play: string;
    pause: string;
    back: string;
    forward: string;
    /** e.g. "15s", drawn under both skip glyphs. */
    skip: string;
    /** Accessible name + value for the progress bar. */
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
  labels,
}: AudioTransportProps) {
  const { colors } = useTheme();
  const elapsed = formatClock(currentSec);
  const remaining = formatRemaining(currentSec, durationSec);

  return (
    <View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={labels.progress}
        accessibilityValue={{
          min: 0,
          max: Math.max(1, Math.floor(durationSec)),
          now: Math.floor(currentSec),
          text: remaining === '' ? elapsed : `${elapsed} ${remaining}`,
        }}
      >
        {/* Two flex children rather than a percentage width: a computed
            percentage has to be built as a string, and RN's DimensionValue only
            accepts the `${number}%` literal form, so the string version costs a
            cast for nothing. */}
        <View
          style={{
            height: 5,
            borderRadius: radius.full,
            backgroundColor: media.track,
            overflow: 'hidden',
            flexDirection: 'row',
          }}
        >
          <View
            style={{
              flex: scrubFraction(currentSec, durationSec),
              backgroundColor: palette.gold,
            }}
          />
          <View style={{ flex: 1 - scrubFraction(currentSec, durationSec) }} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: spacing.sm,
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
