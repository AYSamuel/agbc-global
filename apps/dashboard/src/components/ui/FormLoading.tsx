import { Header, Skeleton } from '@/components/ui/Skeleton';

/**
 * The loading state for a dashboard screen that is NOT a list (frame `PEOPLE-LOADING`).
 *
 * WHY THIS IS SHARED RATHER THAN PER SCREEN, and why it exists at all. A `loading.tsx` is the
 * fallback for its own segment AND every segment nested under it, so `events/loading.tsx`
 * would otherwise draw the events LIST skeleton over `/events/new`, which is a form. A
 * skeleton that does not match what arrives is the one thing the frames rule out by name:
 * "skeletons at real dimensions, so nothing jumps". Each nested route therefore overrides the
 * list shape with this one.
 *
 * It is deliberately GENERIC where the list states are specific. A list has a known shape
 * before its data arrives, because the rows are all alike; a form, a confirmation and a detail
 * view do not, and drawing a precise skeleton for each of seventeen of them would be a great
 * deal of work to make the wrong promise more confidently. Two header lines and one field is
 * what they share, and it is honest about knowing no more than that.
 *
 * Actions are absent, not disabled, exactly as on the list states.
 */
export default function FormLoading() {
  return (
    <>
      <Header title="9.375rem" scope="11.25rem" />
      <Skeleton width="9.375rem" height="0.8125rem" className="mt-5" />
      <div className="mt-3.5 max-w-[32.5rem]">
        <Skeleton width="5.5rem" height="0.6875rem" />
        <Skeleton
          width="100%"
          height="2.875rem"
          className="mt-2 rounded-input"
        />
        <Skeleton width="62%" height="0.75rem" className="mt-[0.5625rem]" />
      </div>
    </>
  );
}
