/**
 * Surfaces whose work item has not landed, and which therefore must not be
 * advertised to a member (docs/spec/plans/W4.7-hardening-audit.md S1).
 *
 * THE RULE THAT MAKES THESE SAFE: a flag here is deleted by the item that
 * finishes its feature, never flipped to `true` and left behind. A flag that
 * outlives its feature is a branch nobody reads and a second way for the app to
 * behave, so `pnpm typecheck` failing at every reference is the point: it hands
 * whoever finishes the feature the complete list of doors to reopen.
 *
 * They are BUILD-TIME constants rather than remote config on purpose. A surface
 * that has not been built cannot be turned on by a config row, so a runtime
 * switch would add no capability and one more way to be wrong: an admin could
 * open a door onto a screen that says "on its way".
 *
 * Hiding a door is not the same as removing the room. The routes stay routable
 * (`04` forbids dead ends, and `features/notifications/deepLinks.ts` still
 * allowlists all three), so a deep link that arrives from anywhere lands on the
 * stub's "on its way" rather than on nothing at all.
 */
interface Features {
  /**
   * STORE and LIBRARY (`14`). Deleted by W4.2, which needs W4.1's Payhip
   * pipeline; W4.1 was parked by Ayo on 2026-09-01 with only its schema built.
   * `18`'s MVP definition already defers both.
   */
  readonly store: boolean;

  /**
   * PLAN, the devotional reading plan (`14`). Deleted by W4.4. `18` defers it
   * with the Store, since the plan it reads is a paid entitlement.
   */
  readonly devotionalPlan: boolean;
}

/**
 * Typed `boolean` rather than left as `false` literals, deliberately. Under
 * `strictTypeChecked` a literal-typed flag makes every `features.x ? ... : null`
 * a provably dead branch, which `no-unnecessary-condition` refuses, and the
 * repo would gain a disable comment per door. Widening costs only dead-code
 * elimination, and the screens stay in the bundle regardless: the routes are
 * kept on purpose so a deep link lands somewhere.
 *
 * Deleting a key still breaks `pnpm typecheck` at every reference, which is the
 * property that matters.
 */
export const features: Features = {
  store: false,
  devotionalPlan: false,
};
