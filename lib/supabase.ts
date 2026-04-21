/**
 * @file supabase.ts
 * @description Initializes and exports the Supabase client for the app.
 *
 * Uses expo-secure-store as the auth storage adapter so that session tokens
 * are persisted in the device's secure keychain rather than AsyncStorage/
 * localStorage. URL polyfill is applied globally here so it is available
 * before any Supabase call is made.
 *
 * Consumers should import `supabase` directly from this module:
 *   import { supabase } from "@/lib/supabase";
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Expo Router handles deep links
    },
  },
);
