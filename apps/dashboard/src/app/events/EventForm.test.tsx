import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';

import { EventForm, type EventDefaults } from './EventForm';

/**
 * The event form (NEW EVENT and EDIT frames, approved 2026-08-20).
 *
 * Everything asserted here is a sentence about the AUDIENCE, because that is what makes this
 * form different from every other one in the dashboard: an ordinary save reaches phones, and
 * the frames put that fact above the fields rather than after the save. A screen that says
 * it quietly, or says it wrong, is the failure mode worth a test.
 */

const noop = () => Promise.resolve({ status: 'idle' as const });

function defaults(overrides: Partial<EventDefaults> = {}): EventDefaults {
  return {
    scope: 'branch',
    title: '',
    description: '',
    startsAtLocal: '',
    endsAtLocal: '',
    location: '',
    rsvpEnabled: true,
    ...overrides,
  };
}

describe('EventForm', () => {
  it('says how many people posting will tell, before anything is typed', () => {
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        audience={{ going: 0, interested: 0, reachable: 128 }}
        defaults={defaults()}
      />,
    );

    expect(screen.getByText(/Posting this tells 128 people/)).toBeVisible();
  });

  it('counts one person as a person', () => {
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        audience={{ going: 0, interested: 0, reachable: 1 }}
        defaults={defaults()}
      />,
    );

    expect(screen.getByText(/tells 1 person\./)).toBeVisible();
  });

  it('offers ministry scope to an admin and not to a leader', () => {
    const { unmount } = render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        defaults={defaults()}
      />,
    );
    expect(screen.queryByLabelText('The whole family')).toBeNull();
    unmount();

    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry
        defaults={defaults()}
      />,
    );
    expect(screen.getByLabelText('The whole family')).toBeInTheDocument();
  });

  it('tells an editor who a change reaches, and that quiet edits stay quiet', () => {
    // Decision 2, taken with Ayo: only time or venue notifies (docs/spec/11). A leader who
    // does not know that either avoids fixing a typo or spams 46 people to fix one.
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        audience={{ going: 34, interested: 12, reachable: 46 }}
        defaults={defaults({
          id: 'e-1',
          title: 'Youth Conference',
          startsAtLocal: '2026-09-12T14:00:00',
          location: 'Wellington Church',
        })}
      />,
    );

    expect(screen.getByText(/This change tells 46 people/)).toBeVisible();
    expect(
      screen.getByText(/Editing the description tells nobody/),
    ).toBeVisible();
  });

  it('locks the scope of an event that already exists', () => {
    // Moving an event between branches would change who it belongs to and who has already
    // been told about it. RLS refuses it; the form does not offer it.
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry
        audience={{ going: 0, interested: 0, reachable: 0 }}
        defaults={defaults({ id: 'e-1', title: 'Youth Conference' })}
      />,
    );

    expect(screen.getByLabelText('My branch')).toBeDisabled();
    expect(screen.getByText(/fixed once it is posted/)).toBeVisible();
  });

  it('trims the seconds PostgREST returns, so the time control can read the value', () => {
    // `datetime-local` accepts 'YYYY-MM-DDTHH:MM' and silently shows nothing for anything
    // else, which is how an edit screen ends up looking like it lost the event's time.
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        audience={{ going: 0, interested: 0, reachable: 0 }}
        defaults={defaults({
          id: 'e-1',
          startsAtLocal: '2026-09-12T14:00:00',
          endsAtLocal: '2026-09-12T16:30:00',
        })}
      />,
    );

    expect(screen.getByLabelText('Starts')).toHaveValue('2026-09-12T14:00');
    expect(screen.getByLabelText('Ends (optional)')).toHaveValue(
      '2026-09-12T16:30',
    );
  });

  it('says the picture is not built yet rather than leaving a gap', () => {
    // Drawn in the frame, built in slice 4b. An absence reads as a bug; a sentence does not.
    render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry={false}
        defaults={defaults()}
      />,
    );

    expect(screen.getByText(/branded cover for now/)).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <EventForm
        save={noop}
        branchName="AGBC Glasgow"
        canPostMinistry
        audience={{ going: 34, interested: 12, reachable: 46 }}
        defaults={defaults({ id: 'e-1', title: 'Youth Conference' })}
      />,
    );

    await expectNoA11yViolations(container);
  });
});
