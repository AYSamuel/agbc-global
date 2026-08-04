import AsyncStorage from '@react-native-async-storage/async-storage';

// Compose draft persistence (docs/spec/09 §3): "drafts persist to local storage
// on every change and restore on next composer open with a Draft restored
// notice (process death loses nothing)".
//
// What is deliberately NOT in here is consent. Consent is per-submission and the
// CONSENT step always re-runs after a restore; a carried-over agreement flag
// would mean recording Art. 9 consent the author never actually gave on this
// submission (docs/spec/09 §3, docs/spec/20).
//
// There is no expiry. A draft is somebody's unfinished testimony, and silently
// deleting it after N days would lose words we promised to keep.

export type ComposeTarget = 'testimony' | 'prayer';

export interface ComposeDraft {
  body: string;
  categoryId: string | null;
  /** The uploaded, server-checked object path (testimony only). Safe to persist:
   * it is a path into a private bucket, readable only by its owner until a leader
   * approves the post, so a restored draft finds the photo still waiting. */
  imagePath: string | null;
  isAnonymous: boolean;
  savedAt: number;
}

/**
 * One key per thing being written. An EDIT gets its own (W2.6): the words being changed
 * are not the words of the new post somebody started yesterday, and sharing one key would
 * let a restored edit overwrite an untouched draft, or worse, put one post's words in
 * another post's box.
 */
export function draftKey(target: ComposeTarget, editId?: string): string {
  return editId
    ? `agbc.compose.draft.${target}.${editId}`
    : `agbc.compose.draft.${target}`;
}

/** Pure for tests: anything malformed reads as "no draft" rather than throwing
 * a composer open on a storage value from an older build. */
export function parseDraft(raw: string | null): ComposeDraft | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.body !== 'string' || record.body.trim().length === 0) {
      return null;
    }
    return {
      body: record.body,
      categoryId:
        typeof record.categoryId === 'string' ? record.categoryId : null,
      imagePath: typeof record.imagePath === 'string' ? record.imagePath : null,
      isAnonymous: record.isAnonymous === true,
      savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function loadDraft(
  target: ComposeTarget,
  editId?: string,
): Promise<ComposeDraft | null> {
  try {
    return parseDraft(await AsyncStorage.getItem(draftKey(target, editId)));
  } catch {
    // Storage unavailable is not a reason to block someone from writing.
    return null;
  }
}

export async function saveDraft(
  target: ComposeTarget,
  draft: Omit<ComposeDraft, 'savedAt'>,
  editId?: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      draftKey(target, editId),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Best effort: the composer still holds the text in memory.
  }
}

export async function clearDraft(
  target: ComposeTarget,
  editId?: string,
): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftKey(target, editId));
  } catch {
    // Nothing to do; a stale draft is recoverable, a crash here is not.
  }
}
