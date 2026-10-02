/**
 * lib/passengerFlow.ts
 *
 * Capacity and boarding authority for FlightCraft passenger markets.
 *
 * Processing order:
 * 1. passengerMarkets creates today's origin-destination demand.
 * 2. itineraryEngine identifies complete journeys.
 * 3. passengerChoice records which itinerary each passenger group prefers.
 * 4. passengerFlow applies scheduled capacity and records who actually travels.
 * 5. Day settlement uses player-preferred demand and carried passengers for
 *    trust. Rival-preferred passengers never reduce player trust.
 *
 * The compatibility helpers at the bottom keep current screens and hooks
 * compiling while they are migrated to the new market pipeline.
 */

import type { PassengerItinerary } from "@/lib/itineraryEngine";
import type {
  PassengerChoiceResult,
  PassengerPreferenceAllocation,
} from "@/lib/passengerChoice";
import { dailyFlights } from "@/lib/revenue";
import type { Demand, DemandStatus, Route } from "@/store";

export type MarketFlowStatus =
  | "no_demand"
  | "no_complete_itinerary"
  | "unserved"
  | "partially_served"
  | "fully_served";

export type ItineraryFlowStatus =
  "no_preference" | "unserved" | "partially_served" | "carried";

export type CapacitySource = "scheduled" | "itinerary_fallback";

export interface ScheduledServiceCapacity {
  itineraryId: string;
  routeId: string;
  aircraftId: string;
  seatCapacity: number;
  /** Number of passenger departures available during this settlement window. */
  departures?: number;
  /** Operational availability after condition, disruption, or cancellation. */
  operationalAvailability?: number;
}

export interface ServiceOperationResult {
  itineraryId: string;
  routeId: string;
  aircraftId: string;
  capacitySource: CapacitySource;
  scheduledCapacity: number;
  carriedPassengers: number;
  unusedSeats: number;
  loadFactor: number;
}

/**
 * Aggregate passenger group. Individual passenger objects are intentionally
 * unnecessary for the simulation.
 */
export interface PassengerAllocation {
  marketId: string;
  itineraryId: string;
  airlineId: string;
  operatorKind: PassengerItinerary["operatorKind"];
  preferredPassengers: number;
  bookedPassengers: number;
  carriedPassengers: number;
  unservedPreferredPassengers: number;
  scheduledCapacity: number;
  loadFactor: number;
  status: ItineraryFlowStatus;
  services: ServiceOperationResult[];
}

export interface AirlineFlowSummary {
  marketId: string;
  airlineId: string;
  operatorKind: PassengerItinerary["operatorKind"];
  preferredPassengers: number;
  bookedPassengers: number;
  carriedPassengers: number;
  unservedPreferredPassengers: number;
  scheduledCapacity: number;
  serviceRate: number | null;
  itineraryIds: string[];
}

export interface PassengerMarketFlowResult {
  marketId: string;
  gameDay: number;
  status: MarketFlowStatus;
  totalDemand: number;
  noItineraryPassengers: number;
  preferredPassengers: number;
  bookedPassengers: number;
  carriedPassengers: number;
  unservedPreferredPassengers: number;
  allocations: PassengerAllocation[];
  airlines: AirlineFlowSummary[];
  ignoredCapacityCount: number;
}

export interface ResolvePassengerFlowParams {
  choice: PassengerChoiceResult;
  itineraries: readonly PassengerItinerary[];
  serviceCapacities?: readonly ScheduledServiceCapacity[];
}

export interface TrustServiceResult {
  eligible: boolean;
  serviceRate: number | null;
  serviceRatePercent: number | null;
  trustDelta: number;
  reason: "no_player_preference" | "grace_period" | "service_result";
}

interface NormalizedServiceCapacity {
  itineraryId: string;
  routeId: string;
  aircraftId: string;
  capacitySource: CapacitySource;
  scheduledCapacity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value: number | null | undefined): number {
  return Math.max(0, Math.floor(finiteOr(value)));
}

function normalizedAvailability(value?: number): number {
  return clamp(finiteOr(value, 1), 0, 1);
}

export function scheduledPassengerCapacity(params: {
  seatCapacity: number;
  departures?: number;
  operationalAvailability?: number;
}): number {
  const seats = nonNegativeInteger(params.seatCapacity);
  const departures = nonNegativeInteger(params.departures ?? 1);
  const availability = normalizedAvailability(params.operationalAvailability);

  return Math.max(0, Math.floor(seats * departures * availability));
}

