/**
 * hooks/useAITick.ts
 *
 * Computes deterministic AI airline state whenever the game day/config changes.
 * Same seed + day + difficulty always produces the same rival airlines.
 */

import { computeAIState } from "@/lib/AIAirline";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

function syncAIState() {
  const { airline, setAIAirlines, airports } = useGameStore.getState();
  if (!airline) return;

  const count = airline.ai_count ?? 0;
  if (count <= 0) {
    setAIAirlines([]);
    return;
  }

  const difficulty = (airline.ai_difficulty ?? "balanced") as
    | "passive"
    | "balanced"
    | "aggressive";
  const gameSeed = airline.seed ?? "DEFAULT";
  const day = airline.day ?? 1;

  const airlines = Array.from({ length: count }, (_, index) =>
    computeAIState(gameSeed, index, day, difficulty, airports),
  );

  setAIAirlines(airlines);
}

export function useAITick() {
  const lastKey = useRef<string>("");

  useEffect(() => {
    syncAIState();

    const unsub = useGameStore.subscribe(
      (s) => ({
        day: s.airline?.day,
        seed: s.airline?.seed,
        aiCount: s.airline?.ai_count,
        aiDifficulty: s.airline?.ai_difficulty,
        airportCount: s.airports.length,
      }),
      (value) => {
        const key = `${value.seed ?? "DEFAULT"}:${value.day ?? 0}:${value.aiCount ?? 0}:${value.aiDifficulty ?? "balanced"}:${value.airportCount}`;
        if (key === lastKey.current) return;
        lastKey.current = key;
        syncAIState();
      },
    );

    return () => unsub();
  }, []);
}
