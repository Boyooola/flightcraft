/**
 * lib/demands.ts
 *
 * Demand generation with tier-aware range constraints.
 *
 * KEY RULES:
 *   - First 3 demands on hub purchase are ALWAYS within tier-1 range (≤2,100nm)
 *     so new players can always serve them immediately
 *   - Daily new demands scale with player's demand_score (proxy for progression)
 *     0-9  served → short/medium only (≤3,500nm)
 *     10-29 served → medium allowed (≤3,500nm)
 *     30+  served → long-haul unlocked (any range)
 *   - Max 8 demands per hub
 *   - Airport classification uses pax_annual when available,
 *     falls back to our scoring matrix
 */

import type { Airport, Demand, HaulClass } from "@/store";

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
// TIER-1 MAX RANGE
// E170LR = 2100nm, CRJ200 = 2004nm → use 2100 as the ceiling
// ─────────────────────────────────────────────────────────────────

export const TIER1_MAX_RANGE_NM = 2_100;

/**
 * Max demand range based on how many demands the player has served.
 * This is the progression gate — long-haul routes unlock gradually.
 */
export function maxRangeForProgress(demandScore: number): number {
  if (demandScore >= 30) return 99_999; // long-haul fully unlocked
  if (demandScore >= 10) return 3_500; // medium-haul max
  return TIER1_MAX_RANGE_NM; // tier-1 safe only
}

// ─────────────────────────────────────────────────────────────────
// MAX DEMANDS PER HUB
// ─────────────────────────────────────────────────────────────────

export const MAX_DEMANDS_PER_HUB = 8;

// ─────────────────────────────────────────────────────────────────
// AIRPORT TRAFFIC WEIGHTS (for demand pool building)
// ─────────────────────────────────────────────────────────────────

export const MEGA_HUBS = new Set([
  "LHR",
  "CDG",
  "FRA",
  "AMS",
  "DXB",
  "SIN",
  "HKG",
  "NRT",
  "JFK",
  "LAX",
  "ORD",
  "ATL",
  "PEK",
  "PVG",
  "SYD",
  "ICN",
  "DEL",
  "BOM",
  "CGK",
  "DOH",
  "IST",
  "MAD",
  "BCN",
  "FCO",
  "ZRH",
  "VIE",
  "CPH",
  "BKK",
  "KUL",
  "MEX",
  "MNL",
  "NBO",
  "JNB",
  "CAI",
  "LOS",
  "ADD",
  "GRU",
  "EZE",
  "YYZ",
  "DFW",
  "DEN",
  "CLT",
  "SEA",
  "SFO",
  "MIA",
  "MCO",
  "LAS",
  "HND",
  "CAN",
  "PVG",
]);

export const MAJOR_HUBS = new Set([
  "DUB",
  "LIS",
  "BRU",
  "ARN",
  "HEL",
  "WAW",
  "PRG",
  "BUD",
  "ATH",
  "OSL",
  "CLT",
  "MIA",
  "SEA",
  "DEN",
  "SFO",
  "YVR",
  "BOG",
  "SCL",
  "LIM",
  "GRU",
  "CMB",
  "DAC",
  "KHI",
  "LHE",
  "CCU",
  "MAA",
  "HYD",
  "BLR",
  "CTU",
  "XIY",
  "WUH",
  "HGH",
  "NKG",
  "AKL",
  "MEL",
  "BNE",
  "PER",
  "CEB",
  "DVO",
  "KIX",
  "DAR",
  "CMN",
  "ABV",
  "ACC",
  "MRU",
  "DOH",
  "AUH",
  "BAH",
  "AMM",
  "SGN",
  "HAN",
  "CAN",
  "SZX",
  "KMG",
  "MUC",
  "BCN",
  "FCO",
  "LIS",
]);

/** Estimate annual pax for airports without pax_annual_m in DB */
function estimatePaxAnnual(airport: Airport): number {
  if (MEGA_HUBS.has(airport.iata)) return 35 + Math.random() * 30;
  if (MAJOR_HUBS.has(airport.iata)) return 5 + Math.random() * 20;
  if (airport.tier === "mega") return 40 + Math.random() * 60;
  if (airport.tier === "large") return 10 + Math.random() * 30;
  if (airport.tier === "major") return 3 + Math.random() * 10;
  if (airport.tier === "regional") return 0.5 + Math.random() * 3;
  if (airport.tier === "minor") return 0.1 + Math.random() * 0.8;
  if (airport.tier === "local") return 0.05 + Math.random() * 0.2;
  return 0.2 + Math.random() * 2;
}

/**
 * Airport display classification based on annual pax.
 * Uses pax_annual_m from DB directly, falls back to tier estimate.
 */