function normalizeScheduledService(
  service: ScheduledServiceCapacity,
): NormalizedServiceCapacity {
  return {
    itineraryId: service.itineraryId,
    routeId: service.routeId,
    aircraftId: service.aircraftId,
    capacitySource: "scheduled",
    scheduledCapacity: scheduledPassengerCapacity(service),
  };
}

function distributeIntegerEvenly(
  total: number,
  keys: readonly string[],
): Map<string, number> {
  const allocation = new Map<string, number>();
  if (keys.length === 0) return allocation;

  const safeTotal = nonNegativeInteger(total);
  const base = Math.floor(safeTotal / keys.length);
  let remainder = safeTotal - base * keys.length;

  [...keys].sort().forEach((key) => {
    const extra = remainder > 0 ? 1 : 0;
    allocation.set(key, base + extra);
    remainder -= extra;
  });

  return allocation;
}

function fallbackServicesForItinerary(
  itinerary: PassengerItinerary,
): NormalizedServiceCapacity[] {
  const routeIds =
    itinerary.routeIds.length > 0 ? itinerary.routeIds : [itinerary.id];
  const aircraftIds =
    itinerary.aircraftIds.length > 0
      ? itinerary.aircraftIds
      : ["unknown-aircraft"];
  const capacityByRoute = distributeIntegerEvenly(
    itinerary.availableSeats,
    routeIds,
  );

  return routeIds.map((routeId, index) => ({
    itineraryId: itinerary.id,
    routeId,
    aircraftId: aircraftIds[index % aircraftIds.length],
    capacitySource: "itinerary_fallback",
    scheduledCapacity: capacityByRoute.get(routeId) ?? 0,
  }));
}

function capacityServicesForItinerary(params: {
  itinerary: PassengerItinerary;
  services: readonly ScheduledServiceCapacity[];
}): NormalizedServiceCapacity[] {
  const validRouteIds = new Set(params.itinerary.routeIds);
  const validAircraftIds = new Set(params.itinerary.aircraftIds);
  const scheduled = params.services
    .filter((service) => service.itineraryId === params.itinerary.id)
    .filter(
      (service) =>
        validRouteIds.has(service.routeId) &&
        validAircraftIds.has(service.aircraftId),
    )
    .map(normalizeScheduledService);

  return scheduled.length > 0
    ? scheduled
    : fallbackServicesForItinerary(params.itinerary);
}

function allocateAcrossServices(params: {
  carriedPassengers: number;
  services: readonly NormalizedServiceCapacity[];
}): ServiceOperationResult[] {
  const totalCapacity = params.services.reduce(
    (total, service) => total + service.scheduledCapacity,
    0,
  );
  const passengersToPlace = Math.min(
    nonNegativeInteger(params.carriedPassengers),
    totalCapacity,
  );

  if (totalCapacity <= 0) {
    return params.services.map((service) => ({
      ...service,
      carriedPassengers: 0,
      unusedSeats: 0,
      loadFactor: 0,
    }));
  }

  const prepared = params.services.map((service) => {
    const exactPassengers =
      (passengersToPlace * service.scheduledCapacity) / totalCapacity;
    const carriedPassengers = Math.min(
      service.scheduledCapacity,
      Math.floor(exactPassengers),
    );

    return {
      service,
      remainder: exactPassengers - carriedPassengers,
      carriedPassengers,
    };
  });
  let passengersLeft =
    passengersToPlace -
    prepared.reduce((total, item) => total + item.carriedPassengers, 0);
  const remainderOrder = [...prepared].sort((left, right) => {
    if (right.remainder !== left.remainder) {
      return right.remainder - left.remainder;
    }
    const routeCompare = left.service.routeId.localeCompare(
      right.service.routeId,
    );
    if (routeCompare !== 0) return routeCompare;
    return left.service.aircraftId.localeCompare(right.service.aircraftId);
  });

  for (let index = 0; passengersLeft > 0; index++) {
    const item = remainderOrder[index % remainderOrder.length];
    if (item.carriedPassengers >= item.service.scheduledCapacity) continue;
    item.carriedPassengers++;
    passengersLeft--;
  }

  return prepared.map(({ service, carriedPassengers }) => ({
    ...service,
    carriedPassengers,
    unusedSeats: Math.max(0, service.scheduledCapacity - carriedPassengers),
    loadFactor:
      service.scheduledCapacity > 0
        ? carriedPassengers / service.scheduledCapacity
        : 0,
  }));
}

