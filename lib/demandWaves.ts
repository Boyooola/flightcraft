/**
 * lib/demandWaves.ts
 *
 * Endgame pressure layer: deterministic demand waves.
 *
 * Every few days, the world creates a passenger spike.
 * This does NOT create individual passengers. It boosts pax_day on existing
 * pending demands, then the passengerFlow system makes those pax appear over
 * the day.
 */

import { seedHash } from "@/lib/seed";
import type { Demand, OwnedHub } from "@/store";

export type DemandWaveKind =
  | "holiday"
  | "business"
  | "festival"
  | "school_break"
  | "global_rush";

export interface DemandWave {
  id: string;
  kind: DemandWaveKind;
  title: string;
  icon: string;
  desc: string;
  effect: string;
  multiplier: number;
  maxTargets: number;
  targetHint: string;
  revenueMultiplier: number;
}

export interface DemandWaveUpdate {
  demandId: string;
  oldPaxDay: number;
  newPaxDay: number;
  addedPax: number;
  originIata: string;
  destIata: string;
}

export interface AppliedDemandWave {
  wave: DemandWave;
  updates: DemandWaveUpdate[];
  totalAddedPax: number;
  affectedHubs: string[];
}

const WAVES: Omit<DemandWave, "id">[] = [
  {
    kind: "holiday",
    title: "Holiday Rush",
    icon: "gift-outline",
    desc: "Travelers are flooding airports for holiday trips. Add capacity fast.",
    effect: "+40% pax on selected demand slots",
    multiplier: 1.4,
    maxTargets: 5,
    targetHint: "busy leisure routes",
    revenueMultiplier: 1.08,
  },
  {
    kind: "business",
    title: "Business Surge",
    icon: "briefcase-outline",
    desc: "Business travelers are moving between major cities today.",
    effect: "+30% pax on medium and long routes",
    multiplier: 1.3,
    maxTargets: 4,
    targetHint: "medium/long demand",
    revenueMultiplier: 1.12,
  },
  {
    kind: "festival",
    title: "Festival Travel",
    icon: "musical-notes-outline",
    desc: "A regional event is creating a sudden passenger spike from one hub.",
    effect: "+60% pax from one hub",
    multiplier: 1.6,
    maxTargets: 3,
    targetHint: "one crowded hub",
    revenueMultiplier: 1.05,
  },
  {
    kind: "school_break",
    title: "School Break",
    icon: "people-circle-outline",
    desc: "Families are traveling on short and medium routes.",
    effect: "+35% pax on short/medium demand",
    multiplier: 1.35,
    maxTargets: 5,
    targetHint: "short/medium routes",
    revenueMultiplier: 1.05,
  },
  {
    kind: "global_rush",
    title: "Global Rush",
    icon: "earth-outline",
    desc: "Passenger demand spikes across the whole network.",
    effect: "+25% pax across many open slots",
    multiplier: 1.25,
    maxTargets: 8,
    targetHint: "network-wide",
    revenueMultiplier: 1.15,
  },
];

export function isDemandWaveDay(day: number): boolean {
  if (day < 7) return false;

  // Early game gets a softer cadence, late game gets stricter pressure.
  if (day < 35) return day % 7 === 0;
  return day % 5 === 0;
}

export function generateDemandWave(
  day: number,
  gameSeed: string = "DEFAULT",
): DemandWave {
  const idx = seedHash(gameSeed, "demand-wave", day) % WAVES.length;
  const base = WAVES[idx];

  return {
    ...base,
    id: `wave-${day}-${base.kind}`,
  };
}

function scoreDemandForWave(
  demand: Demand,
  wave: DemandWave,
  preferredHubIata?: string,
): number {
  let score = demand.pax_day;

  if (wave.kind === "business") {
    if (demand.haul === "medium") score += 400;
    if (demand.haul === "long") score += 650;
    if (demand.haul === "short") score -= 250;
  }

  if (wave.kind === "school_break") {
    if (demand.haul === "short") score += 450;
    if (demand.haul === "medium") score += 250;
    if (demand.haul === "long") score -= 250;
  }

  if (wave.kind === "festival" && preferredHubIata) {
    if (demand.hub_iata === preferredHubIata) score += 1000;
    else score -= 500;
  }

  if (wave.kind === "global_rush") {
    score += demand.delivered_pax_today > 0 ? 150 : 0;
  }

  if (wave.kind === "holiday") {
    score +=
      demand.dest.tier === "mega" || demand.dest.tier === "major" ? 250 : 0;
  }

  return score;
}

export function applyDemandWave(params: {
  day: number;
  gameSeed: string;
  demands: Demand[];
  hubs: OwnedHub[];
}): AppliedDemandWave | null {
  const { day, gameSeed, demands, hubs } = params;

  if (!isDemandWaveDay(day)) return null;

  const wave = generateDemandWave(day, gameSeed);
  const pending = demands.filter((demand) => demand.status === "pending");

  if (pending.length === 0) return null;

  const preferredHubIata =
    wave.kind === "festival" && hubs.length > 0
      ? hubs[seedHash(gameSeed, "wave-festival-hub", day) % hubs.length]
          ?.airport.iata
      : undefined;

  const ranked = [...pending]
    .map((demand) => ({
      demand,
      score: scoreDemandForWave(demand, wave, preferredHubIata),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(wave.maxTargets, pending.length));

  const updates: DemandWaveUpdate[] = ranked
    .map(({ demand }) => {
      const oldPaxDay = demand.pax_day;
      const newPaxDay = Math.max(
        oldPaxDay + 1,
        Math.round(oldPaxDay * wave.multiplier),
      );

      return {
        demandId: demand.id,
        oldPaxDay,
        newPaxDay,
        addedPax: Math.max(0, newPaxDay - oldPaxDay),
        originIata: demand.origin.iata,
        destIata: demand.dest.iata,
      };
    })
    .filter((update) => update.addedPax > 0);

  if (updates.length === 0) return null;

  const affectedHubs = Array.from(
    new Set(
      updates
        .map((update) => {
          const demand = demands.find((d) => d.id === update.demandId);
          return demand?.hub_iata;
        })
        .filter(Boolean) as string[],
    ),
  );

  return {
    wave,
    updates,
    totalAddedPax: updates.reduce((sum, update) => sum + update.addedPax, 0),
    affectedHubs,
  };
}
