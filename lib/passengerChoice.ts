/**
 * lib/passengerChoice.ts
 *
 * Allocates one passenger market across complete airline itineraries.
 *
 * This is the only layer that decides which airline passengers prefer. It does
 * not board passengers, apply aircraft capacity, change trust, or create new
 * demand. Those decisions belong to operations and day-end settlement.
 */

import type { PassengerItinerary } from "@/lib/itineraryEngine";
import type {
  DailyPassengerDemand,
  PassengerMarket,
} from "@/lib/passengerMarkets";
import { passengerElasticityMultiplier } from "@/lib/passengerTypes";
import { priceStrategyConfig } from "@/lib/revenue";
import { seedHash } from "@/lib/seed";

export const CHOICE_SCORE_LIMITS = {
  trust: 30,
  fare: 25,
  directness: 30,
  routeEfficiency: 15,
  total: 100,
} as const;

export const DEFAULT_AIRLINE_TRUST = 50;

export type PassengerChoiceStatus =
  "allocated" | "no_demand" | "no_complete_itinerary";

export type ChoiceFactor = "trust" | "fare" | "directness" | "route_efficiency";

export interface AirlineChoiceProfile {
  airlineId: string;
  /** Trust at the market's origin hub, from 0 through 100. */
  trust: number;
}

export interface ChoiceScoreBreakdown {
  trust: number;
  fare: number;
  directness: number;
  routeEfficiency: number;
  total: number;
  dominantFactor: ChoiceFactor;
}

export interface PassengerPreferenceAllocation {
  marketId: string;
  itineraryId: string;
  airlineId: string;
  operatorKind: PassengerItinerary["operatorKind"];
  preferredPassengers: number;
  preferenceShare: number;
  choiceWeight: number;
  score: ChoiceScoreBreakdown;
  availableSeats: number;
}

export interface AirlinePreferenceSummary {
  marketId: string;
  airlineId: string;
  operatorKind: PassengerItinerary["operatorKind"];
  preferredPassengers: number;
  preferenceShare: number;
  availableSeats: number;
  itineraryIds: string[];
}

export interface PassengerChoiceResult {
  marketId: string;
  gameDay: number;
  status: PassengerChoiceStatus;
  totalDemand: number;
  allocatedPassengers: number;
  unallocatedPassengers: number;
  allocations: PassengerPreferenceAllocation[];
  airlines: AirlinePreferenceSummary[];
  ignoredItineraryCount: number;
}

export interface AllocatePassengerChoiceParams {
  gameSeed: string;
  market: PassengerMarket;
  dailyDemand: Pick<DailyPassengerDemand, "gameDay" | "todayDemand">;
  itineraries: readonly PassengerItinerary[];
  airlineProfiles: readonly AirlineChoiceProfile[];
}

