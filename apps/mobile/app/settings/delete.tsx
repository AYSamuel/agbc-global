import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  Checkbox,
  MenuLabel,
  RadioRow,
  useToast,
  WarnIcon,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

/**
 * DELETE (frame `DELETE · account deletion`; docs/spec/16 §DELETE, `20`, `03`).
 *
 * THE WHOLE SCREEN IS FRICTION, and every piece of it is in the frame for a reason: a
 * warning band saying it cannot be undone, four bullets naming what actually goes, the one
 * choice the member gets, a sentence about what is kept and why, a word to type, and a box
 * to tick. The button is dead until the last two are done. Nothing here is decoration; this
 * is the only irreversible thing a member can do in this app.
 *
 * THE WORD IS LOCALISED, deliberately. The frame says "Type DELETE to confirm", and asking a
 * German member to type an English word would turn the friction into a puzzle: the point is
 * deliberateness, not spelling. `settings:delete.confirmWord` is what each language asks for
 * AND what the check compares against, so the prompt and the gate cannot drift apart. The
 * comparison is trimmed and case-insensitive for the same reason: somebody who typed it in
 * lower case has still decided.
 *
 * OFFLINE REFUSES RATHER THAN QUEUES, correcting `16`'s "queue + confirm when online". An
 * irreversible destructive action held in a local queue can replay days later, after the
 * person changed their mind, with nothing having confirmed it server-side. There is no draft
 * of this and no retry behind their back: either the call reaches the server, or the screen
 * says so and nothing has happened.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [keepPosts, setKeepPosts] = useState(false);
  const [typed, setTyped] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmWord = t('settings:delete.confirmWord');
  const confirmPrompt = t('settings:delete.typeToConfirm', {
    word: confirmWord,
  });
  const wordMatches =
    typed.trim().toLocaleLowerCase() === confirmWord.toLocaleLowerCase();
  const armed = wordMatches && understood;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      // No id: `delete_my_account` is hard-wired to auth.uid(), so this call cannot name
      // anybody but the person making it (20260901160000).
      const { error: rpcError } = await supabase.rpc('delete_my_account', {
        p_keep_posts: keepPosts,
      });
      if (rpcError) throw new Error(rpcError.message);

      // The account is gone server-side the moment that returned. Signing out is about this
      // DEVICE: the session is already dead, and what remains is dropping the tokens and the
      // personal caches so the next screen is an honest guest view rather than a member one
      // failing on every read.
      await useAuthStore
        .getState()
        .signOut()
        .catch(() => {
          // The local session is cleared either way; saying otherwise would be a lie the
          // next screen contradicts (Settings' own sign-out reasons the same way).
        });

      toast.show(t('settings:delete.done'));
      router.replace('/');
    } catch {
      // ONE message for every failure. Distinguishing "offline" from "the server refused"
      // would be guessing, and what they need to know is the same either way: nothing has
      // happened.
      setError(t('settings:delete.failed'));
      setBusy(false);
    }
  }

  return (
    // Not `Screen`: this frame pins its action bar below the scroll, the way the COURSE
    // frames do and EVENT-DETAIL's does not, and `Screen` scrolls everything it is given.
    // Same structure as app/course/[slug].tsx, for the same reason.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          <AppHeader
            title={t('settings:delete.title')}
            backLabel={t('back')}
            onBack={goBack}
          />

          {/* ONE gutter for the whole body, exactly as the SETTINGS hub does it, and it is
          load-bearing rather than tidy: `MenuLabel` carries only `spacing.xs` of its own
          because the frame's `.mlabel` is 20 and the container is expected to supply the
          other 16. Without this wrapper the two section labels rendered at 4px while
          everything around them sat at 16, so they hugged the edge and nothing lined up.
          Every child below is therefore positioned RELATIVE to this 16. */}
          <View style={{ paddingHorizontal: spacing.lg }}>
            {/* `.warnband`: its own class in the frame rather than a red `.linkbanner`, with its
          own padding and a bold body, so it is built from those values here instead of
          bending NoteBanner into a third tone it does not have. */}
            <View
              style={{
                marginTop: 6,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 11,
                backgroundColor: 'rgba(224,52,44,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(224,52,44,0.3)',
                borderRadius: radius.button,
                paddingVertical: 14,
                paddingHorizontal: 15,
              }}
            >
              <View style={{ marginTop: 1 }}>
                <WarnIcon size={18} color={palette.red} />
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13.5,
                  lineHeight: 19.6,
                  color: colors.text,
                }}
              >
                {t('settings:delete.warning')}
              </Text>
            </View>

            <MenuLabel label={t('settings:delete.removedLabel')} />
            {/* `.bullets`: four lines, specific on purpose. "Your data" would tell somebody
          nothing they could weigh. */}
            {/* `.bullets` is 20 in the frame against the cards' 16, so it takes the extra 4
          itself rather than the wrapper widening for everything. */}
            <View style={{ paddingHorizontal: spacing.xs }}>
              {(
                [
                  'removedProfile',
                  'removedRhythm',
                  'removedPurchases',
                  'removedPending',
                ] as const
              ).map((key) => (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 11,
                    paddingVertical: 6,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: palette.red,
                      marginTop: 8,
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: fontFamily.body.regular,
                      fontSize: 14,
                      lineHeight: 21,
                      color: colors.sub,
                    }}
                  >
                    {t(`settings:delete.${key}`)}
                  </Text>
                </View>
              ))}
            </View>

            <MenuLabel label={t('settings:delete.postsLabel')} />
            {/* `.radiolist`. Remove is selected first, per the frame and `16`'s "default: remove":
          the pre-selected option should be the one that leaves less behind. */}
            <View
              style={{
                marginTop: 12,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.cardline,
                // `.radiolist` is 16, which is cardTight rather than card's 18.
                borderRadius: radius.cardTight,
                overflow: 'hidden',
              }}
            >
              <RadioRow
                title={t('settings:delete.removePosts')}
                selected={!keepPosts}
                onSelect={() => {
                  setKeepPosts(false);
                }}
              />
              <RadioRow
                title={t('settings:delete.keepPosts')}
                description={t('settings:delete.keepPostsBody')}
                selected={keepPosts}
                onSelect={() => {
                  setKeepPosts(true);
                }}
                last
              />
            </View>

            {/* `.alwayson`. It names what is kept AND that it carries no name, because somebody
          who reads "some records are kept" and is told nothing else assumes the worst. */}
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                lineHeight: 17,
                color: colors.muted,
                paddingHorizontal: spacing.xs,
                paddingTop: 12,
              }}
            >
              {t('settings:delete.kept')}
            </Text>

            {/* `.gatecfm` + `.confirminp`. Not TextField: the frame gives this input the DISPLAY
          face, heavier and letter-spaced, so it reads as the word being asked for rather
          than as one more form field. */}
            <View style={{ marginTop: 14 }}>
              <Text
                style={{
                  fontFamily: fontFamily.body.extraBold,
                  fontSize: 12,
                  letterSpacing: 0.72,
                  textTransform: 'uppercase',
                  color: colors.muted,
                  // The extra 4 that lines this up with the other two section labels. The
                  // frame gives `.mlabel` 20 and `.gatecfm` 16, and `.gl` sits inside the
                  // latter, so this one label lands 4px left of every other label on the
                  // screen. That is an inconsistency in the mockup rather than a rule;
                  // entry-flow.html is corrected to match in the same change.
                  paddingLeft: spacing.xs,
                  marginBottom: 7,
                }}
              >
                {confirmPrompt}
              </Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={confirmPrompt}
                placeholder={confirmWord}
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1.5,
                  borderColor: wordMatches ? palette.red : colors.controlline,
                  borderRadius: radius.button,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 16,
                  letterSpacing: 1.6,
                  color: colors.text,
                  minHeight: 52,
                }}
              />
            </View>

            <View style={{ marginTop: 14, marginBottom: 6 }}>
              <Checkbox
                checked={understood}
                onChange={setUnderstood}
                label={t('settings:delete.understand')}
              />
            </View>

            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 13,
                  lineHeight: 19,
                  color: palette.red,
                  paddingTop: spacing.xs,
                }}
              >
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* The frame's `.actionbar`: pinned below the scroll, `border-top`, `12 16 22`. It
          costs nothing to pin here, because the button is dead until the word is typed and
          the box ticked, and both of those are up in the scroll. */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.cardline,
          backgroundColor: colors.bg,
          paddingTop: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.md,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
            gap: spacing.sm,
          }}
        >
          <Button
            label={t('settings:delete.confirm')}
            variant="danger"
            fullWidth
            disabled={!armed || busy}
            loading={busy}
            onPress={() => {
              void onDelete();
            }}
          />
          <Button
            label={t('cancel')}
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={goBack}
          />
        </View>
      </View>
    </View>
  );
}
