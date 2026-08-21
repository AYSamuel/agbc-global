'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Guide } from '@/components/ui/Guide';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import type { BranchRow, ServiceRow } from '@/server/branches';

import { NOTHING_SAVED, type BranchFormState } from './state';

/**
 * The branch form (ADD BRANCH and EDIT BRANCH frames, approved 2026-08-21).
 *
 * ONE COMPONENT FOR BOTH, and the frames are clear about where they differ rather than
 * asking it to be two screens: adding may set the short id and cannot reach the two
 * consequential acts, editing may reach both and shows the id as a fact. Everything between
 * those is the same seventeen fields in the same five groups, and building it twice would be
 * two places to forget a hint.
 *
 * A CLIENT COMPONENT for two reasons, and the second is why the repeatable rows work at all.
 * A refusal must not cost the admin what they typed (React resets an uncontrolled form after
 * a form action, so the action echoes the values back and the form is KEYED on the attempt).
 * And the service schedule and the leader list are rows a person adds and removes, which
 * needs state on this side of the wire.
 *
 * THE ROWS TRAVEL AS REPEATED NAMES, not indexed ones: four `serviceLabel` fields rather
 * than `services[2].label`. `FormData.getAll` preserves document order, so removing the
 * middle row needs no renumbering anywhere.
 */

export type SaveAction = (
  state: BranchFormState,
  formData: FormData,
) => Promise<BranchFormState>;

const BLANK_SERVICE: ServiceRow = {
  weekday: 0,
  startTime: '11:00',
  kind: 'sunday',
  label: '',
};