function itineraryFlowStatus(params: {
  preferredPassengers: number;
  carriedPassengers: number;
}): ItineraryFlowStatus {
  if (params.preferredPassengers <= 0) return "no_preference";
  if (params.carriedPassengers <= 0) return "unserved";
  if (params.carriedPassengers < params.preferredPassengers) {
    return "partially_served";
  }
  return "carried";
}

function resolvePreferenceAllocation(params: {
  preference: PassengerPreferenceAllocation;
  itinerary: PassengerItinerary;
  services: readonly ScheduledServiceCapacity[];
}): PassengerAllocation {
  const preferredPassengers = nonNegativeInteger(
    params.preference.preferredPassengers,
  );
  const capacityServices = capacityServicesForItinerary({
    itinerary: params.itinerary,
    services: params.services,
  });
  const scheduledCapacity = capacityServices.reduce(
    (total, service) => total + service.scheduledCapacity,
    0,
  );
  const bookedPassengers = Math.min(preferredPassengers, scheduledCapacity);
  const carriedPassengers = bookedPassengers;
  const serviceResults = allocateAcrossServices({
    carriedPassengers,
    services: capacityServices,
  });

  return {
    marketId: params.preference.marketId,
    itineraryId: params.preference.itineraryId,
    airlineId: params.preference.airlineId,
    operatorKind: params.preference.operatorKind,
    preferredPassengers,
    bookedPassengers,
    carriedPassengers,
    unservedPreferredPassengers: Math.max(
      0,
      preferredPassengers - carriedPassengers,
    ),
    scheduledCapacity,
    loadFactor:
      scheduledCapacity > 0 ? carriedPassengers / scheduledCapacity : 0,
    status: itineraryFlowStatus({
      preferredPassengers,
      carriedPassengers,
    }),
    services: serviceResults,
  };
}

function summarizeAirlineFlow(params: {
  marketId: string;
  allocations: readonly PassengerAllocation[];
}): AirlineFlowSummary[] {
  const summaries = new Map<string, AirlineFlowSummary>();

  for (const allocation of params.allocations) {
    const key = `${allocation.operatorKind}:${allocation.airlineId}`;
    const existing = summaries.get(key);

    if (existing) {
      existing.preferredPassengers += allocation.preferredPassengers;
      existing.bookedPassengers += allocation.bookedPassengers;
      existing.carriedPassengers += allocation.carriedPassengers;
      existing.unservedPreferredPassengers +=
        allocation.unservedPreferredPassengers;
      existing.scheduledCapacity += allocation.scheduledCapacity;
      existing.itineraryIds.push(allocation.itineraryId);
      continue;
    }

    summaries.set(key, {
      marketId: params.marketId,
      airlineId: allocation.airlineId,
      operatorKind: allocation.operatorKind,
      preferredPassengers: allocation.preferredPassengers,
      bookedPassengers: allocation.bookedPassengers,
      carriedPassengers: allocation.carriedPassengers,
      unservedPreferredPassengers: allocation.unservedPreferredPassengers,
      scheduledCapacity: allocation.scheduledCapacity,
      serviceRate: null,
      itineraryIds: [allocation.itineraryId],
    });
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      itineraryIds: Array.from(new Set(summary.itineraryIds)).sort(),
      serviceRate:
        summary.preferredPassengers > 0
          ? summary.carriedPassengers / summary.preferredPassengers
          : null,
    }))
    .sort((left, right) => {
      if (left.carriedPassengers !== right.carriedPassengers) {
        return right.carriedPassengers - left.carriedPassengers;
      }
      return left.airlineId.localeCompare(right.airlineId);
    });
}

function marketFlowStatus(params: {
  choice: PassengerChoiceResult;
  preferredPassengers: number;
  carriedPassengers: number;
}): MarketFlowStatus {
  if (params.choice.totalDemand <= 0) return "no_demand";
  if (params.preferredPassengers <= 0) return "no_complete_itinerary";
  if (params.carriedPassengers <= 0) return "unserved";
  if (params.carriedPassengers < params.preferredPassengers) {
    return "partially_served";
  }
  return "fully_served";
}