export function airportClassification(airport: Airport): {
  label: "Mega Hub" | "International" | "Regional" | "Domestic";
  tier: 1 | 2 | 3 | 4;
  paxM: number;
} {
  const pax = airport.pax_annual_m ?? estimatePaxAnnual(airport);
  if (pax >= 40) return { label: "Mega Hub", tier: 1, paxM: pax };
  if (pax >= 10) return { label: "International", tier: 2, paxM: pax };
  if (pax >= 2) return { label: "Regional", tier: 3, paxM: pax };
  return { label: "Domestic", tier: 4, paxM: pax };
}

export function airportWeight(airport: Airport): number {
  const pax = airport.pax_annual_m ?? 0;
  if (pax >= 50) return 10;
  if (pax >= 20) return 7;
  if (pax >= 5) return 5;
  if (MEGA_HUBS.has(airport.iata)) return 8;
  if (MAJOR_HUBS.has(airport.iata)) return 4;
  if (airport.tier === "mega") return 9;
  if (airport.tier === "large") return 6;
  if (airport.tier === "major") return 3;
  if (airport.tier === "regional") return 2;
  if (airport.tier === "minor") return 1;
  return 1; // local
}

// ─────────────────────────────────────────────────────────────────
// PASSENGER SIMULATION
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// PASSENGER SIMULATION — gravity model
//
// demand ∝ √(pax_A × pax_B) / distance^1.5
//
// Boosted by:
//   - Continent-pair bonus  (intra-regional routes are denser)
//   - Hub connectivity bonus (large airports attract transfer pax)
//   - Same-continent short-haul bias
//   - Daily variance ±20%
//
// No hardcoded country lists — everything derived from airport data.
// ─────────────────────────────────────────────────────────────────

/**
 * Continent-pair bonus table.
 * Key = "ORIGIN_CONTINENT-DEST_CONTINENT" (sorted alphabetically so
 * AS-EU and EU-AS both match "AS-EU").
 *
 * Intra-continental routes are always denser — shorter distances,
 * more frequent scheduling, higher load factors.
 * Cross-continental routes are penalised by distance in the gravity
 * formula already, so we only need to boost known dense corridors.
 */
const CONTINENT_PAIR_BONUS: Record<string, number> = {
  "AS-AS": 1.5, // dense intra-Asian (SEA, EA, South Asia all busy)
  "EU-EU": 1.4, // dense intra-European short haul
  "NA-NA": 1.3, // North American intra (lots of domestic routes)
  "SA-SA": 1.2, // South American intra
  "OC-OC": 1.2, // Oceania intra (AU domestic)
  "AF-AF": 1.1, // African intra (growing)
  "AS-OC": 1.2, // Asia-Pacific corridor (strong tourism + migration)
  "EU-NA": 1.15, // Transatlantic (mature, high-yield)
  "AS-EU": 1.1, // Asia-Europe (long but busy)
};

function continentPairBonus(cA: string, cB: string): number {
  const key1 = [cA, cB].sort().join("-");
  return CONTINENT_PAIR_BONUS[key1] ?? 1.0;
}

export function simulatePaxDay(
  origin: Airport,
  dest: Airport,
  dist: number,
): number {
  // Annual pax at each airport (millions)
  // Priority: DB field → lookup table → estimate from tier
  const oPax = origin.pax_annual_m ?? estimatePaxAnnual(origin);
  const dPax = dest.pax_annual_m ?? estimatePaxAnnual(dest);

  // Gravity core: geometric mean of airport sizes ÷ distance^1.5
  // Min distance 0.3 (×1000nm) prevents division explosion on tiny routes
  const distK = Math.max(dist / 1000, 0.3);
  const gravity = Math.sqrt(oPax * dPax) / Math.pow(distK, 1.5);

  // Continent-pair bonus — denser corridors get a lift
  const contBonus = continentPairBonus(origin.continent, dest.continent);

  // Hub connectivity — large airports attract connecting passengers
  // beyond what their O&D traffic alone would suggest
  const hubBonus =
    dPax >= 60
      ? 1.4 // mega hub  (DXB 86M, ATL 104M)
      : dPax >= 30
        ? 1.25 // major hub (SIN 58M, DOH 44M)
        : dPax >= 10
          ? 1.1 // international (CEB 12M)
          : 1.0;

  // Variance ±20% — daily fluctuation (weather, events, seasonality)
  const variance = 0.8 + Math.random() * 0.4;

  // Domestic short-haul cap — commuter routes don't fill widebodies
  const cap = origin.country === dest.country && dist < 500 ? 400 : 800;

  // Scale = 5 — tuned so outputs feel right:
  //   Large hub pair, short distance → 400-800 pax/day
  //   Large hub pair, long distance  →  30-150 pax/day
  //   Small airport pair             →  20-80  pax/day
  const raw = gravity * contBonus * hubBonus * variance * 5;

  return Math.max(20, Math.min(cap, Math.round(raw)));
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
  allAirports.forEach((a) => {
    if (a.iata === hub.iata) return;
    if (exclude.has(a.iata)) return;

    const dist = distanceNm(hub.lat, hub.lng, a.lat, a.lng);
    if (dist < 50) return; // same metro
    if (dist > maxRange) return; // beyond allowed range

    const w = airportWeight(a);
    if (w < 1) return;
    for (let i = 0; i < w; i++) pool.push(a);
  });
  return pool;
}

