import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { CodeStep } from './CodeStep';
import { EmailStep } from './EmailStep';
import { ProfileStep } from './ProfileStep';
import { SuccessStep } from './SuccessStep';

// The AUTH-1..4 flow (docs/spec/03) as ONE route with internal steps: every
// gated action pushes /auth once, so leaving the flow is always a single pop
// back to the origin screen (no stack juggling across four routes). The
// resume route (/auth/profile, docs/spec/03 half-created) mounts the same
// flow at the profile step; with no origin beneath it, exits replace to Home.
// Gate-return REPLAY is W2.2; AUTH-4's Continue just returns.

export type AuthStep = 'email' | 'code' | 'profile' | 'success';

export interface AuthFlowProps {
  initialStep: 'email' | 'profile';
}

export function AuthFlow({ initialStep }: AuthFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [email, setEmail] = useState('');
  const [sentAt, setSentAt] = useState(0);

  const exitFlow = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

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
  return <SuccessStep onContinue={exitFlow} />;
}
