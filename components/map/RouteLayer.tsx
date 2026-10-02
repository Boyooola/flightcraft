/**
 * components/map/RouteLayer.tsx
 *
 * Active route lines, scheduled service, and moving aircraft.
 *
 * Passenger rules:
 * - A market is allocated across complete player and rival itineraries once
 *   per deterministic choice calculation.
 * - Aircraft board only the passengers who prefer the player's airline.
 * - Rivals never take another batch of passengers at day-end.
 * - Multiple aircraft may serve the same market without exceeding demand.
 * - Scheduled operations use route distance and aircraft speed.
 * - Aircraft positions use that same schedule, so the map never shows fake
 *   arrivals that do not carry passengers or incur operating cost.
 */

import { Colors } from "@/constants/theme";
import { aiServesCorridor, type AIAirline } from "@/lib/AIAirline";
import { hubCrowdingLevel } from "@/lib/demands";
import {
  buildItinerariesForMarket,
  createDirectServiceOffering,
  playerRouteToServiceOffering,
} from "@/lib/itineraryEngine";
import {
  allocatePassengerChoice,
  preferredPassengersForAirline,
} from "@/lib/passengerChoice";
import { boardPassengers, resolvePassengerFlow } from "@/lib/passengerFlow";
import {
  createPassengerMarket,
  type PassengerMarket,
} from "@/lib/passengerMarkets";
import { calcRouteRevenue, dailyFlights } from "@/lib/revenue";
import { getSeasonalMultiplier } from "@/lib/seasons";
import type { Airport, Demand, Route } from "@/store";
import { useDay, useDayProgress, useGameStore, useRoutes } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useMemo, useRef } from "react";

type Coordinate = [number, number];

interface MarketAllocation {
  playerPreferredPassengers: number;
  rivalCarriedPassengers: number;
}

interface RouteOperationProgress {
  day: number;
  scheduleKey: string;
  completedCycles: number;
}

function passengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function demandToPassengerMarket(params: {
  demand: Demand;
  gameSeed: string;
  gameDay: number;
}): PassengerMarket {
  const generated = createPassengerMarket({
    gameSeed: params.gameSeed,
    origin: params.demand.origin,
    destination: params.demand.dest,
    generatedDay: params.gameDay,
  });

  return {
    ...generated,
    id: params.demand.id,
    distanceNm: params.demand.dist_nm,
    haul: params.demand.haul,
    baselineDailyDemand: passengerCount(params.demand.base_pax_day),
    businessShare: params.demand.business_pct ?? generated.businessShare,
    leisureShare: params.demand.leisure_pct ?? generated.leisureShare,
  };
}

/**
 * Calculates the fixed preference split for one market and game day. Rival
 * capacity represents the competitor's complete daily schedule, not one
 * animated aircraft, so rival-preferred travelers can be settled immediately.
 */
function allocateMarketPassengers(params: {
  demand: Demand;
  routes: Route[];
  rivals: AIAirline[];
  playerAirlineId: string;
  playerTrust: number;
  gameSeed: string;
  gameDay: number;
}): MarketAllocation {
  const market = demandToPassengerMarket({
    demand: params.demand,
    gameSeed: params.gameSeed,
    gameDay: params.gameDay,
  });
  const playerOfferings = params.routes
    .filter((route) => route.active && route.demand.id === params.demand.id)
    .map((route) =>
      playerRouteToServiceOffering({
        route,
        airlineId: params.playerAirlineId,
      }),
    );
  const rivalOfferings = params.rivals
    .filter((rival) =>
      aiServesCorridor(
        rival,
        params.demand.origin.iata,
        params.demand.dest.iata,
      ),
    )
    .map((rival) => {
      const dailyCapacity = Math.max(1, market.baselineDailyDemand);

      return createDirectServiceOffering({
        id: `rival-service:${rival.id}:${market.id}`,
        routeId: `rival-route:${rival.id}:${market.id}`,
        airlineId: rival.id,
        operatorKind: "rival",
        originIata: market.originIata,
        destinationIata: market.destinationIata,
        distanceNm: market.distanceNm,
        aircraft: {
          id: `rival-schedule:${rival.id}:${market.id}`,
          modelId: "rival-daily-schedule",
          modelName: "Rival daily schedule",
          rangeNm: Math.max(1, market.distanceNm),
          seatCapacity: dailyCapacity,
        },
        availableSeats: dailyCapacity,
        priceStrategy: "standard",
      });
    });
  const itineraryResult = buildItinerariesForMarket({
    market,
    offerings: [...playerOfferings, ...rivalOfferings],
  });
  const choice = allocatePassengerChoice({
    gameSeed: params.gameSeed,
    market,
    dailyDemand: {
      gameDay: params.gameDay,
      todayDemand: market.baselineDailyDemand,
    },
    itineraries: itineraryResult.itineraries,
    airlineProfiles: [
      {
        airlineId: params.playerAirlineId,
        trust: params.playerTrust,
      },
      ...params.rivals.map((rival) => ({
        airlineId: rival.id,
        trust: rival.trust,
      })),
    ],
  });
  const flow = resolvePassengerFlow({
    choice,
    itineraries: itineraryResult.itineraries,
  });

  return {
    playerPreferredPassengers: preferredPassengersForAirline({
      airlineId: params.playerAirlineId,
      result: choice,
    }),
    rivalCarriedPassengers: flow.airlines
      .filter((airline) => airline.operatorKind === "rival")
      .reduce((total, airline) => total + airline.carriedPassengers, 0),
  };
}