/**
 * Applies scheduled capacity once to the preference result. No other system
 * should independently capture, steal, or board the same passengers.
 */
export function resolvePassengerFlow(
  params: ResolvePassengerFlowParams,
): PassengerMarketFlowResult {
  const itineraryById = new Map(
    params.itineraries
      .filter((itinerary) => itinerary.marketId === params.choice.marketId)
      .map((itinerary) => [itinerary.id, itinerary]),
  );
  const services = params.serviceCapacities ?? [];
  const unmatchedPreferencePassengers = params.choice.allocations.reduce(
    (total, preference) =>
      itineraryById.has(preference.itineraryId)
        ? total
        : total + nonNegativeInteger(preference.preferredPassengers),
    0,
  );
  const allocations = params.choice.allocations.flatMap((preference) => {
    const itinerary = itineraryById.get(preference.itineraryId);
    if (!itinerary) return [];

    return [
      resolvePreferenceAllocation({
        preference,
        itinerary,
        services,
      }),
    ];
  });
  const preferredPassengers = allocations.reduce(
    (total, allocation) => total + allocation.preferredPassengers,
    0,
  );
  const bookedPassengers = allocations.reduce(
    (total, allocation) => total + allocation.bookedPassengers,
    0,
  );
  const carriedPassengers = allocations.reduce(
    (total, allocation) => total + allocation.carriedPassengers,
    0,
  );
  const unservedPreferredPassengers = allocations.reduce(
    (total, allocation) => total + allocation.unservedPreferredPassengers,
    0,
  );
  const validItineraryIds = new Set(itineraryById.keys());
  const ignoredCapacityCount = services.filter(
    (service) => !validItineraryIds.has(service.itineraryId),
  ).length;

  return {
    marketId: params.choice.marketId,
    gameDay: params.choice.gameDay,
    status: marketFlowStatus({
      choice: params.choice,
      preferredPassengers,
      carriedPassengers,
    }),
    totalDemand: params.choice.totalDemand,
    noItineraryPassengers:
      params.choice.unallocatedPassengers + unmatchedPreferencePassengers,
    preferredPassengers,
    bookedPassengers,
    carriedPassengers,
    unservedPreferredPassengers,
    allocations,
    airlines: summarizeAirlineFlow({
      marketId: params.choice.marketId,
      allocations,
    }),
    ignoredCapacityCount,
  };
}

export function airlineFlowSummary(params: {
  airlineId: string;
  flow: PassengerMarketFlowResult;
}): AirlineFlowSummary | null {
  return (
    params.flow.airlines.find(
      (summary) => summary.airlineId === params.airlineId,
    ) ?? null
  );
}

export function trustServiceResult(params: {
  airlineId: string;
  flow: PassengerMarketFlowResult;
  gracePeriod?: boolean;
}): TrustServiceResult {
  const summary = airlineFlowSummary({
    airlineId: params.airlineId,
    flow: params.flow,
  });

  if (!summary || summary.preferredPassengers <= 0) {
    return {
      eligible: false,
      serviceRate: null,
      serviceRatePercent: null,
      trustDelta: 0,
      reason: "no_player_preference",
    };
  }

  const serviceRate = clamp(
    summary.carriedPassengers / summary.preferredPassengers,
    0,
    1,
  );
  const serviceRatePercent = Math.round(serviceRate * 100);

  if (params.gracePeriod) {
    return {
      eligible: false,
      serviceRate,
      serviceRatePercent,
      trustDelta: 0,
      reason: "grace_period",
    };
  }

  const trustDelta =
    serviceRatePercent >= 95
      ? 3
      : serviceRatePercent >= 80
        ? 2
        : serviceRatePercent >= 60
          ? 0
          : serviceRatePercent >= 40
            ? -1
            : -3;

  return {
    eligible: true,
    serviceRate,
    serviceRatePercent,
    trustDelta,
    reason: "service_result",
  };
}

// ---------------------------------------------------------------------------
// Temporary compatibility API
// ---------------------------------------------------------------------------

export type FlowStatus = "empty" | "waiting" | "moving" | "cleared" | "jammed";

export type PassengerFlowDemand = Pick<
  Demand,
  "id" | "hub_iata" | "base_pax_day" | "delivered_pax_today" | "ai_stolen_pax"
> & {
  status?: DemandStatus | "preview";
};

export type FlowDemand = PassengerFlowDemand;

