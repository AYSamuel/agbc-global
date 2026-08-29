'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button } from '@/components/ui/Button';
import { Guide } from '@/components/ui/Guide';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { ImageField } from '@/components/ImageField';
import type { ImageSubject } from '@/components/ImagePreview';
import { mintEventImageAction } from './actions';

import { eventWhen } from './format';
import { NOTHING_SAVED, type EventFormState } from './state';

/**
 * The event form (NEW EVENT and EDIT frames, approved 2026-08-20).
 *
 * A client component for the same reason the broadcast composer is one: a refusal must not
 * cost the leader what they typed. React resets an uncontrolled form after a form action
 * runs, so the action echoes the values back in its state and the form is KEYED on the
 * attempt, which is what makes the re-applied defaults actually land.
 *
 * WHAT IT DOES NOT DECIDE: who hears about the save. That is `event-notices`, derived in SQL
 * from what the row says versus what was last announced. What this holds is the SENTENCE
 * about the audience, and the frames put it above the fields rather than after the save,
 * because being told afterwards that you have just messaged 128 people is not being told.
 */

export type SaveAction = (
  state: EventFormState,
  formData: FormData,
) => Promise<EventFormState>;

export interface EventDefaults {
  id?: string;
  scope: 'branch' | 'ministry';
  title: string;
  description: string;
  startsAtLocal: string;
  endsAtLocal: string;
  location: string;
  rsvpEnabled: boolean;
  /** What members see at the top of this event today: its own picture, or the cover. */
  picture: ImageSubject;
}

