import {
  Card,
  Header,
  Pill,
  SectionLabel,
  Skeleton,
} from '@/components/ui/Skeleton';
import { copy } from '@/copy/en';

/**
 * The loading state for this screen (frame `EVENTS-LOADING`).
 *
 * Every width here is the frame's own, so the skeleton stands where the content will stand
 * and nothing jumps when it arrives. The section label is real text rather than a box,
 * because it is the one thing the screen already knows and cannot get wrong.
 */
export default function Loading() {
  return (
    <>
      <Header title="5.3125rem" scope="14.375rem" />
      <SectionLabel>{copy.events.upcomingHeading}</SectionLabel>
      <Card>
        <Pill width="5.5rem" />
        <Skeleton width="52%" height="1rem" className="mt-[0.75rem]" />
        <Skeleton width="70%" height="0.8125rem" className="mt-[0.5rem]" />
      </Card>
      <Card>
        <Pill width="5.5rem" />
        <Skeleton width="41%" height="1rem" className="mt-[0.75rem]" />
        <Skeleton width="63%" height="0.8125rem" className="mt-[0.5rem]" />
      </Card>
    </>
  );
}
