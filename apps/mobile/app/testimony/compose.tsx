import { useLocalSearchParams } from 'expo-router';

import { ComposeFlow } from '@/features/family/ComposeFlow';

// TESTIMONY-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09). A static segment,
// so it takes precedence over the sibling [id] detail route.
//
// `?edit=<id>` opens the same composer on an existing testimony of the author's own
// (W2.6): MY-POSTS' "Edit and resubmit", and Edit in the detail header's `...` menu.
// Which posts that id may be is not this route's question: RLS answers it, and the
// composer shows the unavailable state for anything it cannot open.
//
// `?fromPrayer=<id>` opens it as the answer to an answered prayer (W2.5), which is the
// last step of the loop: the frame `TESTIMONY-COMPOSE · from answered prayer` adds the
// link banner and the row carries `from_prayer_id`. Whose prayer that may be is not this
// route's question either: `assert_prayer_link_allowed` refuses anyone but its author,
// and the composer drops the link rather than presenting a claim it cannot make.
export default function TestimonyCompose() {
  const { edit, fromPrayer } = useLocalSearchParams<{
    edit?: string;
    fromPrayer?: string;
  }>();
  return (
    <ComposeFlow target="testimony" editId={edit} fromPrayerId={fromPrayer} />
  );
}