export type PassengerPoolDemand = Pick<
  Demand,
  "base_pax_day" | "delivered_pax_today" | "ai_stolen_pax"
>;

export type RouteBoardingInput = {
  id: string;
  plane: {
    id: string;
    plane_model: {
      pax_capacity: number;
    };
  };
};

export type DailyCapacityRouteInput = Pick<
  Route,
  "total_dist_nm" | "demand" | "plane"
>;

export type RouteBoardingResult = {
  routeId: string;
  planeId: string;
  capacity: number;
  practicalCapacity: number;
  boarded: number;
};

export type RouteGroupBoardingResult = {
  totalBoarded: number;
  waitingBefore: number;
  totalPracticalCapacity: number;
  results: RouteBoardingResult[];
};

export function clampDayProgress(dayProgress: number): number {
  return clamp(finiteOr(dayProgress), 0, 1);
}

/**
 * Live passenger pool available to the player's airline.
 *
 * Rival-carried travelers are excluded. Passengers already carried by the
 * player remain in the pool so the number cannot shrink below completed work.
 * This is intentionally not named "preferred" because the stored demand row
 * does not persist the full itinerary-choice allocation.
 */
export function playerPassengerPoolForDemand(
  demand: PassengerPoolDemand,
): number {
  const market = nonNegativeInteger(demand.base_pax_day);
  const carried = nonNegativeInteger(demand.delivered_pax_today);
  const rivalCarried = nonNegativeInteger(demand.ai_stolen_pax);

  return Math.max(carried, market - rivalCarried);
}

/** Daily seats provided by one route's complete operating schedule. */
export function scheduledDailySeatsForRoute(
  route: DailyCapacityRouteInput,
): number {
  const distance = Math.max(
    1,
    finiteOr(route.total_dist_nm, finiteOr(route.demand.dist_nm, 1)),
  );
  const speed = Math.max(1, finiteOr(route.plane.plane_model.speed_kts, 1));
  const cycles = dailyFlights(distance, speed);

  return nonNegativeInteger(route.plane.plane_model.pax_capacity) * cycles;
}

/** Combined daily seats for every aircraft assigned to the same market. */
export function totalScheduledDailySeats(
  routes: readonly DailyCapacityRouteInput[],
): number {
  return routes.reduce(
    (total, route) => total + scheduledDailySeatsForRoute(route),
    0,
  );
}

/** Seats still needed to cover the player's current full-day passenger pool. */
export function dailySeatGapForDemand(params: {
  demand: PassengerPoolDemand;
  routes: readonly DailyCapacityRouteInput[];
}): number {
  return Math.max(
    0,
    playerPassengerPoolForDemand(params.demand) -
      totalScheduledDailySeats(params.routes),
  );
}

export function spawnedPaxForDay(
  demand: PassengerFlowDemand,
  dayProgress: number,
): number {
  if (demand.status === "served") {
    return nonNegativeInteger(demand.base_pax_day);
  }

  const progress = clampDayProgress(dayProgress);
  const eased =
    progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  const total =
    nonNegativeInteger(demand.base_pax_day) * 0.2 +
    nonNegativeInteger(demand.base_pax_day) * 0.8 * eased;

  return Math.min(nonNegativeInteger(demand.base_pax_day), Math.round(total));
}

export function remainingPax(demand: PassengerFlowDemand): number {
  return Math.max(
    0,
    playerPassengerPoolForDemand(demand) -
      nonNegativeInteger(demand.delivered_pax_today),
  );
}

export function waitingPaxForDemand(
  demand: PassengerFlowDemand,
  _dayProgress?: number,
): number {
  return remainingPax(demand);
}

