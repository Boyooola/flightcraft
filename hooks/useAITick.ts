/**
 * Keeps the deterministic rival roster aligned with the current game.
 *
 * Day-end settlement uses the existing roster first. After the player day is
 * settled, this hook builds the next roster once and publishes that transition
 * for lightweight systems such as competition news.
 */

import {
  computeAIRoster,
  normalizeAIDifficulty,
  type AIAirline,
  type AIDifficulty,
} from "@/lib/AIAirline";
import { type AirlineLogoId, type AirlinePaletteId } from "@/lib/airlineBrand";
import { useGameStore, type Airport } from "@/store";
import { useEffect, useMemo } from "react";

export type AIRosterTransitionReason =
  "initial" | "day-advanced" | "configuration-changed";

export interface AIRosterTransition {
  id: number;
  day: number;
  reason: AIRosterTransitionReason;
  previousRoster: readonly AIAirline[];
  currentRoster: readonly AIAirline[];
}

type AIRosterTransitionListener = (transition: AIRosterTransition) => void;

let latestTransition: AIRosterTransition | null = null;
let transitionId = 0;
const transitionListeners = new Set<AIRosterTransitionListener>();
const rosterAirportSignatures = new WeakMap<readonly AIAirline[], string>();

/** Returns the latest transition so a late subscriber does not miss it. */
export function getLatestAIRosterTransition(): AIRosterTransition | null {
  return latestTransition;
}

/**
 * Subscribes to completed roster changes. This is intentionally separate from
 * the game store because the previous roster is temporary comparison data.
 */
export function subscribeToAIRosterTransitions(
  listener: AIRosterTransitionListener,
): () => void {
  transitionListeners.add(listener);
  return () => transitionListeners.delete(listener);
}

function publishRosterTransition(
  day: number,
  reason: AIRosterTransitionReason,
  previousRoster: readonly AIAirline[],
  currentRoster: readonly AIAirline[],
) {
  const transition: AIRosterTransition = {
    id: ++transitionId,
    day,
    reason,
    previousRoster,
    currentRoster,
  };
  latestTransition = transition;

  transitionListeners.forEach((listener) => listener(transition));
}

function normalizeRivalCount(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.floor(value ?? 0)));
}

function rosterMatches(
  roster: readonly AIAirline[],
  params: {
    count: number;
    day: number;
    seed: string;
    difficulty: AIDifficulty;
    reservedLogoId?: AirlineLogoId;
    reservedPaletteId?: AirlinePaletteId;
  },
): boolean {
  if (roster.length !== params.count) return false;

  return roster.every(
    (rival, index) =>
      rival.index === index &&
      rival.day === params.day &&
      rival.seed === params.seed &&
      rival.difficulty === params.difficulty &&
      typeof rival.logoId === "string" &&
      typeof rival.paletteId === "string" &&
      rival.logoId !== params.reservedLogoId &&
      rival.paletteId !== params.reservedPaletteId,
  );
}

function getTransitionReason(
  previousRoster: readonly AIAirline[],
  params: {
    count: number;
    day: number;
    seed: string;
    difficulty: AIDifficulty;
  },
): AIRosterTransitionReason {
  if (previousRoster.length === 0) return "initial";

  const sameConfiguration =
    previousRoster.length === params.count &&
    previousRoster.every(
      (rival, index) =>
        rival.index === index &&
        rival.seed === params.seed &&
        rival.difficulty === params.difficulty,
    );
  const previousDay = previousRoster[0]?.day ?? params.day;

  return sameConfiguration && params.day > previousDay
    ? "day-advanced"
    : "configuration-changed";
}

/**
 * The rival planner depends on airport identity, location, tier, and traffic.
 * Memoizing this signature prevents unrelated store updates from rebuilding it.
 */
function getAirportSignature(airports: readonly Airport[]): string {
  let hash = 5381;

  for (const airport of airports) {
    const value = `${airport.iata}|${airport.lat}|${airport.lng}|${airport.tier}|${airport.pax_annual_m ?? ""}`;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0;
    }
  }

  return `${airports.length}:${hash}`;
}

export function useAITick() {
  const day = useGameStore((state) => state.airline?.day);
  const seed = useGameStore((state) => state.airline?.seed);
  const configuredCount = useGameStore((state) => state.airline?.ai_count);
  const configuredDifficulty = useGameStore(
    (state) => state.airline?.ai_difficulty,
  );
  const playerLogoId = useGameStore((state) => state.airline?.logo_id);
  const playerPaletteId = useGameStore((state) => state.airline?.palette_id);
  const airports = useGameStore((state) => state.airports);
  const loadComplete = useGameStore((state) => state.loadComplete);
  const phase = useGameStore((state) => state.phase);
  const airportSignature = useMemo(
    () => getAirportSignature(airports),
    [airports],
  );

  useEffect(() => {
    if (!loadComplete || phase !== "playing" || !day) return;

    const count = normalizeRivalCount(configuredCount);
    const difficulty = normalizeAIDifficulty(configuredDifficulty);
    const gameSeed = seed ?? "DEFAULT";
    const params = {
      count,
      day,
      seed: gameSeed,
      difficulty,
      reservedLogoId: playerLogoId,
      reservedPaletteId: playerPaletteId,
    };
    const store = useGameStore.getState();
    const previousRoster = store.aiAirlines;

    // Checking the actual roster instead of only a remembered key keeps reset
    // and save-load flows correct, even when they reuse the same seed and day.
    if (
      rosterMatches(previousRoster, params) &&
      (count === 0 ||
        rosterAirportSignatures.get(previousRoster) === airportSignature)
    ) {
      return;
    }

    const reason = getTransitionReason(previousRoster, params);

    if (count === 0) {
      store.setAIAirlines([]);
      publishRosterTransition(day, reason, previousRoster, []);
      return;
    }

    if (airports.length === 0) return;

    const currentRoster = computeAIRoster({
      gameSeed,
      count,
      day,
      difficulty,
      airports,
      reservedLogoId: playerLogoId,
      reservedPaletteId: playerPaletteId,
    });

    rosterAirportSignatures.set(currentRoster, airportSignature);
    store.setAIAirlines(currentRoster);
    publishRosterTransition(day, reason, previousRoster, currentRoster);
  }, [
    airportSignature,
    airports,
    configuredCount,
    configuredDifficulty,
    day,
    loadComplete,
    phase,
    playerLogoId,
    playerPaletteId,
    seed,
  ]);
}
