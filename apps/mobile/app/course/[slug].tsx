import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  icon,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import {
  AppHeader,
  BellIcon,
  Button,
  CheckIcon,
  EmptyState,
  GateSheet,
  LockIcon,
  Skeleton,
  useToast,
} from '@/components/ui';
import { formatFeeMinor, regionalFeesFor } from '@/features/academy/fees';
import { openCourseRegistration } from '@/features/academy/handoff';
import { useToggleInterest } from '@/features/academy/interest';
import {
  invalidateRegistrations,
  liveRegistrationFor,
  useCoursesQuery,
  useInterestQuery,
  useRegionalFeesQuery,
  useRegistrationsQuery,
  type Course,
  type RegistrationRow,
} from '@/features/academy/queries';
import { RegistrationSheet } from '@/features/academy/RegistrationSheet';
import { useFormattingLocale } from '@/i18n';
import { track } from '@/lib/analytics';
import { useLocalizedText } from '@/lib/localizedJson';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

// COURSE (docs/spec/13, mockup COURSE frames reworked/composed 2026-08-10).
// One screen, five honest states below the same hero:
//   open            → per-format chips, fee (+ regional note), outline, gains,
//                     prereq banner when one exists, pinned Register
//   registered      → status band (pending/confirmed copy), the ROW's chips
//                     (format, paid, branch-when-present), pinned "Email us"
//   upcoming        → sparse hero + Coming soon chip, pinned Notify me
//   interest saved  → the stat line and the way back out (withdraw)
//   cancelled       → indistinguishable from open, by design (13: a new row)
// Register never writes anything here: it mints the handoff and opens the
// website (ADR 0017; handoff.ts). Cancelling is a conversation, not a write
// (decided 2026-08-10): the sheet mails the team through the contact-form path.
export default function CourseDetail() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const locale = useFormattingLocale();
  const localized = useLocalizedText();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const courseSlug = typeof slug === 'string' ? slug : '';
  const isMember = useAuthStore((state) => state.status === 'member');

  const query = useCoursesQuery();
  const feesQuery = useRegionalFeesQuery();
  const registrations = useRegistrationsQuery(isMember);
  const interest = useInterestQuery(isMember);
  const toggleInterest = useToggleInterest();

  const [gate, setGate] = useState<'register' | 'notify' | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  const courses = query.data;
  const course = courses?.find((c) => c.slug === courseSlug);
  const loading = courses === undefined && !query.isError;

  const back = () => {
    router.back();
  };
  const toAcademy = () => {
    router.replace('/academy');
  };

  if (loading || query.isError || course === undefined) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top + spacing.lg,
        }}
      >
        <View
          style={{ width: '100%', maxWidth: 680, alignSelf: 'center', flex: 1 }}
        >
          <AppHeader
            title={t('academy:courseTitle')}
            backLabel={t('back')}
            onBack={back}
          />
          <View style={{ paddingHorizontal: spacing.lg }}>
            {loading ? (
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Skeleton height={26} width={220} />
                <Skeleton height={90} />
                <Skeleton height={64} />
                <Skeleton height={180} />
              </View>
            ) : query.isError && courses === undefined ? (
              <EmptyState
                title={t('errors:somethingWrong')}
                body={t('errors:couldntLoad')}
                actionLabel={t('errors:tryAgain')}
                onAction={() => {
                  void query.refetch();
                }}
              />
            ) : (
              // A deep link to a slug the catalog does not know: honest copy
              // plus the way to the pathway (the events notFound pattern).
              <EmptyState
                title={t('academy:notFoundTitle')}
                body={t('academy:notFoundBody')}
                actionLabel={t('academy:notFoundAction')}
                onAction={toAcademy}
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  const registration = liveRegistrationFor(registrations.data, course);
  const interested = interest.data?.includes(course.id) ?? false;
  const regionalFees = regionalFeesFor(feesQuery.data, course.id);
  const prereq =
    course.prereqSlug === null
      ? undefined
      : courses?.find((c) => c.slug === course.prereqSlug);

  // The hero eyebrow is courses.step; an upcoming row with step '' falls back
  // to its level_name (the frame's "The journey continues").
  const eyebrow = course.step !== '' ? course.step : course.levelName;

  const register = async () => {
    if (!isMember) {
      track('gate_shown', { action_type: 'course_register' });
      setGate('register');
      return;
    }
    setOpening(true);
    const outcome = await openCourseRegistration(course.slug, i18n.language);
    setOpening(false);
    if (outcome === 'could_not_open') {
      toast.show(t('errors:somethingWrong'));
    } else if (outcome === 'already_registered') {
      // The mint refused because a live registration exists that this screen
      // did not know about (usually a website one): refetch and say so.
      invalidateRegistrations();
      toast.show(t('academy:alreadyRegistered'));
    }
  };

  const notify = () => {
    if (!isMember) {
      track('gate_shown', { action_type: 'course_interest' });
      setGate('notify');
      return;
    }
    toggleInterest.mutate(
      { courseId: course.id, interested },
      {
        onSuccess: (nowInterested) => {
          toast.show(
            nowInterested
              ? t('academy:interestSavedToast')
              : t('academy:interestRemovedToast'),
          );
        },
        onError: () => {
          toast.show(t('academy:interestFailedToast'));
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.x2l,
        }}
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          <AppHeader
            title={t('academy:courseTitle')}
            backLabel={t('back')}
            onBack={back}
          />

          {/* Mockup .chero: padding 6 20 2; eyebrow 11/800/.14em eye; h1 display
              30/-.02em lh 1.05, 10 above 8 below; body 14.5/1.5 sub. */}
          <View
            style={{
              paddingTop: 6,
              paddingHorizontal: spacing.xl,
              paddingBottom: 2,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 11,
                letterSpacing: 1.54,
                textTransform: 'uppercase',
                color: colors.eye,
              }}
            >
              {eyebrow}
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 30,
                letterSpacing: -0.6,
                lineHeight: 32,
                color: colors.text,
                marginTop: 10,
                marginBottom: 8,
              }}
            >
              {course.name}
            </Text>
            {course.upcoming ? (
              /* Mockup .stchip.soon in the hero: margin 2 0 8. */
              <View
                style={{ flexDirection: 'row', marginTop: 2, marginBottom: 8 }}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{
                    fontFamily: fontFamily.body.extraBold,
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    borderRadius: radius.full,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    overflow: 'hidden',
                    backgroundColor: colors.alt,
                    color: colors.muted,
                  }}
                >
                  {t('academy:status.soon')}
                </Text>
              </View>
            ) : null}
            {localized(course.summary) !== null ? (
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: colors.sub,
                }}
              >
                {localized(course.summary)}
              </Text>
            ) : null}
          </View>

          {/* Registered: the status band (mockup .statusband, green wash =
              tonal.greenCard.bg). A live region: the state can change under a
              member who cancels on the website and comes back. */}
          {registration !== null ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                marginTop: spacing.md,
                marginHorizontal: spacing.lg,
                borderRadius: radius.control,
                paddingVertical: spacing.md,
                paddingHorizontal: 14,
                backgroundColor: tonal.greenCard.bg,
              }}
            >
              <CheckIcon size={icon.md} color={palette.green} strokeWidth={3} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13.5,
                  color: palette.green,
                }}
              >
                {registration.status === 'confirmed'
                  ? t('academy:registeredConfirmed')
                  : t('academy:registeredPending')}
              </Text>
            </View>
          ) : null}

          {/* Prereq banner (mockup .prereq): only while unregistered on an open
              course; informational, never a block (13). */}
          {registration === null && !course.upcoming && prereq !== undefined ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 11,
                marginTop: spacing.md,
                marginHorizontal: spacing.lg,
                backgroundColor: colors.alt,
                borderWidth: 1,
                borderColor: colors.cardline,
                borderRadius: 14,
                paddingVertical: 13,
                paddingHorizontal: 14,
              }}
            >
              <View style={{ marginTop: 1 }}>
                <LockIcon size={icon.md} color={colors.eye} strokeWidth={2} />
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: fontFamily.body.regular,
                  fontSize: 13,
                  lineHeight: 19,
                  color: colors.text,
                }}
              >
                {t('academy:prereqBanner', {
                  course: course.name,
                  prereq: prereq.name,
                })}{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => {
                    router.push({
                      pathname: '/course/[slug]',
                      params: { slug: prereq.slug },
                    });
                  }}
                  style={{
                    fontFamily: fontFamily.body.bold,
                    color: colors.blue,
                  }}
                >
                  {t('academy:prereqLink', { prereq: prereq.name })}
                </Text>
              </Text>
            </View>
          ) : null}

          {/* Meta chips (mockup .metarow/.metachip): the ROW's facts when
              registered, the catalog's formats + fee otherwise. */}
          <MetaChips
            course={course}
            registration={registration}
            locale={locale}
            localizedDuration={(format) => localized(format.duration)}
          />

          {/* fee_note + the regional overrides (mockup .formcap; fee display
              decided 2026-08-10: base fee in the chip, overrides as a note). */}
          {registration === null && !course.upcoming ? (
            <FeeNotes
              course={course}
              regional={regionalFees.map((fee) => ({
                amount: formatFeeMinor(fee.feeMinor, fee.currency, locale),
                country: t(`academy:countries.${fee.countryCode}`, {
                  defaultValue: fee.countryCode,
                }),
              }))}
              note={localized(course.feeNote)}
            />
          ) : null}

          {course.outlineTitles.length > 0 ? (
            <>
              <SectionLabel label={t('academy:outline')} />
              {/* Mockup .numlist/.numrow: padding 2 20 0; rows py 10, hairline
                  between, 26px number disc, title 14.5/1.4. */}
              <View style={{ paddingTop: 2, paddingHorizontal: spacing.xl }}>
                {course.outlineTitles.map((title, index) => (
                  <View
                    key={title}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 13,
                      paddingVertical: 10,
                      borderBottomWidth:
                        index === course.outlineTitles.length - 1 ? 0 : 1,
                      borderBottomColor: colors.cardline,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: radius.full,
                        backgroundColor: colors.alt,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={{
                          fontFamily: fontFamily.body.extraBold,
                          fontSize: 12,
                          color: colors.text,
                        }}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: fontFamily.body.regular,
                        fontSize: 14.5,
                        lineHeight: 20,
                        color: colors.text,
                        paddingTop: 2,
                      }}
                    >
                      {title}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {course.gains.length > 0 ? (
            <>
              <SectionLabel label={t('academy:gains')} />
              {/* Mockup .gainrow: gap 11, padding 8 20; 22px green disc. */}
              <View style={{ paddingBottom: spacing.lg }}>
                {course.gains.map((gain) => {
                  const text = localized(gain);
                  if (text === null) return null;
                  return (
                    <View
                      key={text}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 11,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.xl,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: radius.full,
                          backgroundColor: tonal.green.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 1,
                        }}
                      >
                        <CheckIcon
                          size={icon.sm}
                          color={palette.green}
                          strokeWidth={3}
                        />
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: fontFamily.body.regular,
                          fontSize: 14,
                          lineHeight: 20,
                          color: colors.text,
                        }}
                      >
                        {text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* The pinned action bar (mockup .actionbar: border-top, 12 16 22). The
          COURSE frames pin the action below the scroll, unlike EVENT-DETAIL,
          whose frame keeps actions in flow. */}
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
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          {registration !== null ? (
            <>
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13.5,
                  color: colors.sub,
                  textAlign: 'center',
                  marginBottom: 10,
                }}
              >
                {registration.status === 'confirmed'
                  ? t('academy:registeredConfirmedStat')
                  : t('academy:registeredPendingStat')}
              </Text>
              <Button
                label={t('academy:contactAction')}
                variant="outline"
                fullWidth
                onPress={() => {
                  setContactOpen(true);
                }}
              />
            </>
          ) : course.upcoming ? (
            interested ? (
              <>
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 13.5,
                    color: colors.sub,
                    textAlign: 'center',
                    marginBottom: 10,
                  }}
                >
                  {t('academy:onTheList')}
                </Text>
                <Button
                  label={t('academy:removeFromList')}
                  variant="outline"
                  fullWidth
                  loading={toggleInterest.isPending}
                  onPress={notify}
                />
              </>
            ) : (
              <>
                <Button
                  label={t('academy:notifyMe')}
                  variant="primary"
                  fullWidth
                  loading={toggleInterest.isPending}
                  icon={<BellIcon size={icon.lg} color={colors.btnText} />}
                  onPress={notify}
                />
                <Text
                  style={{
                    fontFamily: fontFamily.body.regular,
                    fontSize: 11.5,
                    lineHeight: 16,
                    color: colors.muted,
                    textAlign: 'center',
                    marginTop: spacing.sm,
                  }}
                >
                  {t('academy:notifySub')}
                </Text>
              </>
            )
          ) : (
            <Button
              label={t('academy:register')}
              variant="primary"
              fullWidth
              loading={opening}
              onPress={() => {
                void register();
              }}
            />
          )}
        </View>
      </View>

      {registration !== null ? (
        <RegistrationSheet
          visible={contactOpen}
          courseName={course.name}
          registration={registration}
          onDismiss={() => {
            setContactOpen(false);
          }}
        />
      ) : null}

      <GateSheet
        visible={gate !== null}
        title={
          gate === 'notify'
            ? t('academy:gateNotifyTitle')
            : t('academy:gateTitle')
        }
        body={
          gate === 'notify'
            ? t('academy:gateNotifyBody')
            : t('academy:gateBody')
        }
        signInLabel={t('signIn')}
        dismissLabel={t('notNow')}
        dismissAnnouncement={t('academy:gateDismissed')}
        onSignIn={() => {
          // Gate-return: signing in completes the tap (replay.ts). The register
          // replay mints AS the new member; notify records the interest.
          useGateStore
            .getState()
            .beginGateSignIn(
              gate === 'notify'
                ? { kind: 'course_interest', courseId: course.id }
                : { kind: 'course_register', courseSlug: course.slug },
            );
          setGate(null);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore
            .getState()
            .dismissGate(
              gate === 'notify' ? 'course_interest' : 'course_register',
            );
          setGate(null);
        }}
      />
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    /* Mockup .mlabel: 11/800, wide caps, muted (the events precedent). */
    <Text
      style={{
        fontFamily: fontFamily.body.extraBold,
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: colors.muted,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.xl,
      }}
    >
      {label}
    </Text>
  );
}

