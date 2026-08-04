import { useLocalSearchParams } from 'expo-router';

import { ComposeFlow } from '@/features/family/ComposeFlow';

// TESTIMONY-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09). A static segment,
// so it takes precedence over the sibling [id] detail route.
//
// `?edit=<id>` opens the same composer on an existing testimony of the author's own
// (W2.6): MY-POSTS' "Edit and resubmit", and Edit in the detail header's `...` menu.
// Which posts that id may be is not this route's question: RLS answers it, and the
// composer shows the unavailable state for anything it cannot open.
export default function TestimonyCompose() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return <ComposeFlow target="testimony" editId={edit} />;
}
