import { AuthFlow } from '@/features/auth/AuthFlow';

// The sign-in entry (docs/spec/03 AUTH-1..4): every gated action routes here.
export default function Auth() {
  return <AuthFlow initialStep="email" />;
}
