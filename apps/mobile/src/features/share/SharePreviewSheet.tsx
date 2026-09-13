import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Text, View } from 'react-native';

import { fontFamily, icon, palette, radius, spacing } from '@agbc/shared/theme';

import {
  AlertIcon,
  Button,
  ShareIcon,
  Sheet,
  useSheetDismiss,
} from '@/components/ui';
import { shareText } from '@/features/family/share';
import { track } from '@/lib/analytics';
import { useTheme } from '@/theme';

import { canShareImage, captureShareCard, shareCardImage } from './capture';
import type { ShareContent } from './content';
import { CARD_EXPECTED_PX, CARD_RENDER_DP } from './geometry';
import { ShareCard } from './ShareCard';

/**
 * SHARE-PREVIEW (W4.15): the card you are about to send, and then the OS sheet.
 *
 * ONE SHEET FOR ALL NINE SHARE POINTS. The card changes, the chrome never does, which is
 * why the mockup draws the same sheet twice with different cards in it.
 *
 * WHY A SHEET AND NOT A SILENT HAND-OFF (Ayo, 2026-09-12). A picture of somebody's prayer
 * request is not a thing to send without being shown it first, and a text fallback needs
 * somewhere to live. Both reasons outlive taste.
 *
 * "SEND AS TEXT INSTEAD" IS NOT A FAILURE PATH. It is on the happy sheet on purpose: a
 * picture cannot be read aloud by a screen reader and cannot be translated by the person
 * receiving it, and `09` line 73 makes OS-share translation the v1 answer for a post
 * written in a language the reader does not speak. An image share would quietly take that
 * away from every share in the app, so the words stay one tap from the picture.
 *
 * THE PREVIEW IS THE OUTPUT, NOT A PICTURE OF IT. The card is mounted off-screen, captured
 * to a PNG, and what the member then sees is an `<Image>` of THAT FILE. It costs nothing
 * and buys the one guarantee worth having: the preview cannot drift from what is sent,
 * because they are the same bytes. It also makes "Getting it ready" a real state rather
 * than a courtesy.
 */

type PreviewState =
  | { status: 'preparing' }
  | { status: 'ready'; uri: string }
  | { status: 'failed' };

export interface SharePreviewSheetProps {
  visible: boolean;
  content: ShareContent;
  /** The plain-text share, for the two buttons that send words instead of a picture. */
  fallbackText: string;
  onClose: () => void;
}

