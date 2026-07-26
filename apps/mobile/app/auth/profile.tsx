import { AuthFlow } from '@/features/auth/AuthFlow';

// Half-created-profile resume (docs/spec/03): a session whose profile has
// onboarded_at NULL lands here from SPLASH and finishes AUTH-3.
export default function AuthProfileResume() {
  return <AuthFlow initialStep="profile" />;
}
