import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyGlyph,
  EmptyState,
  MenuLabel,
  PersonIcon,
  PlusIcon,
  Screen,
  Skeleton,
  TextArea,
} from '@/components/ui';
import { formatClock } from '@/features/watch/audio';
import {
  appendTimestamp,
  useDraftsHydrated,
  useNoteDraftStore,
  useNoteEditor,
  useNoteQuery,
  type NoteDraft,
  type NoteStatus,
  type SermonNote,
} from '@/features/watch/notes';
import {
  usePlaybackStore,
  type PlaybackEntry,
} from '@/features/watch/playback';
import { useSermonQuery } from '@/features/watch/queries';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

/**
 * SERMON-NOTES (docs/spec/08, the four W3.1 slice 4 frames): ONE autosaved
 * document per member per message. The timestamps are TEXT the Add button
 * writes into the page, exactly as a hand writes the next heading in a paper
 * notebook; the Save slot became the autosave status, because a promise to
 * save with nothing on screen is uncheckable.
 *
 * Opening this screen pauses the message: navigation blurs the player, and
 * pausing on blur is the slice 3 rule. That pause is also why the Add line can
 * name one fixed second, and the line is ABSENT when nothing has played,
 * because there is no second to name.
 */
export default function SermonNotesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isMember = useAuthStore((s) => s.status === 'member');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen widthClass="capped" padded={false} keyboardPersistTaps>
        {isMember ? (
          <MemberNotes sermonId={id} />
        ) : (
          <>
            <AppHeader
              title={t('watch:notesTitle')}
              backLabel={t('common:back')}
              onBack={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/watch');
              }}
            />
            {/* Reachable by deep link only: the player's Notes action gates
                first. The most private words in this app, so the screen says
                who can read them before asking anybody to sign in. */}
            <EmptyState
              icon={<EmptyGlyph Icon={PersonIcon} />}
              title={t('watch:notesGuestTitle')}
              body={t('watch:notesGuestBody')}
              actionLabel={t('common:signIn')}
              onAction={() => {
                track('gate_shown', { action_type: 'sermon_notes' });
                useGateStore
                  .getState()
                  .beginGateSignIn({ kind: 'sermon_notes', sermonId: id });
                router.push('/auth');
              }}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * Everything above the page itself, which the three states below share: the
 * header (carrying the autosave status when there is an editor to report on)
 * and the frame's message block.
 */
function NotesChrome({
  sermonId,
  status,
}: {
  sermonId: string;
  status?: NoteStatus;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sermon = useSermonQuery(sermonId).data ?? null;

  return (
    <>
      <AppHeader
        title={t('watch:notesTitle')}
        backLabel={t('common:back')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/watch');
        }}
        trailing={
          status === undefined ? undefined : <NoteStatusLabel status={status} />
        }
      />

      {sermon ? (
        // The frame's `.nsubj`: the message's title, then the speaker.
        //
        // A heading rather than the 11px uppercase eyebrow this started as
        // (Ayo, 2026-08-15, frame updated in the same change): on a screen whose
        // whole job is writing about ONE message, its title is the subject, not
        // a label, and a real title ("DAY 14: Disciples believed it was real,
        // But only one asked to Experience it") shouted in caps at 11px was the
        // hardest thing on the page to read.
        //
        // It keeps the gold (Ayo's call, 2026-08-15). Worth writing down why
        // that is safe at this size and would not have been at 16: `colors.eye`
        // is the deep gold #b98600 in light mode, which is ~4.35:1 on cream. At
        // 20px bold the text is WCAG "large" (>= 18.66px bold), where the bar is
        // 3:1 and this clears it; at 16px it would have been held to 4.5:1 and
        // missed. The size and the colour hold each other up here.
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 20,
              // 1.3, the ratio the frame's headings use. Left at 21 it clipped
              // the descenders of a title that wrapped.
              lineHeight: 26,
              color: colors.eye,
            }}
          >
            {sermon.title}
          </Text>
          {sermon.speaker ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                color: colors.muted,
                marginTop: 3,
              }}
            >
              {sermon.speaker}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ paddingHorizontal: spacing.lg }}>
        <MenuLabel label={t('watch:myNotes')} />
      </View>
    </>
  );
}

