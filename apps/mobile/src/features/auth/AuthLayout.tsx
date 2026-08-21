import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  fontFamily,
  // Aliased: this component takes its own `icon` PROP (the glyph for the gold tile),
  // which would shadow the size token inside the body.
  icon as iconSize,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

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
  /**
   * The back circle, drawn only when there is somewhere to go back TO.
   *
   * Optional since W3.5 slice 5c: the re-home prompt borrows this layout and is presented
   * on launch with nothing behind it, so a back control would be a button that either does
   * nothing or drops the member somewhere they did not come from. Its way out is its own
   * "Not now", at the bottom with the other choice.
   */
  backLabel?: string;
  onBack?: () => void;
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
          {onBack ? (
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
              <ChevronLeftIcon
                size={iconSize.xl}
                color={colors.text}
                strokeWidth={2}
              />
            </Pressable>
          ) : (
            // The tile's own top margin is measured from the back circle in the frame, so
            // without one the gold icon would sit hard against the safe area.
            <View style={{ height: 12 }} />
          )}
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
                <MailIcon
                  size={iconSize.x2l}
                  color={palette.navy}
                  strokeWidth={1.8}
                />
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
