/**
 * hooks/usePlayGames.ts
 *
 * Google Play Games Services integration.
 *
 * Handles:
 *  - Sign in with Google Play Games
 *  - Unlock / increment achievements
 *  - Submit net worth to leaderboard
 *
 * Install:
 *   expo install @react-native-google-signin/google-signin
 *   expo install react-native-game-services
 *
 * Add to app.config.js plugins:
 *   ["@react-native-google-signin/google-signin", {
 *     iosUrlScheme: "" // not needed for Android-only
 *   }]
 */

import {
  ACHIEVEMENTS,
  AchievementId,
  INCREMENTAL_STEPS,
  LEADERBOARD_NET_WORTH,
  PLAY_GAMES_CLIENT_ID,
} from "@/constants/playGames";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Lazy-load SDKs — graceful fallback if not installed ──────────
let GameServices: any = null;
let GoogleSignin: any = null;

try {
  GameServices = require("react-native-game-services").default;
} catch {}

try {
  GoogleSignin =
    require("@react-native-google-signin/google-signin").GoogleSignin;
} catch {}

// ── Types ─────────────────────────────────────────────────────────
export type PlayGamesStatus = "idle" | "signing-in" | "signed-in" | "failed";

export interface PlayGamesPlayer {
  playerId: string;
  displayName: string;
  avatarUrl?: string;
}

// ── Module-level state (shared across all hook instances) ─────────
let _status: PlayGamesStatus = "idle";
let _player: PlayGamesPlayer | null = null;
let _listeners: (() => void)[] = [];

function notify() {
  _listeners.forEach((l) => l());
}

// ── Initialise Google Sign-In ─────────────────────────────────────
export function initPlayGames() {
  if (!GoogleSignin) return;
  GoogleSignin.configure({
    webClientId: PLAY_GAMES_CLIENT_ID,
    offlineAccess: false,
  });
}

// ── Sign in ───────────────────────────────────────────────────────
export async function signInWithPlayGames(): Promise<PlayGamesPlayer | null> {
  console.log("signInWithPlayGames called");
  if (!GoogleSignin || !GameServices) return null;
  console.log("GoogleSignin and GameServices are available");
  if (_status === "signing-in") return null;
  console.log("Starting sign-in process...");

  _status = "signing-in";
  notify();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();

    const player: PlayGamesPlayer = {
      playerId: userInfo.user.id,
      displayName: userInfo.user.name ?? "Pilot",
      avatarUrl: userInfo.user.photo ?? undefined,
    };

    _player = player;
    _status = "signed-in";
    notify();
    return player;
  } catch (e: any) {
    // Code 12501 = user cancelled — not an error
    if (e?.code !== "12501") {
      console.warn("[PlayGames] Sign-in failed:", e?.message);
    }
    _status = "failed";
    notify();
    return null;
  }
}

export async function signOutPlayGames() {
  if (!GoogleSignin) return;
  try {
    await GoogleSignin.signOut();
    _player = null;
    _status = "idle";
    notify();
  } catch {}
}

// ── Achievements ─────────────────────────────────────────────────
export async function unlockAchievement(id: AchievementId) {
  if (!GameServices || _status !== "signed-in") return;
  const playId = ACHIEVEMENTS[id];
  if (!playId) return;
  try {
    await GameServices.unlockAchievement(playId);
  } catch {}
}

export async function incrementAchievement(id: AchievementId, steps: number) {
  if (!GameServices || _status !== "signed-in") return;
  const playId = ACHIEVEMENTS[id];
  const maxSteps = INCREMENTAL_STEPS[id];
  if (!playId || !maxSteps) return;
  // Play Games steps must be between 1 and maxSteps
  const clampedSteps = Math.max(1, Math.min(steps, maxSteps));
  try {
    await GameServices.incrementAchievement(playId, clampedSteps);
  } catch {}
}

export async function setAchievementSteps(id: AchievementId, steps: number) {
  if (!GameServices || _status !== "signed-in") return;
  const playId = ACHIEVEMENTS[id];
  const maxSteps = INCREMENTAL_STEPS[id];
  if (!playId || !maxSteps) return;
  const clamped = Math.max(0, Math.min(steps, maxSteps));
  try {
    await GameServices.setAchievementSteps(playId, clamped);
  } catch {}
}

// ── Leaderboard ──────────────────────────────────────────────────
export async function submitNetWorth(netWorth: number) {
  if (!GameServices || _status !== "signed-in") return;
  if (netWorth <= 0) return;
  try {
    await GameServices.submitScore(LEADERBOARD_NET_WORTH, Math.round(netWorth));
  } catch {}
}

export async function showLeaderboard() {
  if (!GameServices || _status !== "signed-in") return;
  try {
    await GameServices.showLeaderboard(LEADERBOARD_NET_WORTH);
  } catch {}
}

export async function showAchievements() {
  if (!GameServices || _status !== "signed-in") return;
  try {
    await GameServices.showAchievements();
  } catch {}
}

// ── React hook ───────────────────────────────────────────────────
export function usePlayGames() {
  const [status, setStatus] = useState<PlayGamesStatus>(_status);
  const [player, setPlayer] = useState<PlayGamesPlayer | null>(_player);
  const mounted = useRef(true);

  useEffect(() => {
    const listener = () => {
      if (!mounted.current) return;
      setStatus(_status);
      setPlayer(_player);
    };
    _listeners.push(listener);
    return () => {
      mounted.current = false;
      _listeners = _listeners.filter((l) => l !== listener);
    };
  }, []);

  const signIn = useCallback(() => signInWithPlayGames(), []);
  const signOut = useCallback(() => signOutPlayGames(), []);

  return {
    status,
    player,
    isSignedIn: status === "signed-in",
    signIn,
    signOut,
    unlockAchievement,
    incrementAchievement,
    setAchievementSteps,
    submitNetWorth,
    showLeaderboard,
    showAchievements,
  };
}
