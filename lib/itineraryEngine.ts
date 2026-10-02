/**
 * lib/itineraryEngine.ts
 *
 * Decides whether an airline offers a complete journey for a passenger market.
 *
 * Initial FlightCraft rules:
 * - Passengers board only when one route service reaches their final destination.
 * - A route may be direct or an explicit one-stop through service.
 * - Every leg must be continuous and within the assigned aircraft's range.
 * - Separate route records are never combined automatically.
 * - Player and rival services are never mixed into one itinerary.
 *
 * Passenger choice and aircraft operations consume the valid itineraries made
 * here. They do not reinterpret partial routes as complete journeys.
 */

import type { PassengerMarket } from "@/lib/passengerMarkets";
import type { PriceStrategy } from "@/lib/revenue";
import type { Route } from "@/store";

export const MAX_SUPPORTED_ITINERARY_STOPS = 1;
export const ALLOW_SEPARATE_ROUTE_CONNECTIONS = false;
export const ALLOW_INTERLINE_ITINERARIES = false;

export type ItineraryOperatorKind = "player" | "rival";

export type ItineraryRejectionReason =
  | "inactive_route"
  | "no_legs"
  | "too_many_stops"
  | "partial_journey"
  | "disconnected_legs"
  | "repeated_airport"
  | "invalid_distance"
  | "invalid_aircraft_range"
  | "aircraft_out_of_range"
  | "no_capacity";

export type MarketItineraryStatus =
  | "available"
  | "aircraft_out_of_range"
  | "no_capacity"
  | "route_inactive"
  | "no_complete_itinerary";

export interface RouteServiceLeg {
  originIata: string;
  destinationIata: string;
  distanceNm: number;
}

export interface RouteServiceAircraft {
  id: string;
  modelId: string;
  modelName: string;
  rangeNm: number;
  seatCapacity: number;
}

/**
 * One route service operated by one airline and one aircraft.
 * A two-leg offering represents an explicit through route, not two routes that
 * the engine discovered and connected on the player's behalf.
 */
export interface RouteServiceOffering {
  id: string;
  routeId: string;
  airlineId: string;
  operatorKind: ItineraryOperatorKind;
  active: boolean;
  legs: RouteServiceLeg[];
  aircraft: RouteServiceAircraft;
  /** Seats supplied to this market during the settlement window. */
  availableSeats: number;
  priceStrategy: PriceStrategy;
}

export interface ItineraryLeg {
  sequence: number;
  originIata: string;
  destinationIata: string;
  distanceNm: number;
}

export interface PassengerItinerary {
  id: string;
  marketId: string;
  airlineId: string;
  operatorKind: ItineraryOperatorKind;
  routeIds: string[];
  offeringIds: string[];
  aircraftIds: string[];
  aircraftModelNames: string[];
  legs: ItineraryLeg[];
  connectionIatas: string[];
  stopCount: number;
  isDirect: boolean;
  directDistanceNm: number;
  totalDistanceNm: number;
  detourRatio: number;
  availableSeats: number;
  priceStrategy: PriceStrategy;
}

export interface RejectedRouteOffering {
  offeringId: string;
  routeId: string;
  airlineId: string;
  reason: ItineraryRejectionReason;
  message: string;
  offendingLegIndex: number | null;
}

export interface ItineraryValidationSuccess {
  valid: true;
}

export interface ItineraryValidationFailure {
  valid: false;
  rejection: RejectedRouteOffering;
}

export type ItineraryValidationResult =
  ItineraryValidationSuccess | ItineraryValidationFailure;

export interface MarketItineraryResult {
  marketId: string;
  status: MarketItineraryStatus;
  itineraries: PassengerItinerary[];
  rejected: RejectedRouteOffering[];
  ignoredOfferingCount: number;
}

export interface CreateDirectServiceOfferingParams {
  id?: string;
  routeId: string;
  airlineId: string;
  operatorKind: ItineraryOperatorKind;
  active?: boolean;
  originIata: string;
  destinationIata: string;
  distanceNm: number;
  aircraft: RouteServiceAircraft;
  availableSeats?: number;
  priceStrategy?: PriceStrategy;
}

