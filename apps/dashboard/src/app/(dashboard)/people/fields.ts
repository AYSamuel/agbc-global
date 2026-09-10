/**
 * The dashboard frame's `.field`, as class strings the two People forms share.
 *
 * NOT `components/ui/TextField`, and the difference is the mockup's, not a preference.
 * The dashboard frame labels a field with `.lab` (uppercase, muted, micro) and puts the
 * hint UNDER the control; `TextField` labels in body text and puts the hint above, which
 * is the shape the app's auth screens were drawn in. Reshaping the shared component to
 * match this frame would silently restyle sign-in and MFA, so the two live side by side
 * until somebody decides which one the product means. Flagged rather than merged.
 */

/** `.field`: the column, capped at the frame's 520px so a line stays readable. */
export const FIELD = 'mt-4 max-w-[32.5rem]';

/** `.lab` */
export const LABEL =
  'block text-label font-extrabold tracking-[0.14em] text-muted uppercase';

/** `.hint` */
export const HINT =
  'mt-1.5 max-w-[52ch] text-[0.78rem] leading-normal text-muted';

/**
 * `.inp`. 48px rather than the frame's 44px minimum: the responsiveness rules prefer 48,
 * and `Button` already sits at 48, so a field and the button under it line up.
 *
 * `controlline` since W4.12, for the reason spelled out on `Button`'s secondary variant:
 * an empty text field is identified by its boundary and nothing else, so that boundary owes
 * WCAG 1.4.11's 3:1 rather than the decorative hairline's 1.31:1.
 */
export const CONTROL =
  'mt-1.5 min-h-12 w-full rounded-control border border-controlline bg-card px-4 text-body text-text';
