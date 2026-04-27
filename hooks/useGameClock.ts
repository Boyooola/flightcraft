/**
 * hooks/useGameClock.ts
 *
 * Drives the game's time simulation.
 * Uses setInterval scaled by the speed multiplier.
 * Pauses automatically when the app goes to background.
 *
 * Usage:
 *   const { day, paused } = useGameClock();
 */

import { useGameStore } from "@/store";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

const BASE_DAY_MS = 180_000; // 3 real minutes = 1 game day at ×1 (×2=90s, ×3=60s)

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
    const ms = BASE_DAY_MS / speed;
    timerRef.current = setInterval(() => {
      advanceDay();
    }, ms);
  }, [speed, phase, advanceDay, stopClock]);

  // Restart when speed or phase changes
  useEffect(() => {
    startClock();
    return stopClock;
  }, [startClock]);

  // Pause when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (appState.current === "active" && nextState !== "active") {
          stopClock();
        } else if (appState.current !== "active" && nextState === "active") {
          startClock();
        }
        appState.current = nextState;
      },
    );
    return () => sub.remove();
  }, [startClock, stopClock]);

  return {
    day: airline?.day ?? 1,
    speed: airline?.speed ?? 1,
    paused: speed === 0 || phase !== "playing",
  };
}
