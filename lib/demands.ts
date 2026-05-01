/**
 * lib/demands.ts
 *
 * WorldWide Rush-style demand generation for planes only.
 *
 * CORE IDEA:
 *   - Airports do NOT endlessly generate realistic traffic records.
 *   - Each owned hub has visible "demand slots".
 *   - Starting hubs have 3 active demand slots.
 *   - When a demand is served, refill the empty slot.
 *   - Higher progression/trust can unlock more slots up to 8.
 *
 * GAME LOOP:
 *   Airport shows 3 demands
 *   → player serves one with planes
 *   → demand is marked served
 *   → empty slot refills with a new destination
 *
 * DESIGN:
 *   - Uses real airport size as market strength.
 *   - Converts market strength into small game-friendly passenger bundles.
 *   - Early game demand is readable and serveable.
 *   - Later demand grows with progression.
 */

import type { Airport, Demand, HaulClass } from "@/store";
import { seedHash } from "./seed";

// ─────────────────────────────────────────────────────────────────
// DISTANCE
// ─────────────────────────────────────────────────────────────────

export function distanceNm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────
// HAUL CLASSIFICATION
// ─────────────────────────────────────────────────────────────────

export function haulClass(distNm: number): HaulClass {
  if (distNm < 1_000) return "short";
  if (distNm < 3_500) return "medium";
  return "long";
}

// ─────────────────────────────────────────────────────────────────
// RANGE / PROGRESSION
// ─────────────────────────────────────────────────────────────────

export const TIER1_MAX_RANGE_NM = 2_100;

export function maxRangeForProgress(demandScore: number): number {
  if (demandScore >= 30) return 99_999;
  if (demandScore >= 10) return 3_500;
  return TIER1_MAX_RANGE_NM;
}

// ─────────────────────────────────────────────────────────────────
// WORLDWIDE RUSH-STYLE DEMAND SLOTS
// ─────────────────────────────────────────────────────────────────

export const STARTING_DEMAND_SLOTS = 3;
export const MAX_DEMANDS_PER_HUB = 8;

/**
 * Number of visible demand slots for a hub.
 * You can later replace this with trust-based logic from your store.
 */
export function demandSlotsForHub(params?: {
  demandScore?: number;
  trust?: number;
  hubLevel?: number;
}): number {
  const demandScore = params?.demandScore ?? 0;
  const trust = params?.trust ?? 50;
  const hubLevel = params?.hubLevel ?? 1;

  let slots = STARTING_DEMAND_SLOTS;

  if (hubLevel >= 2) slots += 1;
  if (hubLevel >= 4) slots += 1;

  if (demandScore >= 10) slots += 1;
  if (demandScore >= 30) slots += 1;

  if (trust >= 80) slots += 1;
  if (trust <= 25) slots -= 1;

  return Math.max(2, Math.min(MAX_DEMANDS_PER_HUB, slots));
}

/**
 * Counts active visible demands.
 * Served demands are considered completed and should not occupy a slot.
 */
export function activeDemandCount(hubIata: string, demands: Demand[]): number {
  return demands.filter(
    (d) =>
      d.hub_iata === hubIata &&
      d.status !== "served" &&
      d.status !== "no_plane",
  ).length;
}

/**
 * How many new demands this hub needs to refill its visible demand slots.
 */
export function demandsToSpawnForHub(
  hubIata: string,
  demands: Demand[],
  demandSlots: number = STARTING_DEMAND_SLOTS,
): number {
  const active = activeDemandCount(hubIata, demands);
  return Math.max(0, Math.min(MAX_DEMANDS_PER_HUB, demandSlots) - active);
}

/**
 * Existing active destinations so we don't create duplicate visible demands.
 */
export function activeDestinationIatas(
  hubIata: string,
  demands: Demand[],
): string[] {
  return demands
    .filter(
      (d) =>
        d.hub_iata === hubIata &&
        d.status !== "served" &&
        d.status !== "no_plane",
    )
    .map((d) => d.dest.iata);
}

