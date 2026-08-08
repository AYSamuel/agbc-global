import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { motion } from '@agbc/shared/theme';

// The small celebratory burst behind a reaction (docs/spec/05 §Motion: "Glory
// reaction animates a small burst + count tick"). Six dots leave the centre and
// fade; nothing about the surrounding layout moves, so the burst can never push
// a card around mid-tap.
//
// Under the OS reduce-motion setting it renders NOTHING at all, which is the
// contract `05` states: the reaction then reads as a colour/fill change only,
// and the count change is announced through the live region on the pill instead.
// Same detection shape as components/ui/Skeleton.

const DOTS = 6;

export interface BurstProps {
  /** Increment to fire. A number rather than a boolean so two reactions in a row
   * both animate instead of the second being swallowed as "already true". */
  trigger: number;
  color: string;
  /** Dot diameter; the default suits a pill-sized icon. */
  size?: number;
  /** How far the dots travel. The default suits a pill; the milestone
   * celebration's 88px disc needs them to clear its edge (W2.8). */
  spread?: number;
}

export function Burst({ trigger, color, size = 3, spread = 14 }: BurstProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Unknown: animate. A missed burst is a worse failure than an extra one.
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // trigger 0 is the initial render: a card scrolling into view has not just
    // been tapped and must not burst.
    if (trigger === 0 || reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [trigger, reduceMotion, progress]);

  if (reduceMotion) return null;

  return (
    // Zero-size and centred on its parent: purely decorative, and hidden from
    // assistive tech, which is told about the reaction by the pill itself.
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 0,
        height: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: DOTS }, (_, index) => {
        const angle = (index / DOTS) * 2 * Math.PI;
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: progress.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(angle) * spread],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(angle) * spread],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