export function EventForm({
  save,
  branchName,
  canPostMinistry,
  defaults,
  /** Present only when editing: how many people a change to the plan would tell. */
  audience,
  cancelHref,
}: {
  save: SaveAction;
  branchName: string;
  canPostMinistry: boolean;
  defaults: EventDefaults;
  audience?: { going: number; interested: number; reachable: number };
  /** Where "Cancel this event" goes. Absent for an event that is already cancelled. */
  cancelHref?: string;
}) {
  const [state, submit, saving] = useActionState(save, NOTHING_SAVED);
  const problem = state.status === 'error' ? state.problem : null;
  const typed = state.status === 'error' ? state.values : null;
  const attempt = state.status === 'error' ? state.attempt : 0;
  const editing = defaults.id !== undefined;
  const reach = audience?.reachable ?? 0;

  const value = {
    scope: typed?.scope ?? defaults.scope,
    title: typed?.title ?? defaults.title,
    description: typed?.description ?? defaults.description,
    // 'YYYY-MM-DDTHH:MM' is what `datetime-local` reads and writes; PostgREST hands back
    // seconds it has no use for.
    startsAtLocal: (typed?.startsAtLocal ?? defaults.startsAtLocal).slice(
      0,
      16,
    ),
    endsAtLocal: (typed?.endsAtLocal ?? defaults.endsAtLocal).slice(0, 16),
    location: typed?.location ?? defaults.location,
    rsvpEnabled: typed?.rsvpEnabled ?? defaults.rsvpEnabled,
  };

  return (
    <form action={submit} className="max-w-[520px]" key={attempt}>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      {problem && (
        <div className="mt-4">
          <Notice
            tone="bad"
            title={copy.events.problems[problem]}
            live="assertive"
          >
            {''}
          </Notice>
        </div>
      )}

      {/* What this save will do, before it does it. The two frames give this the same place
          and deliberately different weights: posting is advice you read before writing
          anything, so it wears the gold guide; a change to an event people have already
          booked is news about them, so it wears the blue envelope. */}
      {editing ? (
        <div className="mt-4">
          <Notice
            tone={reach === 0 ? 'off' : 'tell'}
            title={
              reach === 0
                ? copy.events.changeTellsNobodyTitle
                : copy.events.changeTellsTitle(reach)
            }
          >
            {reach === 0
              ? copy.events.changeTellsNobodyBody
              : copy.events.changeTellsBody(eventWhen(defaults.startsAtLocal))}
          </Notice>
        </div>
      ) : (
        <Guide title={copy.events.postingTellsTitle(reach)}>
          {value.scope === 'ministry'
            ? copy.events.postingMinistryBody
            : copy.events.postingTellsBody}
        </Guide>
      )}

      <fieldset className="mt-4 border-0 p-0" disabled={editing}>
        <legend className="mb-2 block text-caption font-extrabold tracking-widest text-muted uppercase">
          {copy.events.fields.scope}
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="radio"
              name="scope"
              value="branch"
              defaultChecked={value.scope !== 'ministry'}
            />
            {copy.events.fields.scopeBranch}
          </label>
          {(canPostMinistry || value.scope === 'ministry') && (
            <label className="flex items-center gap-2 text-body text-text">
              <input
                type="radio"
                name="scope"
                value="ministry"
                defaultChecked={value.scope === 'ministry'}
              />
              {copy.events.fields.scopeMinistry}
            </label>
          )}
        </div>
        <p className="mt-1.5 text-small text-muted">
          {/* Fixed after posting: moving an event between branches would change who it
              belongs to and who has already been told about it. */}
          {editing
            ? copy.events.fields.scopeLocked
            : copy.events.fields.scopeHint}
        </p>
      </fieldset>

      <Field
        name="title"
        label={copy.events.fields.title}
        required
        value={value.title}
      />
      <Field
        name="startsAtLocal"
        label={copy.events.fields.starts}
        type="datetime-local"
        required
        hint={copy.events.fields.startsHint(branchName)}
        value={value.startsAtLocal}
        invalid={problem === 'ends_before_start'}
      />
      <Field
        name="endsAtLocal"
        label={copy.events.fields.ends}
        type="datetime-local"
        value={value.endsAtLocal}
        invalid={problem === 'ends_before_start'}
      />
      <Field
        name="location"
        label={copy.events.fields.location}
        required
        value={value.location}
      />
      <Field
        name="description"
        label={copy.events.fields.description}
        multiline
        value={value.description}
      />

      {/* The picture (frame: NEW EVENT · Picture; built in W3.5 slice 4b). The field is
          the same one the message shelf uses, with this feature's own words: the mechanism
          is shared, the sentences are not, because an event's picture stands behind a
          gradient at the top of its own page rather than competing with a YouTube
          thumbnail on a lock screen.

          Nothing here is load-bearing for safety. The extension allowlist and the size cap
          are cheap early refusals; the storage policy admits the upload; and `saveEvent`
          reads the object's OWN first bytes before the row points at it. */}
      <div className="mt-4">
        <span className="block text-caption font-extrabold tracking-widest text-muted uppercase">
          {copy.events.fields.picture}
        </span>
        <ImageField
          subject={defaults.picture}
          words={copy.events.picture}
          fieldName="imagePath"
          mint={mintEventImageAction}
        />
        {/* Only offered when there is something to take off, per the house rule that a
            primary action with nothing to act on is hidden rather than disabled. It is a
            checkbox rather than its own button because the picture is saved WITH the
            event: a second Save would be a second writer of one row. */}
        {defaults.picture.url === null ? null : (
          <label className="mt-2.5 flex items-center gap-2 text-body text-text">
            <input type="checkbox" name="removeImage" />
            {copy.events.picture.remove}
          </label>
        )}
        {defaults.picture.url === null ? null : (
          <p className="mt-1.5 text-small text-muted">
            {copy.events.picture.removeHint}
          </p>
        )}
      </div>

      <div className="mt-4">
        <span className="block text-caption font-extrabold tracking-widest text-muted uppercase">
          {copy.events.fields.rsvp}
        </span>
        <label className="mt-1.5 flex items-center gap-2 text-body text-text">
          <input
            type="checkbox"
            name="rsvpEnabled"
            defaultChecked={value.rsvpEnabled}
          />
          {copy.events.fields.rsvpOn}
        </label>
        <p className="mt-1.5 text-small text-muted">
          {copy.events.fields.rsvpHint}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2.5 border-t border-cardline pt-3.5">
        <Button type="submit" disabled={saving}>
          {editing
            ? saving
              ? copy.events.saving
              : copy.events.save
            : saving
              ? copy.events.posting
              : copy.events.post}
        </Button>
        {/* One way out per screen. The frame draws both a header Discard and an actions
            Cancel, which are the same act; the header slot in this dashboard belongs to
            Sign out (PageHeader owns it so no page can forget it), so the leave control
            lives here on the posting form and above the fields on the edit form, where it
            reads as navigation rather than as abandoning a draft. */}
        {!editing && (
          <Link
            href="/events"
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {copy.events.cancelForm}
          </Link>
        )}
        {editing && cancelHref && (
          <>
            <span className="flex-1" />
            <Link
              href={cancelHref}
              className="inline-flex min-h-12 items-center rounded-button border border-danger px-5 text-body font-bold text-danger"
            >
              {copy.events.cancelEvent}
            </Link>
          </>
        )}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  type = 'text',
  required = false,
  multiline = false,
  invalid = false,
  value,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  invalid?: boolean;
  value?: string;
}) {
  const shared =
    'mt-1.5 w-full rounded-input border bg-card px-3.5 py-3 text-body text-text ' +
    (invalid ? 'border-danger' : 'border-cardline');

  return (
    <div className="mt-4">
      <label
        htmlFor={name}
        className="block text-caption font-extrabold tracking-widest text-muted uppercase"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          rows={3}
          required={required}
          aria-invalid={invalid || undefined}
          defaultValue={value}
          className={shared}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          aria-invalid={invalid || undefined}
          defaultValue={value}
          className={`min-h-12 ${shared}`}
        />
      )}
      {hint && <p className="mt-1.5 text-small text-muted">{hint}</p>}
    </div>
  );
}