// ─────────────────────────────────────────────────────────────────
// AIRPORT CLASSIFICATION / WEIGHTS
// ─────────────────────────────────────────────────────────────────

function fallbackPaxAnnual(airport: Airport): number {
  if (airport.tier === "mega") return 60;
  if (airport.tier === "large") return 25;
  if (airport.tier === "major") return 8;
  if (airport.tier === "regional") return 2;
  if (airport.tier === "minor") return 0.5;
  if (airport.tier === "local") return 0.15;
  return 1;
}

function airportPaxM(airport: Airport): number {
  return airport.pax_annual_m ?? fallbackPaxAnnual(airport);
}

export function airportClassification(airport: Airport): {
  label: "Mega Hub" | "International" | "Regional" | "Domestic";
  tier: 1 | 2 | 3 | 4;
  paxM: number;
} {
  const pax = airportPaxM(airport);

  if (pax >= 40) return { label: "Mega Hub", tier: 1, paxM: pax };
  if (pax >= 10) return { label: "International", tier: 2, paxM: pax };
  if (pax >= 2) return { label: "Regional", tier: 3, paxM: pax };

  return { label: "Domestic", tier: 4, paxM: pax };
}

export function airportWeight(airport: Airport): number {
  const pax = airportPaxM(airport);

  if (pax >= 50) return 10;
  if (pax >= 20) return 7;
  if (pax >= 5) return 5;
  if (pax >= 2) return 3;

  if (airport.tier === "mega") return 9;
  if (airport.tier === "large") return 6;
  if (airport.tier === "major") return 4;
  if (airport.tier === "regional") return 2;

  return 1;
}

// ─────────────────────────────────────────────────────────────────
// SEEDED RANDOM HELPERS
// ─────────────────────────────────────────────────────────────────

let _gameSeed = "DEFAULT";

export function setDemandSeed(seed: string) {
  _gameSeed = seed;
}

function seededUnit(...parts: string[]): number {
  const hash = seedHash(_gameSeed, ...parts);
  return (hash % 10_000) / 10_000;
}

function seededVariance(originIata: string, destIata: string): number {
  const n = seededUnit(originIata, destIata, "variance");
  return 0.85 + n * 0.3;
}

function seededPassengerRoll(originIata: string, destIata: string): number {
  return seededUnit(originIata, destIata, "passengers");
}

// ─────────────────────────────────────────────────────────────────
// ROUTE MARKET STRENGTH
// ─────────────────────────────────────────────────────────────────

const CONTINENT_PAIR_BONUS: Record<string, number> = {
  "AS-AS": 1.5,
  "EU-EU": 1.4,
  "NA-NA": 1.3,
  "SA-SA": 1.2,
  "OC-OC": 1.2,
  "AF-AF": 1.1,
  "AS-OC": 1.2,
  "EU-NA": 1.15,
  "AS-EU": 1.1,
};

function continentPairBonus(cA: string, cB: string): number {
  const key = [cA, cB].sort().join("-");
  return CONTINENT_PAIR_BONUS[key] ?? 1.0;
}

/**
 * This is the hidden "market strength" for a route.
 * It is not shown directly to the player.
 */
export function routeMarketStrength(
  origin: Airport,
  dest: Airport,
  distNm: number,
): number {
  const oPax = airportPaxM(origin);
  const dPax = airportPaxM(dest);

  const airportPower = Math.sqrt(oPax * dPax);
  const distanceFactor = 1 / Math.pow(Math.max(distNm, 100) / 1000, 0.35);

  const maxPax = Math.max(oPax, dPax);
  const hubFactor =
    maxPax >= 60 ? 1.35 : maxPax >= 30 ? 1.22 : maxPax >= 10 ? 1.1 : 1.0;

  const domesticFactor =
    origin.country === dest.country ? (distNm < 800 ? 1.45 : 1.2) : 1.0;

  const intlFactor =
    origin.country !== dest.country && Math.min(oPax, dPax) >= 5 ? 1.18 : 1.0;

  const contFactor = continentPairBonus(origin.continent, dest.continent);
  const variance = seededVariance(origin.iata, dest.iata);

  return (
    airportPower *
    distanceFactor *
    hubFactor *
    domesticFactor *
    intlFactor *
    contFactor *
    variance
  );
}

