import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type DimensionValue,
} from 'react-native';

import { radius } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
}

// Loading placeholder per the 05 contract: HIDDEN from assistive tech (the screen
// exposes a busy/loading state instead); pulse animation goes static under the OS
// reduce-motion setting.
export function Skeleton({
  width = '100%',
  height = 16,
  round = false,
}: SkeletonProps) {
  const { colors } = useTheme();
  // Lazy state initializer, not useRef(...).current: reading a ref during render is
  // forbidden under the React Compiler rules.
  const [opacity] = useState(() => new Animated.Value(0.45));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // default: animate
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="skeleton"
      style={{
        width,
        height,
        borderRadius: round ? radius.full : radius.control,
        backgroundColor: colors.alt,
        opacity: reduceMotion ? 0.6 : opacity,
      }}
    />
  );
}
