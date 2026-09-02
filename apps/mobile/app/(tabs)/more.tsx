import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import {
  BellIcon,
  BookmarkIcon,
  BookOpenIcon,
  Button,
  CalendarIcon,
  ChevronRightIcon,
  EditIcon,
  FlameIcon,
  GradientFill,
  InfoIcon,
  LibraryIcon,
  MailIcon,
  MenuCard,
  MenuLabel,
  MenuRow,
  PersonIcon,
  PinIcon,
  Screen,
  SettingsIcon,
  StoreIcon,
  StudyIcon,
} from '@/components/ui';
import { useUnreadCount, unreadLabel } from '@/features/notifications/nc';
import { useRhythmQuery } from '@/features/rhythm/queries';
import { useBranchNames } from '@/features/family/useBranchNames';
import { features } from '@/lib/features';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

// MORE hub (docs/spec/04 tab 5). Two variants share the Grow / Church / Read /
// App sections: a guest gets the sign-in card (mockup "More · guest hub"), a
// member gets the `.mehead` identity card and the "My life" section (mockup
// `More · member (the "My life" section)`, W3.3 decision 5): the ink card says
// the one thing MORE is the only place to say. The card and the Profile row
// both open PROFILE, deliberately: the card is a glance, the row is a
// destination. The rhythm line is OMITTED until the first "I'm here" (Ayo,
// 2026-08-19: name and branch only; nothing to live up to yet), which is the
// mockup's `More · member (no rhythm yet)` variant.
export default function More() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.status);
  const profile = useAuthStore((state) => state.profile);

  const isMember = status === 'member' && profile !== null;
  const branchNames = useBranchNames();
  const rhythm = useRhythmQuery(profile?.branchId ?? null, isMember);
  const unread = useUnreadCount(isMember);

  const rhythmWeeks = rhythm.data?.currentWeeks ?? 0;
  const unreadCount = unread.data ?? 0;

  return (
    <Screen padded={false} widthClass="capped">
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text
          accessibilityRole="header"
          style={{
            // Mockup .stitle h1: display 800 at 26; gutter-aligned (20 total).
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
            marginTop: spacing.md,
            paddingHorizontal: spacing.xs,
          }}
        >
          {t('tabs.more')}
        </Text>

        {isMember ? (
          // Mockup .mehead: .signin's ink, margin and radius exactly, so the
          // guest and member hubs sit identically.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('more.openProfile', {
              name: profile.displayName,
            })}
            onPress={() => {
              router.push('/settings/profile');
            }}
            style={({ pressed }) => ({
              marginTop: spacing.sm,
              backgroundColor: colors.band,
              borderWidth: 1,
              borderColor: colors.bandline,
              borderRadius: radius.card,
              paddingVertical: 16,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 46,
                height: 46,
                borderRadius: radius.full,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* .profhead .pa's gradient at 46px (goldDeep into navy). */}
              <GradientFill from={palette.goldDeep} to={palette.navy} />
              <Text
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 19,
                  color: onInk.text,
                }}
              >
                {profile.displayName.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 18,
                  letterSpacing: -0.36,
                  color: onInk.text,
                }}
              >
                {profile.displayName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12.5,
                  color: onInk.sub,
                  marginTop: 2,
                }}
              >
                {branchNames[profile.branchId] ?? ''}
              </Text>
              {rhythmWeeks > 0 ? (
                <Text
                  style={[
                    typeScale.label,
                    {
                      fontSize: 10.5,
                      letterSpacing: 1.26,
                      color: colors.accent,
                      marginTop: 7,
                    },
                  ]}
                >
                  {t('more.rhythmWeeks', { count: rhythmWeeks })}
                </Text>
              ) : null}
            </View>
            <ChevronRightIcon size={20} color={onInk.sub} />
          </Pressable>
        ) : (
          // Mockup .signin: ink card, gold eyebrow, display title, gold CTA.
          <View
            style={{
              marginTop: spacing.sm,
              backgroundColor: colors.band,
              borderWidth: 1,
              borderColor: colors.bandline,
              borderRadius: radius.card,
              padding: 18,
            }}
          >
            <Text
              style={[
                typeScale.label,
                { fontSize: 11, letterSpacing: 2.6, color: colors.accent },
              ]}
            >
              {t('more.signinEyebrow')}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 18,
                letterSpacing: -0.36,
                color: onInk.text,
                marginTop: spacing.sm,
                marginBottom: 5,
              }}
            >
              {t('more.signinTitle')}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                lineHeight: 19,
                color: onInk.sub,
                marginBottom: 14,
              }}
            >
              {t('more.signinBody')}
            </Text>
            <Button
              label={t('more.signin')}
              variant="accent"
              fullWidth
              onPress={() => {
                router.push('/auth');
              }}
            />
          </View>
        )}

        {isMember ? (
          <>
            <MenuLabel label={t('more.sections.myLife')} />
            <MenuCard>
              <MenuRow
                icon={PersonIcon}
                label={t('more.rows.profile')}
                onPress={() => {
                  router.push('/settings/profile');
                }}
              />
              <MenuRow
                icon={FlameIcon}
                label={t('more.rows.rhythm')}
                onPress={() => {
                  router.push('/rhythm');
                }}
              />
              <MenuRow
                icon={BookmarkIcon}
                label={t('more.rows.myList')}
                onPress={() => {
                  router.push('/my-list');
                }}
              />
              <MenuRow
                icon={EditIcon}
                label={t('more.rows.myPosts')}
                onPress={() => {
                  router.push('/my-posts');
                }}
              />
              <MenuRow
                icon={BellIcon}
                label={t('more.rows.notifications')}
                value={unreadCount > 0 ? unreadLabel(unreadCount) : undefined}
                onPress={() => {
                  router.push('/notifications');
                }}
              />
            </MenuCard>
          </>
        ) : null}

        <MenuLabel label={t('more.sections.grow')} />
        <MenuCard>
          <MenuRow
            icon={StudyIcon}
            label={t('more.rows.academy')}
            onPress={() => {
              router.push('/academy');
            }}
          />
          {/* The devotional plan is W4.4 and does not ship in the MVP, so its
              row is hidden rather than opening a "coming soon" (features.ts). */}
          {features.devotionalPlan ? (
            <MenuRow
              icon={BookOpenIcon}
              label={t('more.rows.devotional')}
              onPress={() => {
                router.push('/plan');
              }}
            />
          ) : null}
        </MenuCard>

        <MenuLabel label={t('more.sections.church')} />
        <MenuCard>
          <MenuRow
            icon={PinIcon}
            label={t('more.rows.branches')}
            onPress={() => {
              router.push('/branches');
            }}
          />
          <MenuRow
            icon={CalendarIcon}
            label={t('more.rows.events')}
            onPress={() => {
              router.push('/events');
            }}
          />
          <MenuRow
            icon={InfoIcon}
            label={t('more.rows.about')}
            onPress={() => {
              router.push('/about');
            }}
          />
          <MenuRow
            icon={MailIcon}
            label={t('more.rows.contact')}
            onPress={() => {
              router.push('/contact');
            }}
          />
        </MenuCard>

        {/* The whole Read section goes with its two rows: Bookstore and My
            Library are all it holds, and a labelled card with nothing in it is
            worse than no section. Both are W4.2, deferred by `18`'s MVP
            definition, so the frame's Read block is deliberately absent here
            (features.ts, and the note on the frame itself). */}
        {features.store ? (
          <>
            <MenuLabel label={t('more.sections.read')} />
            <MenuCard>
              <MenuRow
                icon={StoreIcon}
                label={t('more.rows.bookstore')}
                onPress={() => {
                  router.push('/store');
                }}
              />
              {/* Members lose the "Sign in" lock badge here (W3.3 slice 1's note). */}
              <MenuRow
                icon={LibraryIcon}
                label={t('more.rows.library')}
                badge={isMember ? undefined : t('more.signin')}
                onPress={() => {
                  router.push(isMember ? '/library' : '/auth');
                }}
              />
            </MenuCard>
          </>
        ) : null}

        <MenuLabel label={t('more.sections.app')} />
        <MenuCard>
          <MenuRow
            icon={SettingsIcon}
            label={t('more.rows.settings')}
            onPress={() => {
              router.push('/settings');
            }}
          />
        </MenuCard>
      </View>
    </Screen>
  );
}