function routeDistanceNm(route: Route): number {
  return Math.max(1, route.total_dist_nm ?? route.demand.dist_nm);
}

function plannedDailyCycles(route: Route): number {
  return dailyFlights(
    routeDistanceNm(route),
    Math.max(1, route.plane.plane_model.speed_kts),
  );
}

/**
 * Places rotations through the day at the midpoint of equal time windows.
 * The final arrival therefore settles before the clock advances to tomorrow.
 */
function completedCyclesAtProgress(route: Route, dayProgress: number): number {
  const cycles = plannedDailyCycles(route);
  const progress = clamp(dayProgress, 0, 1);

  return Math.min(cycles, Math.floor(progress * cycles + 0.5 + Number.EPSILON));
}

function routeScheduleKey(route: Route): string {
  return [
    route.plane.id,
    routeDistanceNm(route),
    route.plane.plane_model.speed_kts,
  ].join(":");
}

/** Settles one scheduled service cycle. */
function settleRouteCycle(params: {
  route: Route;
  gameDay: number;
  dayProgress: number;
  revenueMultiplier: number;
  allocationCache: Record<string, MarketAllocation>;
}) {
  let state = useGameStore.getState();
  const airline = state.airline;
  if (!airline) return;

  const liveDemand =
    state.demands.find((demand) => demand.id === params.route.demand.id) ??
    params.route.demand;
  const hub = state.hubs.find(
    (item) => item.airport.iata === params.route.hub_iata,
  );
  const allocationKey = `${params.gameDay}:${liveDemand.id}`;
  const allocation =
    params.allocationCache[allocationKey] ??
    allocateMarketPassengers({
      demand: liveDemand,
      routes: state.routes,
      rivals: state.aiAirlines,
      playerAirlineId: airline.id,
      playerTrust: hub?.trust ?? 0,
      gameSeed: airline.seed,
      gameDay: params.gameDay,
    });
  params.allocationCache[allocationKey] = allocation;

  const rivalAlreadyCarried = passengerCount(liveDemand.ai_stolen_pax);
  const rivalToRecord = Math.max(
    0,
    allocation.rivalCarriedPassengers - rivalAlreadyCarried,
  );
  if (rivalToRecord > 0) {
    state.addPaxDelivered(liveDemand.id, 0, rivalToRecord);
    state = useGameStore.getState();
  }

  const refreshedDemand =
    state.demands.find((demand) => demand.id === liveDemand.id) ?? liveDemand;
  const livePlane =
    state.ownedPlanes.find((plane) => plane.id === params.route.plane.id) ??
    params.route.plane;
  const playerPreferenceRemaining = Math.max(
    0,
    allocation.playerPreferredPassengers -
      passengerCount(refreshedDemand.delivered_pax_today),
  );
  const deliveredPax = Math.min(
    playerPreferenceRemaining,
    boardPassengers({
      demand: refreshedDemand,
      planeCapacity: livePlane.plane_model.pax_capacity,
      dayProgress: params.dayProgress,
    }),
  );

  if (deliveredPax > 0) {
    state.addPaxDelivered(liveDemand.id, deliveredPax, 0);
    state = useGameStore.getState();
  }

  const seasonalMultiplier = getSeasonalMultiplier(
    params.gameDay,
    liveDemand.dest.country,
    liveDemand.dest.continent,
  );
  const condition = livePlane.condition ?? 100;
  const conditionMultiplier =
    condition <= 15 ? 0.7 : condition <= 40 ? 0.85 : 1;
  const crowding = hub
    ? hubCrowdingLevel(params.route.hub_iata, state.demands, hub.airport)
    : null;
  const congestionMultiplier =
    crowding?.level === "crisis"
      ? 0.8
      : crowding?.level === "overcrowded"
        ? 0.9
        : 1;
  const result = calcRouteRevenue({
    distNm: routeDistanceNm(params.route),
    speedKts: livePlane.plane_model.speed_kts,
    trustPct: hub?.trust ?? 0,
    boardedPax: deliveredPax,
    seatCapacity: livePlane.plane_model.pax_capacity,
    costPerSector: livePlane.plane_model.cost_per_sector ?? 500,
    fuelPerNm: livePlane.plane_model.fuel_per_nm ?? 2,
    priceStrategy: params.route.price_strategy ?? "standard",
    priceElasticity: refreshedDemand.price_elasticity ?? 1,
    crowdMultiplier:
      params.revenueMultiplier * seasonalMultiplier * conditionMultiplier,
    congestionMultiplier,
    businessPct: refreshedDemand.business_pct ?? 0.25,
    leisurePct: refreshedDemand.leisure_pct ?? 0.75,
  });

  state.addRouteEarning(params.route.id, result.net);
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function shortestLongitudeDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function fallbackArc(
  from: Coordinate,
  to: Coordinate,
  steps: number,
): Coordinate[] {
  const longitudeDelta = shortestLongitudeDelta(from[0], to[0]);

  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return [
      from[0] + longitudeDelta * progress,
      from[1] + (to[1] - from[1]) * progress,
    ];
  });
}

