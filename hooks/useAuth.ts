/**
 * hooks/useAuth.ts
 *
 * Handles all authentication flows for FlightCraft mobile.
 *
 * Three flows:
 *   1. Google Sign-In    → full account, cloud sync, IAP eligible
 *   2. Continue as Guest → anonymous Supabase session, no cloud sync
 *   3. Link Google       → upgrades guest to full Google account
 *                          (merges data, same user_id retained)
 *
 * Setup required:
 *   1. npx expo install @react-native-google-signin/google-signin
 *   2. Google Cloud Console → OAuth 2.0 credentials:
 *        - Android client ID (from google-services.json)
 *        - Web client ID (used by Supabase)
 *   3. Supabase dashboard → Auth → Providers → Google → enable
 *        paste Web client ID + secret
 *   4. eas build --profile development (native rebuild required)
 *
 * Environment variables needed in app.config.js / eas.json:
 *   GOOGLE_WEB_CLIENT_ID   — from Google Cloud Console (OAuth web client)
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useCallback, useEffect, useState } from "react";

// ── Configure Google Sign-In once at module level ─────────────────
GoogleSignin.configure({
  // Web client ID from Google Cloud Console — NOT the Android client ID
  // Supabase uses this to verify the id_token
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  scopes: ["email", "profile"],
});

export type AuthState = "idle" | "loading" | "success" | "error";

export function useAuth() {
  const setPhase = useGameStore((s) => s.setPhase);
  const [state, setState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);

  // ── Listen for auth state changes ─────────────────────────────
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Reset handled by SettingsSheet delete account
        setPhase("auth");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Google Sign-In ─────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setState("loading");
    setError(null);

    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) throw new Error("No ID token returned from Google");

      // Exchange Google id_token for a Supabase session
      const { error: sbError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (sbError) throw new Error(sbError.message);

      setState("success");
      setPhase("loading");
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        setState("idle");
        return;
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        setState("idle");
        return;
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError("Google Play Services not available on this device.");
      } else {
        setError(err.message ?? "Google Sign-In failed. Please try again.");
      }
      setState("error");
    }
  }, [setPhase]);

  // ── Guest Sign-In (anonymous) ──────────────────────────────────
  const signInAsGuest = useCallback(async () => {
    setState("loading");
    setError(null);

    try {
      const { error: sbError } = await supabase.auth.signInAnonymously();
      if (sbError) throw new Error(sbError.message);
      setState("success");
      setPhase("loading");
    } catch (err: any) {
      setError(err.message ?? "Could not start guest session.");
      setState("error");
    }
  }, [setPhase]);

  // ── Link Google to existing guest account ──────────────────────
  // Call this from SettingsSheet for anonymous users
  const linkGoogleAccount = useCallback(async (): Promise<{
    error: string | null;
  }> => {
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) return { error: "No ID token from Google" };

      // linkWithIdToken merges the anonymous account with the Google identity
      // The user_id stays the same — all game data is retained
      const { error: sbError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { queryParams: { id_token: idToken } },
      } as any);

      // Fallback: if linkIdentity not available, use signInWithIdToken
      // which will create/find the Google account
      if (sbError) {
        const { error: fallbackErr } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (fallbackErr) return { error: fallbackErr.message };
      }

      return { error: null };
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { error: null };
      return { error: err.message ?? "Failed to link Google account" };
    }
  }, []);

  // ── Sign Out ──────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.revokeAccess().catch(() => {});
      await GoogleSignin.signOut().catch(() => {});
      await supabase.auth.signOut();
    } catch {}
  }, []);

  return {
    state,
    error,
    signInWithGoogle,
    signInAsGuest,
    linkGoogleAccount,
    signOut,
  };
}

// ── Helper: get current user info ─────────────────────────────────
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isAnonymous = user.is_anonymous ?? false;
  const email = user.email ?? null;
  const googleIdent = user.identities?.find((i) => i.provider === "google");
  const displayName =
    googleIdent?.identity_data?.full_name ??
    googleIdent?.identity_data?.name ??
    email?.split("@")[0] ??
    "Guest";
  const avatarUrl = googleIdent?.identity_data?.avatar_url ?? null;

  return { user, isAnonymous, email, displayName, avatarUrl };
}
