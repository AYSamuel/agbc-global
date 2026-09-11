import { Card, Header, SectionLabel, Skeleton } from '@/components/ui/Skeleton';
import { copy } from '@/copy/en';

/**
 * The loading state for this screen (frame `BRANCHES-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="6.875rem" scope="16.5625rem" />
      <SectionLabel>{copy.branches.openHeading}</SectionLabel>
      <Card>
        <Skeleton width="38%" height="1.0625rem" />
        <Skeleton width="54%" height="0.8125rem" className="mt-[0.5625rem]" />
        <Skeleton
          width="10.625rem"
          height="0.8125rem"
          className="mt-[0.875rem]"
        />
      </Card>
      <Card>
        <Skeleton width="31%" height="1.0625rem" />
        <Skeleton width="46%" height="0.8125rem" className="mt-[0.5625rem]" />
        <Skeleton
          width="10.625rem"
          height="0.8125rem"
          className="mt-[0.875rem]"
        />
      </Card>
    </>
  );
}
