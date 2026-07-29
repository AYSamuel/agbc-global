import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Database } from '@agbc/shared/database';

import { publicSupabaseConfig } from './env';

/**
 * Server-side Supabase clients, carrying the CALLER's own session. Everything readable
 * through RLS goes through one of these rather than through admin.ts, so the database
 * keeps checking our work (docs/spec/17 §Platform).
 *
 * Two factories, because the two server contexts hand cookies over differently:
 *
 *  - `createServerComponentClient()` for Server Components, Server Actions and pages.
 *    Reads through next/headers.
 *  - `createRouteClient(request)` for Route Handlers. Reads the cookies off the Request
 *    and hands back any refreshed ones for the handler to put on its Response.
 *
 * The second exists for a reason worth stating: it keeps a route handler a plain
 * function from Request to Response, with no dependency on Next's request-scoped
 * storage. That is what lets the tests import a handler and call it, which is the whole
 * mechanism behind "IDOR probes on every route" (docs/spec/21 §4).
 *
 * A new client per request, always. Never module scope: on a warm serverless instance a
 * shared client leaks one user's session into another user's request (Supabase's SSR
 * advanced guide, Fluid compute).
 */

export async function createServerComponentClient() {
  const { url, key } = publicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Ignored on purpose: proxy.ts
          // refreshes the session on every request, so the refreshed token is already
          // on its way to the browser.
        }
      },
    },
  });
}

export interface RouteClient {
  supabase: SupabaseClient<Database>;
  /**
   * Copies any cookies Supabase refreshed during the request, plus the cache headers
   * that stop a CDN caching one caller's Set-Cookie and serving it to the next one,
   * onto the response. Call it on every response a handler returns.
   */
  commit: (response: Response) => Response;
}

export function createRouteClient(request: Request): RouteClient {
  const { url, key } = publicSupabaseConfig();

  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders = new Map<string, string>();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie'));
      },
      setAll(cookiesToSet, headers) {
        pending.push(...cookiesToSet);
        for (const [name, value] of Object.entries(headers)) {
          pendingHeaders.set(name, value);
        }
      },
    },
  });

  return {
    supabase,
    commit(response) {
      for (const { name, value, options } of pending) {
        response.headers.append('set-cookie', serializeCookie(name, value, options));
      }
      for (const [name, value] of pendingHeaders) {
        response.headers.set(name, value);
      }
      return response;
    },
  };
}

function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return [];

  return header
    .split(';')
    .map((pair) => {
      const index = pair.indexOf('=');
      if (index < 1) return undefined;
      return {
        name: pair.slice(0, index).trim(),
        value: decodeURIComponent(pair.slice(index + 1).trim()),
      };
    })
    .filter((cookie) => cookie !== undefined);
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${String(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.sameSite) parts.push(`SameSite=${capitalize(options.sameSite)}`);
  if (options.secure) parts.push('Secure');
  if (options.httpOnly) parts.push('HttpOnly');

  return parts.join('; ');
}

function capitalize(value: boolean | 'lax' | 'strict' | 'none'): string {
  const text = typeof value === 'boolean' ? (value ? 'strict' : 'lax') : value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