interface WeightedItinerary {
  itinerary: PassengerItinerary;
  score: ChoiceScoreBreakdown;
  weight: number;
  exactPassengers: number;
  preferredPassengers: number;
  remainder: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizedDemand(value: number): number {
  return Math.max(0, Math.round(finiteOr(value, 0)));
}

function normalizedTrust(value: number): number {
  return clamp(finiteOr(value, DEFAULT_AIRLINE_TRUST), 0, 100);
}

function trustScore(trust: number): number {
  return (normalizedTrust(trust) / 100) * CHOICE_SCORE_LIMITS.trust;
}

function fareScore(params: {
  itinerary: PassengerItinerary;
  market: PassengerMarket;
}): number {
  const passengerElasticity = passengerElasticityMultiplier({
    businessPct: params.market.businessShare,
    leisurePct: params.market.leisureShare,
  });
  const pricing = priceStrategyConfig(
    params.itinerary.priceStrategy,
    passengerElasticity,
  );

  // Standard fare anchors at 20. Low fares gain a modest advantage, while
  // premium pricing loses more leisure travelers than business travelers.
  const score = 20 + (1 - pricing.fareMultiplier) * 22 * passengerElasticity;

  return clamp(score, 5, CHOICE_SCORE_LIMITS.fare);
}

function directnessScore(itinerary: PassengerItinerary): number {
  if (itinerary.stopCount <= 0) return CHOICE_SCORE_LIMITS.directness;
  if (itinerary.stopCount === 1) return 18;
  return 0;
}

function routeEfficiencyScore(itinerary: PassengerItinerary): number {
  const detourRatio = Math.max(1, finiteOr(itinerary.detourRatio, 1));
  const detourPenalty = (detourRatio - 1) * 20;

  return clamp(
    CHOICE_SCORE_LIMITS.routeEfficiency - detourPenalty,
    0,
    CHOICE_SCORE_LIMITS.routeEfficiency,
  );
}

function dominantChoiceFactor(
  score: Omit<ChoiceScoreBreakdown, "total" | "dominantFactor">,
): ChoiceFactor {
  const normalizedFactors: { factor: ChoiceFactor; strength: number }[] = [
    {
      factor: "trust",
      strength: score.trust / CHOICE_SCORE_LIMITS.trust,
    },
    {
      factor: "fare",
      strength: score.fare / CHOICE_SCORE_LIMITS.fare,
    },
    {
      factor: "directness",
      strength: score.directness / CHOICE_SCORE_LIMITS.directness,
    },
    {
      factor: "route_efficiency",
      strength: score.routeEfficiency / CHOICE_SCORE_LIMITS.routeEfficiency,
    },
  ];

  normalizedFactors.sort((left, right) => {
    if (right.strength !== left.strength) {
      return right.strength - left.strength;
    }
    return left.factor.localeCompare(right.factor);
  });

  return normalizedFactors[0].factor;
}

/**
 * Scores one valid itinerary on the agreed 100-point scale:
 * trust 30, fare 25, directness 30, and route efficiency 15.
 */
export function scorePassengerItinerary(params: {
  market: PassengerMarket;
  itinerary: PassengerItinerary;
  airlineTrust: number;
}): ChoiceScoreBreakdown {
  const partial = {
    trust: trustScore(params.airlineTrust),
    fare: fareScore({
      itinerary: params.itinerary,
      market: params.market,
    }),
    directness: directnessScore(params.itinerary),
    routeEfficiency: routeEfficiencyScore(params.itinerary),
  };
  const total = clamp(
    partial.trust + partial.fare + partial.directness + partial.routeEfficiency,
    0,
    CHOICE_SCORE_LIMITS.total,
  );

  return {
    trust: roundTo(partial.trust, 2),
    fare: roundTo(partial.fare, 2),
    directness: roundTo(partial.directness, 2),
    routeEfficiency: roundTo(partial.routeEfficiency, 2),
    total: roundTo(total, 2),
    dominantFactor: dominantChoiceFactor(partial),
  };
}

/**
 * Converts a score to a logit-style choice weight. Score differences matter,
 * but a weaker complete itinerary can still attract some passengers.
 */
export function choiceWeightFromScore(score: number): number {
  const safeScore = clamp(finiteOr(score, 0), 0, 100);
  return Math.exp((safeScore - 50) / 15);
}

function allocateLargestRemainders(params: {
  gameSeed: string;
  gameDay: number;
  marketId: string;
  totalDemand: number;
  weighted: Omit<
    WeightedItinerary,
    "exactPassengers" | "preferredPassengers" | "remainder"
  >[];
}): WeightedItinerary[] {
  const totalWeight = params.weighted.reduce(
    (total, item) => total + item.weight,
    0,
  );

  if (totalWeight <= 0 || params.totalDemand <= 0) {
    return params.weighted.map((item) => ({
      ...item,
      exactPassengers: 0,
      preferredPassengers: 0,
      remainder: 0,
    }));
  }

  const allocated = params.weighted.map((item) => {
    const exactPassengers = (params.totalDemand * item.weight) / totalWeight;
    const preferredPassengers = Math.floor(exactPassengers);

    return {
      ...item,
      exactPassengers,
      preferredPassengers,
      remainder: exactPassengers - preferredPassengers,
    };
  });

  let passengersLeft =
    params.totalDemand -
    allocated.reduce((total, item) => total + item.preferredPassengers, 0);

  const remainderOrder = [...allocated].sort((left, right) => {
    if (right.remainder !== left.remainder) {
      return right.remainder - left.remainder;
    }

    const leftTie = seedHash(
      params.gameSeed,
      params.marketId,
      params.gameDay,
      left.itinerary.id,
      "choice-rounding",
    );
    const rightTie = seedHash(
      params.gameSeed,
      params.marketId,
      params.gameDay,
      right.itinerary.id,
      "choice-rounding",
    );

    if (leftTie !== rightTie) return leftTie - rightTie;
    return left.itinerary.id.localeCompare(right.itinerary.id);
  });

  for (let index = 0; passengersLeft > 0; index++) {
    const target = remainderOrder[index % remainderOrder.length];
    target.preferredPassengers++;
    passengersLeft--;
  }

  return allocated;
}

function summarizeAirlines(params: {
  marketId: string;
  totalDemand: number;
  allocations: readonly PassengerPreferenceAllocation[];
}): AirlinePreferenceSummary[] {
  const summaries = new Map<string, AirlinePreferenceSummary>();

  for (const allocation of params.allocations) {
    const key = `${allocation.operatorKind}:${allocation.airlineId}`;
    const existing = summaries.get(key);

    if (existing) {
      existing.preferredPassengers += allocation.preferredPassengers;
      existing.availableSeats += allocation.availableSeats;
      existing.itineraryIds.push(allocation.itineraryId);
      continue;
    }

    summaries.set(key, {
      marketId: params.marketId,
      airlineId: allocation.airlineId,
      operatorKind: allocation.operatorKind,
      preferredPassengers: allocation.preferredPassengers,
      preferenceShare: 0,
      availableSeats: allocation.availableSeats,
      itineraryIds: [allocation.itineraryId],
    });
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      itineraryIds: Array.from(new Set(summary.itineraryIds)).sort(),
      preferenceShare:
        params.totalDemand > 0
          ? summary.preferredPassengers / params.totalDemand
          : 0,
    }))
    .sort((left, right) => {
      if (left.preferredPassengers !== right.preferredPassengers) {
        return right.preferredPassengers - left.preferredPassengers;
      }
      return left.airlineId.localeCompare(right.airlineId);
    });
}