function MemberNotes({ sermonId }: { sermonId: string }) {
  const { t } = useTranslation();
  const noteQuery = useNoteQuery(sermonId, true);
  // The persisted drafts are read from disk asynchronously, and the editor
  // decides its opening copy once, at mount: mounting before they land would
  // open on the server copy and autosave over a newer offline draft.
  const draftsHydrated = useDraftsHydrated();
  // The selector annotates the `| undefined` a record lookup really has: this
  // project does not run `noUncheckedIndexedAccess`, so a missing key types as
  // present while being undefined at runtime, and the guard below would read as
  // an "unnecessary conditional" the linter offers to delete.
  const draft = useNoteDraftStore(
    (s): NoteDraft | undefined => s.drafts[sermonId],
  );

  // With a draft in hand the page opens regardless (the draft IS the newer
  // copy); with no draft, a failed read must NOT open an empty page whose
  // autosave would overwrite the document it could not fetch. Judged only once
  // the drafts are on hand, for the same reason the editor waits for them.
  const blockedByError =
    noteQuery.isError && draftsHydrated && draft === undefined;

  if (blockedByError) {
    return (
      <>
        <NotesChrome sermonId={sermonId} />
        <EmptyState
          title={t('errors:somethingWrong')}
          body={t('errors:couldntLoad')}
          actionLabel={t('errors:tryAgain')}
          onAction={() => {
            void noteQuery.refetch();
          }}
        />
      </>
    );
  }

  if (noteQuery.isPending || !draftsHydrated) {
    return (
      <>
        <NotesChrome sermonId={sermonId} />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Skeleton height={212} />
        </View>
      </>
    );
  }

  // The editor opens on an ANSWER, never on a pending read, which is what lets
  // it decide its opening copy once at mount instead of in an effect.
  return <NotesPage sermonId={sermonId} server={noteQuery.data ?? null} />;
}

function NotesPage({
  sermonId,
  server,
}: {
  sermonId: string;
  server: SermonNote | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const editor = useNoteEditor(sermonId, server);
  // The second the message is paused at (the player saves it on blur); no
  // entry means nothing has played, and the Add line stays away. Annotated for
  // the same reason as `draft` above.
  const position = usePlaybackStore(
    (s): PlaybackEntry | undefined => s.positions[sermonId],
  );

  return (
    <>
      <NotesChrome sermonId={sermonId} status={editor.status} />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <TextArea
          ref={inputRef}
          size="page"
          label={t('watch:myNotes')}
          placeholder={t('watch:notesPlaceholder')}
          value={editor.body}
          onChangeText={editor.setBody}
        />
      </View>

      {editor.status === 'unsaved' ? (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: colors.muted,
            textAlign: 'center',
            paddingTop: 10,
            paddingHorizontal: spacing.xl,
          }}
        >
          {t('watch:notesKeptOnPhone')}
        </Text>
      ) : null}

      {position !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watch:addNoteAt', {
            time: formatClock(position.positionSec),
          })}
          onPress={() => {
            editor.setBody(
              appendTimestamp(editor.body, formatClock(position.positionSec)),
            );
            inputRef.current?.focus();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: editor.status === 'unsaved' ? 10 : spacing.xs,
            marginHorizontal: spacing.lg,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.button,
            paddingVertical: 11,
            paddingHorizontal: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: radius.full,
              backgroundColor: palette.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* The frame draws a text "+" here; the glyph is the same shape
                    and keeps this screen on the app's one icon set. */}
            <PlusIcon size={icon.lg} color={onInk.text} strokeWidth={2.4} />
          </View>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 14.5,
              color: colors.muted,
            }}
          >
            {t('watch:addNoteAt', {
              time: formatClock(position.positionSec),
            })}
          </Text>
        </Pressable>
      ) : null}
      <View style={{ height: spacing.md }} />
    </>
  );
}

/** The frame's `.nstat`: Saved ✓ in green, Saving... muted, Not saved yet in
 * the eyebrow gold. Idle renders nothing: no claim before there is anything to
 * claim. */
function NoteStatusLabel({ status }: { status: NoteStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (status === 'idle') return <View style={{ width: 40 }} />;
  return (
    <Text
      accessibilityLiveRegion="polite"
      // A control label, so it caps at 1.3x and stays on one line (05). It
      // shares the header row with a `flex: 1` title, and the longest strings
      // are not the English ones ("Nog niet opgeslagen", "Pas encore
      // enregistré"): unclamped, this squeezes the title at a large font scale.
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      style={{
        fontFamily: fontFamily.body.bold,
        fontSize: 12.5,
        color:
          status === 'saved'
            ? palette.green
            : status === 'unsaved'
              ? colors.eye
              : colors.muted,
      }}
    >
      {status === 'saved'
        ? t('watch:notesSaved')
        : status === 'saving'
          ? t('watch:notesSaving')
          : t('watch:notesUnsaved')}
    </Text>
  );
}
