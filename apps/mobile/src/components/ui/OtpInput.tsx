import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fontFamily, palette, radius } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The mockup's .otpwrap / .otp row (AUTH-2): six 60px cells, the active cell
// ringed blue (.otp.f). One invisible TextInput drives the row so the OS
// one-time-code suggestion, paste, and screen readers all operate on a single
// real control; the cells are presentation only and hidden from assistive
// tech. The 3px soft focus ring is an absolutely-positioned view (RN's
// experimental boxShadow string crashes under the jest renderer).

export interface OtpInputProps {
  value: string;
  /** Receives digits only, already capped at `length`. */
  onChange: (next: string) => void;
  length?: number;
  accessibilityLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  accessibilityLabel,
  autoFocus = false,
  disabled = false,
}: OtpInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      accessible={false}
      onPress={() => {
        inputRef.current?.focus();
      }}
      style={{ marginBottom: 18 }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: 9 }}
      >
        {Array.from({ length }, (_, index) => {
          const isActive = focused && !disabled && index === activeIndex;
          return (
            <View
              key={index}
              style={{
                flex: 1,
                height: 60,
                backgroundColor: colors.card,
                borderWidth: 1.5,
                borderColor: isActive ? palette.blue : colors.controlline,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isActive ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -4.5,
                    left: -4.5,
                    right: -4.5,
                    bottom: -4.5,
                    borderWidth: 3,
                    borderColor: 'rgba(47,111,237,0.18)',
                    borderRadius: radius.control + 3,
                  }}
                />
              ) : null}
              <Text
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 24,
                  color: colors.text,
                }}
              >
                {value[index] ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(raw) => {
          onChange(raw.replace(/\D/g, '').slice(0, length));
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        accessibilityLabel={accessibilityLabel}
        autoFocus={autoFocus}
        editable={!disabled}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        caretHidden
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
      />
    </Pressable>
  );
}
