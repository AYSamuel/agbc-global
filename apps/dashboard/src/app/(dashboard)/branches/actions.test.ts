import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { Database } from '@agbc/shared/database';

import { loadBranch } from '@/server/branches';
import {
  admin,
  createCaller,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import { NOTHING_SAVED, type BranchFormState } from './state';

/**
 * The seam between the branch form and the branch module.
 *
 * `server/branches.test.ts` proves `saveBranch` against the real database. `BranchForm.test.tsx`
 * proves the form renders and its rows survive a removal. Both were green from 2026-08-21 to
 * 2026-09-11 while NO BRANCH COULD BE EDITED AT ALL: the action between them read `slug` from
 * the request body, the form stops offering a slug input the moment a branch exists, and so
 * every save of every existing branch was refused with "Give the branch a short id." A
 * sentence about a box that is not on the screen, four lines before the code that would have
 * checked authorization and long before anything reached Postgres.
 *
 * Nothing tested the two halves MEETING, which is the whole of where the defect lived. So
 * every test here drives the action with the BODY A BROWSER POSTS rather than with a
 * hand-assembled `BranchInput`, and lets the real database answer.
 */

const harness = vi.hoisted(() => ({
  client: null as SupabaseClient<Database> | null,
  redirects: [] as string[],
}));

// Only the cookie plumbing is replaced. The client handed back is a real one over a real
// admin session, so RLS, the column grants and the aal2 policy all still get their say:
// mocking Supabase here would prove the mock (vitest.config.ts says why).
vi.mock('@/lib/supabase/server', () => ({
  createServerComponentClient: () => {
    if (!harness.client) throw new Error('no client was set for this test');
    return Promise.resolve(harness.client);
  },
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    harness.redirects.push(path);
    // The real `redirect` works by THROWING, and the action's control flow depends on it:
    // there is no return after the call. A mock that returned normally would let the action
    // fall off its end and report `undefined` as the new state.
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

const { saveBranchAction } = await import('./actions');

const minted: TestCaller[] = [];
const branchIds: string[] = [];

let ministryAdmin: TestCaller;
let stamp: string;
let slug: string;

/** What the admin sees after pressing the button: a destination, or a refusal on the form. */
interface Answer {
  redirectedTo: string | null;
  state: BranchFormState | null;
}

async function submit(form: FormData): Promise<Answer> {
  harness.redirects.length = 0;
  harness.client = ministryAdmin.serverClient();

  try {
    return {
      redirectedTo: null,
      state: await saveBranchAction(NOTHING_SAVED, form),
    };
  } catch (error) {
    // A thrown redirect is a SUCCESS. Anything thrown without one is a real failure and
    // has to keep travelling, or a broken action would read here as a saved branch.
    if (harness.redirects.length === 0) throw error;
    return { redirectedTo: harness.redirects[0] ?? null, state: null };
  }
}

/**
 * Every scalar field the form posts, by the names `BranchForm` gives them.
 *
 * The repeatable rows are appended rather than set, because the form posts a repeated NAME
 * per row (`serviceLabel` twice, not `services[1].label`) and `collect` zips them by
 * position. Sending them any other way would test a shape no browser produces.
 */
function body(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();

  const fields: Record<string, string> = {
    name: 'AGBC Test Rotterdam',
    // 'Testville' rather than 'Rotterdam' deliberately: `vitest.globalSetup.server.ts`
    // sweeps leftover branches by exactly this city, and a run killed part way through
    // cannot clean up after itself. A realistic-looking city here would leave real branches
    // in the local stack, which is how they reached a developer's phone in W2.8.
    city: 'Testville',
    country: 'Netherlands',
    languages: 'Nederlands / English',
    timezone: 'Europe/Amsterdam',
    addressLine1: 'Coolsingel 1',
    addressLine2: '',
    lat: '51.9244',
    lng: '4.4777',
    serviceTimes: 'Sundays 11:00, doors from 10:30',
    leadName: 'Pastor Test',
    leadRole: 'Branch Pastor',
    leadBio: 'Serving Rotterdam since the hall on Coolsingel.',
    youtubeChannelId: '',
    email: 'rotterdam@test.local',
    welcome: 'There is a seat here for you.',
    order: '97',
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);

  form.append('serviceWeekday', '0');
  form.append('serviceStart', '11:00');
  form.append('serviceKind', 'sunday');
  form.append('serviceLabel', 'Sunday Worship');

  form.append('leaderName', 'Anneke Test');
  form.append('leaderRole', 'Womens Ministry');

  return form;
}

/** Adding one: the short id is a field, because this is the only moment it can be chosen. */
function creating(
  newSlug: string,
  overrides: Record<string, string> = {},
): FormData {
  const form = body(overrides);
  form.set('slug', newSlug);
  return form;
}

/** Add a branch and remember it for the sweep, so a test can own one without repeating this. */
async function addBranch(newSlug: string): Promise<void> {
  const answer = await submit(creating(newSlug));
  if (answer.redirectedTo !== '/branches?outcome=added') {
    throw new Error(
      `could not add the fixture branch: ${JSON.stringify(answer.state)}`,
    );
  }

  const created = await loadBranch(ministryAdmin.serverClient(), newSlug);
  if (!created) throw new Error(`the branch ${newSlug} was not created`);
  branchIds.push(created.id);
}

/**
 * Editing one: `existingSlug` and NO `slug`, which is exactly what the browser sends.
 *
 * The omission is the point of this whole file. `BranchForm.test.tsx` asserts it from the
 * DOM side, off the rendered form rather than off this assumption; the two together are the
 * contract.
 */
function editing(overrides: Record<string, string> = {}): FormData {
  const form = body(overrides);
  form.set('existingSlug', slug);
  return form;
}

beforeAll(async () => {
  stamp = `${String(process.pid)}-${String(Date.now()).slice(-6)}`;
  slug = `test-actions-${stamp}`;
  ministryAdmin = await createCaller({ role: 'admin', mfa: 'verified' });
  minted.push(ministryAdmin);

  // The branch the editing tests act on, added here rather than by the test above it: each
  // test owns what it needs and none of them depends on another having run first, which is
  // the rule this file's neighbour predates.
  await addBranch(slug);
});

afterAll(async () => {
  for (const one of minted) await deleteCaller(one);
  // Schedule rows first: `deleteTestBranch` is deliberately loud about a failed delete.
  for (const id of branchIds) {
    await admin().from('branch_services').delete().eq('branch_id', id);
    await deleteTestBranch(id);
  }
});

describe('adding a branch through the form', () => {
  test('an admin adds one and lands on the list', async () => {
    const mine = `test-added-${stamp}`;
    await addBranch(mine);

    const created = await loadBranch(ministryAdmin.serverClient(), mine);
    expect(created?.name).toBe('AGBC Test Rotterdam');
    expect(created?.timezone).toBe('Europe/Amsterdam');
    expect(created?.services).toHaveLength(1);
  });

  test('a missing short id is still refused, because here it IS a field', async () => {
    // The other half of the fix. Sourcing the slug from the row must not blanket-suppress
    // the check: on the create path there is no row, the input is on the screen, and
    // leaving it empty has to say so.
    const answer = await submit(creating(''));
    expect(answer.redirectedTo).toBeNull();
    expect(answer.state).toMatchObject({
      status: 'error',
      problem: 'slug_required',
    });
  });
});

describe('editing a branch through the form', () => {
  test('renaming one saves, though the form posts no short id at all', async () => {
    const form = editing({ name: 'AGBC Test Rotterdam Centraal' });
    expect(form.get('slug')).toBeNull();

    const answer = await submit(form);
    // Before the fix this was `{ status: 'error', problem: 'slug_required' }`, for every
    // branch and every field, and the database was never reached.
    expect(answer.redirectedTo).toBe('/branches?outcome=saved');

    const after = await loadBranch(ministryAdmin.serverClient(), slug);
    expect(after?.name).toBe('AGBC Test Rotterdam Centraal');
    // The slug is what it always was: an edit renames a branch, it never re-slugs one.
    expect(after?.slug).toBe(slug);
  });

  test('a refusal on some other field keeps the short id on screen', async () => {
    const answer = await submit(editing({ timezone: 'Europe/Amsterdaam' }));
    expect(answer.state).toMatchObject({
      status: 'error',
      problem: 'timezone_unknown',
    });

    // The values echoed back are what the form re-renders from, and `Locked` shows the slug
    // among them. Reading it from the request left this empty, so a mistyped timezone also
    // blanked the short id the person was looking at.
    if (answer.state?.status !== 'error') throw new Error('expected a refusal');
    expect(answer.state.values.slug).toBe(slug);
  });
});
