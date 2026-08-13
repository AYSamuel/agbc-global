import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyGlyph,
  EmptyState,
  PersonIcon,
  PlusIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { MyPostCard } from '@/features/family/MyPostCard';
import { useMyPostsQuery, type MyPost } from '@/features/family/myPosts';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';

/**
 * MY-POSTS (docs/spec/09 §MY-POSTS, frames `author pipeline` and `nothing shared yet`).
 *
 * The author's own view of the pipeline, and the only place a pending, rejected or removed
 * post of theirs is visible at all: the public feeds read `status='approved'` and cannot
 * show anyone their own row (docs/spec/09, corrected at W2.3). The consent step already
 * promises this screen by name ("Edit or delete it anytime from My posts"), so it is a
 * promise being kept rather than a new idea.
 */
export default function MyPostsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const beginGateSignIn = useGateStore((state) => state.beginGateSignIn);

  const signedIn = status === 'member';
  const query = useMyPostsQuery(signedIn);

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('family:myPosts.title')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/more');
        }}
        backLabel={t('common:back')}
      />

      {/* `.post` sits at a 16px inset, not the 20px screen gutter: the cards are the
          screen's content rather than text set against its edge. The empty and error
          states below bring their own padding, so this wrapper only insets the list. */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        {!signedIn ? (
          // Reachable by deep link rather than by tapping, since the row that leads here
          // gates first. Same machine either way: remember the destination, sign in, land
          // back on it (docs/spec/03).
          //
          // The PERSON glyph every guest state in the mockup shares, rather than the plus
          // the EMPTY state above uses: one says "you have not written anything yet", this
          // one says "the account is what holds them". (Frame backfilled 2026-08-08; this
          // state shipped at W2.6 without one, and the glyph came from the frame.)
          <EmptyState
            icon={<EmptyGlyph Icon={PersonIcon} />}
            title={t('family:myPosts.guestTitle')}
            body={t('family:myPosts.guestBody')}
            actionLabel={t('common:signIn')}
            onAction={() => {
              // This gate is a full-screen state, not a sheet, so "shown" has
              // no earlier honest moment than the CTA tap: shown and the
              // sign-in tap coincide for this kind (and for `rhythm`).
              track('gate_shown', { action_type: 'my_posts' });
              beginGateSignIn({ kind: 'my_posts' });
              router.push('/auth');
            }}
          />
        ) : query.isPending ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Skeleton height={96} />
            <Skeleton height={96} />
            <Skeleton height={96} />
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
          // The frame's `nothing shared yet`: the `.empty .ei` circle with a plus, then
          // the same invitation the Family tab makes, in the one place a person came
          // looking for their own words.
          <EmptyState
            icon={<EmptyGlyph Icon={PlusIcon} />}
            title={t('family:myPosts.emptyTitle')}
            body={t('family:myPosts.emptyBody')}
            actionLabel={t('family:myPosts.emptyAction')}
            onAction={() => {
              router.push('/testimony/compose');
            }}
          />
        ) : (
          // The frame opens straight onto the cards, with 8px of air and no explanatory
          // line: the pills say what each post is doing, and a paragraph above them would
          // be the screen explaining itself instead of answering.
          <View style={{ paddingTop: spacing.xs }}>
            {query.data.map((post) => (
              <MyPostCard
                key={`${post.kind}-${post.id}`}
                post={post}
                onEdit={openEditor}
                onContact={() => {
                  router.push('/contact');
                }}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );

  /**
   * Edit and resubmit is the composer, prefilled, and it re-pends on save by a trigger
   * rather than by anything this screen does (docs/spec/02 invariants). The composer's
   * prefill lands with the edit slice; the route is here so the button is never a dead end.
   */
  function openEditor(post: MyPost) {
    router.push(
      post.kind === 'prayer'
        ? { pathname: '/prayer/compose', params: { edit: post.id } }
        : { pathname: '/testimony/compose', params: { edit: post.id } },
    );
  }
}
