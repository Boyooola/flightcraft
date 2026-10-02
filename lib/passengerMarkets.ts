/**
 * lib/passengerMarkets.ts
 *
 * Source of truth for FlightCraft passenger markets and route opportunities.
 *
 * A passenger market answers one question:
 * "How many people want to travel from this origin to this final destination?"
 *
 * It does not depend on the player's routes, aircraft, price, or rivals. Those
 * systems decide which itineraries are available and who carries the market.
 *
 * Route opportunities are player-facing suggestions built from passenger
 * markets. Unlike the underlying market, an opportunity must fit the operating
 * range of at least one aircraft the player owns. Before the first aircraft is
 * purchased, opportunities use the starter-aircraft envelope.
 */

import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { getRegionForAirport, getSeasonalMultiplier } from "@/lib/seasons";
import { seedFloat, seedHash } from "@/lib/seed";
import type {
  Airport,
  AirportTier,
  HaulClass,
  HubTier,
  OwnedPlane,
} from "@/store";

export const STARTER_OPPORTUNITY_RANGE_NM = 2_000;
export const MIN_OPPORTUNITY_DISTANCE_NM = 50;
export const DEFAULT_ROUTE_OPPORTUNITY_COUNT = 3;

/**
 * Visible opportunities and active-route capacity are intentionally separate.
 * A hub may offer several choices without being able to operate all of them.
 */
export const ROUTE_OPPORTUNITIES_BY_HUB_TIER: Record<HubTier, number> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
};

export type MarketRelationship =
  "domestic" | "regional" | "continental" | "intercontinental";

export type OpportunityDistanceBand = "near" | "core" | "reach";

export type OpportunityAircraftState =
  "ready" | "reassignment_required" | "aircraft_required" | "out_of_range";

export interface PassengerMarket {
  /** Directional origin-destination key, for example MNL>JFK. */
  id: string;
  originIata: string;
  destinationIata: string;
  distanceNm: number;
  haul: HaulClass;
  relationship: MarketRelationship;
  baselineDailyDemand: number;
  businessShare: number;
  leisureShare: number;
  generatedDay: number;
}

export interface DailyPassengerDemand {
  marketId: string;
  gameDay: number;
  baselineDemand: number;
  seasonalMultiplier: number;
  dailyVariationMultiplier: number;
  eventMultiplier: number;
  todayDemand: number;
}

export interface OpportunityAircraftFit {
  state: OpportunityAircraftState;
  routeDistanceNm: number;
  operatingRangeNm: number;
  capablePlaneIds: string[];
  idleCapablePlaneIds: string[];
  recommendedPlaneId: string | null;
}

export interface RouteOpportunity {
  id: string;
  hubIata: string;
  destinationIata: string;
  market: PassengerMarket;
  distanceBand: OpportunityDistanceBand;
  aircraftFit: OpportunityAircraftFit;
  generatedDay: number;
}

export interface CreatePassengerMarketParams {
  gameSeed: string;
  origin: Airport;
  destination: Airport;
  generatedDay?: number;
  /**
   * Optional symmetric country-pair multipliers. Keys use alphabetical ISO
   * country codes, for example "PH:US". Values are clamped to 0.5 through 1.5.
   */
  countryAffinity?: Readonly<Record<string, number>>;
}

export interface CalculateDailyDemandParams {
  gameSeed: string;
  gameDay: number;
  market: PassengerMarket;
  destination: Airport;
  /** World events may modify total travel, but player trust and price may not. */
  eventMultiplier?: number;
}

export interface GenerateRouteOpportunitiesParams {
  gameSeed: string;
  gameDay: number;
  hub: Airport;
  airports: readonly Airport[];
  ownedPlanes: readonly OwnedPlane[];
  count?: number;
  hubTier?: HubTier;
  /** Active destinations and already-visible opportunities belong here. */
  excludedDestinationIatas?: readonly string[];
  /** Changes which distance band is requested first when refilling one slot. */
  slotOffset?: number;
  countryAffinity?: Readonly<Record<string, number>>;
}

const AIRPORT_TRAFFIC_FALLBACK_M: Record<AirportTier, number> = {
  mega: 60,
  large: 25,
  major: 8,
  regional: 2,
  minor: 0.5,
  local: 0.15,
};

const AIRPORT_TIER_SCORE: Record<AirportTier, number> = {
  mega: 6,
  large: 5,
  major: 4,
  regional: 3,
  minor: 2,
  local: 1,
};

const RELATIONSHIP_MULTIPLIER: Record<MarketRelationship, number> = {
  domestic: 1.35,
  regional: 1.2,
  continental: 1,
  intercontinental: 0.7,
};

