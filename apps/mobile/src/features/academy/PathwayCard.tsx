import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { LockIcon } from '@/components/ui';
import { useTheme } from '@/theme';

// The ACADEMY pathway card (mockup .pathcard, reworked 2026-08-10): step tile,
// name, level tag, the pathway_summary blurb (02: "the ACADEMY card's own
// blurb"), a compact formats · fee meta line, the prerequisite lock when one
// exists, and the status chip. Upcoming cards fade the step tile and carry no
// meta; an enrolled member's card wears the green chip (13: "where I am in it").

export type PathwayStatus = 'available' | 'enrolled' | 'soon';

export interface PathwayCardProps {
  step: string;
  name: string;
  tag: string;
  blurb: string | null;
  meta: string | null;
  lockNote: string | null;
  status: PathwayStatus;
  statusLabel: string;
  onPress: () => void;
}

export function PathwayCard({
  step,
  name,
  tag,
  blurb,
  meta,
  lockNote,
  status,
  statusLabel,
  onPress,
}: PathwayCardProps) {
  const { colors } = useTheme();

  // Mockup .stchip.ok / .enr / .soon: ok is the frame's blue wash verbatim
  // (rgba(47,111,237,.12), no tonal token carries it); enr is tonal.green.bg.
  const chip =
    status === 'enrolled'
      ? { backgroundColor: tonal.green.bg, color: palette.green }
      : status === 'soon'
        ? { backgroundColor: colors.alt, color: colors.muted }
        : { backgroundColor: 'rgba(47,111,237,0.12)', color: colors.blue };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} · ${tag} · ${statusLabel}`}
      onPress={onPress}
      // Mockup .pathcard: flex row gap 14, margin 12 16 0, card on cardline, r18, p16.
      style={{
        flexDirection: 'row',
        gap: 14,
        marginTop: spacing.md,
        marginHorizontal: spacing.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.card,
        padding: spacing.lg,
      }}
    >
      {/* Mockup .step: 44px tile, r13, alt, display 800 16; .up fades it to .55. */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          backgroundColor: colors.alt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: status === 'soon' ? 0.55 : 1,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 16,
            color: colors.text,
          }}
        >
          {step}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Mockup .pt: display 800 17 -0.01em. */}
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 17,
            letterSpacing: -0.17,
            color: colors.text,
          }}
        >
          {name}
        </Text>
        {/* Mockup .ptag: 12.5 muted, 2 above. */}
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: colors.muted,
            marginTop: 2,
          }}
        >
          {tag}
        </Text>
        {/* Mockup .pblurb: 12.5 sub, lh 1.45, 7 above. */}
        {blurb !== null ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              lineHeight: 18,
              color: colors.sub,
              marginTop: 7,
            }}
          >
            {blurb}
          </Text>
        ) : null}
        {/* Mockup .pm: 12.5 sub, 9 above. */}
        {meta !== null ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              color: colors.sub,
              marginTop: 9,
            }}
          >
            {meta}
          </Text>
        ) : null}
        {/* Mockup .plock: 12 muted, lock glyph, 6 above. */}
        {lockNote !== null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
            }}
          >
            <LockIcon size={icon.sm} color={colors.muted} />
            <Text
              style={{
                flex: 1,
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                color: colors.muted,
              }}
            >
              {lockNote}
            </Text>
          </View>
        ) : null}
        {/* Mockup .stchip: 10/800, .06em caps pill, 10 above; capped scale like
            every control label (05 rule). */}
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 10,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              borderRadius: radius.full,
              paddingVertical: 4,
              paddingHorizontal: 10,
              overflow: 'hidden',
              ...chip,
            }}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
