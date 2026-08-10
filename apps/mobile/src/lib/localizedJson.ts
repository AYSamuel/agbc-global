import { useTranslation } from 'react-i18next';

// The courses tables carry prose as {en, de, nl, fr} jsonb because the website's
// content files already hold all four translations (docs/spec/02 §Academy). This
// is the ONE place that picks a language out of such a value; screens never
// reach into the object themselves, so the fallback rule lives in exactly one
// spot. Structural narrowing at the data boundary, like give's parseAccounts:
// a malformed value degrades to null instead of crashing a screen.

export type LocalizedText = Readonly<Record<string, string>>;

export function narrowLocalizedText(value: unknown): LocalizedText | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value).filter(
    (pair): pair is [string, string] => typeof pair[1] === 'string',
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

/** The language's text, falling back to English, then to anything present. */
export function pickLocalized(
  text: LocalizedText | null,
  language: string,
): string | null {
  if (text === null) return null;
  const lang = language.split('-')[0];
  // Partial typing keeps the fallback chain honest: any key can be absent.
  const record: Partial<Record<string, string>> = text;
  const values: readonly (string | undefined)[] = Object.values(text);
  return record[lang] ?? record.en ?? values[0] ?? null;
}

/** The picker bound to the CURRENT language, for components. */
export function useLocalizedText(): (
  text: LocalizedText | null,
) => string | null {
  const { i18n } = useTranslation();
  return (text) => pickLocalized(text, i18n.language);
}
