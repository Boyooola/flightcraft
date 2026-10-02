/**
 * Predictable, one-day passenger surges for existing route opportunities.
 *
 * A wave never creates a destination, extends aircraft range, or changes the
 * permanent OD market. It only adds travelers to suitable opportunities that
 * already exist for the current day.
 */

import { seedHash } from "@/lib/seed";
import type { Demand, OwnedHub } from "@/store";

export type DemandWaveKind =
  "holiday" | "business" | "festival" | "school_break" | "network_rush";

export interface DemandWave {
  id: string;
  kind: DemandWaveKind;
  title: string;
  icon: string;
  desc: string;
  increasePercent: number;
  targetLimit: number;
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

export const DEMAND_WAVE_INTERVAL_DAYS = 7;

const WAVES: Omit<DemandWave, "id">[] = [
  {
    kind: "holiday",
    title: "Holiday travel",
    icon: "calendar-outline",
    desc: "Leisure bookings are higher on selected routes today.",
    increasePercent: 30,
    targetLimit: 4,
  },
  {
    kind: "business",
    title: "Business travel",
    icon: "briefcase-outline",
    desc: "Corporate bookings are higher on key city routes today.",
    increasePercent: 25,
    targetLimit: 3,
  },
  {
    kind: "festival",
    title: "Regional event",
    icon: "location-outline",
    desc: "A local event is increasing travel from one of your hubs today.",
    increasePercent: 35,
    targetLimit: 3,
  },
  {
    kind: "school_break",
    title: "School break",
    icon: "people-outline",
    desc: "Family travel is higher on short and medium routes today.",
    increasePercent: 25,
    targetLimit: 4,
  },
  {
    kind: "network_rush",
    title: "Network rush",
    icon: "airplane-outline",
    desc: "Passenger demand is slightly higher across the network today.",
    increasePercent: 15,
    targetLimit: 6,
  },
];

const DESTINATION_TIER_SCORE: Record<Demand["dest"]["tier"], number> = {
  local: 0,
  minor: 20,
  regional: 40,
  major: 70,
  large: 90,
  mega: 110,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedIata(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function nonNegativeInteger(value: number | null | undefined): number {
  return Math.max(
    0,
    Math.round(typeof value === "number" && Number.isFinite(value) ? value : 0),
  );
}

function businessShare(demand: Demand): number {
  return clamp(demand.business_pct ?? 0.25, 0, 1);
}

function leisureShare(demand: Demand): number {
  return clamp(demand.leisure_pct ?? 1 - businessShare(demand), 0, 1);
}

function uniqueOpenDemands(demands: readonly Demand[]): Demand[] {
  const byId = new Map<string, Demand>();

  demands.forEach((demand) => {
    if (!demand.id || demand.status !== "pending") return;
    if (!normalizedIata(demand.origin?.iata)) return;
    if (!normalizedIata(demand.dest?.iata)) return;
    if (nonNegativeInteger(demand.base_pax_day) === 0) return;
    byId.set(demand.id, demand);
  });

  return [...byId.values()];
}

export function isDemandWaveDay(day: number): boolean {
  const safeDay = Math.floor(day);
  return (
    Number.isFinite(safeDay) &&
    safeDay >= DEMAND_WAVE_INTERVAL_DAYS &&
    safeDay % DEMAND_WAVE_INTERVAL_DAYS === 0
  );
}

export function generateDemandWave(
  day: number,
  gameSeed: string = "DEFAULT",
): DemandWave {
  const safeDay = Math.max(1, Math.floor(day));
  const seed = gameSeed.trim() || "DEFAULT";
  const base = WAVES[seedHash(seed, "demand-wave", safeDay) % WAVES.length];

  return {
    ...base,
    id: `wave-${safeDay}-${base.kind}`,
  };
}

function festivalHubIata(params: {
  day: number;
  gameSeed: string;
  demands: readonly Demand[];
  hubs: readonly OwnedHub[];
}): string | null {
  const openHubIatas = new Set(
    params.demands.map((demand) => normalizedIata(demand.hub_iata)),
  );
  const ownedWithOpenDemand = params.hubs
    .map((hub) => normalizedIata(hub.airport.iata))
    .filter((iata) => iata && openHubIatas.has(iata));
  const candidates =
    ownedWithOpenDemand.length > 0
      ? ownedWithOpenDemand
      : [...openHubIatas].filter(Boolean);

  if (candidates.length === 0) return null;

  const index =
    seedHash(params.gameSeed, "festival-hub", params.day) % candidates.length;
  return candidates[index];
}

function eligibleDemands(
  demands: readonly Demand[],
  wave: DemandWave,
  selectedFestivalHub: string | null,
): Demand[] {
  switch (wave.kind) {
    case "holiday":
      return [...demands];
    case "business":
      return [...demands];
    case "festival":
      return selectedFestivalHub
        ? demands.filter(
            (demand) => normalizedIata(demand.hub_iata) === selectedFestivalHub,
          )
        : [];
    case "school_break":
      return demands.filter((demand) => demand.haul !== "long");
    case "network_rush":
      return [...demands];
  }
}

function demandScore(params: {
  demand: Demand;
  wave: DemandWave;
  day: number;
  gameSeed: string;
}): number {
  const { demand, wave, day, gameSeed } = params;
  const baseDemand = nonNegativeInteger(demand.base_pax_day);
  const variety =
    seedHash(gameSeed, "wave-route", day, wave.kind, demand.id) % 101;

  let relevance = 0;
  switch (wave.kind) {
    case "holiday":
      relevance =
        leisureShare(demand) * 300 + DESTINATION_TIER_SCORE[demand.dest.tier];
      break;
    case "business":
      relevance = businessShare(demand) * 400;
      if (demand.haul === "medium") relevance += 60;
      if (demand.haul === "long") relevance += 90;
      break;
    case "festival":
      relevance = leisureShare(demand) * 120;
      break;
    case "school_break":
      relevance = leisureShare(demand) * 300;
      if (demand.haul === "short") relevance += 80;
      break;
    case "network_rush":
      relevance = 0;
      break;
  }

  return baseDemand + relevance + variety;
}

export function applyDemandWave(params: {
  day: number;
  gameSeed: string;
  demands: readonly Demand[];
  hubs: readonly OwnedHub[];
}): AppliedDemandWave | null {
  const safeDay = Math.floor(params.day);
  if (!isDemandWaveDay(safeDay)) return null;

  const gameSeed = params.gameSeed.trim() || "DEFAULT";
  const wave = generateDemandWave(safeDay, gameSeed);
  const openDemands = uniqueOpenDemands(params.demands);
  if (openDemands.length === 0) return null;

  const selectedFestivalHub =
    wave.kind === "festival"
      ? festivalHubIata({
          day: safeDay,
          gameSeed,
          demands: openDemands,
          hubs: params.hubs,
        })
      : null;
  const candidates = eligibleDemands(openDemands, wave, selectedFestivalHub);
  if (candidates.length === 0) return null;

  const selected = candidates
    .map((demand) => ({
      demand,
      score: demandScore({ demand, wave, day: safeDay, gameSeed }),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.demand.id.localeCompare(right.demand.id),
    )
    .slice(0, wave.targetLimit)
    .map(({ demand }) => demand);

  const updates = selected.map((demand): DemandWaveUpdate => {
    const oldPaxDay = nonNegativeInteger(demand.base_pax_day);
    const addedPax = Math.max(
      1,
      Math.round(oldPaxDay * (wave.increasePercent / 100)),
    );

    return {
      demandId: demand.id,
      oldPaxDay,
      newPaxDay: oldPaxDay + addedPax,
      addedPax,
      originIata: normalizedIata(demand.origin.iata),
      destIata: normalizedIata(demand.dest.iata),
    };
  });

  const demandById = new Map(selected.map((demand) => [demand.id, demand]));
  const affectedHubs = [
    ...new Set(
      updates
        .map((update) =>
          normalizedIata(demandById.get(update.demandId)?.hub_iata),
        )
        .filter(Boolean),
    ),
  ].sort();

  return {
    wave,
    updates,
    totalAddedPax: updates.reduce(
      (total, update) => total + update.addedPax,
      0,
    ),
    affectedHubs,
  };
}
