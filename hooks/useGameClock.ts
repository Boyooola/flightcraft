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
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const BASE_DAY_MS = 180_000; // 3 real min = 1 game day at ×1

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useGameClock() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

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
              const {
                airline,
                hubs,
                demands,
                ownedPlanes,
                earnedAchievements,
                missionsCompleted,
              } = useGameStore.getState();
              if (airline) {
                const { error: airlineError } = await supabase
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
                if (airlineError) throw airlineError;

                const hubUpdates = hubs
                  .filter((h) => !h.id.startsWith("temp-"))
                  .map((h) =>
                    supabase
                      .from("hubs")
                      .update({ trust: Math.round(h.trust * 10) / 10 })
                      .eq("id", h.id),
                  );
                const hubResults = await Promise.all(hubUpdates);
                const hubError = hubResults.find((result) => result.error)?.error;
                if (hubError) throw hubError;

                const demandResults = await Promise.all(
                  demands
                    .filter((demand) => !demand.id.startsWith("temp-"))
                    .map((demand) =>
                      supabase
                        .from("demands")
                        .update({
                          delivered_pax_today:
                            demand.delivered_pax_today ?? 0,
                          base_pax_day: demand.base_pax_day,
                          popularity: demand.popularity,
                          ai_stolen_pax: demand.ai_stolen_pax ?? 0,
                        })
                        .eq("id", demand.id),
                    ),
                );
                const demandError = demandResults.find(
                  (result) => result.error,
                )?.error;
                if (demandError) throw demandError;

                const planeResults = await Promise.all(
                  ownedPlanes
                    .filter((plane) => !plane.id.startsWith("temp-"))
                    .map((plane) =>
                      supabase
                        .from("owned_planes")
                        .update({
                          condition: plane.condition ?? 100,
                          days_active: plane.days_active ?? 0,
                          route_id: plane.route_id,
                        })
                        .eq("id", plane.id),
                    ),
                );
                const planeError = planeResults.find(
                  (result) => result.error,
                )?.error;
                if (planeError) throw planeError;
              }
            } catch {}
          }
        } else if (!wasActive && nowActive) {
          // Resume the same in-progress day. Daily state is reset only by the
          // actual day-end settlement; foregrounding must never erase it.
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
