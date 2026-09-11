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
 * The loading state for this screen (frame `REPORTS-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="5.9375rem" scope="9.375rem" />
      <Stats labels={['2.625rem', '5.75rem', '7rem']} />
      <SectionLabel>{copy.reports.listLabel}</SectionLabel>
      <Card>
        <Pill width="6rem" />
        <Skeleton width="100%" height="0.875rem" className="mt-[0.75rem]" />
        <Skeleton width="78%" height="0.875rem" className="mt-[0.5rem]" />
        <Skeleton width="13.125rem" height="0.875rem" className="mt-[1rem]" />
      </Card>
      <Card>
        <Pill width="6rem" />
        <Skeleton width="100%" height="0.875rem" className="mt-[0.75rem]" />
        <Skeleton width="61%" height="0.875rem" className="mt-[0.5rem]" />
        <Skeleton width="13.125rem" height="0.875rem" className="mt-[1rem]" />
      </Card>
    </>
  );
}
