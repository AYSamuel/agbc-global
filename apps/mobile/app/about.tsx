import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import {
  Button,
  ChevronLeftIcon,
  CircleIconButton,
  GradientFill,
} from '@/components/ui';
import { useTheme } from '@/theme';

const HERO_MIN_HEIGHT = 168;

// ABOUT (docs/spec/04, mockup ABOUT frame): the church's story as static,
// localized copy ported from the website (agbc/src/i18n/ui.ts), with the
// "One family, many nations" hero. Static surface: no data states. Links to
// CONTACT and BRANCHES per 04 (the branches button is composed; the frame
// shows only "Contact us", flagged in the PR).
export default function About() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const sections = [
    { title: t('church:storyTitle'), body: t('church:storyBody') },
    { title: t('church:believeTitle'), body: t('church:believeBody') },
    { title: t('church:missionTitle'), body: t('church:missionBody') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.x2l }}
    >
      <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
        {/* Mockup .mediahero variant: flush-top, bottom radius 22, #33507f. */}
        <View
          style={{
            minHeight: HERO_MIN_HEIGHT + insets.top,
            justifyContent: 'flex-end',
            backgroundColor: palette.ink,
            borderBottomLeftRadius: radius.cardHero,
            borderBottomRightRadius: radius.cardHero,
            overflow: 'hidden',
          }}
        >
          <GradientFill direction="diagonal" from="#33507f" to={palette.ink} />
          <GradientFill
            direction="vertical"
            from={palette.ink}
            to={palette.ink}
            fromOpacity={0.05}
            toOpacity={0.92}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 14,
              left: spacing.lg,
            }}
          >
            <CircleIconButton
              icon={<ChevronLeftIcon size={20} color={onInk.text} />}
              accessibilityLabel={t('back')}
              onPress={() => {
                router.back();
              }}
            />
          </View>
          <View style={{ padding: 18 }}>
            <Text
              style={[
                typeScale.label,
                { fontSize: 11, letterSpacing: 2.6, color: palette.gold },
              ]}
            >
              {t('church:aboutEyebrow')}
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 20,
                letterSpacing: -0.4,
                color: onInk.text,
                marginTop: 6,
              }}
            >
              {t('church:aboutHeroTitle')}
            </Text>
          </View>
        </View>

        {/* Mockup .aboutsec: h3 display 17, body 14.5/1.6 sub. */}
        <View style={{ paddingHorizontal: spacing.gutter }}>
          {sections.map((section) => (
            <View key={section.title}>
              <Text
                accessibilityRole="header"
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 17,
                  color: colors.text,
                  marginTop: spacing.lg,
                  marginBottom: 6,
                }}
              >
                {section.title}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 14.5,
                  lineHeight: 23,
                  color: colors.sub,
                }}
              >
                {section.body}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: 14,
            gap: spacing.sm + 2,
          }}
        >
          <Button
            label={t('church:contactUs')}
            variant="outline"
            fullWidth
            onPress={() => {
              router.push('/contact');
            }}
          />
          <Button
            label={t('church:seeBranches')}
            variant="outline"
            fullWidth
            onPress={() => {
              router.push('/branches');
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}