function normalizeIata(iata: string): string {
  return iata.trim().toUpperCase();
}

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: number): number {
  return Math.max(0, Math.floor(finiteNumber(value)));
}

function normalizedLeg(leg: RouteServiceLeg): RouteServiceLeg {
  return {
    originIata: normalizeIata(leg.originIata),
    destinationIata: normalizeIata(leg.destinationIata),
    distanceNm: Math.round(finiteNumber(leg.distanceNm)),
  };
}

function rejection(
  offering: RouteServiceOffering,
  reason: ItineraryRejectionReason,
  message: string,
  offendingLegIndex: number | null = null,
): ItineraryValidationFailure {
  return {
    valid: false,
    rejection: {
      offeringId: offering.id,
      routeId: offering.routeId,
      airlineId: offering.airlineId,
      reason,
      message,
      offendingLegIndex,
    },
  };
}

/**
 * Converts the current player Route shape into the neutral service shape.
 * A route with via_iata remains one through service with two explicit legs.
 */
export function playerRouteToServiceOffering(params: {
  route: Route;
  airlineId: string;
  availableSeats?: number;
}): RouteServiceOffering {
  const { route } = params;
  const originIata = normalizeIata(route.demand.origin.iata);
  const destinationIata = normalizeIata(route.demand.dest.iata);
  const viaIata = route.via_iata ? normalizeIata(route.via_iata) : null;
  const directDistance = Math.round(
    finiteNumber(route.total_dist_nm || route.demand.dist_nm),
  );

  const legs: RouteServiceLeg[] = viaIata
    ? [
        {
          originIata,
          destinationIata: viaIata,
          distanceNm: Math.round(finiteNumber(route.leg1_dist_nm ?? 0)),
        },
        {
          originIata: viaIata,
          destinationIata,
          distanceNm: Math.round(finiteNumber(route.leg2_dist_nm ?? 0)),
        },
      ]
    : [
        {
          originIata,
          destinationIata,
          distanceNm: directDistance,
        },
      ];

  return {
    id: `player-service:${route.id}`,
    routeId: route.id,
    airlineId: params.airlineId,
    operatorKind: "player",
    active: route.active,
    legs,
    aircraft: {
      id: route.plane.id,
      modelId: route.plane.plane_model.id,
      modelName: route.plane.plane_model.nickname,
      rangeNm: route.plane.plane_model.range_nm,
      seatCapacity: route.plane.plane_model.pax_capacity,
    },
    availableSeats: positiveInteger(
      params.availableSeats ?? route.plane.plane_model.pax_capacity,
    ),
    priceStrategy: route.price_strategy ?? "standard",
  };
}

/** Useful for rival routes and any direct service that is not a store Route. */
export function createDirectServiceOffering(
  params: CreateDirectServiceOfferingParams,
): RouteServiceOffering {
  return {
    id: params.id ?? `${params.operatorKind}-service:${params.routeId}`,
    routeId: params.routeId,
    airlineId: params.airlineId,
    operatorKind: params.operatorKind,
    active: params.active ?? true,
    legs: [
      {
        originIata: normalizeIata(params.originIata),
        destinationIata: normalizeIata(params.destinationIata),
        distanceNm: Math.round(finiteNumber(params.distanceNm)),
      },
    ],
    aircraft: {
      ...params.aircraft,
      rangeNm: finiteNumber(params.aircraft.rangeNm),
      seatCapacity: positiveInteger(params.aircraft.seatCapacity),
    },
    availableSeats: positiveInteger(
      params.availableSeats ?? params.aircraft.seatCapacity,
    ),
    priceStrategy: params.priceStrategy ?? "standard",
  };
}

