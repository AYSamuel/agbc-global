'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

import { NOTHING_SAVED, type ComposeState } from '../state';

/**
 * The composer (COMPOSE frame, approved 2026-08-19).
 *
 * A client component for one reason: a refused link must not cost the leader what they
 * typed, and the frame's refusal banner has to sit under the link field where the mistake
 * is rather than in a URL on a page that lost the message.
 *
 * `useActionState` alone does NOT keep the fields: React resets an uncontrolled form after a
 * form action runs, and the first browser pass of this screen emptied every box while
 * showing the refusal (2026-08-19). So the action echoes the typed values back in its state
 * and they are re-applied as defaults, with the form KEYED on the attempt so React remounts
 * the inputs and actually picks the new defaults up.
 *
 * WHAT IT DOES NOT VALIDATE: the link. `checkLink` on the server owns that, and the
 * database's CHECK owns the shape underneath it. A copy of the rule here would be a third
 * definition of the same thing and would drift the day the allowlist changes; what this
 * holds is the SENTENCE, which is the part a human needs.
 */

export type SaveAction = (
  state: ComposeState,
  formData: FormData,
) => Promise<ComposeState>;

export function Composer({
  save,
  branchName,
  canSendMinistry,
  recipientHint,
}: {
  save: SaveAction;
  /** The leader's own branch: the audience, named rather than implied. */
  branchName: string;
  /** Ministry scope is admin-only (`17` §Roles), so the control only exists for them. */
  canSendMinistry: boolean;
  recipientHint: string;
}) {
  const [state, submit, saving] = useActionState(save, NOTHING_SAVED);
  const problem = state.status === 'error' ? state.problem : null;
  const typed = state.status === 'error' ? state.values : null;
  // Keyed on the attempt so every refusal REMOUNTS the fields and their echoed defaults
  // land: changing `defaultValue` on a mounted input does nothing.
  const attempt = state.status === 'error' ? state.attempt : 0;
  const linkProblem =
    problem === 'link_not_allowed' || problem === 'link_malformed'
      ? problem
      : null;

  return (
    <form action={submit} className="max-w-[520px]" key={attempt}>
      {/* Said before they write anything, not after they try to send. */}
      <div className="mt-4">
        <Notice tone="off" title={copy.broadcasts.approvalNoticeTitle}>
          {copy.broadcasts.approvalNoticeBody}
        </Notice>
      </div>

      {problem === 'empty' && (
        <div className="mt-4">
          <Notice
            tone="bad"
            title={copy.broadcasts.emptyFieldsTitle}
            live="assertive"
          >
            {copy.broadcasts.emptyFieldsBody}
          </Notice>
        </div>
      )}
      {problem === 'refused' && (
        <div className="mt-4">
          <Notice tone="bad" title={copy.broadcasts.refused} live="assertive">
            {copy.broadcasts.refusedBody}
          </Notice>
        </div>
      )}

      <fieldset className="mt-4 border-0 p-0">
        <legend className="mb-2 block text-caption font-extrabold tracking-widest text-muted uppercase">
          {copy.broadcasts.whoItReaches}
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="radio"
              name="scope"
              value="branch"
              defaultChecked={typed === null || typed.scope !== 'ministry'}
            />
            {copy.broadcasts.scopeLabel.branch(branchName)}
          </label>
          {canSendMinistry && (
            <label className="flex items-center gap-2 text-body text-text">
              <input
                type="radio"
                name="scope"
                value="ministry"
                defaultChecked={typed?.scope === 'ministry'}
              />
              {copy.broadcasts.scopeLabel.ministry}
            </label>
          )}
        </div>
        <p className="mt-1.5 text-small text-muted">{recipientHint}</p>
      </fieldset>

      <Field
        name="title"
        label={copy.broadcasts.fieldTitle}
        required
        value={typed?.title}
      />
      <Field
        name="body"
        label={copy.broadcasts.fieldBody}
        required
        multiline
        hint={copy.broadcasts.fieldBodyHint}
        value={typed?.body}
      />
      <Field
        name="bodyDe"
        label={copy.broadcasts.fieldBodyDe}
        multiline
        value={typed?.bodyDe}
      />
      <Field
        name="bodyNl"
        label={copy.broadcasts.fieldBodyNl}
        multiline
        value={typed?.bodyNl}
      />
      <Field
        name="bodyFr"
        label={copy.broadcasts.fieldBodyFr}
        multiline
        value={typed?.bodyFr}
      />

      <Field
        name="link"
        label={copy.broadcasts.fieldLink}
        describedBy={linkProblem ? 'link-problem' : undefined}
        invalid={linkProblem !== null}
        value={typed?.link}
      />
      {linkProblem && (
        <div className="mt-2.5 max-w-[520px]" id="link-problem">
          <Notice
            tone="bad"
            live="assertive"
            title={
              linkProblem === 'link_not_allowed'
                ? copy.broadcasts.linkNotAllowed
                : copy.broadcasts.linkMalformed
            }
          >
            {linkProblem === 'link_not_allowed'
              ? copy.broadcasts.linkNotAllowedBody
              : copy.broadcasts.linkMalformedBody}
          </Notice>
        </div>
      )}

      <div className="mt-4 flex gap-2.5 border-t border-cardline pt-3.5">
        <Button type="submit" disabled={saving}>
          {saving ? copy.broadcasts.saving : copy.broadcasts.continue}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  required = false,
  multiline = false,
  describedBy,
  invalid = false,
  value,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
  describedBy?: string;
  invalid?: boolean;
  /** What the leader typed, echoed back after a refusal. */
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
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={value}
          className={shared}
        />
      ) : (
        <input
          id={name}
          name={name}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={value}
          className={`min-h-12 ${shared}`}
        />
      )}
      {hint && <p className="mt-1.5 text-small text-muted">{hint}</p>}
    </div>
  );
}
