import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';

/**
 * The mockup's `.phead`: the page's title and scope on the left, Sign out on the right.
 *
 * ONE COMPONENT BECAUSE OF THE BUTTON, not because three headers looked alike. Every
 * dashboard frame draws Sign out here, and until now no dashboard page had it: `/` has a
 * sign-out, but `/` redirects straight to `/moderation`, so a signed-in leader had no way
 * out of the dashboard at all short of clearing cookies. Putting it in one place is what
 * stops the next page forgetting it too.
 *
 * A real form POST, so signing out works with HTML alone and cannot be triggered by a
 * cross-site GET (the route itself refuses anything but a same-origin POST).
 */
export function PageHeader({
  title,
  scope,
}: {
  title: string;
  /** The branch or reach this page is showing: "AGBC Glasgow", "All branches". */
  scope: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[1.5rem] leading-tight font-extrabold">
          {title}
        </h1>
        <p className="mt-1 text-body font-bold break-words text-sub">{scope}</p>
      </div>
      <form action="/auth/sign-out" method="post">
        <Button type="submit" variant="ghost">
          {copy.app.signOut}
        </Button>
      </form>
    </header>
  );
}
