import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { ActionSheet, Button, CheckIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import type { RsvpAnswer, RsvpStatus } from './rsvp';

/**
 * The three RSVP states (mockup W2.9 section, composed and approved 2026-08-09;
 * docs/spec/11 §EVENT-DETAIL "Going / Interested / Cancel").
 *
 * ONE STRUCTURE ACROSS ALL THREE, which is the frames' decision and the reason
 * the screen does not rearrange itself as a member answers: a full-width lead
 * button, then a quiet line beneath it. Unanswered it reads "RSVP · I'm going"
 * over "I'm interested"; answered it reads "You're going" over "Change or
 * cancel".
 *
 * AN ANSWER ALREADY GIVEN QUIETENS RATHER THAN VANISHING (`.btn.confirmed`),
 * the same treatment "You're here" gets on Home and a Glory reaction gets on a
 * card, so a commitment already made looks the same everywhere in the app.
 *
 * CANCEL IS ONE STEP BACK, never a button sitting in the open beside a
 * commitment: it lives in the sheet behind "Change or cancel", and the copy
 * there says plainly that cancelling costs nothing.
 */
export interface RsvpControlsProps {
  answer: RsvpAnswer;
  /** Guests get the gate instead of a write (docs/spec/03). */
  onAnswer: (status: RsvpStatus) => void;
}

export function RsvpControls({ answer, onAnswer }: RsvpControlsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [changing, setChanging] = useState(false);

  // A cancelled RSVP reads exactly like one never given: the row is remembered
  // server-side (docs/spec/11) and the screen simply offers again.
  const committed = answer === 'going' || answer === 'interested';

  if (!committed) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Button
          label={t('events:rsvpGoing')}
          variant="primary"
          fullWidth
          onPress={() => {
            onAnswer('going');
          }}
        />
        <Button
          label={t('events:rsvpInterested')}
          variant="ghost"
          fullWidth
          onPress={() => {
            onAnswer('interested');
          }}
        />
      </View>
    );
  }

  const going = answer === 'going';

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        label={
          going ? t('events:rsvpYoureGoing') : t('events:rsvpYoureInterested')
        }
        variant="confirmed"
        fullWidth
        icon={<CheckIcon size={17} color={colors.eye} strokeWidth={2.8} />}
        onPress={() => {
          setChanging(true);
        }}
      />
      <Button
        label={t('events:rsvpChange')}
        variant="ghost"
        fullWidth
        onPress={() => {
          setChanging(true);
        }}
      />

      <ActionSheet
        visible={changing}
        title={t('events:rsvpChangeTitle')}
        // The sheet offers the OTHER answer, never the one already given: a
        // member who is going is not asked whether they would like to be going.
        body={
          going
            ? t('events:rsvpChangeBodyGoing')
            : t('events:rsvpChangeBodyInterested')
        }
        primaryLabel={
          going ? t('events:rsvpInterested') : t('events:rsvpGoingShort')
        }
        onPrimary={() => {
          setChanging(false);
          onAnswer(going ? 'interested' : 'going');
        }}
        secondaryLabel={t('events:rsvpCancel')}
        // A real cancellation, not the way out: the scrim and the back button
        // remain that (see ActionSheet's onSecondary).
        onSecondary={() => {
          setChanging(false);
          onAnswer('cancelled');
        }}
        dismissAnnouncement={t('events:rsvpChangeDismissed')}
        onDismiss={() => {
          setChanging(false);
        }}
        footnote={t('events:rsvpCancelNote')}
      />
    </View>
  );
}