/**
 * WorldWide Rush-style passenger bundle.
 *
 * Instead of huge realistic pax/day values, this creates readable game goals:
 *   early: 12–60 pax
 *   mid:   40–160 pax
 *   late:  100–400+ pax
 */
export function simulatePaxDay(
  origin: Airport,
  dest: Airport,
  distNm: number,
  demandScore: number = 0,
): number {
  const strength = routeMarketStrength(origin, dest, distNm);
  const roll = seededPassengerRoll(origin.iata, dest.iata);

  let min = 12;
  let max = 60;

  if (demandScore >= 10) {
    min = 30;
    max = 140;
  }

  if (demandScore >= 30) {
    min = 70;
    max = 320;
  }

  if (demandScore >= 75) {
    min = 120;
    max = 520;
  }

  const strengthBoost = Math.min(2.2, Math.max(0.75, strength / 8));
  const rolled = min + roll * (max - min);
  const pax = Math.round(rolled * strengthBoost);

  const haul = haulClass(distNm);

  if (haul === "short") return Math.max(8, Math.round(pax));
  if (haul === "medium") return Math.max(20, Math.round(pax * 1.15));
  return Math.max(60, Math.round(pax * 1.35));
}

// ─────────────────────────────────────────────────────────────────
// DEMAND POOL BUILDER
// ─────────────────────────────────────────────────────────────────

function buildPool(
  hub: Airport,
  allAirports: Airport[],
  exclude: Set<string>,
  maxRange: number,
): Airport[] {
  const pool: Airport[] = [];

  allAirports.forEach((airport) => {
    if (!airport.iata) return;
    if (airport.iata === hub.iata) return;
    if (exclude.has(airport.iata)) return;

    const dist = distanceNm(hub.lat, hub.lng, airport.lat, airport.lng);

    if (dist < 50) return;
    if (dist > maxRange) return;

    const weight = airportWeight(airport);
    for (let i = 0; i < weight; i++) {
      pool.push(airport);
    }
  });

  return pool;
}

// ─────────────────────────────────────────────────────────────────
// DEMAND GENERATION
// ─────────────────────────────────────────────────────────────────

export function generateDemands(
  hub: Airport,
  allAirports: Airport[],
  count: number = STARTING_DEMAND_SLOTS,
  existingDests: string[] = [],
  demandScore: number = 0,
  forceShort: boolean = false,
): Omit<Demand, "id" | "airline_id">[] {
  const maxRange = forceShort
    ? TIER1_MAX_RANGE_NM
    : maxRangeForProgress(demandScore);

  const exclude = new Set(existingDests);
  const pool = buildPool(hub, allAirports, exclude, maxRange);

  if (pool.length > 0) {
    return generateFromPool(hub, pool, count, demandScore);
  }

  const fallbackPool = buildPool(hub, allAirports, exclude, 99_999);
  if (fallbackPool.length === 0) return [];

  return generateFromPool(hub, fallbackPool, count, demandScore);
}

function generateFromPool(
  hub: Airport,
  pool: Airport[],
  count: number,
  demandScore: number,
): Omit<Demand, "id" | "airline_id">[] {
  const used = new Set<string>();
  const demands: Omit<Demand, "id" | "airline_id">[] = [];

  let tries = 0;

  while (demands.length < count && tries < 500) {
    tries++;

    const dest = pool[Math.floor(Math.random() * pool.length)];
    if (!dest?.iata) continue;
    if (used.has(dest.iata)) continue;

    used.add(dest.iata);

    const dist = Math.round(distanceNm(hub.lat, hub.lng, dest.lat, dest.lng));
    if (dist < 50) continue;

    demands.push({
      hub_iata: hub.iata,
      origin: hub,
      dest,
      dist_nm: dist,
      haul: haulClass(dist),
      pax_day: simulatePaxDay(hub, dest, dist, demandScore),
      status: "pending",
      delivered_pax_today: 0,
    });
  }

  return demands;
}

