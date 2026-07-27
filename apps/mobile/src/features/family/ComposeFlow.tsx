import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';

import {
  composeBodyMax,
  composeSchema,
  CONSENT_VERSION,
  type ComposeForm,
  type ComposeTarget,
} from '@agbc/shared';

import { useToast } from '@/components/ui';
import i18n from '@/i18n';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

import { mapComposeError, type ComposeErrorKey } from './composeErrors';
import { ComposeStep } from './ComposeStep';
import { ConsentStep } from './ConsentStep';
import { clearDraft, loadDraft, saveDraft } from './drafts';
import { PostPendingStep } from './PostPendingStep';

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
}

/** The post's language tag: what the author is composing in, as far as we can
 * tell (docs/spec/09 multilingual feeds). The column accepts more than the four
 * UI locales, so this is a declaration, not a restriction. */
function currentContentLanguage(): string {
  return i18n.language.split('-')[0] || 'en';
}

export function ComposeFlow({ target }: ComposeFlowProps) {
  const router = useRouter();
  const { t } = useTranslation('family');
  const toast = useToast();
  const profile = useAuthStore((s) => s.profile);

  const [stage, setStage] = useState<ComposeStage>('compose');
  const [errorKey, setErrorKey] = useState<ComposeErrorKey | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const schema = useMemo(() => composeSchema(target), [target]);
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
      isAnonymous: false,
      consentAgreed: false,
    },
  });

  const body = useWatch({ control, name: 'body' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const isAnonymous = useWatch({ control, name: 'isAnonymous' });

  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/family');
  };

  // Restore on open (docs/spec/09 §3). Guarded on an empty box so a fast typist
  // never has their first sentence overwritten by a slow storage read, and
  // consentAgreed is reset to false explicitly: that is the rule made visible.
  useEffect(() => {
    let cancelled = false;
    void loadDraft(target).then((draft) => {
      if (cancelled) return;
      if (draft && getValues('body') === '') {
        reset({
          body: draft.body,
          categoryId: draft.categoryId,
          isAnonymous: draft.isAnonymous,
          consentAgreed: false,
        });
        toast.show(t('draftRestored'));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [target, getValues, reset, toast, t]);

  // Save on every change, debounced. Gated on `hydrated` so the empty default
  // state cannot overwrite a stored draft in the window before it loads, and on
  // the stage so a save scheduled just before Post cannot land AFTER the
  // successful submit cleared it and resurrect a draft of an already-sent post
  // (`stage` is a dependency precisely so that transition cancels the timer).
  useEffect(() => {
    if (!hydrated || stage === 'sent') return undefined;
    const timer = setTimeout(() => {
      void saveDraft(target, { body, categoryId, isAnonymous });
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hydrated, stage, target, body, categoryId, isAnonymous]);

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

  const goToConsent = () => {
    void trigger('body').then((valid) => {
      if (valid) {
        // Consent is per-submission: arriving at the step always starts unticked,
        // including on a second pass after a failed submit.
        setValue('consentAgreed', false);
        setErrorKey(null);
        setStage('consent');
      }
    });
  };

  // Invoked inside the press event, never at render (compiler-lint purity).
  const submitForm = handleSubmit(async (form) => {
    setErrorKey(null);
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
      consent_version: CONSENT_VERSION,
    };
    const { error } =
      target === 'testimony'
        ? await supabase
            .from('testimonies')
            .insert({ ...common, category_id: form.categoryId })
        : await supabase
            .from('prayers')
            .insert({ ...common, is_anonymous: form.isAnonymous });

    if (error) {
      setErrorKey(mapComposeError(error));
      return;
    }
    // The words are safely on the server now; the local copy has done its job.
    await clearDraft(target);
    // The author's own pending row is not in the public feed, but a refetch
    // keeps counts and any concurrent approval honest when they land back.
    await queryClient.invalidateQueries({ queryKey: ['family'] });
    setStage('sent');
  });

  if (stage === 'compose') {
    return (
      <ComposeStep
        target={target}
        control={control}
        bodyError={
          errors.body
            ? body.trim().length === 0
              ? t('composeBodyRequired')
              : t('composeBodyTooLong', { max: composeBodyMax(target) })
            : null
        }
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
