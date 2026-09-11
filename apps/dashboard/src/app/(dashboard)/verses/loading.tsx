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
 * The loading state for this screen (frame `VERSES-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="12.5rem" scope="10.625rem" />
      <Stats labels={['3.5rem', '3.5rem', '3.5rem', '3.5rem']} />
      <SectionLabel>{copy.verses.scheduledLabel}</SectionLabel>
      <Card>
        <Pill width="6rem" />
        <Skeleton width="100%" height="0.875rem" className="mt-[0.75rem]" />
        <Skeleton width="60%" height="0.875rem" className="mt-[0.5rem]" />
      </Card>
    </>
  );
}
