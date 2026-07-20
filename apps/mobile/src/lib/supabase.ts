import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { fetchWithTimeout } from './fetchWithTimeout';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase config: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see apps/mobile/.env.example)',
  );
}

// The publishable key is public by design; RLS is the security boundary
// (docs/spec/02). Auth storage is AsyncStorage for the guest phase; W2.1 swaps in
// the LargeSecureStore adapter per docs/spec/03 before any real session exists.
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Bounded fetch: hangs become errors so four-states fallbacks fire (docs/spec/04).
  global: { fetch: fetchWithTimeout },
});
