/**
 * lib/routing.ts
 *
 * WorldWide Rush-style plane routing.
 *
 * CORE IDEA:
 *   - Keep routing readable and game-like.
 *   - Prefer DIRECT routes.
 *   - If direct is not possible, find one clean connection.
 *   - Do not overwhelm the player with 30 route options.
 *   - Passenger movement should feel like:
 *       demand appears → assign plane → plane carries pax → demand completes
 */

import type { Airport } from "@/store";

const TURNAROUND_H = 1;
const CONNECTION_STOP_H = 1.5;

const MAX_CONNECTION_OPTIONS = 5;
const MAX_DETOUR_PCT = 60;

export interface DirectRoute {
  type: "direct";
  canServe: true;
  distNm: number;
  maxLegNm: number;
  dailyFlights: number;
  routeLabel: string;
  stops: Airport[];
  travelTimeH: number;
}

export interface ConnectingRoute {
  type: "connecting";
  canServe: true;
  via: Airport;
  leg1Nm: number;
  leg2Nm: number;
  distNm: number;
  maxLegNm: number;
  dailyFlights: number;
  detourPct: number;
  routeLabel: string;
  stops: Airport[];
  travelTimeH: number;
}

export interface BlockedRoute {
  type: "blocked";
  canServe: false;
  reason: "out_of_range" | "no_connection";
  distNm: number;
  maxLegNm: number;
  dailyFlights: 0;
  routeLabel: string;
  stops: Airport[];
  travelTimeH: 0;
}

export type RouteOption = DirectRoute | ConnectingRoute;
export type RouteResult = RouteOption | BlockedRoute;

// ─────────────────────────────────────────────────────────────────
// DISTANCE
// ─────────────────────────────────────────────────────────────────

