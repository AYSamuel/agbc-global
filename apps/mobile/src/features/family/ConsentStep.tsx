import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { ComposeForm, ComposeTarget } from '@agbc/shared';
import {
  fontFamily,
  icon,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { Button, CheckIcon, Checkbox, Screen } from '@/components/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { useTheme } from '@/theme';

// CONSENT (mockup frame line 1157): the .authwrap layout shared with AUTH-1/2/3,
// three .cpoint rows with green check discs, the agreement .checkrow, then the
// post button.
//
// This screen IS the GDPR Art. 9(2)(a) capture (docs/spec/20 §Consent mechanics),
// which has two consequences the copy has to respect. First, the wording is
// versioned: these keys are hashed against their version by a test, so editing
// any of them in any language without minting a new version fails CI. Second,
// agreement is per-submission: the flow re-runs this step after a draft restore
// and never carries the tick over.
//
// A post carrying a photo shows a FOURTH point and records a different version
// (CONSENT_VERSION_PHOTO): sharing a picture of other people is a different act
// and docs/spec/20 §Photos asks for it explicitly. Two versions rather than one
// with an always-on photo line (decided with Ayo, 2026-07-27) so that a prayer
// author never agrees to wording about a photo they were never offered, and the
// version on the row always names exactly the words that were on this screen.

const POINTS = [
  { title: 'consentPoint1Title', body: 'consentPoint1Body' },
  { title: 'consentPoint2Title', body: 'consentPoint2Body' },
  { title: 'consentPoint3Title', body: 'consentPoint3Body' },
] as const;

const PHOTO_POINT = {
  title: 'consentPhotoTitle',
  body: 'consentPhotoBody',
} as const;

export interface ConsentStepProps {
  target: ComposeTarget;
  control: Control<ComposeForm>;
  /** Drives the fourth point AND, through ComposeFlow, the version recorded. */
  hasPhoto: boolean;
  consentError: string | null;
  submitErrorMessage: string | null;
  submitting: boolean;
  onBack: () => void;
  onPost: () => void;
}

export function ConsentStep({
  target,
  control,
  hasPhoto,
  consentError,
  submitErrorMessage,
  submitting,
  onBack,
  onPost,
}: ConsentStepProps) {
  const { t } = useTranslation('family');
  const { colors } = useTheme();

  return (
    <Screen widthClass="capped" padded={false}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.x2l,
          paddingBottom: spacing.x2l + 2,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:back')}
          onPress={onBack}
          hitSlop={4}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.full,
            backgroundColor: colors.alt,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ChevronLeftIcon size={icon.xl} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 27,
            letterSpacing: -0.54,
            color: colors.text,
            marginBottom: 8,
          }}
        >
          {t('consentTitle')}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 14.5,
            lineHeight: 22,
            color: colors.sub,
            marginBottom: 22,
          }}
        >
          {t(
            target === 'testimony'
              ? 'consentLeadTestimony'
              : 'consentLeadPrayer',
          )}
        </Text>

        {(hasPhoto ? [...POINTS, PHOTO_POINT] : POINTS).map((point) => (
          <View
            key={point.title}
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              alignItems: 'flex-start',
              marginBottom: 15,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 26,
                height: 26,
                borderRadius: radius.full,
                backgroundColor: tonal.green.bg,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              <CheckIcon size={icon.md} color={palette.green} strokeWidth={2.5} />
            </View>
            <Text
              style={{
                flex: 1,
                fontFamily: fontFamily.body.regular,
                fontSize: 14,
                lineHeight: 20,
                color: colors.text,
              }}
            >
              <Text style={{ fontFamily: fontFamily.body.bold }}>
                {t(point.title)}
              </Text>{' '}
              {t(point.body)}
            </Text>
          </View>
        ))}

        <Controller
          control={control}
          name="consentAgreed"
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onChange={field.onChange}
              label={t('consentAgree')}
              error={consentError}
            />
          )}
        />

        {submitErrorMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              lineHeight: 18,
              color: palette.red,
              marginTop: spacing.md,
            }}
          >
            {submitErrorMessage}
          </Text>
        ) : null}

        {/* The frame's .spacer: the CTA sits at the bottom on a tall screen and
            is pushed down by the content on a short one, inside the scroll. */}
        <View style={{ flex: 1, minHeight: spacing.lg }} />
        <Button
          label={t(
            target === 'testimony'
              ? 'consentPostTestimony'
              : 'consentPostPrayer',
          )}
          variant="primary"
          fullWidth
          loading={submitting}
          onPress={onPost}
        />
      </View>
    </Screen>
  );
}
