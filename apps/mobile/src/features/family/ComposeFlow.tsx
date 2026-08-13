import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';

import {
  composeBodyMax,
  composeSchema,
  consentVersionFor,
  type ComposeForm,
  type ComposeTarget,
} from '@agbc/shared';
import { spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  Screen,
  Skeleton,
  useToast,
} from '@/components/ui';
import i18n from '@/i18n';
import { track } from '@/lib/analytics';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

import { mapComposeError, type ComposeErrorKey } from './composeErrors';
import { ComposeStep } from './ComposeStep';
import { ConsentStep } from './ConsentStep';
import { clearDraft, loadDraft, saveDraft } from './drafts';
import { surfacesTouchedByTestimony } from './markAnswered';
import { myPostsKey } from './myPosts';
import { useEditablePost } from './ownPost';
import { usePrayerQuery } from './queries';
import {
  discardTestimonyPhoto,
  photoPickingAvailable,
  pickAndUploadTestimonyPhoto,
  type PhotoFailure,
} from './photo';
import { PostPendingStep } from './PostPendingStep';
import { PRAYER_SURFACE_KEYS, TESTIMONY_SURFACE_KEYS } from './keys';

// TESTIMONY-COMPOSE / PRAYER-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09),
// as ONE route with internal steps, the same shape as AuthFlow: leaving the
// composer is a single pop back to Family however deep the author got.
//
// One react-hook-form instance spans compose and consent so a draft restore and
// a validation error can never disagree about what is in the box. The draft
// carries body/category/anonymity and NEVER the consent tick: the consent step
// re-runs after every restore, because a carried-over agreement would record
// Art. 9 consent this submission never actually received (docs/spec/09 §3).

const DRAFT_DEBOUNCE_MS = 400;

type ComposeStage = 'compose' | 'consent' | 'sent';

export interface ComposeFlowProps {
  target: ComposeTarget;
  /**
   * Editing an existing post of the author's own (W2.6): MY-POSTS' "Edit and resubmit",
   * and Edit in the `...` menu on the detail header.
   *
   * Three things differ, and each of them is the database's rule rather than a choice:
   *
   * 1. THE CONSENT STEP DOES NOT RE-RUN. `consent_version` and `consented_at` are
   *    immutable on update (the guards raise "authorship, branch, and consent evidence
   *    are immutable"), so there is nothing a second agreement could record. The evidence
   *    on the row names the wording the author agreed to when they published, which is
   *    still the wording they published under.
   * 2. A PHOTO CANNOT BE ADDED TO A POST THAT NEVER HAD ONE. That would be doing
   *    something the recorded consent did not describe, and the photo gate refuses it
   *    (20260727120000 left this exact note for W2.6). Replacing or removing the photo of
   *    a post that already carries one is fine. The way to add one is to delete and share
   *    again, which is the only path that can record the right consent.
   * 3. A REQUEST KEEPS THE ANONYMITY IT WAS PUBLISHED WITH. The column is editable by its
   *    author and does NOT re-pend the row, but going anonymous -> named republishes
   *    somebody's name against words they chose to publish without it, which the data
   *    model expects a confirm sheet for and no frame draws yet. Left out rather than
   *    invented.
   *
   * The save itself re-pends the post: that is a trigger, not this screen (docs/spec/02).
   */
  editId?: string;
  /**
   * The answered prayer this testimony is being written FROM (W2.5, the last step of the
   * loop). Frame: `TESTIMONY-COMPOSE · from answered prayer (prefilled)`.
   *
   * It adds the link banner and puts `from_prayer_id` on the row, and it is dropped
   * silently for a request that is not the author's own: `assert_prayer_link_allowed`
   * refuses that link anyway, and the honest thing on screen is to compose a plain
   * testimony rather than to display a claim the database will not accept.
   *
   * Never offered on an EDIT. `from_prayer_id` counts as content on update, so changing it
   * re-pends the post, and the composer has no frame for adding a link to a testimony that
   * was published without one. The only way in is from the request itself.
   */
  fromPrayerId?: string;
}

/** The post's language tag: what the author is composing in, as far as we can
 * tell (docs/spec/09 multilingual feeds). The column accepts more than the four
 * UI locales, so this is a declaration, not a restriction. */
function currentContentLanguage(): string {
  return i18n.language.split('-')[0] || 'en';
}

