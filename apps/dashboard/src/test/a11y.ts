import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe over a rendered surface and fails with the actual rule violations.
 *
 * Automation catches roughly a third of accessibility problems, so this is necessary and
 * not sufficient (~/.claude/standards/frontend.md). The manual keyboard pass is recorded
 * in the PR; this is the part that can regress silently.
 *
 * Colour contrast cannot be evaluated in jsdom, which has no layout, so axe reports
 * those rules as "incomplete" rather than passing them. Contrast is verified against the
 * design tokens in the browser instead.
 */
export async function expectNoA11yViolations(
  container: HTMLElement,
): Promise<void> {
  const results = await axe.run(container, {
    resultTypes: ['violations'],
  });

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.html}`).join('\n'),
  );

  expect(summary, summary.join('\n')).toEqual([]);
}
