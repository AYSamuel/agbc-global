/**
 * Reading rendered order out of a React Native tree.
 *
 * Section order on a screen is sometimes a decision rather than an accident of
 * how the JSX was typed (HOME's is: docs/spec/07, "Why this order"), and those
 * decisions drift silently because every order compiles. Roles order themselves
 * when the sections carry one (`getAllByRole` returns render order), but cards
 * like the verse or the rhythm strip carry no role that would sort them, and
 * `JSON.stringify(screen.toJSON())` throws on the tree's circular props.
 *
 * So walk it. `textsInOrder` collects every text node in document order, which
 * is the order a reader scrolls through.
 */

export function textsInOrder(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }
    if (typeof n === 'object' && n !== null && 'children' in n) {
      walk(n.children);
    }
  };
  walk(node);
  return out;
}

/**
 * The index of the first text node containing `needle`. Throws rather than
 * returning -1: two missing needles both yield -1, and `-1 < -1` is false, so a
 * silent miss would read as a passing order assertion.
 */
export function indexOfText(texts: readonly string[], needle: string): number {
  const at = texts.findIndex((text) => text.includes(needle));
  if (at === -1) {
    throw new Error(
      `Expected "${needle}" to be rendered. Text in order: ${texts.join(' | ')}`,
    );
  }
  return at;
}
