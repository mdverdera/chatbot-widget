/**
 * Supabase client — server-side only.
 *
 * Provides a singleton Supabase client authenticated with the service-role key.
 * The service-role key bypasses Row Level Security, which is appropriate here
 * because all access is server-side and tenant isolation is enforced in every
 * query via an explicit `tenant_id` filter — never via RLS policies alone.
 *
 * Configuration (environment variables):
 *   SUPABASE_URL              Your Supabase project URL.
 *                             e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY Service-role key from Project Settings → API.
 *                             NEVER expose this to the browser.
 *
 * NEVER import this module from client-side code.
 * NEVER use the anon key here — the service-role key is required for
 * server-side vector writes and RLS bypass.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'SUPABASE_URL environment variable is not set. Set it in .env.local.',
    );
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Set it in .env.local.',
    );
  }
  return key;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase service-role client.
 * Initialised lazily on first call so missing env vars throw at call time,
 * not at module load time (which would break Next.js build).
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(getSupabaseUrl(), getServiceRoleKey(), {
      auth: {
        // Disable auto-refresh — this is a server-side service key, not a user session.
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _client;
}
