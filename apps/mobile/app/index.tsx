import { View } from 'react-native';

// Deliberately blank: the entry flow (SPLASH > onboarding) lands at W1.1 and the
// tab shell at W1.2. Theming (tokens, dark mode) arrives at W0.7; text arrives with
// i18n at W0.9 (i18n keys only, no literal strings).
export default function Index() {
  return <View style={{ flex: 1 }} />;
}
