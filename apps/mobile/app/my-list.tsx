import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { palette, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  BookmarkIcon,
  CircleIconButton,
  EmptyGlyph,
  EmptyState,
  MenuLabel,
  PersonIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { queueSave, useSavedListQuery } from '@/features/watch/saved';
import { SermonRow } from '@/features/watch/SermonRow';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

/**
 * MY-LIST (docs/spec/08 §MY-LIST, the four W3.1 slice 4 frames).
 *
 * The list IS the saving, so the control that unsaves sits on the row rather
 * than behind a menu, and it is the same filled bookmark the player's top bar
 * shows: one glyph means "saved" everywhere. A row the channel lost renders
 * greyed with the same remove control (08's rot handling), and only the rows
 * with nothing left to hear are drawn that way: one whose audio survived still
 * plays, so it keeps its ordinary face.
 */
export default function MyListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.status);
  const beginGateSignIn = useGateStore((state) => state.beginGateSignIn);

  const signedIn = status === 'member';
  const query = useSavedListQuery(signedIn);

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('watch:myListTitle')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/more');
        }}
        backLabel={t('common:back')}
      />

      {/* `.rrow` sits at a 16px inset like the frame; the empty and guest
          states bring their own padding. */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        {!signedIn ? (
          // Reachable by deep link only: the PROFILE row that leads here exists
          // only for a member, and the Save gate stands in front of the action.
          // Same PERSON glyph and sentence shape as MY-POSTS and PROFILE: the
          // account is what holds the answer.
          <EmptyState
            icon={<EmptyGlyph Icon={PersonIcon} />}
            title={t('watch:myListGuestTitle')}
            body={t('watch:myListGuestBody')}
            actionLabel={t('common:signIn')}
            onAction={() => {
              // A full-screen gate: "shown" has no earlier honest moment than
              // the CTA tap (the my_posts precedent).
              track('gate_shown', { action_type: 'my_list' });
              beginGateSignIn({ kind: 'my_list' });
              router.push('/auth');
            }}
          />
        ) : query.isPending ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Skeleton height={92} />
            <Skeleton height={92} />
            <Skeleton height={92} />
          </View>
        ) : query.isError ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : query.data.length === 0 ? (
          // The frame's `nothing saved yet`: teach the gesture, then send them
          // where the messages are (08's browse CTA).
          <EmptyState
            icon={<EmptyGlyph Icon={BookmarkIcon} />}
            title={t('watch:myListEmptyTitle')}
            body={t('watch:myListEmptyBody')}
            actionLabel={t('watch:browseMessages')}
            onAction={() => {
              router.push('/(tabs)/watch');
            }}
          />
        ) : (
          <>
            {/* The frame's `.mlabel` under the header ("12 saved"): MenuLabel
                is that class, and the screen's 16px inset plus its own 4px
                lands on the frame's 20px side padding. */}
            <MenuLabel
              label={t('watch:savedCount', { count: query.data.length })}
            />
            {query.data.map((item) => (
              <SermonRow
                key={item.sermon.id}
                sermon={item.sermon}
                // Nothing left to play: unavailable AND no self-hosted audio
                // (08: audio that survived keeps the row ordinary).
                gone={
                  item.sermon.status === 'unavailable' &&
                  item.sermon.audio_path === null
                }
                onPress={() => {
                  router.push({
                    pathname: '/sermon/[id]',
                    params: { id: item.sermon.id },
                  });
                }}
                trailing={
                  // `.rsave`, at the library's 40px rather than the frame's 36:
                  // 36 is below our own 44px touch-target floor (05), and this
                  // is the same control the player's top bar carries. With
                  // CircleIconButton's hitSlop it answers at 48.
                  //
                  // Deliberately NOT dimmed on a gone row: the way out is where
                  // the hand already expects it, which is the frame's own note.
                  <CircleIconButton
                    accessibilityLabel={t('watch:removeFromList')}
                    backgroundColor={colors.alt}
                    icon={
                      <BookmarkIcon
                        size={17}
                        color={palette.gold}
                        fill={palette.gold}
                      />
                    }
                    onPress={() => {
                      queueSave(item.sermon.id, false);
                    }}
                  />
                }
              />
            ))}
            <View style={{ height: spacing.md }} />
          </>
        )}
      </View>
    </Screen>
  );
}