export function BranchForm({
  save,
  existing,
  /** The branch currently holding HQ, for the banner at the foot of the edit form. */
  headquarters,
}: {
  save: SaveAction;
  existing?: BranchRow;
  headquarters?: { name: string; isThisOne: boolean };
}) {
  const [state, submit, saving] = useActionState(save, NOTHING_SAVED);
  const problem = state.status === 'error' ? state.problem : null;
  const typed = state.status === 'error' ? state.values : null;
  const attempt = state.status === 'error' ? state.attempt : 0;
  const editing = existing !== undefined;

  const value = {
    slug: typed?.slug ?? existing?.slug ?? '',
    name: typed?.name ?? existing?.name ?? '',
    city: typed?.city ?? existing?.city ?? '',
    country: typed?.country ?? existing?.country ?? '',
    timezone: typed?.timezone ?? existing?.timezone ?? '',
    languages: typed?.languages ?? existing?.languages ?? '',
    youtubeChannelId:
      typed?.youtubeChannelId ?? existing?.youtubeChannelId ?? '',
    email: typed?.email ?? existing?.email ?? '',
    lat: typed?.lat ?? (existing ? String(existing.lat) : ''),
    lng: typed?.lng ?? (existing ? String(existing.lng) : ''),
    addressLine1: typed?.addressLine1 ?? existing?.addressLine1 ?? '',
    addressLine2: typed?.addressLine2 ?? existing?.addressLine2 ?? '',
    serviceTimes: typed?.serviceTimes ?? existing?.serviceTimes ?? '',
    leadName: typed?.leadName ?? existing?.lead.name ?? '',
    leadRole: typed?.leadRole ?? existing?.lead.role ?? '',
    leadBio: typed?.leadBio ?? existing?.lead.bio ?? '',
    welcome: typed?.welcome ?? existing?.welcome ?? '',
    order: typed?.order ?? (existing ? String(existing.order) : ''),
  };

  const [services, setServices] = useState<ServiceRow[]>(
    typed?.services ?? existing?.services ?? [BLANK_SERVICE],
  );
  const [leaders, setLeaders] = useState<{ name: string; role: string }[]>(
    typed?.leaders ?? existing?.leaders ?? [],
  );

  return (
    <form action={submit} className="max-w-[520px]" key={attempt}>
      {editing && (
        <input type="hidden" name="existingSlug" value={existing.slug} />
      )}

      {problem && (
        <div className="mt-4">
          <Notice
            tone="bad"
            title={copy.branches.problems[camel(problem)]}
            live="assertive"
          >
            {''}
          </Notice>
        </div>
      )}

      {/* The one thing a person adding a branch has to know BEFORE the fields: there is no
          draft, and the first save is public. */}
      {!editing && (
        <Guide title={copy.branches.createGuideTitle}>
          {copy.branches.createGuideBody}
        </Guide>
      )}

      <Section title={copy.branches.sectionBranch} />
      <Field
        name="name"
        label={copy.branches.nameLabel}
        placeholder={copy.branches.namePlaceholder}
        required
        value={value.name}
        invalid={problem === 'name_required'}
      />
      {editing ? (
        <Locked
          label={copy.branches.slugLabel}
          value={value.slug}
          hint={copy.branches.slugHintExisting}
        />
      ) : (
        <Field
          name="slug"
          label={copy.branches.slugLabel}
          placeholder={copy.branches.slugPlaceholder}
          required
          hint={copy.branches.slugHintNew}
          value={value.slug}
          invalid={problem === 'slug_shape' || problem === 'slug_taken'}
        />
      )}
      <Pair>
        <Field
          name="city"
          label={copy.branches.cityLabel}
          required
          value={value.city}
          invalid={problem === 'city_required'}
        />
        <Field
          name="country"
          label={copy.branches.countryLabel}
          required
          value={value.country}
          invalid={problem === 'country_required'}
        />
      </Pair>
      <Pair>
        <Field
          name="languages"
          label={copy.branches.languagesLabel}
          placeholder={copy.branches.languagesPlaceholder}
          value={value.languages}
        />
        <Field
          name="timezone"
          label={copy.branches.timezoneLabel}
          placeholder={copy.branches.timezonePlaceholder}
          required
          value={value.timezone}
          invalid={
            problem === 'timezone_required' || problem === 'timezone_unknown'
          }
        />
      </Pair>
      <p className="mt-1.5 text-small text-muted">
        {copy.branches.timezoneHint}
      </p>

      <Section title={copy.branches.sectionWhere} />
      <Field
        name="addressLine1"
        label={copy.branches.addressLabel}
        placeholder={copy.branches.addressPlaceholder}
        value={value.addressLine1}
      />
      <Field
        name="addressLine2"
        label={copy.branches.address2Label}
        placeholder={copy.branches.address2Placeholder}
        value={value.addressLine2}
      />
      <Pair>
        <Field
          name="lat"
          label={copy.branches.latLabel}
          required
          value={value.lat}
          invalid={problem === 'coordinates_required'}
        />
        <Field
          name="lng"
          label={copy.branches.lngLabel}
          required
          value={value.lng}
          invalid={problem === 'coordinates_required'}
        />
      </Pair>
      <p className="mt-1.5 text-small text-muted">
        {copy.branches.coordinatesHint}
      </p>

      <Section title={copy.branches.sectionWhen} />
      {services.map((row, index) => (
        <div
          key={`service-${String(index)}`}
          // NOWRAP, and the label column shrinks instead. With `flex-wrap` the remove
          // control dropped to a line of its own at every width tested, where it stops
          // reading as "remove THIS row" (seen in the browser at 1280 and 1024). The row's
          // floor is about 440px against a 560px form, so there is nothing to wrap for.
          className="mt-2 flex items-end gap-2"
        >
          <div className="w-[112px]">
            <label
              htmlFor={`serviceWeekday-${String(index)}`}
              className="sr-only"
            >
              {copy.branches.weekdayLabel}
            </label>
            <select
              id={`serviceWeekday-${String(index)}`}
              name="serviceWeekday"
              defaultValue={String(row.weekday)}
              className="mt-1.5 min-h-12 w-full rounded-input border border-cardline bg-card px-3 py-3 text-body text-text"
            >
              {copy.branches.weekdays.map((day, dayIndex) => (
                <option key={day} value={String(dayIndex)}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[104px]">
            <label
              htmlFor={`serviceStart-${String(index)}`}
              className="sr-only"
            >
              {copy.branches.startTimeLabel}
            </label>
            <input
              id={`serviceStart-${String(index)}`}
              name="serviceStart"
              type="time"
              required
              defaultValue={row.startTime}
              aria-invalid={problem === 'service_incomplete' || undefined}
              className="mt-1.5 min-h-12 w-full rounded-input border border-cardline bg-card px-3 py-3 text-body text-text"
            />
          </div>
          <div className="w-[112px]">
            <label htmlFor={`serviceKind-${String(index)}`} className="sr-only">
              {copy.branches.serviceKindLabel}
            </label>
            <select
              id={`serviceKind-${String(index)}`}
              name="serviceKind"
              defaultValue={row.kind}
              className="mt-1.5 min-h-12 w-full rounded-input border border-cardline bg-card px-3 py-3 text-body text-text"
            >
              {Object.entries(copy.branches.serviceKinds).map(
                ([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`serviceLabel-${String(index)}`}
              className="sr-only"
            >
              {copy.branches.serviceLabelLabel}
            </label>
            <input
              id={`serviceLabel-${String(index)}`}
              name="serviceLabel"
              placeholder={copy.branches.serviceLabelLabel}
              defaultValue={row.label}
              className="mt-1.5 min-h-12 w-full rounded-input border border-cardline bg-card px-3.5 py-3 text-body text-text"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setServices(services.filter((_, at) => at !== index));
            }}
            className="min-h-12 flex-none self-end px-1.5 text-body font-bold text-muted"
          >
            <span aria-hidden="true">✕</span>
            <span className="sr-only">
              {copy.branches.removeService(row.label)}
            </span>
          </button>
        </div>
      ))}
      <div className="mt-2.5">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setServices([...services, BLANK_SERVICE]);
          }}
        >
          {copy.branches.addService}
        </Button>
      </div>
      <p className="mt-1.5 text-small text-muted">
        {copy.branches.servicesHint}
      </p>
      <Field
        name="serviceTimes"
        label={copy.branches.serviceTimesLabel}
        placeholder={copy.branches.serviceTimesPlaceholder}
        hint={copy.branches.serviceTimesHint}
        value={value.serviceTimes}
      />

      <Section title={copy.branches.sectionWho} />
      <Pair>
        <Field
          name="leadName"
          label={copy.branches.leadNameLabel}
          placeholder={copy.branches.leadNamePlaceholder}
          value={value.leadName}
        />
        <Field
          name="leadRole"
          label={copy.branches.leadRoleLabel}
          placeholder={copy.branches.leadRolePlaceholder}
          value={value.leadRole}
        />
      </Pair>
      <Field
        name="leadBio"
        label={copy.branches.leadBioLabel}
        placeholder={copy.branches.leadBioPlaceholder}
        multiline
        value={value.leadBio}
      />
      <span className="mt-4 block text-caption font-extrabold tracking-widest text-muted uppercase">
        {copy.branches.leadersLabel}
      </span>
      {leaders.map((person, index) => (
        <div
          key={`leader-${String(index)}`}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <div className="min-w-[140px] flex-1">
            <label htmlFor={`leaderName-${String(index)}`} className="sr-only">
              {copy.branches.leaderNameLabel}
            </label>
            <input
              id={`leaderName-${String(index)}`}
              name="leaderName"
              defaultValue={person.name}
              placeholder={copy.branches.leaderNameLabel}
              className="min-h-12 w-full rounded-input border border-cardline bg-card px-3.5 py-3 text-body text-text"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label htmlFor={`leaderRole-${String(index)}`} className="sr-only">
              {copy.branches.leaderRoleLabel}
            </label>
            <input
              id={`leaderRole-${String(index)}`}
              name="leaderRole"
              defaultValue={person.role}
              placeholder={copy.branches.leaderRoleLabel}
              className="min-h-12 w-full rounded-input border border-cardline bg-card px-3.5 py-3 text-body text-text"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setLeaders(leaders.filter((_, at) => at !== index));
            }}
            className="min-h-12 px-2 text-body font-bold text-muted"
          >
            <span aria-hidden="true">✕</span>
            <span className="sr-only">
              {copy.branches.removeLeader(person.name)}
            </span>
          </button>
        </div>
      ))}
      <div className="mt-2.5">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setLeaders([...leaders, { name: '', role: '' }]);
          }}
        >
          {copy.branches.addLeader}
        </Button>
      </div>
      <div className="mt-4">
        <Guide title={copy.branches.leadersGuideTitle}>
          {copy.branches.leadersGuideBody}
        </Guide>
      </div>

      <Section title={copy.branches.sectionApp} />
      <Field
        name="youtubeChannelId"
        label={copy.branches.youtubeLabel}
        placeholder={copy.branches.youtubePlaceholder}
        value={value.youtubeChannelId}
      />
      <Field
        name="email"
        label={copy.branches.emailLabel}
        type="email"
        value={value.email}
      />
      <Field
        name="welcome"
        label={copy.branches.welcomeLabel}
        placeholder={copy.branches.welcomePlaceholder}
        multiline
        value={value.welcome}
      />
      <Field
        name="order"
        label={copy.branches.orderLabel}
        hint={copy.branches.orderHint}
        value={value.order}
      />

      <div className="mt-5 flex items-center gap-2.5 border-t border-cardline pt-3.5">
        <Button type="submit" disabled={saving}>
          {editing
            ? saving
              ? copy.branches.savePending
              : copy.branches.save
            : saving
              ? copy.branches.createPending
              : copy.branches.createSubmit}
        </Button>
        <Link
          href="/branches"
          className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {copy.branches.discard}
        </Link>
      </div>

      {!editing && (
        <p className="mt-3 text-small text-muted">
          {copy.branches.createFooter}
        </p>
      )}
      {/* The two consequential acts live below the ordinary Save, never beside it, and each
          leads to its own page rather than a dialog: what has to be read before confirming
          does not fit in one. The HQ banner is neutral and the close banner is not, which is
          the file's own distinction between "this reaches people" and "this cannot be taken
          back by a leader". */}
      {editing && headquarters && (
        <div className="mt-5">
          <Notice
            tone="off"
            title={copy.branches.hqBannerTitle(headquarters.name)}
            action={
              headquarters.isThisOne ||
              existing.status !== 'active' ? undefined : (
                <BannerLink
                  href={`/branches/${existing.slug}/hq`}
                  label={copy.branches.hqBannerAction}
                />
              )
            }
          >
            {headquarters.isThisOne
              ? copy.branches.hqBannerThisOne
              : copy.branches.hqBannerBody}
          </Notice>
        </div>
      )}
      {editing && existing.status === 'active' && !existing.isHq && (
        <div className="mt-3">
          <Notice
            tone="bad"
            title={copy.branches.closeBannerTitle}
            action={
              <BannerLink
                href={`/branches/${existing.slug}/close`}
                label={copy.branches.closeBannerAction(existing.name)}
                danger
              />
            }
          >
            {copy.branches.closeBannerBody}
          </Notice>
        </div>
      )}
      {editing && existing.status === 'archived' && (
        <div className="mt-3">
          <Notice
            tone="bad"
            title={copy.branches.reopenBannerTitle(
              existing.archivedBy ?? copy.branches.aMinistryAdmin,
              closedOn(existing.archivedAt),
            )}
            action={
              <BannerLink
                href={`/branches/${existing.slug}/open`}
                label={copy.branches.reopenBannerAction}
              />
            }
          >
            {copy.branches.reopenBannerBody}
          </Notice>
        </div>
      )}
    </form>
  );
}

