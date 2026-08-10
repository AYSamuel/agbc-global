// Pure decisions for the claim flow (ADR 0017 decision 3): validation via the shared
// contract, RPC-outcome-to-response mapping, and the four-language claim email. No
// I/O here; index.ts owns the wire, and every decision the database can hold still is
// in the two RPCs (request_email_claim / verify_email_claim), where pgTAP asserts it.

import {
  type ClaimLanguage,
  type EmailClaimRequestBody,
  type EmailClaimResponse,
  emailClaimRequestBodySchema,
} from '../../../packages/shared/src/contracts/academy.ts';

export function parseEmailClaim(raw: unknown): EmailClaimRequestBody | null {
  const parsed = emailClaimRequestBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What request_email_claim can say. */
export type RequestOutcome =
  | 'created'
  | 'already_verified'
  | 'address_in_use'
  | 'rate_limited'
  | 'refused';

/** What verify_email_claim can say. */
export type VerifyOutcome =
  | 'verified'
  | 'invalid_code'
  | 'expired'
  | 'too_many_attempts'
  | 'no_claim'
  | 'address_in_use';

/**
 * The response for a request outcome, WITHOUT the send: 'created' means the caller
 * still has to email the code, and only then answer ok. Uniformity rule (ADR 0017):
 * nothing here may vary with whether the address has registrations, and none of these
 * outcomes can, because the RPC never looks.
 */
export function requestResponse(
  outcome: RequestOutcome,
): { response: EmailClaimResponse; status: number; send: boolean } {
  switch (outcome) {
    case 'created':
      return { response: { ok: true }, status: 200, send: true };
    case 'already_verified':
      return { response: { ok: true, verified: true }, status: 200, send: false };
    case 'address_in_use':
      return {
        response: { ok: false, error: 'address_in_use' },
        status: 409,
        send: false,
      };
    case 'rate_limited':
      return {
        response: { ok: false, error: 'rate_limited' },
        status: 429,
        send: false,
      };
    case 'refused':
      return { response: { ok: false, error: 'invalid' }, status: 403, send: false };
  }
}

export function verifyResponse(
  outcome: VerifyOutcome,
  linked: number,
): { response: EmailClaimResponse; status: number } {
  switch (outcome) {
    case 'verified':
      return { response: { ok: true, verified: true, linked }, status: 200 };
    case 'invalid_code':
      return { response: { ok: false, error: 'invalid_code' }, status: 422 };
    case 'expired':
      return { response: { ok: false, error: 'expired' }, status: 410 };
    case 'too_many_attempts':
      return { response: { ok: false, error: 'too_many_attempts' }, status: 410 };
    // No live claim reads the same as a wrong code: the caller's remedy is identical
    // (request a fresh one), and a distinct answer would say more than needed.
    case 'no_claim':
      return { response: { ok: false, error: 'invalid_code' }, status: 422 };
    case 'address_in_use':
      return { response: { ok: false, error: 'address_in_use' }, status: 409 };
  }
}

/**
 * The claim email, in the member's app language (docs/spec/16: the four locales are
 * the product's languages, and a code email is member-facing copy). Plain text, code
 * and validity only; the address itself is never echoed back into the body, and the
 * copy names what entering the code DOES, so a code that arrives unexpectedly is its
 * own warning.
 */
export function buildClaimEmail(
  code: string,
  language: ClaimLanguage,
  from: string,
  to: string,
): { from: string; to: string; subject: string; text: string } {
  const copy: Record<ClaimLanguage, { subject: string; text: string }> = {
    en: {
      subject: `${code} is your AGBC confirmation code`,
      text: `Your code is ${code}. It expires in 15 minutes.\n\nEntering this code in the AGBC app confirms this email address belongs to your account, so course registrations made with it show up there.\n\nIf you didn't request this, you can ignore this email; nothing changes without the code.`,
    },
    de: {
      subject: `${code} ist dein AGBC-Bestätigungscode`,
      text: `Dein Code ist ${code}. Er läuft in 15 Minuten ab.\n\nMit diesem Code bestätigst du in der AGBC-App, dass diese E-Mail-Adresse zu deinem Konto gehört, damit Kursanmeldungen mit dieser Adresse dort angezeigt werden.\n\nWenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren; ohne den Code ändert sich nichts.`,
    },
    nl: {
      subject: `${code} is je AGBC-bevestigingscode`,
      text: `Je code is ${code}. Hij verloopt over 15 minuten.\n\nMet deze code bevestig je in de AGBC-app dat dit e-mailadres bij jouw account hoort, zodat cursusregistraties met dit adres daar zichtbaar worden.\n\nAls je dit niet hebt aangevraagd, kun je deze e-mail negeren; zonder de code verandert er niets.`,
    },
    fr: {
      subject: `${code} est votre code de confirmation AGBC`,
      text: `Votre code est ${code}. Il expire dans 15 minutes.\n\nEn saisissant ce code dans l'application AGBC, vous confirmez que cette adresse e-mail appartient à votre compte, afin que les inscriptions aux cours faites avec cette adresse y apparaissent.\n\nSi vous n'avez rien demandé, vous pouvez ignorer cet e-mail ; rien ne change sans le code.`,
    },
  };
  const chosen = copy[language];
  return { from, to, subject: chosen.subject, text: chosen.text };
}