// ─────────────────────────────────────────────────────────────────
// GENERATE DEMANDS
// ─────────────────────────────────────────────────────────────────

/**
 * Generate N demands for a hub.
 *
 * @param hub            The hub airport
 * @param allAirports    Full airport list
 * @param count          How many to generate (default 3)
 * @param existingDests  Already-used destination iatas to avoid duplication
 * @param demandScore    Player's progression score (gates long-haul)
 * @param forceShort     If true, only generate tier-1-flyable demands (initial hub purchase)
 */
export function generateDemands(
  hub: Airport,
  allAirports: Airport[],
  count: number = 3,
  existingDests: string[] = [],
  demandScore: number = 0,
  forceShort: boolean = false,
): Omit<Demand, "id" | "airline_id">[] {
  const maxRange = forceShort
    ? TIER1_MAX_RANGE_NM
    : maxRangeForProgress(demandScore);

  const exclude = new Set(existingDests);
  const pool = buildPool(hub, allAirports, exclude, maxRange);

  if (pool.length === 0) {
    // Fallback: ignore range constraint if no destinations found
    const fallbackPool = buildPool(hub, allAirports, exclude, 99_999);
    if (fallbackPool.length === 0) return [];
    return generateFromPool(hub, fallbackPool, count);
  }

  return generateFromPool(hub, pool, count);
}

function generateFromPool(
  hub: Airport,
  pool: Airport[],
  count: number,
): Omit<Demand, "id" | "airline_id">[] {
  const used: Set<string> = new Set();
  const demands: Omit<Demand, "id" | "airline_id">[] = [];
  let tries = 0;

  while (demands.length < count && tries < 500) {
    tries++;
    const dest = pool[Math.floor(Math.random() * pool.length)];
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
      pax_day: simulatePaxDay(hub, dest, dist),
      status: "pending",
      delivered_pax_today: 0,
    });
  }
  return demands;
}

/**
 * Generate exactly 1 new demand for a hub (daily spawn).
 * Respects max 8 demands per hub and player progression.
 */
export function generateOneDemand(
  hub: Airport,
  allAirports: Airport[],
  existingDests: string[],
  demandScore: number = 0,
  currentCount: number = 0,
): Omit<Demand, "id" | "airline_id"> | null {
  if (currentCount >= MAX_DEMANDS_PER_HUB) return null; // cap reached
  const results = generateDemands(
    hub,
    allAirports,
    1,
    existingDests,
    demandScore,
    false,
  );
  return results[0] ?? null;
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
  // Reduced 25-47% — hub cost should feel meaningful but not
  // prohibitive early game. A Mega Hub still requires real investment.
  if (tier === 1) return 400_000; // Mega Hub      (was $600K)
  if (tier === 2) return 200_000; // International (was $350K)
  if (tier === 3) return 100_000; // Regional      (was $180K)
  return 50_000; // Domestic      (was $80K)
}

// ─────────────────────────────────────────────────────────────────
// OVERCROWDING SYSTEM
// ─────────────────────────────────────────────────────────────────

export type CrowdingLevel = "normal" | "busy" | "overcrowded" | "crisis";

export interface CrowdingInfo {
  level: CrowdingLevel;
  waitingPax: number; // total unserved pax waiting at airport
  capacityPct: number; // 0-200+, % of airport waiting capacity used
  cap: number; // threshold in pax before congestion starts
}

/** Max waiting pax before airport starts getting congested */
function hubWaitingCapacity(paxM: number): number {
  if (paxM >= 40) return 3000; // Mega Hub
  if (paxM >= 10) return 1500; // International
  if (paxM >= 2) return 500; // Regional
  return 150; // Domestic
}

/**
 * Compute crowding level for a hub.
 * waitingPax = sum of (pax_day - delivered_pax_today) for all unserved/partial demands.
 * capacityPct = waitingPax / hubWaitingCapacity × 100.
 *
 *   0-50%:   normal
 *   50-100%: busy     — trust growth pauses
 *   100-150%: overcrowded — trust decays, revenue -10%
 *   150%+:   crisis   — trust decays faster, revenue -20%, competitor event
 */
export function hubCrowdingLevel(
  hubIata: string,
  demands: { hub_iata: string; pax_day: number; delivered_pax_today: number }[],
  airport: { pax_annual_m: number | null; iata: string },
): CrowdingInfo {
  const hubDemands = demands.filter((d) => d.hub_iata === hubIata);

  // Waiting pax = undelivered passengers across all demands today
  const waitingPax = hubDemands.reduce((sum, d) => {
    const delivered = d.delivered_pax_today ?? 0;
    return sum + Math.max(0, d.pax_day - delivered);
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

  return { level, waitingPax, capacityPct, cap };
}
