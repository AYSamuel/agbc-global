import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// Giving config (docs/spec/12, docs/spec/02). The single giving_config row holds
// the whole public giving structure (card give URL, PayPal, the cancellation
// inbox, and the bank accounts) so bank-detail changes ship as config, never an
// app release. Public-by-design values; nothing here is secret.

export interface BankField {
  label: string;
  value: string;
}

export interface BankAccount {
  /** ISO-ish currency label used as the selector key (GBP, EUR, USD, HUF, NGN). */
  code: string;
  symbol: string;
  holder: string;
  fields: BankField[];
}

export interface GivingConfig {
  /** Card giving page on the church site; null hides the "Give now" action. */
  giveUrl: string | null;
  paypalUrl: string | null;
  /** Inbox for changing or cancelling a recurring card gift (docs/spec/12). */
  cancellationEmail: string | null;
  accounts: BankAccount[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Narrow the jsonb at the data boundary (mirrors family's mapTestimony): keep only
// well-formed accounts/fields, drop the rest, so a malformed row degrades instead
// of crashing a screen.
function parseAccounts(raw: unknown): BankAccount[] {
  if (!Array.isArray(raw)) return [];
  const accounts: BankAccount[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const code = optionalString(entry.code);
    const holder = optionalString(entry.holder);
    if (code === null || holder === null || !Array.isArray(entry.fields)) {
      continue;
    }
    const fields: BankField[] = [];
    for (const field of entry.fields) {
      if (!isRecord(field)) continue;
      const label = optionalString(field.label);
      const value = optionalString(field.value);
      if (label !== null && value !== null) fields.push({ label, value });
    }
    if (fields.length === 0) continue;
    accounts.push({
      code,
      symbol: optionalString(entry.symbol) ?? '',
      holder,
      fields,
    });
  }
  return accounts;
}

function parseGivingConfig(raw: unknown): GivingConfig {
  if (!isRecord(raw)) {
    throw new Error('giving_config payload is not an object');
  }
  return {
    giveUrl: optionalString(raw.giveUrl),
    paypalUrl: optionalString(raw.paypalUrl),
    cancellationEmail: optionalString(raw.cancellationEmail),
    accounts: parseAccounts(raw.accounts),
  };
}

export const givingConfigQueryOptions = {
  queryKey: ['giving-config'] as const,
  queryFn: async (): Promise<GivingConfig> => {
    const { data, error } = await supabase
      .from('giving_config')
      .select('accounts')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('giving_config is empty');
    return parseGivingConfig(data.accounts);
  },
  // Giving details change rarely; keep them fresh for an hour so the tab and the
  // bank screen paint instantly from cache (and offline) between refreshes.
  staleTime: 60 * 60_000,
};

export function useGivingConfigQuery() {
  return useQuery(givingConfigQueryOptions);
}
