import { ComposeFlow } from '@/features/family/ComposeFlow';

// PRAYER-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09). A static segment,
// so it takes precedence over the sibling [id] detail route.
export default function PrayerCompose() {
  return <ComposeFlow target="prayer" />;
}
