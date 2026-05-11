/**
 * hooks/usePlayGames.ts
 *
 * Google Play Games Services integration.
 *
 * Handles:
 *  - Silent Play Games sign-in
 *  - Unlock / increment achievements
 *  - Submit leaderboard scores
 *  - Show achievements UI
 *  - Show leaderboard UI
 */

import {
  ACHIEVEMENTS,
  AchievementId,
  INCREMENTAL_STEPS,
  LEADERBOARD_NET_WORTH,
} from "@/constants/playGames";

import { useGameStore } from "@/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules } from "react-native";

// ── Native Play Games Module ─────────────────────────────────────
const GameServices = NativeModules.PlayGamesModule;

// ── Types ────────────────────────────────────────────────────────
export type PlayGamesStatus = "idle" | "signing-in" | "signed-in" | "failed";

export interface PlayGamesPlayer {
  playerId: string;
  displayName: string;
  avatarUrl?: string;
}

// ── Shared State ─────────────────────────────────────────────────
let _status: PlayGamesStatus = "idle";

let _player: PlayGamesPlayer | null = null;

let _listeners: (() => void)[] = [];

function notify() {
  _listeners.forEach((l) => l());
}

// ── Init ─────────────────────────────────────────────────────────
export async function initPlayGames() {
  console.log("[PlayGames] Initializing...", GameServices);

  if (!GameServices) {
    console.warn("[PlayGames] Native module unavailable");
    return;
  }

  if (_status === "signed-in") return;

  _status = "signing-in";
  notify();

  try {
    /**
     * Native module should return:
     * {
     *   playerId?: string,
     *   displayName?: string,
     *   avatarUrl?: string
     * }
     */
    const result = await GameServices.signIn();

    console.log("[PlayGames] signIn result:", result);

    if (result?.playerId) {
      _player = {
        playerId: result.playerId ?? "player",
        displayName: result.displayName ?? "Pilot",
        avatarUrl: result.avatarUrl,
      };

      _status = "signed-in";
    } else {
      _status = "failed";
    }

    notify();
    return _player;
  } catch (e) {
    console.warn("[PlayGames] init failed:", e);

    _status = "failed";
    notify();
    return null;
  }
}

// ── Sign In ──────────────────────────────────────────────────────
export async function signInWithPlayGames() {
  return initPlayGames();
}

// ── Sign Out ─────────────────────────────────────────────────────
export async function signOutPlayGames() {
  _player = null;
  _status = "idle";

  notify();
}

// ── Achievements ─────────────────────────────────────────────────
export async function unlockAchievement(id: AchievementId) {
  if (!GameServices || _status !== "signed-in") return;

  const playId = ACHIEVEMENTS[id];

  if (!playId) return;

  try {
    await GameServices.unlockAchievement(playId);
  } catch (e) {
    console.warn("[PlayGames] unlockAchievement failed:", e);
  }
}

export async function incrementAchievement(id: AchievementId, steps: number) {
  if (!GameServices || _status !== "signed-in") return;

  const playId = ACHIEVEMENTS[id];
  const maxSteps = INCREMENTAL_STEPS[id];

  if (!playId || !maxSteps) return;

  const clampedSteps = Math.max(1, Math.min(steps, maxSteps));

  try {
    await GameServices.incrementAchievement(playId, clampedSteps);
  } catch (e) {
    console.warn("[PlayGames] incrementAchievement failed:", e);
  }
}

export async function setAchievementSteps(id: AchievementId, steps: number) {
  if (!GameServices || _status !== "signed-in") return;

  const playId = ACHIEVEMENTS[id];
  const maxSteps = INCREMENTAL_STEPS[id];

  if (!playId || !maxSteps) return;

  const clamped = Math.max(0, Math.min(steps, maxSteps));

  try {
    await GameServices.setAchievementSteps(playId, clamped);
  } catch (e) {
    console.warn("[PlayGames] setAchievementSteps failed:", e);
  }
}

// ── Leaderboards ─────────────────────────────────────────────────
export async function submitNetWorth(netWorth: number) {
  if (!GameServices || _status !== "signed-in") return;

  if (netWorth <= 0) return;

  try {
    await GameServices.submitScore(LEADERBOARD_NET_WORTH, Math.round(netWorth));
  } catch (e) {
    console.warn("[PlayGames] submitScore failed:", e);
  }
}

export async function showLeaderboard() {
  if (!GameServices || _status !== "signed-in") return;

  try {
    await GameServices.showLeaderboard(LEADERBOARD_NET_WORTH);
  } catch (e) {
    console.warn("[PlayGames] showLeaderboard failed:", e);
  }
}

export async function showAchievements() {
  if (!GameServices || _status !== "signed-in") return;

  try {
    await GameServices.showAchievements();
  } catch (e) {
    console.warn("[PlayGames] showAchievements failed:", e);
  }
}

// ── React Hook ───────────────────────────────────────────────────
export function usePlayGames() {
  const setPhase = useGameStore((s) => s.setPhase);

  const [status, setStatus] = useState<PlayGamesStatus>(_status);

  const [player, setPlayer] = useState<PlayGamesPlayer | null>(_player);

  const mounted = useRef(true);

  useEffect(() => {
    const listener = () => {
      if (!mounted.current) return;

      setStatus(_status);
      setPlayer(_player);

      if (_player) {
        setPhase("loading");
      }
    };

    _listeners.push(listener);

    return () => {
      mounted.current = false;

      _listeners = _listeners.filter((l) => l !== listener);
    };
  }, [setPhase]);

  useEffect(() => {
    initPlayGames();
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
