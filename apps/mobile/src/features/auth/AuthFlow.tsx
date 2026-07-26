import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/ui';
import { useGateStore } from '@/state/gate';

import { CodeStep } from './CodeStep';
import { EmailStep } from './EmailStep';
import { ProfileStep } from './ProfileStep';
import { replayGateAction } from './replay';
import { SuccessStep } from './SuccessStep';

// The AUTH-1..4 flow (docs/spec/03) as ONE route with internal steps: every
// gated action pushes /auth once, so leaving the flow is always a single pop
// back to the origin screen (no stack juggling across four routes). The
// resume route (/auth/profile, docs/spec/03 half-created) mounts the same
// flow at the profile step; with no origin beneath it, exits replace to Home.
//
// Gate-return (W2.2): a success exit takes the pending gate action and
// replays it AFTER landing back on the origin screen (04 rule 9: the action
// runs, the user stays in place). Any other way out of the flow clears the
// pending action (docs/spec/03 lifetime rules): an abandoned sign-in must
// never replay later.

export type AuthStep = 'email' | 'code' | 'profile' | 'success';

export interface AuthFlowProps {
  initialStep: 'email' | 'profile';
}

export function AuthFlow({ initialStep }: AuthFlowProps) {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const toast = useToast();
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [email, setEmail] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const succeededRef = useRef(false);

  const exitFlow = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const exitWithReplay = () => {
    succeededRef.current = true;
    const action = useGateStore.getState().takePending();
    // Navigate first (stay in place); the replay then updates the origin
    // screen live via query invalidation. Failures surface honestly.
    exitFlow();
    if (action) {
      void replayGateAction(action).then((outcome) => {
        if (outcome === 'failed') toast.show(t('replayFailed'));
      });
    }
  };

  // docs/spec/03: leaving the flow without success (back from any step,
  // hardware back, gesture) drops the pending action. On success the take
  // above already emptied it, so this cleanup is a no-op.
  useEffect(() => {
    return () => {
      if (!succeededRef.current) useGateStore.getState().clearPending();
    };
  }, []);

  // Hardware back mirrors the on-screen back: the code step returns to the
  // email step; every other step exits the flow (the default pop).
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (step === 'code') {
          setStep('email');
          return true;
        }
        return false;
      },
    );
    return () => {
      subscription.remove();
    };
  }, [step]);

  if (step === 'email') {
    return (
      <EmailStep
        onBack={exitFlow}
        onSent={(sentEmail, at) => {
          setEmail(sentEmail);
          setSentAt(at);
          setStep('code');
        }}
      />
    );
  }
  if (step === 'code') {
    return (
      <CodeStep
        email={email}
        sentAt={sentAt}
        onChangeEmail={() => {
          setStep('email');
        }}
        onResent={setSentAt}
        onVerified={(next) => {
          setStep(next === 'member' ? 'success' : 'profile');
        }}
      />
    );
  }
  if (step === 'profile') {
    return (
      <ProfileStep
        onBack={exitFlow}
        onDone={() => {
          setStep('success');
        }}
      />
    );
  }
  return <SuccessStep onContinue={exitWithReplay} />;
}
