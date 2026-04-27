/**
 * hooks/useAuth.ts
 *
 * Google Sign-In + anonymous guest auth for FlightCraft.
 *
 * NOTE: Google Sign-In requires a native EAS build.
 * The module is guarded with try/catch so the app doesn't crash
 * in Expo Go — it shows a graceful error instead.
 *
 * To enable Google Sign-In:
 *   1. npx expo install @react-native-google-signin/google-signin
 *   2. Google Cloud Console → OAuth credentials (Android + Web)
 *   3. Supabase → Auth → Providers → Google → enable
 *   4. eas build --platform android --profile development
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback, useEffect, useState } from "react";

// ── Safe lazy import — won't crash if native module missing ────────
let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require("@react-native-google-signin/google-signin");
  GoogleSignin = pkg.GoogleSignin;
  statusCodes = pkg.statusCodes ?? {};
} catch {
  // Native module not available — requires eas build
}

// Configure only when module is available
if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    scopes: ["email", "profile"],
  });
}

// ─────────────────────────────────────────────────────────────────

export type AuthState = "idle" | "loading" | "success" | "error";

export function useAuth() {
  const setPhase = useGameStore((s) => s.setPhase);
  const [state, setState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setPhase("auth");
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Google Sign-In ─────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    if (!GoogleSignin) {
      setError(
        "Google Sign-In requires an app update. Use 'Continue as Guest' for now.",
      );
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken ?? userInfo?.idToken;
      if (!idToken) throw new Error("No ID token from Google");

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
        setError("Google Play Services not available.");
      } else {
        setError(err.message ?? "Google Sign-In failed.");
      }
      setState("error");
    }
  }, [setPhase]);

  // ── Guest (anonymous) ──────────────────────────────────────────
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

  // ── Link Google to guest account ───────────────────────────────
  const linkGoogleAccount = useCallback(async (): Promise<{
    error: string | null;
  }> => {
    if (!GoogleSignin) {
      return {
        error: "Google Sign-In requires an app update from the Play Store.",
      };
    }
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken ?? userInfo?.idToken;
      if (!idToken) return { error: "No ID token from Google" };

      const { error: sbError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (sbError) return { error: sbError.message };
      return { error: null };
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { error: null };
      return { error: err.message ?? "Failed to link Google account" };
    }
  }, []);

  // ── Sign Out ──────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      if (GoogleSignin) {
        await GoogleSignin.revokeAccess().catch(() => {});
        await GoogleSignin.signOut().catch(() => {});
      }
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

// ── Get current user info ─────────────────────────────────────────
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

// Stable boolean — evaluated once when module loads
export const isGoogleSignInAvailable: boolean = GoogleSignin !== null;
