import {
  Card,
  Header,
  Pill,
  SectionLabel,
  Skeleton,
  Stats,
} from '@/components/ui/Skeleton';
import { copy } from '@/copy/en';

/**
 * The loading state for the branch requests (frame `REQUESTS-LOADING`).
 *
 * The only card in the set with a PERSON in it, so the only skeleton with a circle. Everything
 * else on this screen is a name and the two branches either side of a move, which is why the
 * rows beside the avatar are short.
 *
 * Approve and Refuse are absent rather than greyed, per the frames' rule: a decision about
 * somebody's membership should not be reachable a frame before the screen knows who they are.
 */
export default function Loading() {
  return (
    <>
      <Header title="12.5rem" scope="9.375rem" />
      <Stats labels={['4rem', '6rem', '4.875rem']} />
      <SectionLabel>{copy.requests.waitingLabel}</SectionLabel>
      <Person name="44%" move="66%" />
      <Person name="36%" move="58%" />
    </>
  );
}

function Person({ name, move }: { name: string; move: string }) {
  return (
    <Card>
      <Pill />
      <div className="mt-3 flex items-center gap-3">
        <Skeleton
          width="2.5rem"
          height="2.5rem"
          className="flex-none rounded-full"
        />
        <div className="flex-1">
          <Skeleton width={name} height="1rem" />
          <Skeleton width={move} height="0.8125rem" className="mt-2" />
        </div>
      </div>
    </Card>
  );
}
