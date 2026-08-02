import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { LANGUAGES, loadVerse, type Language } from '@/server/verses';

import { remove, save } from '../../actions';
import { fullDate, nameOf } from '../../format';
import { verseAccess } from '../../guard';
import { VersesRefusal } from '../../Refusal';
import { VerseForm } from '../../VerseForm';

export const dynamic = 'force-dynamic';

/**
 * One day, one language (frame: `VERSE-EDIT`, reached from Edit on a row).
 *
 * The URL IS the key, because the table's key is (date, language) and nothing else
 * identifies a verse to a person: `/verses/2026-08-14/de` is readable, shareable and
 * survives a refresh, which a row id would not be.
 *
 * A pair with no verse behind it is not an error. It is the day somebody noticed was empty,
 * so the form opens as an ADD prefilled with that date and language rather than turning
 * them away. Only a malformed pair goes back to the schedule: there is no verse it could
 * ever mean.
 */
export default async function VersePage({
  params,
}: {
  params: Promise<{ date: string; language: string }>;
}) {
  const { date, language } = await params;

  if (!isIsoDate(date) || !isLanguage(language)) redirect('/verses');

  const supabase = await createServerComponentClient();
  const { caller, admin } = await verseAccess(supabase);

  // Public content, so this read is not what protects it (`daily_verses` is readable by
  // everyone, guest included). It simply is not fetched for a caller who cannot act on it.
  const verse = admin ? await loadVerse(supabase, date, language) : null;

  return (
    <DashboardShell caller={caller} current="verses">
      <PageHeader
        title={verse ? copy.verses.verse.editTitle : copy.verses.verse.addTitle}
        scope={copy.verses.verse.editScope(fullDate(date), nameOf(language))}
      />
      {admin ? (
        <VerseForm
          verse={verse}
          initialDate={date}
          initialLanguage={language}
          save={save}
          remove={remove}
        />
      ) : (
        <VersesRefusal />
      )}
    </DashboardShell>
  );
}

function isIsoDate(value: string): boolean {
  // Shape first, then reality: '2026-08-32' passes the pattern and is not a day, and
  // '2026-02-30' rolls forward into March rather than failing. The same two-step
  // `try_iso_date()` makes in the database, for the same reason.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().startsWith(value);
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((language) => language === value);
}
