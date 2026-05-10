/**
 * hooks/useAuth.ts
 *
 * Authentication via Google Play Games Services only.
 * No Supabase auth — Play Games player ID is the user identifier.
 *
 * Flow:
 *   1. App opens → show Play Games sign-in screen
 *   2. Player signs in → get playerId
 *   3. Store playerId in module-level state
 *   4. All Supabase queries use player_id = playerId
 */

import {
  initPlayGames,
  signInWithPlayGames,
  signOutPlayGames,
  usePlayGames,
  type PlayGamesPlayer,
} from "@/hooks/usePlayGames";
import { useCallback, useEffect } from "react";

export type AuthState = "loading" | "signed-in" | "signed-out";

// Module-level player ID — set once after sign-in, used everywhere
let _playerId: string | null = null;

export function getPlayerId(): string | null {
  return _playerId;
}

export function setPlayerId(id: string | null) {
  _playerId = id;
}

// ── Main hook ─────────────────────────────────────────────────────
export function useAuth() {
  const { status, player, signIn: pgSignIn } = usePlayGames();

  useEffect(() => {
    initPlayGames();
  }, []);

  // Keep module-level playerId in sync
  useEffect(() => {
    if (player?.playerId) {
      setPlayerId(player.playerId);
    } else if (status === "failed" || status === "idle") {
      setPlayerId(null);
    }
  }, [player, status]);

  const signIn = useCallback(async (): Promise<PlayGamesPlayer | null> => {
    console.log("Attempting Play Games sign-in...");
    const result = await signInWithPlayGames();
    if (result?.playerId) setPlayerId(result.playerId);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await signOutPlayGames();
    setPlayerId(null);
  }, []);

  const authState: AuthState =
    status === "signing-in"
      ? "loading"
      : status === "signed-in"
        ? "signed-in"
        : "signed-out";

  return {
    authState,
    player,
    playerId: player?.playerId ?? null,
    signIn,
    signOut,
    isSignedIn: status === "signed-in",
    isLoading: status === "signing-in",
  };
}
