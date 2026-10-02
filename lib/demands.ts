/**
 * Compatibility layer for the old Demand model.
 *
 * Passenger markets now live in passengerMarkets.ts. A market is persistent
 * and describes travelers from one origin to one final destination. This file
 * adapts those markets into the Demand records still used by current screens
 * and persistence.
 *
 * Rules:
 * - Daily passengers do not unlock, replace, or delete an opportunity.
 * - Demand score does not change market size or automatic route range.
 * - Visible opportunities and active-route capacity are separate limits.
 * - Automatic opportunities never exceed the best owned aircraft range.
 * - With no aircraft, the starter planning envelope is 2,000 nautical miles.
 */

import {
  STARTER_OPPORTUNITY_RANGE_NM,
  baselineDemandForMarket,
  calculateDailyPassengerDemand,
  createPassengerMarket,
  generateRouteOpportunities,
  marketHaulClass,
  opportunityCountForHubTier,
  type RouteOpportunity,
} from "@/lib/passengerMarkets";
import type {
  Airport,
  AirportTier,
  Demand,
  HaulClass,
  HubTier,
  OwnedPlane,
} from "@/store";

export interface HubTierConfig {
  /** Maximum routes that may operate at the same time. */
  routes: number;
  /** Destination choices visible to the player. */
  opportunities: number;
  /** Deprecated compatibility field. Trust is never silently floored. */
  trustFloor: number;
  upgradeTrust: number;
  upgradePax: number;
  minAirportTier: AirportTier;
}

export const HUB_TIER_CONFIG: Record<number, HubTierConfig> = {
  1: {
    routes: 2,
    opportunities: 3,
    trustFloor: 0,
    upgradeTrust: 45,
    upgradePax: 3_000,
    minAirportTier: "local",
  },
  2: {
    routes: 3,
    opportunities: 4,
    trustFloor: 0,
    upgradeTrust: 58,
    upgradePax: 10_000,
    minAirportTier: "minor",
  },
  3: {
    routes: 4,
    opportunities: 5,
    trustFloor: 0,
    upgradeTrust: 68,
    upgradePax: 30_000,
    minAirportTier: "regional",
  },
  4: {
    routes: 5,
    opportunities: 6,
    trustFloor: 0,
    upgradeTrust: 78,
    upgradePax: 80_000,
    minAirportTier: "major",
  },
  5: {
    routes: 6,
    opportunities: 7,
    trustFloor: 0,
    upgradeTrust: 88,
    upgradePax: 200_000,
    minAirportTier: "large",
  },
  6: {
    routes: 7,
    opportunities: 8,
    trustFloor: 0,
    upgradeTrust: 100,
    upgradePax: 999_999,
    minAirportTier: "mega",
  },
};

export const PAX_PRESENCE_THRESHOLDS: Record<AirportTier, number> = {
  local: 500,
  minor: 1_500,
  regional: 4_000,
  major: 10_000,
  large: 25_000,
  mega: 60_000,
};

export const CASH_RESERVE_AFTER_BUY = 100_000;
export const TIER1_MAX_RANGE_NM = STARTER_OPPORTUNITY_RANGE_NM;

let gameSeed = "DEFAULT";

export function setDemandSeed(seed: string): void {
  gameSeed = seed.trim() || "DEFAULT";
}

function hubTier(value: number | undefined): HubTier {
  return Math.min(6, Math.max(1, Math.round(value ?? 1))) as HubTier;
}

function normalizedIata(iata: string): string {
  return iata.trim().toUpperCase();
}