interface MetaChipsProps {
  course: Course;
  registration: RegistrationRow | null;
  locale: string;
  localizedDuration: (format: Course['formats'][number]) => string | null;
}

function MetaChips({
  course,
  registration,
  locale,
  localizedDuration,
}: MetaChipsProps) {
  const { t } = useTranslation();

  const chips: { label: string; value: string }[] = [];
  if (registration !== null) {
    // The row's own facts: format free text, what was paid (the NG fixture
    // renders ₦ from the row's currency), branch display name when present.
    chips.push({ label: t('academy:chipFormat'), value: registration.format });
    chips.push({
      label: t('academy:chipPaid'),
      value: formatFeeMinor(registration.amount, registration.currency, locale),
    });
    if (registration.branch !== null && registration.branch !== '') {
      chips.push({
        label: t('academy:chipBranch'),
        value: registration.branch,
      });
    }
  } else {
    for (const format of course.formats) {
      const duration = localizedDuration(format);
      if (duration !== null) {
        chips.push({
          label:
            format.key === 'intensive'
              ? t('academy:formatIntensive')
              : t('academy:formatPartTime'),
          value: duration,
        });
      }
    }
    if (course.feeMinor !== null && course.feeCurrency !== null) {
      chips.push({
        label: t('academy:chipFee'),
        value: formatFeeMinor(course.feeMinor, course.feeCurrency, locale),
      });
    }
  }
  if (chips.length === 0) return null;
  return (
    /* Mockup .metarow: wrap, gap 8, padding 14 16 4. */
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingTop: 14,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xs,
      }}
    >
      {chips.map((chip) => (
        <MetaChip
          key={chip.label + chip.value}
          label={chip.label}
          value={chip.value}
        />
      ))}
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    /* Mockup .metachip: card on cardline, r12, 9x13 padding; label 10/800 caps
       muted with 3 below; value 12.5/700. */
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.control,
        paddingVertical: 9,
        paddingHorizontal: 13,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: colors.muted,
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 12.5,
          color: colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function FeeNotes({
  course,
  regional,
  note,
}: {
  course: Course;
  regional: { amount: string; country: string }[];
  note: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const lines: string[] = [];
  if (note !== null) lines.push(sentenceCase(note));
  if (course.feeMinor !== null) {
    for (const fee of regional) {
      lines.push(
        t('academy:regionalFee', { fee: fee.amount, country: fee.country }),
      );
    }
  }
  if (lines.length === 0) return null;
  return (
    /* Mockup .formcap: 12/1.45 muted, padding 6 20 0. */
    <Text
      style={{
        fontFamily: fontFamily.body.regular,
        fontSize: 12,
        lineHeight: 17,
        color: colors.muted,
        paddingTop: 6,
        paddingHorizontal: spacing.xl,
      }}
    >
      {lines.join(' · ')}
    </Text>
  );
}

/** The seed's fee_note is mid-sentence prose ("workbook included"); the frame
 * prints it as its own line. First letter up, full stop kept if present. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
