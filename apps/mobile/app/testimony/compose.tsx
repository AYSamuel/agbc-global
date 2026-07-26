import { ComposeFlow } from '@/features/family/ComposeFlow';

// TESTIMONY-COMPOSE -> CONSENT -> POST-PENDING (docs/spec/09). A static segment,
// so it takes precedence over the sibling [id] detail route.
export default function TestimonyCompose() {
  return <ComposeFlow target="testimony" />;
}
