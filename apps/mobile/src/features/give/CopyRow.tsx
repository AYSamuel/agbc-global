import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { CopyIcon, useToast } from '@/components/ui';
import { useTheme } from '@/theme';

// expo-clipboard is a NATIVE module: a dev client built before it was added
// (the W0.11 builds) throws "Cannot find native module 'ExpoClipboard'" at
// import, which would kill the whole route. Guarded require: the screen always
// renders, the value stays selectable (the docs/spec/12 fallback), and the Copy
// affordance only appears when the module exists (no dead buttons). Same trap
// as expo-linear-gradient (see ui/Gradient.tsx); the next EAS dev build links it.
interface ClipboardModule {
  setStringAsync: (value: string) => Promise<boolean>;
}

function loadClipboard(): ClipboardModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-clipboard') as ClipboardModule;
  } catch {
    return null;
  }
}

const Clipboard = loadClipboard();

// GIVE-BANK copy row (mockup .copyrow): an uppercase field label, the value in the
// display face, and a blue "Copy" affordance. Copying is a give-feature concern, so
// the row owns the clipboard write + toast rather than pushing it to every caller.
// The value is also selectable text, the offline/old-device fallback (docs/spec/12).
export interface CopyRowProps {
  label: string;
  value: string;
  copyLabel: string;
  /** Toast on success, already interpolated (e.g. "Account number copied"). */
  copiedMessage: string;
  /** Toast if the clipboard write fails: no silent failures. */
  failedMessage: string;
}

export function CopyRow({
  label,
  value,
  copyLabel,
  copiedMessage,
  failedMessage,
}: CopyRowProps) {
  const { colors } = useTheme();
  const toast = useToast();

  const onCopy = () => {
    if (Clipboard === null) return;
    Clipboard.setStringAsync(value)
      .then(() => {
        toast.show(copiedMessage);
      })
      .catch(() => {
        toast.show(failedMessage);
      });
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.button,
        paddingVertical: 13,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 3,
          }}
        >
          {label}
        </Text>
        <Text
          selectable
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 16,
            letterSpacing: -0.16,
            color: colors.text,
          }}
        >
          {value}
        </Text>
      </View>
      {Clipboard !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copyLabel}: ${label}`}
          onPress={onCopy}
          // Small affordance (mockup .copy) lifted to the 44px floor via hitSlop.
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <CopyIcon size={14} color={colors.blue} />
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 12.5,
              color: colors.blue,
            }}
          >
            {copyLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