const OPPORTUNITY_BAND_ORDER: OpportunityDistanceBand[] = [
  "near",
  "core",
  "reach",
];

interface OpportunityCandidate {
  destination: Airport;
  market: PassengerMarket;
  band: OpportunityDistanceBand;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizedIata(iata: string): string {
  return iata.trim().toUpperCase();
}

export function passengerMarketId(
  originIata: string,
  destinationIata: string,
): string {
  return `${normalizedIata(originIata)}>${normalizedIata(destinationIata)}`;
}

export function countryPairKey(countryA: string, countryB: string): string {
  return [countryA.trim().toUpperCase(), countryB.trim().toUpperCase()]
    .sort()
    .join(":");
}

export function marketDistanceNm(
  origin: Airport,
  destination: Airport,
): number {
  const earthRadiusNm = 3_440.065;
  const degreesToRadians = Math.PI / 180;
  const originLat = origin.lat * degreesToRadians;
  const destinationLat = destination.lat * degreesToRadians;
  const latitudeDelta = (destination.lat - origin.lat) * degreesToRadians;
  const longitudeDelta = (destination.lng - origin.lng) * degreesToRadians;

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(longitudeDelta / 2) ** 2;

  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(earthRadiusNm * centralAngle);
}

export function marketHaulClass(distanceNm: number): HaulClass {
  if (distanceNm < 1_000) return "short";
  if (distanceNm < 3_500) return "medium";
  return "long";
}

export function marketRelationship(
  origin: Airport,
  destination: Airport,
): MarketRelationship {
  if (origin.country === destination.country) return "domestic";

  const originRegion = getRegionForAirport({
    country: origin.country,
    continent: origin.continent,
  });
  const destinationRegion = getRegionForAirport({
    country: destination.country,
    continent: destination.continent,
  });

  if (
    originRegion !== "global" &&
    destinationRegion !== "global" &&
    originRegion === destinationRegion
  ) {
    return "regional";
  }

  if (origin.continent === destination.continent) return "continental";

  return "intercontinental";
}

function airportTrafficMillions(airport: Airport): number {
  const fallback = AIRPORT_TRAFFIC_FALLBACK_M[airport.tier] ?? 1;
  return Math.max(0.05, finiteOr(airport.pax_annual_m, fallback));
}

function affinityMultiplier(
  origin: Airport,
  destination: Airport,
  countryAffinity?: Readonly<Record<string, number>>,
): number {
  if (!countryAffinity) return 1;

  const configured =
    countryAffinity[countryPairKey(origin.country, destination.country)];

  return configured === undefined ? 1 : clamp(configured, 0.5, 1.5);
}

/**
 * Stable market size. This must never inspect the player's fleet, routes,
 * prices, trust, cash, or rival airlines.
 */
export function baselineDemandForMarket(params: {
  gameSeed: string;
  origin: Airport;
  destination: Airport;
  distanceNm?: number;
  countryAffinity?: Readonly<Record<string, number>>;
}): number {
  const distanceNm =
    params.distanceNm ?? marketDistanceNm(params.origin, params.destination);
  const distanceKm = distanceNm * 1.852;
  const originTraffic = airportTrafficMillions(params.origin);
  const destinationTraffic = airportTrafficMillions(params.destination);
  const airportPower = Math.sqrt(originTraffic * destinationTraffic);
  const distanceDecay = 1 + distanceKm / 4_000;
  const relationship = marketRelationship(params.origin, params.destination);
  const relationshipMultiplier = RELATIONSHIP_MULTIPLIER[relationship];
  const explicitAffinity = affinityMultiplier(
    params.origin,
    params.destination,
    params.countryAffinity,
  );
  const stableVariance = seedFloat(
    0.88,
    1.12,
    params.gameSeed,
    passengerMarketId(params.origin.iata, params.destination.iata),
    "market-baseline",
  );

  const rawDemand =
    ((airportPower * 10) / distanceDecay) *
    relationshipMultiplier *
    explicitAffinity *
    stableVariance;

  return Math.round(clamp(rawDemand, 8, 600));
}

export function createPassengerMarket(
  params: CreatePassengerMarketParams,
): PassengerMarket {
  const distanceNm = marketDistanceNm(params.origin, params.destination);
  const mix = passengerMixFromDistance(distanceNm);

  return {
    id: passengerMarketId(params.origin.iata, params.destination.iata),
    originIata: normalizedIata(params.origin.iata),
    destinationIata: normalizedIata(params.destination.iata),
    distanceNm,
    haul: marketHaulClass(distanceNm),
    relationship: marketRelationship(params.origin, params.destination),
    baselineDailyDemand: baselineDemandForMarket({
      gameSeed: params.gameSeed,
      origin: params.origin,
      destination: params.destination,
      distanceNm,
      countryAffinity: params.countryAffinity,
    }),
    businessShare: mix.businessPct,
    leisureShare: mix.leisurePct,
    generatedDay: Math.max(1, Math.floor(params.generatedDay ?? 1)),
  };
}

/**
 * Calculates total travelers in the market for one day. Airline trust, fares,
 * schedules, and rival strength belong in passenger choice, not here.
 */
export function calculateDailyPassengerDemand(
  params: CalculateDailyDemandParams,
): DailyPassengerDemand {
  const gameDay = Math.max(1, Math.floor(params.gameDay));
  const seasonalMultiplier = getSeasonalMultiplier(
    gameDay,
    params.destination.country,
    params.destination.continent,
  );
  const dailyVariationMultiplier = seedFloat(
    0.94,
    1.06,
    params.gameSeed,
    params.market.id,
    gameDay,
    "daily-market-demand",
  );
  const eventMultiplier = clamp(params.eventMultiplier ?? 1, 0.5, 1.75);
  const todayDemand = Math.max(
    1,
    Math.round(
      params.market.baselineDailyDemand *
        seasonalMultiplier *
        dailyVariationMultiplier *
        eventMultiplier,
    ),
  );

  return {
    marketId: params.market.id,
    gameDay,
    baselineDemand: params.market.baselineDailyDemand,
    seasonalMultiplier,
    dailyVariationMultiplier,
    eventMultiplier,
    todayDemand,
  };
}

/**
 * The best owned aircraft defines the range of automatic opportunities.
 * Assigned aircraft still count because the player may reassign them.
 */
export function opportunityOperatingRangeNm(
  ownedPlanes: readonly OwnedPlane[],
): number {
  if (ownedPlanes.length === 0) return STARTER_OPPORTUNITY_RANGE_NM;

  return Math.max(
    0,
    ...ownedPlanes.map((plane) =>
      Math.max(0, finiteOr(plane.plane_model.range_nm, 0)),
    ),
  );
}

export function evaluateOpportunityAircraftFit(params: {
  distanceNm: number;
  ownedPlanes: readonly OwnedPlane[];
}): OpportunityAircraftFit {
  const routeDistanceNm = Math.max(0, Math.round(params.distanceNm));
  const operatingRangeNm = opportunityOperatingRangeNm(params.ownedPlanes);
  const capablePlanes = params.ownedPlanes
    .filter((plane) => plane.plane_model.range_nm >= routeDistanceNm)
    .sort((a, b) => {
      const rangeDifference = a.plane_model.range_nm - b.plane_model.range_nm;
      if (rangeDifference !== 0) return rangeDifference;

      const capacityDifference =
        a.plane_model.pax_capacity - b.plane_model.pax_capacity;
      if (capacityDifference !== 0) return capacityDifference;

      return a.id.localeCompare(b.id);
    });
  const idleCapablePlanes = capablePlanes.filter((plane) => !plane.route_id);
  const recommendedPlane = idleCapablePlanes[0] ?? capablePlanes[0] ?? null;

  let state: OpportunityAircraftState;

  if (params.ownedPlanes.length === 0) {
    state =
      routeDistanceNm <= STARTER_OPPORTUNITY_RANGE_NM
        ? "aircraft_required"
        : "out_of_range";
  } else if (capablePlanes.length === 0) {
    state = "out_of_range";
  } else if (idleCapablePlanes.length === 0) {
    state = "reassignment_required";
  } else {
    state = "ready";
  }

  return {
    state,
    routeDistanceNm,
    operatingRangeNm,
    capablePlaneIds: capablePlanes.map((plane) => plane.id),
    idleCapablePlaneIds: idleCapablePlanes.map((plane) => plane.id),
    recommendedPlaneId: recommendedPlane?.id ?? null,
  };
}

export function opportunityCountForHubTier(hubTier: HubTier): number {
  return ROUTE_OPPORTUNITIES_BY_HUB_TIER[hubTier];
}

function opportunityDistanceBand(
  distanceNm: number,
  operatingRangeNm: number,
): OpportunityDistanceBand {
  const usableRange = Math.max(1, operatingRangeNm);
  const rangeUse = distanceNm / usableRange;

  if (rangeUse <= 0.35) return "near";
  if (rangeUse <= 0.7) return "core";
  return "reach";
}

function opportunityScore(params: {
  gameSeed: string;
  gameDay: number;
  hub: Airport;
  destination: Airport;
  market: PassengerMarket;
}): number {
  const demandScore = Math.log2(params.market.baselineDailyDemand + 1) * 100;
  const airportScore = AIRPORT_TIER_SCORE[params.destination.tier] * 12;
  const variety = seedFloat(
    0.85,
    1.15,
    params.gameSeed,
    params.gameDay,
    params.hub.iata,
    params.destination.iata,
    "route-opportunity",
  );

  return (demandScore + airportScore) * variety;
}

function validAirportCoordinates(airport: Airport): boolean {
  return (
    Number.isFinite(airport.lat) &&
    Number.isFinite(airport.lng) &&
    airport.lat >= -90 &&
    airport.lat <= 90 &&
    airport.lng >= -180 &&
    airport.lng <= 180
  );
}

/**
 * Creates direct-route suggestions only. It never generates a longer route as
 * a fallback when the fleet has no suitable aircraft.
 */
export function generateRouteOpportunities(
  params: GenerateRouteOpportunitiesParams,
): RouteOpportunity[] {
  const requestedCount = Math.max(
    0,
    Math.floor(
      params.count ??
        (params.hubTier
          ? opportunityCountForHubTier(params.hubTier)
          : DEFAULT_ROUTE_OPPORTUNITY_COUNT),
    ),
  );

  if (requestedCount === 0 || !validAirportCoordinates(params.hub)) return [];

  const gameDay = Math.max(1, Math.floor(params.gameDay));
  const operatingRangeNm = opportunityOperatingRangeNm(params.ownedPlanes);
  const excluded = new Set(
    (params.excludedDestinationIatas ?? []).map(normalizedIata),
  );
  excluded.add(normalizedIata(params.hub.iata));

  const candidates: OpportunityCandidate[] = [];

  for (const destination of params.airports) {
    const destinationIata = normalizedIata(destination.iata ?? "");
    if (!destinationIata || excluded.has(destinationIata)) continue;
    if (!validAirportCoordinates(destination)) continue;

    const distanceNm = marketDistanceNm(params.hub, destination);
    if (distanceNm < MIN_OPPORTUNITY_DISTANCE_NM) continue;
    if (distanceNm > operatingRangeNm) continue;

    const market = createPassengerMarket({
      gameSeed: params.gameSeed,
      origin: params.hub,
      destination,
      generatedDay: gameDay,
      countryAffinity: params.countryAffinity,
    });

    candidates.push({
      destination,
      market,
      band: opportunityDistanceBand(distanceNm, operatingRangeNm),
      score: opportunityScore({
        gameSeed: params.gameSeed,
        gameDay,
        hub: params.hub,
        destination,
        market,
      }),
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.destination.iata.localeCompare(b.destination.iata);
  });

  const remaining = new Map(
    candidates.map((candidate) => [candidate.destination.iata, candidate]),
  );
  const selected: OpportunityCandidate[] = [];
  const slotOffset = Math.max(0, Math.floor(params.slotOffset ?? 0));

  for (let slot = 0; slot < requestedCount && remaining.size > 0; slot++) {
    const requestedBand =
      OPPORTUNITY_BAND_ORDER[
        (slot + slotOffset) % OPPORTUNITY_BAND_ORDER.length
      ];
    const candidate =
      candidates.find(
        (item) =>
          remaining.has(item.destination.iata) && item.band === requestedBand,
      ) ?? candidates.find((item) => remaining.has(item.destination.iata));

    if (!candidate) break;

    selected.push(candidate);
    remaining.delete(candidate.destination.iata);
  }

  return selected.map((candidate, index) => ({
    id: `opportunity:${normalizedIata(params.hub.iata)}>${normalizedIata(
      candidate.destination.iata,
    )}:${gameDay}:${slotOffset + index}`,
    hubIata: normalizedIata(params.hub.iata),
    destinationIata: normalizedIata(candidate.destination.iata),
    market: candidate.market,
    distanceBand: candidate.band,
    aircraftFit: evaluateOpportunityAircraftFit({
      distanceNm: candidate.market.distanceNm,
      ownedPlanes: params.ownedPlanes,
    }),
    generatedDay: gameDay,
  }));
}

/** Deterministic order helper for persistence or snapshot tests. */
export function comparePassengerMarkets(
  left: PassengerMarket,
  right: PassengerMarket,
): number {
  const originCompare = left.originIata.localeCompare(right.originIata);
  if (originCompare !== 0) return originCompare;

  return left.destinationIata.localeCompare(right.destinationIata);
}

/** A stable integer useful when a caller needs a market-specific selection. */
export function passengerMarketSeed(
  gameSeed: string,
  market: Pick<PassengerMarket, "id">,
  purpose: string,
): number {
  return seedHash(gameSeed, market.id, purpose);
}
