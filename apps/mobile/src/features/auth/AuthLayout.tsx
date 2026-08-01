import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { MailIcon, Screen } from '@/components/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { useTheme } from '@/theme';

// The mockup's .authwrap chrome shared by AUTH-1/2/3: back circle (.backbtn,
// 40px on --alt), optional gold mail tile (.authicon, 64px, radius 18), the
// 27px display h1, and the 14.5px lead. Content flows below; the caller adds
// its own spacer + CTA. AUTH-4 uses the separate .success layout instead.

export interface AuthLayoutProps extends PropsWithChildren {
  title: string;
  /** Plain-string lead; CodeStep passes rich content via leadNode instead. */
  lead?: string;
  leadNode?: ReactNode;
  showMailIcon?: boolean;
  /**
   * Any other glyph in the same gold tile (the mockup's `.authicon`), for the screens
   * outside auth that borrow this layout: BRANCH-CHANGE puts a house there. Wins over
   * `showMailIcon`, which stays because every auth call site reads better for it.
   */
  icon?: ReactNode;
  backLabel: string;
  onBack: () => void;
}

export function AuthLayout({
  title,
  lead,
  leadNode,
  showMailIcon = false,
  icon,
  backLabel,
  onBack,
  children,
}: AuthLayoutProps) {
  const { colors } = useTheme();
  return (
    <Screen widthClass="capped" padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingTop: spacing.md,
            paddingHorizontal: spacing.x2l,
            paddingBottom: spacing.x2l + 2,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
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
            <ChevronLeftIcon size={20} color={colors.text} strokeWidth={2} />
          </Pressable>
          {icon !== undefined || showMailIcon ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.card,
                backgroundColor: palette.gold,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 6,
                marginBottom: 18,
              }}
            >
              {icon ?? (
                <MailIcon size={28} color={palette.navy} strokeWidth={1.8} />
              )}
            </View>
          ) : null}
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
            {title}
          </Text>
          {leadNode ??
            (lead ? (
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: colors.sub,
                  marginBottom: 22,
                }}
              >
                {lead}
              </Text>
            ) : null)}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
