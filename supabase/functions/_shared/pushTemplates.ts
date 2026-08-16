// Rendering an automated notification into words, per recipient (docs/spec/15).
//
// `notifications` rows store a template key + params and NEVER a baked English string, so
// this module is where a key becomes a title and a body. It runs at SEND time, in the
// recipient's `profiles.language`; the app renders the same key again from i18next for the
// notification centre, which is why the two must agree on the key and its params rather
// than on any text.
//
// TWO RULES LIVE WITH THE PAYLOAD, not with the transport, so they are restated here:
//
//   1. NOTHING SPECIAL-CATEGORY. A push body is read off a lock screen by whoever is
//      holding the phone, and it crosses Expo, then APNs or FCM, then the OS. So no
//      testimony wording, no prayer wording, no author name: "Someone prayed with you",
//      never what they prayed about (docs/spec/15 payload-privacy rule, docs/spec/20).
//      Params carry counts, branch names and titles the church itself published; the
//      member fetches the real content in-app, after auth.
//   2. NOTHING THAT CAN FAIL SILENTLY. An unknown key or a missing language falls back
//      rather than throwing, because a template mistake must not stop a whole fan-out, and
//      it returns a usable generic line rather than an empty notification.
//
// Copy is grace-framed (CLAUDE.md): encourage, never shame.

export type Language = 'en' | 'de' | 'nl' | 'fr';

const LANGUAGES: readonly Language[] = ['en', 'de', 'nl', 'fr'];
const FALLBACK: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export interface Rendered {
  title: string;
  body: string;
}

export type TemplateParams = Record<string, string | number | undefined>;

/**
 * A form is either one string, or the plural shapes a count selects between.
 *
 * `Intl.PluralRules` picks the category, so DE/NL/FR get their own rules rather than
 * English's. Only `one` and `other` are populated: none of these templates reaches a
 * language needing `few`/`many`, and `other` is the documented fallback when a category
 * is absent.
 */
type Form = string | { one: string; other: string };

interface Template {
  title: Record<Language, Form>;
  body: Record<Language, Form>;
}

/**
 * The catalogue. Keys are `<domain>.<event>` and are the contract between the sender, the
 * app's i18next namespaces and every `notifications.template_key` ever written, so a key
 * is renamed by migration, never by edit.
 */
const TEMPLATES: Record<string, Template> = {
  'prayer.someone_prayed': {
    title: {
      en: 'Someone prayed with you',
      de: 'Jemand hat mit dir gebetet',
      nl: 'Iemand heeft met je gebeden',
      fr: 'Quelqu’un a prié avec vous',
    },
    body: {
      en: 'Tap to see the prayer',
      de: 'Tippe, um das Gebet zu sehen',
      nl: 'Tik om het gebed te zien',
      fr: 'Touchez pour voir la prière',
    },
  },
  'prayer.reminder': {
    title: {
      en: 'You said you’d pray for a request',
      de: 'Du wolltest für ein Anliegen beten',
      nl: 'Je wilde voor een verzoek bidden',
      fr: 'Vous vouliez prier pour une demande',
    },
    body: {
      en: 'Take a moment now',
      de: 'Nimm dir jetzt einen Moment',
      nl: 'Neem er nu even de tijd voor',
      fr: 'Prenez un moment maintenant',
    },
  },
  'testimony.glory_batch': {
    title: {
      en: { one: '{count} person said Glory', other: '{count} people said Glory' },
      de: {
        one: '{count} Person hat Ehre gesagt',
        other: '{count} Personen haben Ehre gesagt',
      },
      nl: {
        one: '{count} persoon zei Glorie',
        other: '{count} mensen zeiden Glorie',
      },
      fr: {
        one: '{count} personne a dit Gloire',
        other: '{count} personnes ont dit Gloire',
      },
    },
    body: {
      en: 'On your testimony',
      de: 'Zu deinem Zeugnis',
      nl: 'Bij jouw getuigenis',
      fr: 'À propos de votre témoignage',
    },
  },
  'moderation.approved': {
    title: {
      en: 'Your post is live',
      de: 'Dein Beitrag ist veröffentlicht',
      nl: 'Je bericht staat online',
      fr: 'Votre publication est en ligne',
    },
    body: {
      en: 'The family can see it now',
      de: 'Die Familie kann es jetzt sehen',
      nl: 'De familie kan het nu zien',
      fr: 'La famille peut la voir maintenant',
    },
  },
  'moderation.changes_needed': {
    // Never "rejected". `09`/CLAUDE.md: the author is being invited back, not judged, and
    // the REASON is not in the payload (it can be safeguarding-sensitive, 20260803140000).
    title: {
      en: 'Your post needs a small change',
      de: 'Dein Beitrag braucht eine kleine Änderung',
      nl: 'Je bericht heeft een kleine wijziging nodig',
      fr: 'Votre publication demande une petite modification',
    },
    body: {
      en: 'Tap to see what to do next',
      de: 'Tippe, um zu sehen, was als Nächstes zu tun ist',
      nl: 'Tik om te zien wat je nu kunt doen',
      fr: 'Touchez pour voir la suite',
    },
  },
  'service.starts_soon': {
    title: {
      en: 'Service starts in 1 hour',
      de: 'Der Gottesdienst beginnt in 1 Stunde',
      nl: 'De dienst begint over 1 uur',
      fr: 'Le culte commence dans 1 heure',
    },
    // The branch name is the church's own published name, not member data.
    body: {
      en: '{branch}',
      de: '{branch}',
      nl: '{branch}',
      fr: '{branch}',
    },
  },
  'rsvp.reminder': {
    title: {
      en: '{event} is coming up',
      de: '{event} steht bevor',
      nl: '{event} komt eraan',
      fr: '{event} approche',
    },
    body: {
      en: 'You said you’re going',
      de: 'Du hast zugesagt',
      nl: 'Je hebt gezegd dat je komt',
      fr: 'Vous avez dit que vous venez',
    },
  },
  'registration.confirmed': {
    title: {
      en: 'Your registration is confirmed',
      de: 'Deine Anmeldung ist bestätigt',
      nl: 'Je inschrijving is bevestigd',
      fr: 'Votre inscription est confirmée',
    },
    body: {
      en: '{course}',
      de: '{course}',
      nl: '{course}',
      fr: '{course}',
    },
  },
  'purchase.added': {
    title: {
      en: 'Added to your Library',
      de: 'Zu deiner Bibliothek hinzugefügt',
      nl: 'Toegevoegd aan je bibliotheek',
      fr: 'Ajouté à votre bibliothèque',
    },
    body: {
      en: '{title} is ready to read',
      de: '{title} ist bereit zum Lesen',
      nl: '{title} is klaar om te lezen',
      fr: '{title} est prêt à lire',
    },
  },
};

