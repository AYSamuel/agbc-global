import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { AppHeader, EmptyState, Screen } from '@/components/ui';

// Placeholder leaf screen for MORE-hub destinations whose work items are still
// ahead (Branches/Events W1.7, Academy W2.9, Store W4.2, ...). Real screens per
// docs/spec/04: back affordance + friendly copy, never a dead end.
export interface StubScreenProps {
  title: string;
  /** Overrides the generic "on its way" body. */
  body?: string;
  icon?: ReactNode;
}

export function StubScreen({ title, body, icon }: StubScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={title}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />
      <View style={{ marginTop: spacing.x3l }}>
        <EmptyState
          title={t('comingSoon.title')}
          body={body ?? t('comingSoon.body')}
          icon={icon}
        />
      </View>
    </Screen>
  );
}
