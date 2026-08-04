import { useLocalSearchParams } from 'expo-router';

import { ComposeFlow } from '@/features/family/ComposeFlow';

// PRAYER-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09). A static segment,
// so it takes precedence over the sibling [id] detail route.
//
// `?edit=<id>` opens the same composer on an existing request of the author's own
// (W2.6); see the testimony route for what that mode does and does not allow.
export default function PrayerCompose() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return <ComposeFlow target="prayer" editId={edit} />;
}
