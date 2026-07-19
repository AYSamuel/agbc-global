import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 2600;

// 05 contract: announced via the accessibility live region + announceForAccessibility;
// auto-dismiss NEVER steals or moves focus (render-only overlay, no focus calls).
export function ToastProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    AccessibilityInfo.announceForAccessibility(next);
    timer.current = setTimeout(() => {
      setMessage(null);
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spacing.gutter,
            right: spacing.gutter,
            bottom: insets.bottom + spacing.x3l,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: colors.band,
              borderRadius: radius.button,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              maxWidth: 480,
            }}
          >
            <Text style={[typeScale.bodyMedium, { color: colors.bandtext }]}>
              {message}
            </Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}

// Motion note: entrance/exit animation (fade, motion.base ms) arrives with the first
// product use; the contract (announce + no focus steal) is what this component owns.
export const TOAST_MOTION_MS = motion.base;
