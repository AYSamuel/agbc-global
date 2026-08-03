import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { MyPost, PostStatus } from './myPosts';
import { useRelativeAgeLabel } from './useRelativeAgeLabel';

/**
 * One post in the author's pipeline (frame: `MY-POSTS · author pipeline`).
 *
 * The card carries the status and, where there is one, what to do about it. Only two of the
 * four statuses have an action, and the difference between them is the point of the screen:
 * `rejected` is a conversation the author can answer (edit and resubmit), `removed` is not
 * theirs to reopen (`02`: edits are refused server-side) so the way on is a person, not a
 * button.
 */
export function MyPostCard({
  post,
  onEdit,
  onContact,
}: {
  post: MyPost;
  onEdit: (post: MyPost) => void;
  onContact: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const age = useRelativeAgeLabel(post.createdAt);
  const tone = TONES[post.status];
  // The frame sets every body in curly quotes: these are somebody's words, and the card
  // is quoting them back.
  const quoted = `“${post.body}”`;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.cardline,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingHorizontal: spacing.md,
        paddingVertical: 15,
        marginBottom: spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          marginBottom: 9,
        }}
      >
        {/* The status is the first thing on the card, because it is the question the
            author opened this screen to ask. */}
        <View
          style={{
            backgroundColor:
              post.status === 'removed' ? colors.alt : tone.wash.bg,
            borderRadius: radius.full,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 10,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color:
                post.status === 'removed' ? colors.muted : tone.text(colors),
            }}
          >
            {t(`family:myPosts.status.${post.status}`)}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: fontFamily.body.medium,
            fontSize: 11.5,
            color: colors.muted,
          }}
        >
          {age}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 14.5,
          lineHeight: 21,
          color: colors.text,
        }}
      >
        {quoted}
      </Text>

      {post.status === 'rejected' && post.rejectionReason !== null ? (
        <>
          <Reason colors={colors}>
            {t('family:myPosts.rejectedPrefix', {
              reason: post.rejectionReason,
            })}
          </Reason>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onEdit(post);
            }}
            style={({ pressed }) => ({
              marginTop: spacing.sm,
              minHeight: hitTarget.preferred,
              borderRadius: radius.control,
              backgroundColor: colors.btnBg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13.5,
                color: colors.btnText,
              }}
            >
              {t('family:myPosts.editAndResubmit')}
            </Text>
          </Pressable>
        </>
      ) : null}

      {post.status === 'removed' ? (
        <>
          <Reason colors={colors}>{t('family:myPosts.removedBody')}</Reason>
          {/* A link to a person rather than a button that would fail: only an admin can
              restore removed content, and the author's route is the conversation. */}
          <Pressable
            accessibilityRole="link"
            onPress={onContact}
            hitSlop={spacing.xs}
            style={{
              marginTop: spacing.sm,
              minHeight: hitTarget.min,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 12.5,
                color: colors.blue,
              }}
            >
              {t('family:myPosts.contactLeader')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/** The mockup's `.post .reason`: the leader's words, set apart on the alt surface. */
function Reason({
  colors,
  children,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  children: string;
}) {
  return (
    <Text
      style={{
        marginTop: spacing.sm,
        backgroundColor: colors.alt,
        borderRadius: radius.control,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: fontFamily.body.regular,
        fontSize: 13,
        lineHeight: 19,
        color: colors.sub,
      }}
    >
      {children}
    </Text>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

const TONES: Record<
  PostStatus,
  { wash: { bg: string }; text: (colors: Colors) => string }
> = {
  approved: { wash: tonal.green, text: () => palette.green },
  pending: { wash: tonal.goldSoft, text: (colors) => colors.eye },
  rejected: { wash: tonal.red, text: () => palette.red },
  // Removed reads quietly on purpose: it is the one status the author cannot act on, and a
  // red badge on a post that is already gone only shouts at somebody about a closed door.
  removed: { wash: { bg: 'transparent' }, text: (colors) => colors.muted },
};
