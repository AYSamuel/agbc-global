import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  GiveTabIcon,
  PinIcon,
  StudyIcon,
  WatchTabIcon,
  type IconProps,
} from '@/components/ui';
import { useTheme } from '@/theme';

// Mockup .quick / .qtile: four tiles, each a tinted icon square + label
// (docs/spec/07 §4: Plan a visit · Watch · Give · Academy).
export interface QuickActionsProps {
  onVisit: () => void;
  onWatch: () => void;
  onGive: () => void;
  onAcademy: () => void;
}

export function QuickActions({
  onVisit,
  onWatch,
  onGive,
  onAcademy,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Tints are the mockup's .ic.g1-g4 (fixed rgba over any theme surface).
  const tiles: {
    key: string;
    label: string;
    Icon: (props: IconProps) => React.ReactElement;
    tint: string;
    iconColor: string;
    onPress: () => void;
  }[] = [
    {
      key: 'visit',
      label: t('home:quick.visit'),
      Icon: PinIcon,
      tint: colors.alt,
      iconColor: colors.text,
      onPress: onVisit,
    },
    {
      key: 'watch',
      label: t('home:quick.watch'),
      Icon: WatchTabIcon,
      tint: 'rgba(47,111,237,0.12)',
      iconColor: colors.blue,
      onPress: onWatch,
    },
    {
      key: 'give',
      label: t('home:quick.give'),
      Icon: GiveTabIcon,
      tint: 'rgba(31,138,91,0.12)',
      iconColor: palette.green,
      onPress: onGive,
    },
    {
      key: 'academy',
      label: t('home:quick.academy'),
      Icon: StudyIcon,
      tint: 'rgba(255,207,74,0.20)',
      iconColor: colors.eye,
      onPress: onAcademy,
    },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          accessibilityRole="button"
          accessibilityLabel={tile.label}
          onPress={tile.onPress}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: hitTarget.preferred,
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.cardTight,
            paddingTop: 13,
            paddingBottom: 10,
            paddingHorizontal: spacing.xs,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: tile.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <tile.Icon size={18} color={tile.iconColor} />
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 10.5,
              color: colors.text,
            }}
          >
            {tile.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
