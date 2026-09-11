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
 * The loading state for this screen (frame `QUEUE-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="13.75rem" scope="9.375rem" />
      <Stats labels={['4.375rem', '5.625rem', '4rem']} />
      <SectionLabel>{copy.queue.waitingLabel}</SectionLabel>
      <Card>
        <Pill width="6rem" />
        <Skeleton width="100%" height="0.875rem" className="mt-[0.75rem]" />
        <Skeleton width="82%" height="0.875rem" className="mt-[0.5rem]" />
        <Skeleton width="11.25rem" height="0.875rem" className="mt-[1rem]" />
      </Card>
      <Card>
        <Pill width="6rem" />
        <Skeleton width="100%" height="0.875rem" className="mt-[0.75rem]" />
        <Skeleton width="64%" height="0.875rem" className="mt-[0.5rem]" />
        <Skeleton width="11.25rem" height="0.875rem" className="mt-[1rem]" />
      </Card>
    </>
  );
}