/** The generic line an unknown key falls back to, rather than an empty notification. */
const GENERIC: Record<Language, Rendered> = {
  en: { title: 'AGBC Global', body: 'You have a new notification' },
  de: { title: 'AGBC Global', body: 'Du hast eine neue Benachrichtigung' },
  nl: { title: 'AGBC Global', body: 'Je hebt een nieuwe melding' },
  fr: { title: 'AGBC Global', body: 'Vous avez une nouvelle notification' },
};

function selectForm(form: Form, language: Language, params: TemplateParams): string {
  if (typeof form === 'string') return form;
  const count = Number(params.count);
  if (!Number.isFinite(count)) return form.other;
  // Intl gives each language its own rule; `one` is not "=== 1" in FR (0 is `one` there).
  const category = new Intl.PluralRules(language).select(count);
  return category === 'one' ? form.one : form.other;
}

/**
 * `{name}` substitution. A param that was not supplied leaves its placeholder OUT rather
 * than printing `{branch}` on a lock screen; the surrounding text still reads.
 */
function interpolate(text: string, params: TemplateParams): string {
  return text
    .replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = params[key];
      return value === undefined ? '' : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Render one notification for one recipient.
 *
 * Never throws: an unknown key, an unknown language or a missing param each degrade to
 * something a member can act on. A fan-out that dies on a typo would be a worse bug than
 * a generic line.
 */
export function renderTemplate(
  templateKey: string,
  params: TemplateParams,
  language: string,
): Rendered {
  const lang: Language = isLanguage(language) ? language : FALLBACK;
  const template = TEMPLATES[templateKey];
  if (!template) {
    console.warn(`pushTemplates: unknown template_key "${templateKey}"`);
    return GENERIC[lang];
  }

  const title = interpolate(
    selectForm(template.title[lang] ?? template.title[FALLBACK], lang, params),
    params,
  );
  const body = interpolate(
    selectForm(template.body[lang] ?? template.body[FALLBACK], lang, params),
    params,
  );

  // An empty title would render as the app name alone on Android and as nothing on iOS.
  return {
    title: title || GENERIC[lang].title,
    body: body || GENERIC[lang].body,
  };
}

/** Exposed for the test that asserts every key carries all four languages. */
export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
export const SUPPORTED_LANGUAGES = LANGUAGES;
export const TEMPLATE_CATALOGUE = TEMPLATES;