export function validateServiceOfferingForMarket(params: {
  market: PassengerMarket;
  offering: RouteServiceOffering;
}): ItineraryValidationResult {
  const { market, offering } = params;
  const legs = offering.legs.map(normalizedLeg);

  if (!offering.active) {
    return rejection(
      offering,
      "inactive_route",
      "This route is not currently operating.",
    );
  }

  if (legs.length === 0) {
    return rejection(
      offering,
      "no_legs",
      "This route does not contain a flight leg.",
    );
  }

  if (legs.length > MAX_SUPPORTED_ITINERARY_STOPS + 1) {
    return rejection(
      offering,
      "too_many_stops",
      "Only direct and one-stop through routes are supported.",
    );
  }

  const marketOrigin = normalizeIata(market.originIata);
  const marketDestination = normalizeIata(market.destinationIata);
  const firstOrigin = legs[0].originIata;
  const finalDestination = legs[legs.length - 1].destinationIata;

  if (firstOrigin !== marketOrigin || finalDestination !== marketDestination) {
    return rejection(
      offering,
      "partial_journey",
      `No complete ${marketOrigin} to ${marketDestination} itinerary is available.`,
    );
  }

  const visitedAirports = new Set<string>([firstOrigin]);

  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index];

    if (
      !leg.originIata ||
      !leg.destinationIata ||
      leg.originIata === leg.destinationIata ||
      leg.distanceNm <= 0
    ) {
      return rejection(
        offering,
        "invalid_distance",
        "One of the route legs has invalid airport or distance data.",
        index,
      );
    }

    if (index > 0 && legs[index - 1].destinationIata !== leg.originIata) {
      return rejection(
        offering,
        "disconnected_legs",
        "The route legs do not form one continuous journey.",
        index,
      );
    }

    if (visitedAirports.has(leg.destinationIata)) {
      return rejection(
        offering,
        "repeated_airport",
        "The route returns to an airport already used in this journey.",
        index,
      );
    }

    visitedAirports.add(leg.destinationIata);
  }

  const aircraftRangeNm = finiteNumber(offering.aircraft.rangeNm);
  if (aircraftRangeNm <= 0) {
    return rejection(
      offering,
      "invalid_aircraft_range",
      "The assigned aircraft does not have a valid operating range.",
    );
  }

  const outOfRangeLegIndex = legs.findIndex(
    (leg) => leg.distanceNm > aircraftRangeNm,
  );

  if (outOfRangeLegIndex >= 0) {
    const leg = legs[outOfRangeLegIndex];
    return rejection(
      offering,
      "aircraft_out_of_range",
      `${offering.aircraft.modelName} cannot fly ${leg.originIata} to ${leg.destinationIata}.`,
      outOfRangeLegIndex,
    );
  }

  if (
    positiveInteger(offering.availableSeats) <= 0 ||
    positiveInteger(offering.aircraft.seatCapacity) <= 0
  ) {
    return rejection(
      offering,
      "no_capacity",
      "This route does not have passenger capacity available.",
    );
  }

  return { valid: true };
}

function itineraryKey(params: {
  market: PassengerMarket;
  offering: RouteServiceOffering;
}): string {
  const path = params.offering.legs
    .map(normalizedLeg)
    .map((leg, index) =>
      index === 0
        ? `${leg.originIata}>${leg.destinationIata}`
        : leg.destinationIata,
    )
    .join(">");

  return [
    params.offering.operatorKind,
    params.offering.airlineId,
    params.market.id,
    path,
    params.offering.priceStrategy,
  ].join(":");
}

function buildPassengerItinerary(params: {
  market: PassengerMarket;
  offering: RouteServiceOffering;
}): PassengerItinerary {
  const legs = params.offering.legs.map(normalizedLeg).map((leg, index) => ({
    sequence: index + 1,
    ...leg,
  }));
  const totalDistanceNm = legs.reduce(
    (total, leg) => total + leg.distanceNm,
    0,
  );
  const connectionIatas = legs.slice(0, -1).map((leg) => leg.destinationIata);

  return {
    id: `itinerary:${itineraryKey(params)}`,
    marketId: params.market.id,
    airlineId: params.offering.airlineId,
    operatorKind: params.offering.operatorKind,
    routeIds: [params.offering.routeId],
    offeringIds: [params.offering.id],
    aircraftIds: [params.offering.aircraft.id],
    aircraftModelNames: [params.offering.aircraft.modelName],
    legs,
    connectionIatas,
    stopCount: connectionIatas.length,
    isDirect: connectionIatas.length === 0,
    directDistanceNm: params.market.distanceNm,
    totalDistanceNm,
    detourRatio:
      Math.round(
        (totalDistanceNm / Math.max(1, params.market.distanceNm)) * 100,
      ) / 100,
    availableSeats: positiveInteger(params.offering.availableSeats),
    priceStrategy: params.offering.priceStrategy,
  };
}