/** `slug_taken` in the module, `slugTaken` in the copy: one map rather than one per call. */
function camel(problem: string): keyof typeof copy.branches.problems {
  const key = problem.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  return key as keyof typeof copy.branches.problems;
}

function closedOn(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

/**
 * The one control a banner carries, as a LINK rather than a button.
 *
 * Each of these three leads to a page that states consequences and asks for a code, so it is
 * navigation and not an act: a control that looks like a button but changes nothing until
 * the next screen is a control that gets pressed by accident.
 */
function BannerLink({
  href,
  label,
  danger = false,
}: {
  href: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex min-h-12 items-center rounded-button border px-5 text-body font-bold whitespace-nowrap ' +
        (danger
          ? 'border-danger text-danger'
          : 'border-cardline text-text hover:bg-alt')
      }
    >
      {label}
    </Link>
  );
}

function Section({ title }: { title: string }) {
  return (
    <h2 className="px-0.5 pt-6 pb-1 text-caption font-extrabold tracking-widest text-muted uppercase">
      {title}
    </h2>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3.5">{children}</div>;
}

/** A value the form SHOWS and nobody may type. The slug, once the branch exists. */
function Locked({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="mt-4 min-w-[180px] flex-1">
      <span className="block text-caption font-extrabold tracking-widest text-muted uppercase">
        {label}
      </span>
      <p className="mt-1.5 min-h-12 rounded-input border border-cardline bg-alt px-3.5 py-3 text-body font-bold text-muted">
        {value}
      </p>
      <p className="mt-1.5 text-small text-muted">{hint}</p>
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  placeholder,
  type = 'text',
  required = false,
  multiline = false,
  invalid = false,
  value,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
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
    <div className="mt-4 min-w-[180px] flex-1">
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
          placeholder={placeholder}
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
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          defaultValue={value}
          className={`min-h-12 ${shared}`}
        />
      )}
      {hint && <p className="mt-1.5 text-small text-muted">{hint}</p>}
    </div>
  );
}
