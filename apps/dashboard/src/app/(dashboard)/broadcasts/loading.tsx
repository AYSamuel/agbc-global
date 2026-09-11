import {
  Card,
  Header,
  Pill,
  SectionLabel,
  Skeleton,
} from '@/components/ui/Skeleton';
import { copy } from '@/copy/en';

/**
 * The loading state for this screen (frame `BROADCASTS-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="8.4375rem" scope="15.3125rem" />
      <SectionLabel>{copy.broadcasts.waitingHeading}</SectionLabel>
      <Card>
        <Pill width="6.5rem" />
        <Skeleton width="58%" height="1rem" className="mt-[0.75rem]" />
        <Skeleton width="100%" height="0.8125rem" className="mt-[0.5rem]" />
        <Skeleton
          width="11.875rem"
          height="0.8125rem"
          className="mt-[0.875rem]"
        />
      </Card>
      <Card>
        <Pill width="6.5rem" />
        <Skeleton width="47%" height="1rem" className="mt-[0.75rem]" />
        <Skeleton width="88%" height="0.8125rem" className="mt-[0.5rem]" />
        <Skeleton
          width="11.875rem"
          height="0.8125rem"
          className="mt-[0.875rem]"
        />
      </Card>
    </>
  );
}