function mergeItineraryService(
  itinerary: PassengerItinerary,
  offering: RouteServiceOffering,
): PassengerItinerary {
  return {
    ...itinerary,
    routeIds: Array.from(new Set([...itinerary.routeIds, offering.routeId])),
    offeringIds: Array.from(new Set([...itinerary.offeringIds, offering.id])),
    aircraftIds: Array.from(
      new Set([...itinerary.aircraftIds, offering.aircraft.id]),
    ),
    aircraftModelNames: Array.from(
      new Set([...itinerary.aircraftModelNames, offering.aircraft.modelName]),
    ),
    availableSeats:
      itinerary.availableSeats + positiveInteger(offering.availableSeats),
  };
}

function statusFromRejections(
  itineraries: readonly PassengerItinerary[],
  rejected: readonly RejectedRouteOffering[],
): MarketItineraryStatus {
  if (itineraries.length > 0) return "available";
  if (rejected.some((item) => item.reason === "aircraft_out_of_range")) {
    return "aircraft_out_of_range";
  }
  if (rejected.some((item) => item.reason === "no_capacity")) {
    return "no_capacity";
  }
  if (rejected.some((item) => item.reason === "inactive_route")) {
    return "route_inactive";
  }

  return "no_complete_itinerary";
}

/**
 * Finds complete services for one market. Offerings from separate route records
 * are validated independently and are never chained into a connection.
 */
export function buildItinerariesForMarket(params: {
  market: PassengerMarket;
  offerings: readonly RouteServiceOffering[];
}): MarketItineraryResult {
  const marketOrigin = normalizeIata(params.market.originIata);
  const itinerariesByKey = new Map<string, PassengerItinerary>();
  const rejected: RejectedRouteOffering[] = [];
  let ignoredOfferingCount = 0;

  for (const offering of params.offerings) {
    const firstLeg = offering.legs[0];
    const startsAtMarketOrigin =
      firstLeg && normalizeIata(firstLeg.originIata) === marketOrigin;

    if (!startsAtMarketOrigin) {
      ignoredOfferingCount++;
      continue;
    }

    const validation = validateServiceOfferingForMarket({
      market: params.market,
      offering,
    });

    if (!validation.valid) {
      rejected.push(validation.rejection);
      continue;
    }

    const key = itineraryKey({ market: params.market, offering });
    const existing = itinerariesByKey.get(key);

    if (existing) {
      itinerariesByKey.set(key, mergeItineraryService(existing, offering));
    } else {
      itinerariesByKey.set(
        key,
        buildPassengerItinerary({ market: params.market, offering }),
      );
    }
  }

  const itineraries = Array.from(itinerariesByKey.values()).sort(
    (left, right) => {
      if (left.stopCount !== right.stopCount) {
        return left.stopCount - right.stopCount;
      }
      if (left.detourRatio !== right.detourRatio) {
        return left.detourRatio - right.detourRatio;
      }
      if (left.availableSeats !== right.availableSeats) {
        return right.availableSeats - left.availableSeats;
      }
      return left.id.localeCompare(right.id);
    },
  );

  return {
    marketId: params.market.id,
    status: statusFromRejections(itineraries, rejected),
    itineraries,
    rejected,
    ignoredOfferingCount,
  };
}

export function airlineHasCompleteItinerary(params: {
  airlineId: string;
  result: MarketItineraryResult;
}): boolean {
  return params.result.itineraries.some(
    (itinerary) => itinerary.airlineId === params.airlineId,
  );
}

export function itinerariesForAirline(params: {
  airlineId: string;
  result: MarketItineraryResult;
}): PassengerItinerary[] {
  return params.result.itineraries.filter(
    (itinerary) => itinerary.airlineId === params.airlineId,
  );
}
