/**
 * hooks/useLeaderboardPush.ts
 *
 * Checks the player's leaderboard rank periodically.
 * If rank has improved since last check → schedules a local push notification.
 *
 * Checks on:
 *   - App foreground (via AppState)
 *   - Every 10 game-days
 *
 * Never notifies on rank drops — only positive moments.
 */

import { ACHIEVEMENTS } from "@/lib/achievements";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {}

const RANK_KEY = "@flightcraft:last_known_rank";
const CHECK_EVERY = 10; // game-days between checks

// ── Score formula (must match LeaderboardSheet) ───────────────────
function calcScore(row: {
  cash: number;
  loan: number;
  demand_score: number;
  reputation: number;
  achievements: Record<string, number> | null;
}): number {
  const netWorth = Math.max(0, row.cash - row.loan);
  const earnedIds = Object.keys(row.achievements ?? {});
  const achPoints = ACHIEVEMENTS.filter((a) => earnedIds.includes(a.id)).reduce(
    (s, a) => s + a.points,
    0,
  );
  return Math.round(
    netWorth * 0.35 +
      row.demand_score * 1000 * 0.35 +
      row.reputation * 500 * 0.15 +
      achPoints * 0.15,
  );
}

async function checkRank(): Promise<number | null> {
  try {
    const airline = useGameStore.getState().airline;
    if (!airline) return null;

    const { data } = await supabase
      .from("airlines")
      .select("id, cash, loan, demand_score, reputation, achievements")
      .limit(100);

    if (!data) return null;

    const scored = data
      .map((r: any) => ({ id: r.id, score: calcScore(r) }))
      .sort((a: any, b: any) => b.score - a.score);

    const idx = scored.findIndex((r: any) => r.id === airline.id);
    return idx >= 0 ? idx + 1 : null;
  } catch {
    return null;
  }
}

async function notifyRankUp(newRank: number, prevRank: number) {
  if (!Notifications) return;
  try {
    const medal =
      newRank === 1 ? "🥇" : newRank === 2 ? "🥈" : newRank === 3 ? "🥉" : "✈";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${medal} You've moved up to #${newRank}!`,
        body: `Up from #${prevRank} on the global leaderboard. Keep building your empire!`,
        data: { type: "rank_up", rank: newRank },
      },
      trigger: null, // immediate
    });
  } catch {}
}

export function useLeaderboardPush() {
  const lastCheckDay = useRef<number>(-1);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const airline = useGameStore((s) => s.airline);

  const runCheck = async () => {
    const newRank = await checkRank();
    if (newRank === null) return;

    try {
      const stored = await AsyncStorage.getItem(RANK_KEY);
      const prevRank = stored ? parseInt(stored, 10) : null;

      // Only notify on improvement
      if (prevRank !== null && newRank < prevRank) {
        await notifyRankUp(newRank, prevRank);
      }

      await AsyncStorage.setItem(RANK_KEY, newRank.toString());
    } catch {}
  };

  // Check every N game-days
  useEffect(() => {
    if (!airline) return;
    const day = airline.day;
    if (lastCheckDay.current === -1) {
      lastCheckDay.current = day;
      return;
    }
    if (day - lastCheckDay.current >= CHECK_EVERY) {
      lastCheckDay.current = day;
      runCheck();
    }
  }, [airline?.day]);

  // Also check when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current !== "active" && next === "active") {
        runCheck();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);
}