export function SharePreviewSheet({
  visible,
  content,
  fallbackText,
  onClose,
}: SharePreviewSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cardRef = useRef<View>(null);
  const [state, setState] = useState<PreviewState>({ status: 'preparing' });
  /**
   * WHICH GO AT THIS WE ARE ON, and it is load-bearing rather than bookkeeping.
   *
   * `onLayout` fires again on any re-measure, so the capture needs a guard or it rasterises
   * the same view twice for nothing. But the guard cannot simply be "already done": this
   * component stays mounted for the life of the card it belongs to, so a plain flag would
   * survive the sheet closing and silently block the NEXT opening from taking a fresh
   * picture, leaving a member looking at yesterday's verse.
   *
   * The fresh layout itself needs no help: `Sheet` is a React Native `Modal`, which renders
   * nothing at all while hidden, so closing the sheet unmounts the card and opening it
   * mounts a new one. The suite asserts that unmount rather than assuming it.
   */
  const [attempt, setAttempt] = useState(0);
  const captured = useRef(-1);

  const dismiss = useSheetDismiss(t('share.dismissed'), onClose);

  // EVERY OPENING STARTS FROM SCRATCH, and it is done here rather than in an effect
  // because React's own guidance is that adjusting state when a prop changes belongs in
  // the render pass (`react-hooks/set-state-in-effect` enforces it). Without the reset the
  // sheet would keep the previous capture and never take another, since the hidden card
  // lays out only once; on OPEN rather than on close so the sheet slides away still
  // showing the picture instead of flashing a skeleton on its way out.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) {
      setAttempt((n) => n + 1);
      setState({ status: 'preparing' });
    }
  }

  const capture = useCallback(() => {
    void (async () => {
      try {
        if (!(await canShareImage())) {
          setState({ status: 'failed' });
          return;
        }
        setState({ status: 'ready', uri: await captureShareCard(cardRef) });
      } catch {
        // Everything on this sheet is local work (lay out, rasterise, write a file), so
        // there is no server to blame and nothing to retry against: it fails on a device
        // that is out of space, or on an OEM that refuses the capture. The member is told
        // what happened and handed the way out, never the error.
        setState({ status: 'failed' });
      }
    })();
  }, []);

  const onCardLayout = useCallback(() => {
    if (captured.current === attempt) return;
    captured.current = attempt;
    capture();
  }, [attempt, capture]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
    setState({ status: 'preparing' });
  }, []);

  const sendPicture = useCallback(() => {
    if (state.status !== 'ready') return;
    void (async () => {
      try {
        // The OS chooser's own title reuses the sheet's line rather than owning a second
        // string that says the same thing in slightly different words.
        await shareCardImage(
          state.uri,
          t(`share.previewTitle.${content.kind}`),
        );
        // `shareAsync` resolves when the OS sheet has been handed the file, and neither
        // platform reports back whether the member went through with it. This is the best
        // signal available and the event means "a share was started", which is what the
        // north star needs it to mean.
        track('content_shared', {
          content_kind: content.kind,
          sent_as: 'image',
        });
        onClose();
      } catch {
        setState({ status: 'failed' });
      }
    })();
  }, [content.kind, onClose, state, t]);

  const sendText = useCallback(
    (after: 'choice' | 'failure') => {
      void (async () => {
        try {
          await shareText(fallbackText);
          track('content_shared', {
            content_kind: content.kind,
            // The two are different facts and are never collapsed (ADR 0020's amendment):
            // one is a member preferring words, which is a verdict on the feature, and the
            // other is a member handed words because the picture could not be made, which
            // is a verdict on the build.
            sent_as: after === 'choice' ? 'text' : 'text_after_failure',
          });
          onClose();
        } catch {
          // THE SHEET STAYS OPEN, and closing it in a `finally` was the first version of
          // this. Two things were wrong with that: the rejection escaped as an unhandled
          // promise, and a member whose OS share sheet refused to open would have watched
          // ours disappear as though something had been sent. Nothing left the app, so
          // nothing is recorded and the buttons they need are still under their thumb.
        }
      })();
    },
    [content.kind, fallbackText, onClose],
  );

  return (
    <Sheet visible={visible} dismissLabel={t('close')} onDismiss={dismiss}>
      {/* `.kindline`: names what is being shared. Not `SheetEyebrow` (`.sheettitle`),
          which is the quieter label over a list of actions, and not `Eyebrow`, which
          carries a rule and the gold accent. */}
      <Text
        style={{
          textAlign: 'center',
          fontFamily: fontFamily.body.extraBold,
          fontSize: 11.5,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: colors.muted,
          marginBottom: spacing.lg - 2,
        }}
      >
        {t(`share.previewTitle.${content.kind}`)}
      </Text>

      {state.status === 'failed' ? (
        <FailNote message={t('share.failed')} />
      ) : (
        <PreviewWindow
          uri={state.status === 'ready' ? state.uri : null}
          preparingLabel={t('share.preparing')}
          previewLabel={t('share.previewAlt')}
        />
      )}

      {/* HIDE, DON'T DIM (the 2026-07-20 rule): while the picture is being made, the
          action that operates on it is absent rather than a dead button under a skeleton.
          The sheet therefore grows by one button when the card lands, and that is the
          accepted cost rather than an oversight: reserving the space would be a dead gap,
          which says less than a button arriving. */}
      {state.status === 'ready' ? (
        // `.btn{margin-bottom:8px}`, carried by the piece rather than a container gap,
        // the way `ActionSheet` already does it.
        <View style={{ marginBottom: spacing.sm }}>
          <Button
            label={t('share.share')}
            icon={<ShareIcon size={icon.lg} color={colors.btnText} />}
            fullWidth
            onPress={sendPicture}
          />
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <>
          <View style={{ marginBottom: spacing.sm }}>
            <Button
              label={t('share.sendAsText')}
              fullWidth
              onPress={() => {
                sendText('failure');
              }}
            />
          </View>
          <Button
            label={t('share.tryAgain')}
            variant="ghost"
            fullWidth
            onPress={retry}
          />
        </>
      ) : (
        <Button
          label={t('share.sendAsTextInstead')}
          variant="ghost"
          fullWidth
          onPress={() => {
            sendText('choice');
          }}
        />
      )}

      {/* The card itself, mounted off-screen at its real size so it can be rasterised.
          It is never seen: what the member looks at above is the FILE this produces.
          `pointerEvents` and the accessibility props inside `ShareCard` keep it out of
          both the touch tree and the screen reader's. */}
      {state.status === 'failed' ? null : (
        <View
          // The suite's only handle on a view with no semantic one: `onLayout` is what
          // starts the capture, and nothing on screen represents it.
          testID="share-card-host"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -(CARD_RENDER_DP * 2),
            top: 0,
            width: CARD_RENDER_DP,
            height: CARD_RENDER_DP,
          }}
          onLayout={onCardLayout}
        >
          <ShareCard ref={cardRef} content={content} />
        </View>
      )}
    </Sheet>
  );
}

