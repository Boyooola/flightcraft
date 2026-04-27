/**
 * lib/routing.ts
 *
 * Multi-leg routing logic.
 *
 * Rules:
 *   - A route is DIRECT if demand.dist_nm <= plane.range_nm
 *   - A route is CONNECTING if a mid-point airport exists where
 *     leg1 (origin→via) AND leg2 (via→dest) are each <= plane.range_nm
 *   - Player only needs to OWN the origin hub — not the via or dest
 *   - Revenue uses total_dist_nm (both legs combined)
 *   - Daily flights use the LONGEST leg (bottleneck determines turnaround)
 *   - Connecting adds a 1h ground stop at the via airport
 */

import type { Airport } from "@/store";

const TURNAROUND_H = 1; // hours on ground at each end
const GROUND_STOP_H = 1; // extra ground stop at connecting airport

export interface DirectRoute {
  type: "direct";
  distNm: number; // total distance
  maxLegNm: number; // = distNm (just one leg)
  dailyFlights: number;
}

export interface ConnectingRoute {
  type: "connecting";
  via: Airport;
  leg1Nm: number; // origin → via
  leg2Nm: number; // via → dest
  distNm: number; // leg1 + leg2 (total billed distance)
  maxLegNm: number; // max(leg1, leg2) — determines turnaround
  dailyFlights: number;
  detourPct: number; // how much longer than direct (0 = same)
}

export type RouteOption = DirectRoute | ConnectingRoute;

// ─────────────────────────────────────────────────────────────────
// HAVERSINE DISTANCE
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
// DAILY FLIGHTS
// ─────────────────────────────────────────────────────────────────

function calcDailyFlights(
  maxLegNm: number,
  speedKts: number,
  extraStopH: number = 0,
): number {
  const legH = maxLegNm / speedKts;
  const cycleH = legH * 2 + TURNAROUND_H + extraStopH;
  return Math.max(1, Math.floor(24 / cycleH));
}

// ─────────────────────────────────────────────────────────────────
// FIND CONNECTING AIRPORTS
// ─────────────────────────────────────────────────────────────────

/**
 * Find all airports that can serve as a mid-point for origin→dest
 * given a plane with rangeNm.
 *
 * Filters by:
 *   - leg1 (origin→via) <= rangeNm
 *   - leg2 (via→dest)   <= rangeNm
 *   - via is not origin or dest
 *   - via is a scheduled international/major airport (tier = major)
 *   - total detour is not more than 50% longer than direct distance
 *
 * Returns sorted by total distance (shortest connection first).
 * Capped at 30 results to keep UI manageable.
 */
export function findConnectingAirports(
  origin: Airport,
  dest: Airport,
  rangeNm: number,
  allAirports: Airport[],
  directNm: number,
): ConnectingRoute[] {
  const results: ConnectingRoute[] = [];

  for (const via of allAirports) {
    if (via.iata === origin.iata) continue;
    if (via.iata === dest.iata) continue;
    if (via.tier !== "major") continue; // only route through major airports

    const leg1 = distNm(origin, via);
    const leg2 = distNm(via, dest);

    if (leg1 > rangeNm) continue;
    if (leg2 > rangeNm) continue;

    const total = leg1 + leg2;
    const detourPct = Math.round(((total - directNm) / directNm) * 100);
    if (detourPct > 80) continue; // skip routes more than 80% longer

    const maxLeg = Math.max(leg1, leg2);
    const flights = calcDailyFlights(maxLeg, 450, GROUND_STOP_H); // 450kts avg

    results.push({
      type: "connecting",
      via,
      leg1Nm: leg1,
      leg2Nm: leg2,
      distNm: total,
      maxLegNm: maxLeg,
      dailyFlights: flights,
      detourPct,
    });
  }

  // Sort by total distance (shortest = least detour)
  results.sort((a, b) => a.distNm - b.distNm);
  return results.slice(0, 30);
}

// ─────────────────────────────────────────────────────────────────
// REVENUE ESTIMATE FOR DISPLAY
// ─────────────────────────────────────────────────────────────────

/**
 * Estimate daily revenue for a route option.
 * Uses total distance for yield (passengers pay full journey).
 * Uses daily flights from the longest leg.
 */
export function estimateRouteRevenue(
  paxDay: number,
  option: RouteOption,
  paxCap: number,
  speedKts: number,
  trustPct: number,
  haul: string,
): { dailyRev: number; fillPct: number } {
  const flights =
    option.type === "direct"
      ? calcDailyFlights(option.distNm, speedKts)
      : calcDailyFlights(option.maxLegNm, speedKts, GROUND_STOP_H);

  const capacity = paxCap * flights;
  const paxCarried = Math.min(paxDay, capacity);
  const fillPct = Math.min(100, Math.round((paxCarried / paxDay) * 100));

  const base = haul === "short" ? 0.12 : haul === "medium" ? 0.09 : 0.07;
  const distFactor = Math.sqrt(option.distNm / 500);
  const trustBonus = 1 + (trustPct / 100) * 0.5;
  const ypp = base * distFactor * trustBonus;
  const dailyRev = Math.round(paxCarried * ypp * option.distNm);

  return { dailyRev, fillPct };
}