export function distNm(a: Airport, b: Airport): number {
  const R = 3440.065;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

// ─────────────────────────────────────────────────────────────────
// FLIGHT CADENCE
// ─────────────────────────────────────────────────────────────────

function calcTravelTimeH(
  totalDistNm: number,
  speedKts: number,
  connectionStops = 0,
): number {
  return totalDistNm / speedKts + connectionStops * CONNECTION_STOP_H;
}

function calcDailyFlights(params: {
  maxLegNm: number;
  speedKts: number;
  connectionStops?: number;
}): number {
  const { maxLegNm, speedKts, connectionStops = 0 } = params;

  const oneWayH =
    maxLegNm / speedKts + TURNAROUND_H + connectionStops * CONNECTION_STOP_H;

  const roundTripH = oneWayH * 2;

  return Math.max(1, Math.floor(24 / roundTripH));
}

// ─────────────────────────────────────────────────────────────────
// AIRPORT FILTERS
// ─────────────────────────────────────────────────────────────────

function canBeConnectionAirport(airport: Airport): boolean {
  return (
    airport.tier === "mega" ||
    airport.tier === "large" ||
    airport.tier === "major"
  );
}

function airportConnectionScore(airport: Airport): number {
  const pax = airport.pax_annual_m ?? 0;

  if (pax >= 40) return 100;
  if (pax >= 10) return 70;
  if (pax >= 2) return 40;

  if (airport.tier === "mega") return 90;
  if (airport.tier === "large") return 65;
  if (airport.tier === "major") return 45;

  return 10;
}

// ─────────────────────────────────────────────────────────────────
// DIRECT ROUTE
// ─────────────────────────────────────────────────────────────────

export function createDirectRoute(
  origin: Airport,
  dest: Airport,
  speedKts: number,
): DirectRoute {
  const direct = distNm(origin, dest);

  return {
    type: "direct",
    canServe: true,
    distNm: direct,
    maxLegNm: direct,
    dailyFlights: calcDailyFlights({
      maxLegNm: direct,
      speedKts,
    }),
    routeLabel: `${origin.iata} → ${dest.iata}`,
    stops: [origin, dest],
    travelTimeH: calcTravelTimeH(direct, speedKts),
  };
}

// ─────────────────────────────────────────────────────────────────
// CONNECTING ROUTES
// ─────────────────────────────────────────────────────────────────

export function findConnectingAirports(
  origin: Airport,
  dest: Airport,
  rangeNm: number,
  allAirports: Airport[],
  directNm: number,
  speedKts: number = 450,
): ConnectingRoute[] {
  const results: ConnectingRoute[] = [];

  for (const via of allAirports) {
    if (!via.iata) continue;
    if (via.iata === origin.iata) continue;
    if (via.iata === dest.iata) continue;
    if (!canBeConnectionAirport(via)) continue;

    const leg1Nm = distNm(origin, via);
    const leg2Nm = distNm(via, dest);

    if (leg1Nm > rangeNm) continue;
    if (leg2Nm > rangeNm) continue;

    const totalNm = leg1Nm + leg2Nm;
    const detourPct = Math.round(((totalNm - directNm) / directNm) * 100);

    if (detourPct < 0) continue;
    if (detourPct > MAX_DETOUR_PCT) continue;

    const maxLegNm = Math.max(leg1Nm, leg2Nm);

    results.push({
      type: "connecting",
      canServe: true,
      via,
      leg1Nm,
      leg2Nm,
      distNm: totalNm,
      maxLegNm,
      dailyFlights: calcDailyFlights({
        maxLegNm,
        speedKts,
        connectionStops: 1,
      }),
      detourPct,
      routeLabel: `${origin.iata} → ${via.iata} → ${dest.iata}`,
      stops: [origin, via, dest],
      travelTimeH: calcTravelTimeH(totalNm, speedKts, 1),
    });
  }

  results.sort((a, b) => {
    const scoreA = a.detourPct - airportConnectionScore(a.via) / 20;
    const scoreB = b.detourPct - airportConnectionScore(b.via) / 20;
    return scoreA - scoreB;
  });

  return results.slice(0, MAX_CONNECTION_OPTIONS);
}

// ─────────────────────────────────────────────────────────────────
// BEST ROUTE
// This is the main function you should use in-game.
// ─────────────────────────────────────────────────────────────────

export function findBestRoute(params: {
  origin: Airport;
  dest: Airport;
  planeRangeNm: number;
  planeSpeedKts: number;
  allAirports: Airport[];
  allowConnections?: boolean;
}): RouteResult {
  const {
    origin,
    dest,
    planeRangeNm,
    planeSpeedKts,
    allAirports,
    allowConnections = true,
  } = params;

  const directNm = distNm(origin, dest);

  if (directNm <= planeRangeNm) {
    return createDirectRoute(origin, dest, planeSpeedKts);
  }

  if (!allowConnections) {
    return {
      type: "blocked",
      canServe: false,
      reason: "out_of_range",
      distNm: directNm,
      maxLegNm: directNm,
      dailyFlights: 0,
      routeLabel: `${origin.iata} → ${dest.iata}`,
      stops: [origin, dest],
      travelTimeH: 0,
    };
  }

  const connections = findConnectingAirports(
    origin,
    dest,
    planeRangeNm,
    allAirports,
    directNm,
    planeSpeedKts,
  );

  if (connections.length > 0) {
    return connections[0];
  }

  return {
    type: "blocked",
    canServe: false,
    reason: "no_connection",
    distNm: directNm,
    maxLegNm: directNm,
    dailyFlights: 0,
    routeLabel: `${origin.iata} → ${dest.iata}`,
    stops: [origin, dest],
    travelTimeH: 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// ROUTE OPTIONS FOR UI
// Use this when showing route choices to player.
// ─────────────────────────────────────────────────────────────────

export function getRouteOptions(params: {
  origin: Airport;
  dest: Airport;
  planeRangeNm: number;
  planeSpeedKts: number;
  allAirports: Airport[];
  allowConnections?: boolean;
}): RouteResult[] {
  const {
    origin,
    dest,
    planeRangeNm,
    planeSpeedKts,
    allAirports,
    allowConnections = true,
  } = params;

  const directNm = distNm(origin, dest);

  if (directNm <= planeRangeNm) {
    return [createDirectRoute(origin, dest, planeSpeedKts)];
  }

  if (!allowConnections) {
    return [
      {
        type: "blocked",
        canServe: false,
        reason: "out_of_range",
        distNm: directNm,
        maxLegNm: directNm,
        dailyFlights: 0,
        routeLabel: `${origin.iata} → ${dest.iata}`,
        stops: [origin, dest],
        travelTimeH: 0,
      },
    ];
  }

  const connections = findConnectingAirports(
    origin,
    dest,
    planeRangeNm,
    allAirports,
    directNm,
    planeSpeedKts,
  );

  if (connections.length > 0) return connections;

  return [
    {
      type: "blocked",
      canServe: false,
      reason: "no_connection",
      distNm: directNm,
      maxLegNm: directNm,
      dailyFlights: 0,
      routeLabel: `${origin.iata} → ${dest.iata}`,
      stops: [origin, dest],
      travelTimeH: 0,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// WORLDWIDE RUSH-STYLE REVENUE ESTIMATE
// For display only.
// Real reward should still come from lib/revenue.ts.
// ─────────────────────────────────────────────────────────────────

export function estimateRouteRevenue(
  paxDay: number,
  option: RouteResult,
  paxCap: number,
  speedKts: number,
  trustPct: number,
  _haul: string,
): { dailyRev: number; fillPct: number } {
  if (!option.canServe) {
    return {
      dailyRev: 0,
      fillPct: 0,
    };
  }

  const flights =
    option.type === "direct"
      ? calcDailyFlights({
          maxLegNm: option.maxLegNm,
          speedKts,
        })
      : calcDailyFlights({
          maxLegNm: option.maxLegNm,
          speedKts,
          connectionStops: 1,
        });

  const capacity = paxCap * flights;
  const paxCarried = Math.min(paxDay, capacity);
  const fillPct =
    paxDay > 0 ? Math.min(100, Math.round((paxCarried / paxDay) * 100)) : 0;

  const trustMultiplier =
    0.9 + (Math.max(0, Math.min(100, trustPct)) / 100) * 0.35;

  const distanceMultiplier =
    option.distNm < 500
      ? 18
      : option.distNm < 1_500
        ? 32
        : option.distNm < 3_500
          ? 58
          : 110;

  const connectionPenalty = option.type === "connecting" ? 0.9 : 1.0;

  const dailyRev = Math.round(
    paxCarried * distanceMultiplier * trustMultiplier * connectionPenalty,
  );

  return {
    dailyRev,
    fillPct,
  };
}

// ─────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────

export function formatRouteTime(hours: number): string {
  if (hours <= 0) return "—";

  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;

  return `${h}h ${m}m`;
}

export function routeDifficulty(
  option: RouteResult,
): "easy" | "medium" | "hard" | "blocked" {
  if (!option.canServe) return "blocked";

  if (option.type === "direct" && option.distNm < 1_000) return "easy";
  if (option.type === "direct") return "medium";

  if (option.detourPct <= 25) return "medium";
  return "hard";
}