/**
 * Allocates all travelers with a complete itinerary. Available seats are
 * reported but not enforced here, so operations can measure how much
 * player-preferred demand was actually carried for trust settlement.
 */
export function allocatePassengerChoice(
  params: AllocatePassengerChoiceParams,
): PassengerChoiceResult {
  const totalDemand = normalizedDemand(params.dailyDemand.todayDemand);
  const profileByAirline = new Map(
    params.airlineProfiles.map((profile) => [
      profile.airlineId,
      normalizedTrust(profile.trust),
    ]),
  );
  const eligibleItineraries = params.itineraries.filter(
    (itinerary) =>
      itinerary.marketId === params.market.id && itinerary.availableSeats > 0,
  );
  const ignoredItineraryCount =
    params.itineraries.length - eligibleItineraries.length;

  if (totalDemand <= 0) {
    return {
      marketId: params.market.id,
      gameDay: params.dailyDemand.gameDay,
      status: "no_demand",
      totalDemand: 0,
      allocatedPassengers: 0,
      unallocatedPassengers: 0,
      allocations: [],
      airlines: [],
      ignoredItineraryCount,
    };
  }

  if (eligibleItineraries.length === 0) {
    return {
      marketId: params.market.id,
      gameDay: params.dailyDemand.gameDay,
      status: "no_complete_itinerary",
      totalDemand,
      allocatedPassengers: 0,
      unallocatedPassengers: totalDemand,
      allocations: [],
      airlines: [],
      ignoredItineraryCount,
    };
  }

  const weighted = eligibleItineraries.map((itinerary) => {
    const airlineTrust =
      profileByAirline.get(itinerary.airlineId) ?? DEFAULT_AIRLINE_TRUST;
    const score = scorePassengerItinerary({
      market: params.market,
      itinerary,
      airlineTrust,
    });

    return {
      itinerary,
      score,
      weight: choiceWeightFromScore(score.total),
    };
  });
  const allocated = allocateLargestRemainders({
    gameSeed: params.gameSeed,
    gameDay: params.dailyDemand.gameDay,
    marketId: params.market.id,
    totalDemand,
    weighted,
  });
  const totalWeight = allocated.reduce((total, item) => total + item.weight, 0);
  const allocations = allocated
    .map<PassengerPreferenceAllocation>((item) => ({
      marketId: params.market.id,
      itineraryId: item.itinerary.id,
      airlineId: item.itinerary.airlineId,
      operatorKind: item.itinerary.operatorKind,
      preferredPassengers: item.preferredPassengers,
      preferenceShare: totalWeight > 0 ? item.weight / totalWeight : 0,
      choiceWeight: roundTo(item.weight, 4),
      score: item.score,
      availableSeats: item.itinerary.availableSeats,
    }))
    .sort((left, right) => {
      if (left.preferredPassengers !== right.preferredPassengers) {
        return right.preferredPassengers - left.preferredPassengers;
      }
      return left.itineraryId.localeCompare(right.itineraryId);
    });
  const allocatedPassengers = allocations.reduce(
    (total, allocation) => total + allocation.preferredPassengers,
    0,
  );

  return {
    marketId: params.market.id,
    gameDay: params.dailyDemand.gameDay,
    status: "allocated",
    totalDemand,
    allocatedPassengers,
    unallocatedPassengers: Math.max(0, totalDemand - allocatedPassengers),
    allocations,
    airlines: summarizeAirlines({
      marketId: params.market.id,
      totalDemand,
      allocations,
    }),
    ignoredItineraryCount,
  };
}

export function preferredPassengersForAirline(params: {
  airlineId: string;
  result: PassengerChoiceResult;
}): number {
  return (
    params.result.airlines.find(
      (summary) => summary.airlineId === params.airlineId,
    )?.preferredPassengers ?? 0
  );
}

export function preferenceShareForAirline(params: {
  airlineId: string;
  result: PassengerChoiceResult;
}): number {
  return (
    params.result.airlines.find(
      (summary) => summary.airlineId === params.airlineId,
    )?.preferenceShare ?? 0
  );
}