/**
 * `.scwrap`: the card shown WHOLE and never cropped, because the member is being asked to
 * approve exactly what leaves the app and a preview that hides an edge is not a preview.
 * Square by `aspectRatio` rather than a fixed height, so it holds its shape at every width
 * and at every text scale.
 */
function PreviewWindow({
  uri,
  preparingLabel,
  previewLabel,
}: {
  uri: string | null;
  preparingLabel: string;
  previewLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        // The frame draws 234 on a 390-wide phone, which is 68% of the sheet's content
        // width; capped so a tablet's wider sheet does not turn the preview into a poster.
        alignSelf: 'center',
        width: '68%',
        maxWidth: 280,
        aspectRatio: 1,
        marginBottom: spacing.lg - 2,
        shadowColor: palette.navy,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 13,
        elevation: 6,
      }}
    >
      {uri === null ? (
        // `.scwrap.sk`: the skeleton is the card's exact size, so the only movement when
        // the card lands is the Share button arriving.
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={preparingLabel}
          style={{
            flex: 1,
            borderRadius: radius.cardTight - 3,
            backgroundColor: colors.alt,
            borderWidth: 1,
            borderColor: colors.cardline,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 12.5,
              color: colors.muted,
            }}
          >
            {preparingLabel}
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          testID="share-preview-image"
          // NOT decorative, so not hidden. This picture is the thing the member is being
          // asked to approve, and a reader who is handed silence here has been asked to
          // approve nothing. The label says what it is; the words on it are the member's
          // own and are on the screen behind this sheet.
          accessible
          accessibilityRole="image"
          accessibilityLabel={previewLabel}
          onLoad={
            // A DEV-ONLY check on the one thing no test in this repo can see. The capture
            // is the device's own rasteriser doing arithmetic we predicted, so a new device
            // or a changed geometry could quietly produce a 720 card while everything green
            // stayed green (W4.8's placeholder-icon shape). Read off the image we are
            // already loading, so it costs nothing and needs no second decode.
            __DEV__
              ? (event) => {
                  const { width, height } = event.nativeEvent.source;
                  if (
                    width !== CARD_EXPECTED_PX ||
                    height !== CARD_EXPECTED_PX
                  ) {
                    console.warn(
                      `[share] captured ${String(width)}x${String(height)}, expected ${String(CARD_EXPECTED_PX)} square`,
                    );
                  }
                }
              : undefined
          }
          style={{ flex: 1, borderRadius: radius.cardTight - 3 }}
        />
      )}
    </View>
  );
}

/**
 * `.failnote`. Deliberately not a `NoteBanner` (`.linkbanner`): that is a tonal wash with
 * a border for a line you live alongside, and this is a flat `alt` block reporting a local
 * failure. If a second one ever appears, promote it then.
 */
function FailNote({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm + 1,
        backgroundColor: colors.alt,
        borderRadius: radius.control,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md + 1,
        marginBottom: spacing.lg - 2,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ marginTop: 1 }}
      >
        <AlertIcon size={17} color={palette.red} />
      </View>
      <Text
        style={{
          flex: 1,
          fontFamily: fontFamily.body.regular,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.sub,
          textAlign: 'left',
        }}
      >
        {message}
      </Text>
    </View>
  );
}
