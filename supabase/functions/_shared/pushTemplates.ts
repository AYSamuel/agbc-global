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
  // A REMOVAL IS NOT A REJECTION, and this key exists because reusing the one above would
  // have been a real bug (W3.6 slice 2). `MyPostCard.tsx` states the product rule in a
  // comment: "rejected is a conversation the author can answer (edit and resubmit),
  // removed is not". "Your post needs a small change" would send a member whose post was
  // taken down after review to go and edit it, which is the one thing that must not happen.
  //
  // The words are the ones the destination already uses (`family:myPosts.removedBody`, in
  // all four languages since W2.6), for the reason that matters most here: the private
  // `moderation_note` can be safeguarding-sensitive and is invisible to the author by
  // column privilege (20260803140000), so what is offered instead is a PERSON. A leader can
  // use judgement face to face about what is safe to say; a push payload cannot.
  'moderation.removed': {
    title: {
      en: 'Your post was taken down',
      de: 'Dein Beitrag wurde entfernt',
      nl: 'Je bericht is verwijderd',
      fr: 'Votre publication a été retirée',
    },
    body: {
      en: 'Your branch leader can talk it through with you',
      de: 'Deine Gemeindeleitung kann mit dir darüber sprechen',
      nl: 'Je gemeenteleider kan het met je bespreken',
      fr: 'Le responsable de votre branche peut en parler avec vous',
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
  // The four event notices (W3.5 slice 4, docs/spec/11). `{event}` is the church's own
  // published title and `{when}` its start, formatted per recipient language by
  // `formatWhen` below: neither is member data, and both are the whole point of the
  // notification, so `15`'s payload rule is satisfied by carrying them rather than by
  // hiding them behind "tap to see" (decided with Ayo 2026-08-20).
  'event.posted': {
    title: {
      en: 'New: {event}',
      de: 'Neu: {event}',
      nl: 'Nieuw: {event}',
      fr: 'Nouveau : {event}',
    },
    body: {
      en: '{when} at your branch',
      de: '{when} in deiner Gemeinde',
      nl: '{when} bij jouw locatie',
      fr: '{when} dans votre branche',
    },
  },
  'event.posted_ministry': {
    title: {
      en: 'The whole family: {event}',
      de: 'Die ganze Familie: {event}',
      nl: 'De hele familie: {event}',
      fr: 'Toute la famille : {event}',
    },
    body: {
      en: '{when}, every branch together',
      de: '{when}, alle Gemeinden gemeinsam',
      nl: '{when}, alle locaties samen',
      fr: '{when}, toutes les branches ensemble',
    },
  },
  'event.moved': {
    title: {
      en: '{event} has moved',
      de: '{event} wurde verlegt',
      nl: '{event} is verplaatst',
      fr: '{event} a été déplacé',
    },
    body: {
      en: 'Now {when}',
      de: 'Jetzt {when}',
      nl: 'Nu {when}',
      fr: 'Maintenant {when}',
    },
  },
  'event.cancelled': {
    // Never "we cancelled on you": the member gets the fact and a way onward, in one line.
    title: {
      en: '{event} is cancelled',
      de: '{event} fällt aus',
      nl: '{event} gaat niet door',
      fr: '{event} est annulé',
    },
    body: {
      en: 'Tap to see what else is on',
      de: 'Tippe, um zu sehen, was sonst ansteht',
      nl: 'Tik om te zien wat er nog meer is',
      fr: 'Touchez pour voir ce qui est prévu',
    },
  },
  'event.reinstated': {
    title: {
      en: '{event} is back on',
      de: '{event} findet doch statt',
      nl: '{event} gaat toch door',
      fr: '{event} est maintenu',
    },
    body: {
      en: '{when}, as before',
      de: '{when}, wie zuvor',
      nl: '{when}, zoals eerder',
      fr: '{when}, comme prévu',
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

/**
 * Params holding a wall-clock start, formatted per recipient language before interpolation.
 *
 * ONE convention rather than a per-template declaration: a param named `when` is an event's
 * `starts_at_local`, and every renderer that meets it (here, and the app's notification
 * centre) turns it into words in the reader's own language. The alternative, formatting at
 * entry-build time, would freeze one language for every recipient of a send, which is
 * exactly what `15`'s localization rule exists to prevent.
 */
const WALL_CLOCK_PARAMS = new Set(['when']);

/**
 * '2026-09-05T19:00:00' -> 'Sat, 5 Sept, 7:00 pm', in the reader's language.
 *
 * THE ZONE IS NOT CONVERTED, deliberately. `02` stores an event as wall clock plus an IANA
 * zone because that is what survives a change in the zone's law, and `11` shows every event
 * in ITS OWN zone with a label. So the parts are carried into a UTC instant and formatted as
 * UTC: no arithmetic, no offset, and the same string the app's own event screens print
 * (`apps/mobile/src/features/events/format.ts` uses the identical carrier trick).
 *
 * An unparseable value returns '' rather than throwing: `interpolate` then drops the
 * placeholder and the sentence still reads, which is this module's rule for everything.
 *
 * THE LANGUAGE IS ALL WE HAVE, and the app has more. `profiles.language` is a language, so
 * an English reader here gets `en` conventions where the app would give their device's own
 * region (`i18n/index.ts`'s formattingLocale, decided 2026-08-08). A push may therefore say
 * "7:00 pm" where the same row reads "19:00" in the centre on a UK phone. Accepted rather
 * than overlooked: the server cannot know a device's region, and the alternative is storing
 * one on every profile to make two clocks agree.
 */
export function formatWhen(value: string, language: Language): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  const carrier = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );
  try {
    return new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(carrier);
  } catch {
    return '';
  }
}

function localizeParams(params: TemplateParams, language: Language): TemplateParams {
  let localized: TemplateParams | null = null;
  for (const key of WALL_CLOCK_PARAMS) {
    const value = params[key];
    if (typeof value !== 'string') continue;
    localized ??= { ...params };
    localized[key] = formatWhen(value, language);
  }
  return localized ?? params;
}

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

  const values = localizeParams(params, lang);
  const title = interpolate(
    selectForm(template.title[lang] ?? template.title[FALLBACK], lang, values),
    values,
  );
  const body = interpolate(
    selectForm(template.body[lang] ?? template.body[FALLBACK], lang, values),
    values,
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
