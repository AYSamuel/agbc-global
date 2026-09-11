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
 * The loading state for this screen (frame `REGISTRATIONS-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="9.375rem" scope="14.375rem" />
      <Stats labels={['5.5rem', '4rem', '4.75rem']} />
      <SectionLabel>{copy.academy.waitingLabel}</SectionLabel>
      <Card>
        <Pill width="6.875rem" />
        <Skeleton width="52%" height="1rem" className="mt-[0.75rem]" />
        <Skeleton width="38%" height="0.8125rem" className="mt-[0.5rem]" />
      </Card>
    </>
  );
}