/**
 * Generate exactly one demand.
 * Useful when a single slot has been completed.
 */
export function generateOneDemand(
  hub: Airport,
  allAirports: Airport[],
  existingDests: string[],
  demandScore: number = 0,
  currentCount: number = 0,
): Omit<Demand, "id" | "airline_id"> | null {
  if (currentCount >= MAX_DEMANDS_PER_HUB) return null;

  const result = generateDemands(
    hub,
    allAirports,
    1,
    existingDests,
    demandScore,
    false,
  );

  return result[0] ?? null;
}

/**
 * WorldWide Rush-style refill.
 *
 * Call this after:
 *   - buying a hub
 *   - serving a demand
 *   - loading a save
 *   - daily tick, if you still want daily pacing
 */
export function refillDemandSlots(
  hub: Airport,
  allAirports: Airport[],
  allDemands: Demand[],
  options?: {
    demandScore?: number;
    trust?: number;
    hubLevel?: number;
    forceShort?: boolean;
  },
): Omit<Demand, "id" | "airline_id">[] {
  const demandScore = options?.demandScore ?? 0;

  const slots = demandSlotsForHub({
    demandScore,
    trust: options?.trust,
    hubLevel: options?.hubLevel,
  });

  const missing = demandsToSpawnForHub(hub.iata, allDemands, slots);
  if (missing <= 0) return [];

  const existingDests = activeDestinationIatas(hub.iata, allDemands);

  return generateDemands(
    hub,
    allAirports,
    missing,
    existingDests,
    demandScore,
    options?.forceShort ?? false,
  );
}

// ─────────────────────────────────────────────────────────────────
// HUB STATUS HELPERS
// ─────────────────────────────────────────────────────────────────

export function allDemandsServed(hubIata: string, demands: Demand[]): boolean {
  const hubDemands = demands.filter((d) => d.hub_iata === hubIata);
  if (hubDemands.length === 0) return false;

  return hubDemands.every((d) => d.status === "served");
}

export function pendingDemandCount(hubIata: string, demands: Demand[]): number {
  return demands.filter((d) => d.hub_iata === hubIata && d.status === "pending")
    .length;
}

export function hubPurchaseCost(airport: Airport): number {
  const { tier } = airportClassification(airport);

  if (tier === 1) return 400_000;
  if (tier === 2) return 200_000;
  if (tier === 3) return 100_000;

  return 50_000;
}

// ─────────────────────────────────────────────────────────────────
// CROWDING SYSTEM
// ─────────────────────────────────────────────────────────────────

export type CrowdingLevel = "normal" | "busy" | "overcrowded" | "crisis";

export interface CrowdingInfo {
  level: CrowdingLevel;
  waitingPax: number;
  capacityPct: number;
  cap: number;
}

function hubWaitingCapacity(paxM: number): number {
  if (paxM >= 40) return 1200;
  if (paxM >= 10) return 700;
  if (paxM >= 2) return 300;
  return 120;
}

export function hubCrowdingLevel(
  hubIata: string,
  demands: {
    hub_iata: string;
    pax_day: number;
    delivered_pax_today: number;
    status?: string;
  }[],
  airport: { pax_annual_m: number | null; iata: string },
): CrowdingInfo {
  const hubDemands = demands.filter(
    (d) =>
      d.hub_iata === hubIata && d.status !== "served" && d.status !== "expired",
  );

  const waitingPax = hubDemands.reduce((sum, demand) => {
    const delivered = demand.delivered_pax_today ?? 0;
    return sum + Math.max(0, demand.pax_day - delivered);
  }, 0);

  const paxM = airport.pax_annual_m ?? 2;
  const cap = hubWaitingCapacity(paxM);
  const capacityPct = Math.round((waitingPax / cap) * 100);

  const level: CrowdingLevel =
    capacityPct >= 150
      ? "crisis"
      : capacityPct >= 100
        ? "overcrowded"
        : capacityPct >= 50
          ? "busy"
          : "normal";

  return {
    level,
    waitingPax,
    capacityPct,
    cap,
  };
}
