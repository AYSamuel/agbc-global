// Env access for edge functions: secrets arrive via `supabase secrets set`
// (docs/spec/25 §3.5); nothing here is ever a literal.

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | null {
  return Deno.env.get(name) ?? null;
}