function greatCircleArc(from: Coordinate, to: Coordinate): Coordinate[] {
  const fromLongitude = degreesToRadians(from[0]);
  const fromLatitude = degreesToRadians(from[1]);
  const toLongitude = degreesToRadians(to[0]);
  const toLatitude = degreesToRadians(to[1]);

  const fromVector = [
    Math.cos(fromLatitude) * Math.cos(fromLongitude),
    Math.cos(fromLatitude) * Math.sin(fromLongitude),
    Math.sin(fromLatitude),
  ];
  const toVector = [
    Math.cos(toLatitude) * Math.cos(toLongitude),
    Math.cos(toLatitude) * Math.sin(toLongitude),
    Math.sin(toLatitude),
  ];
  const dot = clamp(
    fromVector[0] * toVector[0] +
      fromVector[1] * toVector[1] +
      fromVector[2] * toVector[2],
    -1,
    1,
  );
  const angle = Math.acos(dot);
  const steps = Math.max(
    12,
    Math.min(72, Math.ceil(radiansToDegrees(angle) / 3)),
  );
  const sineAngle = Math.sin(angle);

  if (angle < 0.000001 || Math.abs(sineAngle) < 0.000001) {
    return fallbackArc(from, to, steps);
  }

  const points: Coordinate[] = [];
  let previousLongitude = from[0];

  for (let index = 0; index <= steps; index++) {
    const progress = index / steps;
    const fromWeight = Math.sin((1 - progress) * angle) / sineAngle;
    const toWeight = Math.sin(progress * angle) / sineAngle;
    const x = fromWeight * fromVector[0] + toWeight * toVector[0];
    const y = fromWeight * fromVector[1] + toWeight * toVector[1];
    const z = fromWeight * fromVector[2] + toWeight * toVector[2];
    const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;

    let longitude = radiansToDegrees(Math.atan2(y, x));
    const latitude = radiansToDegrees(Math.asin(clamp(z / magnitude, -1, 1)));

    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;

    points.push([longitude, latitude]);
    previousLongitude = longitude;
  }

  return points;
}

