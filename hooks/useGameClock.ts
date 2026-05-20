/**
 * hooks/useGameClock.ts
 *
 * Game time simulation + background handling.
 *
 * Two responsibilities:
 *   1. CLOCK  — setInterval driving advanceDay() at speed×
 *   2. PAUSE  — auto-pauses when app backgrounds, saves state,
 *               resumes on foreground
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const BASE_DAY_MS = 180_000; // 3 real min = 1 game day at ×1
const BG_TIMESTAMP_KEY = "@flightcraft:bg_timestamp";
const BG_SPEED_KEY = "@flightcraft:bg_speed";

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useGameClock() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const hasSetup = useRef(false);

  const airline = useGameStore((s) => s.airline);
  const phase = useGameStore((s) => s.phase);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const speed = airline?.speed ?? 1;

  const stopClock = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    if (speed === 0 || phase !== "playing") return;

    const tickMs = 500;
    const msPerDay = BASE_DAY_MS / speed;
    let lastTick = Date.now();

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;

      const store = useGameStore.getState();
      const nextProgress = store.dayProgress + elapsed / msPerDay;

      if (nextProgress >= 1) {
        advanceDay();
        store.setDayProgress(nextProgress % 1);
      } else {
        store.setDayProgress(nextProgress);
      }
    }, tickMs);
  }, [speed, phase, advanceDay, stopClock]);

  // ── Clock lifecycle ────────────────────────────────────────────
  useEffect(() => {
    startClock();
    return stopClock;
  }, [startClock]);

  // ── Background / foreground handling ──────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      async (nextState: AppStateStatus) => {
        const wasActive = appState.current === "active";
        const nowActive = nextState === "active";
        appState.current = nextState;

        if (wasActive && !nowActive) {
          // ── Going to background — save state immediately ──────────
          stopClock();

          if (phase === "playing" && speed > 0) {
            try {
              const { airline, hubs, earnedAchievements, missionsCompleted } =
                useGameStore.getState();
              if (airline) {
                await supabase
                  .from("airlines")
                  .update({
                    cash: airline.cash,
                    loan: airline.loan,
                    day: airline.day,
                    demand_score: airline.demand_score,
                    reputation: airline.reputation,
                    achievements: earnedAchievements,
                    missions_completed: missionsCompleted,
                  })
                  .eq("id", airline.id);

                const hubUpdates = hubs
                  .filter((h) => !h.id.startsWith("temp-"))
                  .map((h) =>
                    supabase
                      .from("hubs")
                      .update({ trust: Math.round(h.trust * 10) / 10 })
                      .eq("id", h.id),
                  );
                await Promise.all(hubUpdates);
              }
            } catch {}
          }
        } else if (!wasActive && nowActive) {
          // ── Returning to foreground — just resume ────────────────
          await AsyncStorage.multiRemove([BG_TIMESTAMP_KEY, BG_SPEED_KEY]);
          useGameStore.getState().resetDailyPax();
          startClock();
        }
      },
    );

    return () => sub.remove();
  }, [startClock, stopClock, phase, speed]);

  return {
    day: airline?.day ?? 1,
    speed: airline?.speed ?? 1,
    paused: speed === 0 || phase !== "playing",
  };
}