export function ComposeFlow({
  target,
  editId,
  fromPrayerId,
}: ComposeFlowProps) {
  const router = useRouter();
  const { t } = useTranslation('family');
  const toast = useToast();
  const profile = useAuthStore((s) => s.profile);
  const editing = editId !== undefined;
  const existing = useEditablePost(target, editId ?? null);

  // The request being answered, for the banner's excerpt. Through the feed view like every
  // other read: it is approved (mark-answered requires that), so the author can see it, and
  // an anonymous one still yields its own words.
  const originPrayer = usePrayerQuery(fromPrayerId ?? '', !editing);
  // `is_mine` decides whether the link is real, not the id in the URL. The row answers it
  // even for an anonymous request, which is exactly the case where the author has no
  // author_id to compare against (migration 20260803170000).
  const origin =
    !editing && fromPrayerId && originPrayer.data?.is_mine === true
      ? originPrayer.data
      : null;
  const linkId = origin ? fromPrayerId : undefined;

  const [stage, setStage] = useState<ComposeStage>('compose');
  const [errorKey, setErrorKey] = useState<ComposeErrorKey | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Photo state that is NOT part of the form: the local preview file (gone after
  // process death, unlike the object) and the in-flight/failure flags. The path
  // itself lives on the form, because that is what the row carries.
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoFailure, setPhotoFailure] = useState<PhotoFailure | null>(null);

  const schema = useMemo(
    () => composeSchema(target, editing ? 'edit' : 'create'),
    [target, editing],
  );
  const {
    control,
    handleSubmit,
    getValues,
    reset,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ComposeForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      body: '',
      categoryId: null,
      imagePath: null,
      isAnonymous: false,
      consentAgreed: false,
    },
  });

  const body = useWatch({ control, name: 'body' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const imagePath = useWatch({ control, name: 'imagePath' });
  const isAnonymous = useWatch({ control, name: 'isAnonymous' });

  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/family');
  };

  // Restore on open (docs/spec/09 §3). Guarded on an empty box so a fast typist
  // never has their first sentence overwritten by a slow storage read, and
  // consentAgreed is reset to false explicitly: that is the rule made visible.
  //
  // An edit waits for the row first and starts from THOSE words, so a draft can only
  // ever restore an edit somebody was already part-way through (its key carries the post
  // id). Until the row lands there is nothing to overwrite and nothing to save.
  const existingPost = existing.data ?? null;
  useEffect(() => {
    if (editing && existingPost === null) return undefined;
    let cancelled = false;
    void loadDraft(target, editId, linkId).then((draft) => {
      if (cancelled) return;
      const start = draft ?? existingPost;
      if (start && getValues('body') === '') {
        reset({
          body: start.body,
          categoryId: start.categoryId,
          // The object survived; the cached file the picker wrote may not, so
          // the preview falls back to a signed URL for the author's own photo.
          imagePath: target === 'testimony' ? start.imagePath : null,
          isAnonymous: start.isAnonymous,
          consentAgreed: false,
        });
        if (draft) toast.show(t('draftRestored'));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    target,
    editId,
    linkId,
    editing,
    existingPost,
    getValues,
    reset,
    toast,
    t,
  ]);

  // Save on every change, debounced. Gated on `hydrated` so the empty default
  // state cannot overwrite a stored draft in the window before it loads, and on
  // the stage so a save scheduled just before Post cannot land AFTER the
  // successful submit cleared it and resurrect a draft of an already-sent post
  // (`stage` is a dependency precisely so that transition cancels the timer).
  useEffect(() => {
    if (!hydrated || stage === 'sent') return undefined;
    const timer = setTimeout(() => {
      void saveDraft(
        target,
        { body, categoryId, imagePath, isAnonymous },
        editId,
        linkId,
      );
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [
    hydrated,
    stage,
    target,
    editId,
    linkId,
    body,
    categoryId,
    imagePath,
    isAnonymous,
  ]);

  // Hardware back mirrors the on-screen control: consent returns to compose,
  // everything else leaves the composer (the default pop).
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (stage === 'consent') {
          setStage('compose');
          return true;
        }
        return false;
      },
    );
    return () => {
      subscription.remove();
    };
  }, [stage]);

  const onPickPhoto = () => {
    if (photoBusy) return;
    setPhotoFailure(null);
    setPhotoBusy(true);
    // The folder name IS the member's id: the storage policies and the row guard
    // both hang on it, so it comes from the session rather than anywhere the UI
    // could have stale-cached it.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const userId = data.session?.user.id;
        if (!userId) return { ok: false, reason: 'failed' } as const;
        return pickAndUploadTestimonyPhoto(userId);
      })
      .then((result) => {
        if (result.ok) {
          setValue('imagePath', result.path, { shouldValidate: true });
          setPhotoPreviewUri(result.previewUri);
          return;
        }
        // Backing out of the system picker is not a failure and gets no copy.
        if (result.reason !== 'cancelled') setPhotoFailure(result.reason);
      })
      .finally(() => {
        setPhotoBusy(false);
      });
  };

  const onRemovePhoto = () => {
    const current = getValues('imagePath');
    setValue('imagePath', null, { shouldValidate: true });
    setPhotoPreviewUri(null);
    setPhotoFailure(null);
    // Take the object with it. The author changed their mind before anyone else
    // could ever see it, so it should not linger in the bucket.
    if (current !== null) void discardTestimonyPhoto(current);
  };

  const goToConsent = () => {
    void trigger('body').then((valid) => {
      if (!valid) return;
      // An edit has no consent step to go to (see `editId`): the button under the box
      // is the save, so this IS the submit.
      if (editing) {
        setErrorKey(null);
        void submitForm();
        return;
      }
      // Consent is per-submission: arriving at the step always starts unticked,
      // including on a second pass after a failed submit.
      setValue('consentAgreed', false);
      setErrorKey(null);
      setStage('consent');
    });
  };

  // Invoked inside the press event, never at render (compiler-lint purity).
  const submitForm = handleSubmit(async (form) => {
    setErrorKey(null);

    if (editing) {
      // Only the columns the author can actually change. `consent_version`,
      // `consented_at`, `author_id` and `branch_id` are absent because they are
      // immutable on update, and `status` is absent because the trigger owns it: this
      // update is what sends the post back to pending, but it does not say so.
      const { error: editError } =
        target === 'testimony'
          ? await supabase
              .from('testimonies')
              .update({
                body: form.body.trim(),
                category_id: form.categoryId,
                image_path: form.imagePath,
                language: currentContentLanguage(),
              })
              .eq('id', editId)
          : await supabase
              .from('prayers')
              .update({
                body: form.body.trim(),
                language: currentContentLanguage(),
              })
              .eq('id', editId);

      if (editError) {
        setErrorKey(mapComposeError(editError));
        return;
      }
      await clearDraft(target, editId);
      await Promise.all(
        [
          ...(target === 'testimony'
            ? TESTIMONY_SURFACE_KEYS
            : PRAYER_SURFACE_KEYS),
          myPostsKey(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setStage('sent');
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId || !profile) {
      setErrorKey('errorGeneric');
      return;
    }
    // author_id and branch_id are required by the row type but NOT trusted: the
    // insert guard overwrites both from auth.uid() and the profile (docs/spec/02).
    const common = {
      author_id: userId,
      branch_id: profile.branchId,
      body: form.body.trim(),
      language: currentContentLanguage(),
      // The wording that was actually on screen: a post carrying a photo shows
      // (and records) the version with the photo-permission clause, and the
      // database refuses the pairing if the two ever disagree (docs/spec/20).
      consent_version: consentVersionFor(form.imagePath !== null),
    };
    const { error } =
      target === 'testimony'
        ? await supabase.from('testimonies').insert({
            ...common,
            category_id: form.categoryId,
            image_path: form.imagePath,
            // The loop's last link (W2.5). Null unless this composer was opened from the
            // author's own answered request; the guard refuses anything else.
            from_prayer_id: linkId ?? null,
          })
        : await supabase
            .from('prayers')
            .insert({ ...common, is_anonymous: form.isAnonymous });

    if (error) {
      setErrorKey(mapComposeError(error));
      return;
    }
    // The insert stood, so the events follow it here (never on the edit path
    // above: a re-submission is not a second post). `from_answered_prayer` uses
    // `linkId`, not `fromPrayerId`, because only the validated link was written
    // to the row; the pair below is north star 2's numerator (docs/spec/22 §5).
    if (target === 'testimony') {
      track('testimony_posted', { from_answered_prayer: linkId !== undefined });
      if (linkId !== undefined) track('answered_converted_to_testimony');
    } else {
      track('prayer_posted');
    }
    // The words are safely on the server now; the local copy has done its job.
    await clearDraft(target, editId, linkId);
    // The author's own pending row is not in the public feed, but a refetch
    // keeps counts and any concurrent approval honest when they land back.
    // Only the surfaces this post belongs to: a blanket sweep also re-signs every photo.
    // A LINKED testimony is the exception to "a new testimony has nothing to say about
    // the prayer feed": it is written onto the request's row too, and without this
    // PRAYER-DETAIL keeps offering to write the testimony that now exists (W2.5).
    await Promise.all(
      (target === 'testimony'
        ? surfacesTouchedByTestimony(linkId)
        : PRAYER_SURFACE_KEYS
      ).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
    setStage('sent');
  });

  if (stage === 'compose') {
    if (editing && existing.isPending) {
      return <ComposeLoading target={target} onClose={exit} />;
    }
    // The row is gone, or is `removed` and the database refuses edits to it
    // (docs/spec/02: removed is terminal for the author). Either way the composer has
    // nothing to open, and says so rather than presenting an empty box that would post
    // as something new.
    if (editing && (existing.isError || existingPost === null)) {
      return (
        <ComposeUnavailable
          target={target}
          message={t(existing.isError ? 'errors:couldntLoad' : 'editGone')}
          onClose={exit}
          onRetry={existing.isError ? () => void existing.refetch() : undefined}
        />
      );
    }
    if (editing && existingPost?.status === 'removed') {
      return (
        <ComposeUnavailable
          target={target}
          message={t('editRemoved')}
          onClose={exit}
        />
      );
    }
    return (
      <ComposeStep
        target={target}
        editing={editing}
        // The banner waits for the row. Showing "Born from an answered prayer" before the
        // request has arrived would mean showing it and then taking it away for anyone
        // whose link turns out not to be theirs.
        originPrayerBody={origin?.body ?? null}
        control={control}
        bodyError={
          errors.body
            ? body.trim().length === 0
              ? t('composeBodyRequired')
              : t('composeBodyTooLong', { max: composeBodyMax(target) })
            : null
        }
        submitErrorMessage={editing && errorKey ? t(errorKey) : null}
        submitting={isSubmitting}
        photo={{
          // Adding a photo to a post that never carried one is refused by the database
          // (see `editId`), so the control is not offered rather than offered and
          // refused. A post that has one keeps every photo action it had.
          available:
            photoPickingAvailable &&
            (!editing || existingPost?.imagePath !== null),
          path: imagePath,
          previewUri: photoPreviewUri,
          busy: photoBusy,
          failure: photoFailure,
          onPick: onPickPhoto,
          onRemove: onRemovePhoto,
        }}
        onClose={exit}
        onContinue={goToConsent}
      />
    );
  }
  if (stage === 'consent') {
    return (
      <ConsentStep
        target={target}
        control={control}
        hasPhoto={imagePath !== null}
        consentError={errors.consentAgreed ? t('consentRequired') : null}
        submitErrorMessage={errorKey ? t(errorKey) : null}
        submitting={isSubmitting}
        onBack={() => {
          setStage('compose');
        }}
        onPost={() => void submitForm()}
      />
    );
  }
  return <PostPendingStep target={target} onDone={exit} />;
}

/**
 * Waiting for the row an edit is about to change.
 *
 * The header is drawn straight away and the box is a skeleton, rather than a spinner on
 * an empty screen: the author tapped Edit and should land on something recognisable
 * while the words arrive.
 */
function ComposeLoading({
  target,
  onClose,
}: {
  target: ComposeTarget;
  onClose: () => void;
}) {
  const { t } = useTranslation('family');
  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t(
          target === 'testimony' ? 'editTestimonyTitle' : 'editPrayerTitle',
        )}
        leading="close"
        backLabel={t('common:close')}
        onBack={onClose}
      />
      <View style={{ paddingHorizontal: spacing.gutter, gap: spacing.md }}>
        <Skeleton height={18} width="40%" />
        <Skeleton height={140} />
      </View>
    </Screen>
  );
}

/** The post an edit was opened for cannot be edited: gone, or removed by a leader. */
function ComposeUnavailable({
  target,
  message,
  onClose,
  onRetry,
}: {
  target: ComposeTarget;
  message: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('family');
  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t(
          target === 'testimony' ? 'editTestimonyTitle' : 'editPrayerTitle',
        )}
        leading="close"
        backLabel={t('common:close')}
        onBack={onClose}
      />
      <EmptyState
        title={t('editUnavailableTitle')}
        body={message}
        actionLabel={onRetry ? t('errors:tryAgain') : t('common:close')}
        onAction={onRetry ?? onClose}
      />
    </Screen>
  );
}