function bearing(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1R = (lat1 * Math.PI) / 180;
  const lat2R = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x =
    Math.cos(lat1R) * Math.sin(lat2R) -
    Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function buildRoutePoints(route: Route, airports: Airport[]): Coordinate[] {
  const via = route.via_iata
    ? airports.find((airport) => airport.iata === route.via_iata)
    : null;

  if (via) {
    const leg1 = greatCircleArc(
      [route.demand.origin.lng, route.demand.origin.lat],
      [via.lng, via.lat],
    );

    const leg2 = greatCircleArc(
      [via.lng, via.lat],
      [route.demand.dest.lng, route.demand.dest.lat],
    );

    return [...leg1, ...leg2.slice(1)];
  }

  return greatCircleArc(
    [route.demand.origin.lng, route.demand.origin.lat],
    [route.demand.dest.lng, route.demand.dest.lat],
  );
}

interface PlaneState {
  routeId: string;
  lng: number;
  lat: number;
  rotation: number;
}

function planeStateAtProgress(params: {
  route: Route;
  points: Coordinate[];
  dayProgress: number;
}): PlaneState {
  const { route, points } = params;

  if (points.length < 2) {
    return {
      routeId: route.id,
      lng: route.demand.origin.lng,
      lat: route.demand.origin.lat,
      rotation: 0,
    };
  }

  // Each service cycle has an outbound and return leg. The aircraft reaches
  // the destination at the midpoint, exactly when that cycle is settled.
  const cycles = plannedDailyCycles(route);
  const rawPhase = (clamp(params.dayProgress, 0, 1) * cycles * 2) % 2;
  const outbound = rawPhase <= 1;
  const routeProgress = outbound ? rawPhase : 2 - rawPhase;
  const finalPointIndex = points.length - 1;
  const exactPoint = routeProgress * finalPointIndex;
  const segmentIndex = Math.max(
    0,
    Math.min(finalPointIndex - 1, Math.floor(exactPoint)),
  );
  const segmentProgress = exactPoint - segmentIndex;
  const segmentStart = points[segmentIndex];
  const segmentEnd = points[segmentIndex + 1];

  return {
    routeId: route.id,
    lng: segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentProgress,
    lat: segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentProgress,
    rotation: outbound
      ? bearing(segmentStart, segmentEnd)
      : bearing(segmentEnd, segmentStart),
  };
}

export default function RouteLayer({
  paused = false,
}: {
  speed?: number;
  paused?: boolean;
}) {
  const routes = useRoutes();
  const day = useDay();
  const dayProgress = useDayProgress();
  const airports = useGameStore((s) => s.airports);
  const ownedPlanes = useGameStore((s) => s.ownedPlanes);

  const allocationCacheRef = useRef<Record<string, MarketAllocation>>({});
  const allocationDayRef = useRef(day);
  const operationProgressRef = useRef<Record<string, RouteOperationProgress>>(
    {},
  );

  const active = useMemo(
    () => routes.filter((route) => route.active),
    [routes],
  );
  const routePointsById = useMemo(
    () =>
      new Map(
        active.map((route) => [route.id, buildRoutePoints(route, airports)]),
      ),
    [active, airports],
  );

  useEffect(() => {
    const snapshot = useGameStore.getState();
    const airline = snapshot.airline;
    if (!airline) return;

    const operationDay = airline.day;
    const liveRoutes = snapshot.routes.filter((route) => route.active);
    const activeIds = new Set(liveRoutes.map((route) => route.id));

    Object.keys(operationProgressRef.current).forEach((routeId) => {
      if (!activeIds.has(routeId)) {
        delete operationProgressRef.current[routeId];
      }
    });

    if (allocationDayRef.current !== operationDay) {
      allocationDayRef.current = operationDay;
      allocationCacheRef.current = {};
    }

    const choice = snapshot.activeChoiceConsequence;
    const choiceMultiplier =
      choice?.revenueMultiplier != null &&
      choice.revenueMultiplierEndsDay != null &&
      operationDay < choice.revenueMultiplierEndsDay
        ? choice.revenueMultiplier
        : 1;
    const revenueMultiplier =
      (snapshot.dailyEvent?.revenueMultiplier ?? 1) * choiceMultiplier;

    liveRoutes.forEach((route) => {
      const completedCycles = completedCyclesAtProgress(
        route,
        snapshot.dayProgress,
      );
      const scheduleKey = routeScheduleKey(route);
      const progress = operationProgressRef.current[route.id];

      if (!progress || progress.scheduleKey !== scheduleKey) {
        // Opening or reassigning a route never replays service cycles that
        // occurred before that route existed.
        operationProgressRef.current[route.id] = {
          day: operationDay,
          scheduleKey,
          completedCycles,
        };
        return;
      }

      if (progress.day !== operationDay) {
        progress.day = operationDay;
        progress.completedCycles = 0;
      }

      while (progress.completedCycles < completedCycles) {
        // Reserve this cycle before store updates trigger another render.
        progress.completedCycles++;
        settleRouteCycle({
          route,
          gameDay: operationDay,
          dayProgress: snapshot.dayProgress,
          revenueMultiplier,
          allocationCache: allocationCacheRef.current,
        });
      }
    });
  }, [day, dayProgress, routes]);

  const planes = useMemo(
    () =>
      active.map((route) =>
        planeStateAtProgress({
          route,
          points: routePointsById.get(route.id) ?? [],
          dayProgress,
        }),
      ),
    [active, dayProgress, routePointsById],
  );

  const currentConditionByPlaneId = useMemo(
    () => new Map(ownedPlanes.map((plane) => [plane.id, plane.condition])),
    [ownedPlanes],
  );
  const conditionByRouteId = useMemo(
    () =>
      new Map(
        active.map((route) => [
          route.id,
          currentConditionByPlaneId.get(route.plane.id) ??
            route.plane.condition ??
            100,
        ]),
      ),
    [active, currentConditionByPlaneId],
  );
  const lineGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features: active.map((route) => ({
        type: "Feature",
        id: route.id,
        geometry: {
          type: "LineString",
          coordinates: routePointsById.get(route.id) ?? [],
        },
        properties: {
          routeId: route.id,
          condition: conditionByRouteId.get(route.id) ?? 100,
        },
      })),
    }),
    [active, conditionByRouteId, routePointsById],
  );
  const planeGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: planes.map((plane) => ({
        type: "Feature",
        id: `plane-${plane.routeId}`,
        geometry: {
          type: "Point",
          coordinates: [plane.lng, plane.lat],
        },
        properties: {
          rotation: plane.rotation,
          condition: conditionByRouteId.get(plane.routeId) ?? 100,
        },
      })),
    }),
    [conditionByRouteId, planes],
  );

  if (active.length === 0) return null;

  return (
    <>
      <MapboxGL.ShapeSource id="routes-source" shape={lineGeoJSON}>
        <MapboxGL.LineLayer
          id="route-casing"
          style={{
            lineColor: Colors.surface,
            lineWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              2.8,
              6,
              4,
              10,
              5.2,
            ],
            lineOpacity: paused ? 0.45 : 0.78,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <MapboxGL.LineLayer
          id="route-line"
          style={{
            lineColor: paused
              ? Colors.muted
              : [
                  "case",
                  ["<=", ["get", "condition"], 15],
                  Colors.red,
                  ["<=", ["get", "condition"], 40],
                  Colors.amber,
                  Colors.sky,
                ],
            lineWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              1.2,
              6,
              2,
              10,
              2.6,
            ],
            lineOpacity: paused ? 0.5 : 0.86,
            lineDasharray: paused ? [1, 1.5] : undefined,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </MapboxGL.ShapeSource>

      {planes.length > 0 && (
        <MapboxGL.ShapeSource id="planes-source" shape={planeGeoJSON}>
          <MapboxGL.SymbolLayer
            id="plane-icon"
            existing={false}
            style={{
              iconImage: "airport-15",
              iconSize: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                0.9,
                5,
                1.35,
                10,
                1.8,
              ],
              iconColor: paused
                ? Colors.muted
                : [
                    "case",
                    ["<=", ["get", "condition"], 15],
                    Colors.red,
                    ["<=", ["get", "condition"], 40],
                    Colors.amber,
                    Colors.skyDark,
                  ],
              iconHaloColor: Colors.surface,
              iconHaloWidth: 1.25,
              iconOpacity: paused ? 0.58 : 1,
              iconRotate: ["get", "rotation"],
              iconRotationAlignment: "map",
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      )}
    </>
  );
}