/** Deterministic compatibility helper. New code should use scheduled capacity. */
export function practicalPlaneCapacity(params: {
  planeCapacity: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): number {
  const minimum = clamp(finiteOr(params.loadFactorMin, 0.65), 0, 1);
  const maximum = clamp(finiteOr(params.loadFactorMax, 1), minimum, 1);
  return Math.max(
    0,
    Math.round(nonNegativeInteger(params.planeCapacity) * maximum),
  );
}

export function boardPassengers(params: {
  demand: PassengerFlowDemand;
  planeCapacity: number;
  dayProgress: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): number {
  const waiting = waitingPaxForDemand(params.demand, params.dayProgress);
  return Math.min(waiting, nonNegativeInteger(params.planeCapacity));
}

export function boardPassengersForRouteGroup(params: {
  demand: PassengerFlowDemand;
  routes: RouteBoardingInput[];
  dayProgress: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): RouteGroupBoardingResult {
  const waitingBefore = waitingPaxForDemand(params.demand, params.dayProgress);
  const prepared = params.routes.map((route) => {
    const capacity = nonNegativeInteger(route.plane.plane_model.pax_capacity);
    return {
      routeId: route.id,
      planeId: route.plane.id,
      capacity,
      practicalCapacity: practicalPlaneCapacity({
        planeCapacity: capacity,
        loadFactorMin: params.loadFactorMin,
        loadFactorMax: params.loadFactorMax,
      }),
      boarded: 0,
    };
  });
  const totalPracticalCapacity = prepared.reduce(
    (total, route) => total + route.practicalCapacity,
    0,
  );
  const totalBoarded = Math.min(waitingBefore, totalPracticalCapacity);
  const serviceResults = allocateAcrossServices({
    carriedPassengers: totalBoarded,
    services: prepared.map((route) => ({
      itineraryId: "compatibility",
      routeId: route.routeId,
      aircraftId: route.planeId,
      capacitySource: "scheduled" as const,
      scheduledCapacity: route.practicalCapacity,
    })),
  });
  const boardedByRoute = new Map(
    serviceResults.map((result) => [result.routeId, result.carriedPassengers]),
  );

  return {
    totalBoarded,
    waitingBefore,
    totalPracticalCapacity,
    results: prepared.map((route) => ({
      ...route,
      boarded: boardedByRoute.get(route.routeId) ?? 0,
    })),
  };
}

export function totalRouteGroupCapacity(routes: RouteBoardingInput[]): number {
  return routes.reduce(
    (total, route) =>
      total + nonNegativeInteger(route.plane.plane_model.pax_capacity),
    0,
  );
}

export function routeGroupCanClearDemand(params: {
  demand: PassengerFlowDemand;
  routes: DailyCapacityRouteInput[];
}): boolean {
  return dailySeatGapForDemand(params) <= 0;
}

export function isDemandCleared(demand: PassengerFlowDemand): boolean {
  return demand.status === "served" || remainingPax(demand) <= 0;
}

export function demandFlowStatus(
  demand: PassengerFlowDemand,
  dayProgress: number,
): FlowStatus {
  if (isDemandCleared(demand)) return "cleared";

  const waiting = waitingPaxForDemand(demand, dayProgress);
  const delivered = nonNegativeInteger(demand.delivered_pax_today);

  if (waiting <= 0 && delivered <= 0) return "empty";
  if (waiting >= Math.max(10, nonNegativeInteger(demand.base_pax_day) * 0.6)) {
    return "jammed";
  }
  if (delivered > 0) return "moving";
  return "waiting";
}

export function hubOutboundWaitingPax(
  hubIata: string,
  demands: PassengerFlowDemand[],
  dayProgress: number,
): number {
  return demands
    .filter(
      (demand) => demand.hub_iata === hubIata && demand.status !== "served",
    )
    .reduce(
      (total, demand) => total + waitingPaxForDemand(demand, dayProgress),
      0,
    );
}

export function hubOutboundDeliveredPax(
  hubIata: string,
  demands: PassengerFlowDemand[],
): number {
  return demands
    .filter((demand) => demand.hub_iata === hubIata)
    .reduce(
      (total, demand) => total + nonNegativeInteger(demand.delivered_pax_today),
      0,
    );
}

export function hubFlowPercent(
  hubIata: string,
  demands: PassengerFlowDemand[],
): number {
  const hubDemands = demands.filter((demand) => demand.hub_iata === hubIata);
  const total = hubDemands.reduce(
    (sum, demand) => sum + nonNegativeInteger(demand.base_pax_day),
    0,
  );
  if (total <= 0) return 0;

  return Math.min(
    100,
    Math.round((hubOutboundDeliveredPax(hubIata, demands) / total) * 100),
  );
}

export function inboundArrivalsForAirport(
  iata: string,
  demands: (PassengerFlowDemand & { dest?: { iata: string } })[],
): number {
  return demands
    .filter((demand) => demand.dest?.iata === iata)
    .reduce(
      (total, demand) => total + nonNegativeInteger(demand.delivered_pax_today),
      0,
    );
}