export function distanceNm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusNm = 3_440.065;
  const latitudeDelta = ((lat2 - lat1) * Math.PI) / 180;
  const longitudeDelta = ((lng2 - lng1) * Math.PI) / 180;
  const latitude1 = (lat1 * Math.PI) / 180;
  const latitude2 = (lat2 * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusNm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function haulClass(routeDistanceNm: number): HaulClass {
  return marketHaulClass(routeDistanceNm);
}

/** Kept for old callers. Progress no longer extends automatic route range. */
export function maxRangeForProgress(_demandScore: number): number {
  return STARTER_OPPORTUNITY_RANGE_NM;
}

export function maxRoutesForTier(tier: number): number {
  return HUB_TIER_CONFIG[hubTier(tier)].routes;
}

export function demandSlotsForHub(params?: { hubLevel?: number }): number {
  return HUB_TIER_CONFIG[hubTier(params?.hubLevel)].opportunities;
}

export function presenceThreshold(
  airport: Airport,
  aiHubCount: number,
): number {
  const multiplier = aiHubCount >= 2 ? 3 : aiHubCount === 1 ? 2 : 1;
  return PAX_PRESENCE_THRESHOLDS[airport.tier] * multiplier;
}

function fallbackPaxAnnual(airport: Airport): number {
  const fallback: Record<AirportTier, number> = {
    mega: 60,
    large: 25,
    major: 8,
    regional: 2,
    minor: 0.5,
    local: 0.15,
  };
  return fallback[airport.tier];
}

function airportPaxM(airport: Airport): number {
  return airport.pax_annual_m ?? fallbackPaxAnnual(airport);
}

export function airportClassification(airport: Airport): {
  label: "Mega Hub" | "International" | "Regional" | "Domestic";
  tier: 1 | 2 | 3 | 4;
  paxM: number;
} {
  const paxM = airportPaxM(airport);
  if (paxM >= 40) return { label: "Mega Hub", tier: 1, paxM };
  if (paxM >= 10) return { label: "International", tier: 2, paxM };
  if (paxM >= 2) return { label: "Regional", tier: 3, paxM };
  return { label: "Domestic", tier: 4, paxM };
}

/** Compatibility weight for old UI previews. */
export function airportWeight(airport: Airport): number {
  const paxM = airportPaxM(airport);
  if (paxM >= 50) return 10;
  if (paxM >= 20) return 7;
  if (paxM >= 5) return 5;
  if (paxM >= 2) return 3;
  return 1;
}

/** Compatibility score derived from the authoritative market baseline. */
export function routeMarketStrength(
  origin: Airport,
  destination: Airport,
  routeDistanceNm: number,
): number {
  return (
    baselineDemandForMarket({
      gameSeed,
      origin,
      destination,
      distanceNm: routeDistanceNm,
    }) / 10
  );
}

export function computePaxCeiling(
  origin: Airport,
  destination: Airport,
  routeDistanceNm: number,
): number {
  return baselineDemandForMarket({
    gameSeed,
    origin,
    destination,
    distanceNm: routeDistanceNm,
  });
}

/** Stable daily OD demand. Player progression never creates travelers. */
export function simulatePaxDay(
  origin: Airport,
  destination: Airport,
  _routeDistanceNm: number,
  _demandScore: number = 0,
  gameDay: number = 1,
): number {
  const market = createPassengerMarket({
    gameSeed,
    origin,
    destination,
    generatedDay: gameDay,
  });
  return calculateDailyPassengerDemand({
    gameSeed,
    gameDay,
    market,
    destination,
  }).todayDemand;
}

export interface GenerateHubOpportunitiesParams {
  hub: Airport;
  airports: readonly Airport[];
  ownedPlanes: readonly OwnedPlane[];
  gameDay: number;
  hubLevel?: number;
  count?: number;
  existingDestinationIatas?: readonly string[];
  slotOffset?: number;
  countryAffinity?: Readonly<Record<string, number>>;
}

/** Authoritative, aircraft-aware generator for player-facing route choices. */
export function generateHubOpportunities(
  params: GenerateHubOpportunitiesParams,
): RouteOpportunity[] {
  const tier = hubTier(params.hubLevel);
  return generateRouteOpportunities({
    gameSeed,
    gameDay: Math.max(1, Math.floor(params.gameDay)),
    hub: params.hub,
    airports: params.airports,
    ownedPlanes: params.ownedPlanes,
    count: params.count ?? opportunityCountForHubTier(tier),
    hubTier: tier,
    excludedDestinationIatas: params.existingDestinationIatas,
    slotOffset: params.slotOffset,
    countryAffinity: params.countryAffinity,
  });
}

export function routeOpportunityToLegacyDemand(
  opportunity: RouteOpportunity,
  origin: Airport,
  destination: Airport,
  gameDay: number,
): Omit<Demand, "id" | "airline_id"> {
  const dailyDemand = calculateDailyPassengerDemand({
    gameSeed,
    gameDay: Math.max(1, Math.floor(gameDay)),
    market: opportunity.market,
    destination,
  });
  return {
    hub_iata: origin.iata,
    origin,
    dest: destination,
    dist_nm: opportunity.market.distanceNm,
    haul: opportunity.market.haul,
    status: "pending",
    delivered_pax_today: 0,
    business_pct: opportunity.market.businessShare,
    leisure_pct: opportunity.market.leisureShare,
    base_pax_day: dailyDemand.todayDemand,
    pax_ceiling: dailyDemand.todayDemand,
    popularity: 0,
  };
}

function legacyDemandsFromOpportunities(params: {
  opportunities: readonly RouteOpportunity[];
  hub: Airport;
  airports: readonly Airport[];
  gameDay: number;
}): Omit<Demand, "id" | "airline_id">[] {
  const airportByIata = new Map(
    params.airports.map((airport) => [normalizedIata(airport.iata), airport]),
  );
  return params.opportunities.flatMap((opportunity) => {
    const destination = airportByIata.get(
      normalizedIata(opportunity.destinationIata),
    );
    return destination
      ? [
          routeOpportunityToLegacyDemand(
            opportunity,
            params.hub,
            destination,
            params.gameDay,
          ),
        ]
      : [];
  });
}

/**
 * Legacy generator retained for existing screens and persistence. This
 * signature has no fleet, so it intentionally uses the starter range.
 */
export function generateDemands(
  hub: Airport,
  allAirports: Airport[],
  count: number = demandSlotsForHub({ hubLevel: 1 }),
  existingDests: string[] = [],
  _demandScore: number = 0,
  _forceShort: boolean = false,
  gameDay: number = 1,
): Omit<Demand, "id" | "airline_id">[] {
  const opportunities = generateHubOpportunities({
    hub,
    airports: allAirports,
    ownedPlanes: [],
    gameDay,
    count,
    existingDestinationIatas: existingDests,
  });
  return legacyDemandsFromOpportunities({
    opportunities,
    hub,
    airports: allAirports,
    gameDay,
  });
}

export function generateOneDemand(
  hub: Airport,
  allAirports: Airport[],
  existingDests: string[],
  demandScore: number = 0,
  gameDay: number = 1,
): Omit<Demand, "id" | "airline_id"> | null {
  return (
    generateDemands(
      hub,
      allAirports,
      1,
      existingDests,
      demandScore,
      true,
      gameDay,
    )[0] ?? null
  );
}

/** Served rows persist. Only no_plane rows are absent from visible choices. */
export function activeDemandCount(hubIata: string, demands: Demand[]): number {
  const normalizedHub = normalizedIata(hubIata);
  return demands.filter(
    (demand) =>
      normalizedIata(demand.hub_iata) === normalizedHub &&
      demand.status !== "no_plane",
  ).length;
}

export function demandsToSpawnForHub(
  hubIata: string,
  demands: Demand[],
  demandSlots: number = demandSlotsForHub({ hubLevel: 1 }),
): number {
  return Math.max(0, demandSlots - activeDemandCount(hubIata, demands));
}

export function activeDestinationIatas(
  hubIata: string,
  demands: Demand[],
): string[] {
  const normalizedHub = normalizedIata(hubIata);
  return demands
    .filter(
      (demand) =>
        normalizedIata(demand.hub_iata) === normalizedHub &&
        demand.status !== "no_plane",
    )
    .map((demand) => demand.dest.iata);
}

export function refillDemandSlots(
  hub: Airport,
  allAirports: Airport[],
  allDemands: Demand[],
  options?: {
    demandScore?: number;
    hubLevel?: number;
    forceShort?: boolean;
    gameDay?: number;
    ownedPlanes?: readonly OwnedPlane[];
  },
): Omit<Demand, "id" | "airline_id">[] {
  const slots = demandSlotsForHub({ hubLevel: options?.hubLevel });
  const missing = demandsToSpawnForHub(hub.iata, allDemands, slots);
  if (missing === 0) return [];

  const gameDay = Math.max(1, Math.floor(options?.gameDay ?? 1));
  const opportunities = generateHubOpportunities({
    hub,
    airports: allAirports,
    ownedPlanes: options?.ownedPlanes ?? [],
    gameDay,
    hubLevel: options?.hubLevel,
    count: missing,
    existingDestinationIatas: activeDestinationIatas(hub.iata, allDemands),
    slotOffset: activeDemandCount(hub.iata, allDemands),
  });
  return legacyDemandsFromOpportunities({
    opportunities,
    hub,
    airports: allAirports,
    gameDay,
  });
}

/** True when all of today's passengers at the hub have been accounted for. */
export function allDemandsServed(hubIata: string, demands: Demand[]): boolean {
  const normalizedHub = normalizedIata(hubIata);
  const hubDemands = demands.filter(
    (demand) =>
      normalizedIata(demand.hub_iata) === normalizedHub &&
      demand.status !== "no_plane",
  );
  if (hubDemands.length === 0) return false;

  return hubDemands.every((demand) => {
    const totalHandled =
      (demand.delivered_pax_today ?? 0) + (demand.ai_stolen_pax ?? 0);
    return totalHandled >= Math.max(1, demand.base_pax_day ?? 1);
  });
}

export function pendingDemandCount(hubIata: string, demands: Demand[]): number {
  const normalizedHub = normalizedIata(hubIata);
  return demands.filter(
    (demand) =>
      normalizedIata(demand.hub_iata) === normalizedHub &&
      demand.status === "pending",
  ).length;
}

export function hubPurchaseCost(airport: Airport): number {
  const { tier } = airportClassification(airport);
  if (tier === 1) return 400_000;
  if (tier === 2) return 200_000;
  if (tier === 3) return 100_000;
  return 50_000;
}

export type CrowdingLevel = "normal" | "busy" | "overcrowded" | "crisis";

export interface CrowdingInfo {
  level: CrowdingLevel;
  waitingPax: number;
  capacityPct: number;
  cap: number;
}

function hubWaitingCapacity(paxM: number): number {
  if (paxM >= 40) return 1_200;
  if (paxM >= 10) return 700;
  if (paxM >= 2) return 300;
  return 120;
}

export function hubCrowdingLevel(
  hubIata: string,
  demands: {
    hub_iata: string;
    base_pax_day: number;
    delivered_pax_today: number;
    ai_stolen_pax?: number;
    status?: string;
  }[],
  airport: { pax_annual_m: number | null; iata: string },
): CrowdingInfo {
  const normalizedHub = normalizedIata(hubIata);
  const hubDemands = demands.filter(
    (demand) =>
      normalizedIata(demand.hub_iata) === normalizedHub &&
      demand.status !== "served" &&
      demand.status !== "expired" &&
      demand.status !== "no_plane",
  );
  const waitingPax = hubDemands.reduce((total, demand) => {
    const handled =
      (demand.delivered_pax_today ?? 0) + (demand.ai_stolen_pax ?? 0);
    return total + Math.max(0, demand.base_pax_day - handled);
  }, 0);
  const cap = hubWaitingCapacity(airport.pax_annual_m ?? 2);
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
