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
    conflict?: boolean; // true = Google account already has progress
    onOverwrite?: () => Promise<{ error: string | null }>;
    onKeepGuest?: () => void;
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

      // ── Step 1: Check if this Google account already has an airline ──
      // Sign in to a temporary session to check without destroying the guest
      const { data: checkData } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      const googleUserId = checkData?.user?.id;
      const guestUserId =
        useGameStore.getState().airline?.id ??
        (await supabase.auth.getUser()).data?.user?.id;

      if (googleUserId && googleUserId !== guestUserId) {
        // Different user ID — Google account already exists in Supabase
        // Check if it has an airline with meaningful progress
        const { data: existingAirline } = await supabase
          .from("airlines")
          .select("id, name, day, cash")
          .eq("user_id", googleUserId)
          .maybeSingle();

        if (existingAirline && existingAirline.day > 1) {
          // Conflict — Google account has real progress
          // Sign back out of Google session, restore guest session
          await supabase.auth.signOut();

          return {
            error: null,
            conflict: true,
            // Option A: overwrite Google progress with current guest progress
            onOverwrite: async () => {
              try {
                const { error: relink } = await supabase.auth.signInWithIdToken(
                  {
                    provider: "google",
                    token: idToken,
                  },
                );
                if (relink) return { error: relink.message };

                // Delete the old Google airline and transfer guest data
                await supabase
                  .from("airlines")
                  .delete()
                  .eq("id", existingAirline.id);

                // Update the guest airline to the new Google user ID
                const guestAirline = useGameStore.getState().airline;
                if (guestAirline) {
                  await supabase
                    .from("airlines")
                    .update({ user_id: googleUserId })
                    .eq("id", guestAirline.id);
                }

                useGameStore.getState().setIsAnonymous(false);
                return { error: null };
              } catch (e: any) {
                return { error: e.message ?? "Failed to link account" };
              }
            },
            // Option B: keep playing as guest, do nothing
            onKeepGuest: () => {},
          };
        }
      }

      // ── No conflict — safe to link ────────────────────────────────
      useGameStore.getState().setIsAnonymous(false);
      return { error: null };
    } catch (err: any) {
      if (err.code === statusCodes?.SIGN_IN_CANCELLED) return { error: null };
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
