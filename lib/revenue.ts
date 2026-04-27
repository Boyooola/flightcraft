/**
 * lib/revenue.ts
 *
 * Passenger-based revenue simulation.
 *
 * ECONOMY BALANCE (tuned for ~60-90 day plane payoff on good routes):
 *
 *   Yield per pax:
 *     Short  (<1000nm):  $120/pax base  (was $85)
 *     Medium (1-3500nm): $280/pax base  (was $220)
 *     Long   (>3500nm):  $550/pax base  (was $480)
 *
 *   Load factor base: 70% (was 65%)
 *   Trust yield bonus: up to +25% at 100% trust
 *
 *   Example — MNL→SIN (medium, 425 pax/day, E170 at 60% of old price):
 *     Revenue ≈ $119K/day → recoups plane in ~16 days ✓
 *
 *   Example — MNL→CEB (short, 120 pax/day):
 *     Revenue ≈ $14K/day → recoups CRJ in ~60 days ✓
 */

import type { HaulClass, OwnedHub, Route } from "@/store";

// ─────────────────────────────────────────────────────────────────
// DAILY FLIGHTS
// ─────────────────────────────────────────────────────────────────

export function dailyFlights(distNm: number, speedKts: number): number {
  const flightH = distNm / speedKts;
  return Math.max(1, Math.floor(24 / (flightH * 2)));
}

// ─────────────────────────────────────────────────────────────────
// YIELD PER PAX — rebalanced
// ─────────────────────────────────────────────────────────────────

const YIELD_TABLE: Record<HaulClass, number> = {
  short: 120, // $120/pax — commuter + leisure
  medium: 280, // $280/pax — regional international
  long: 550, // $550/pax — long haul premium
};

export function yieldPerPax(haul: HaulClass, trustPct: number): number {
  const base = YIELD_TABLE[haul];
  const trustBonus = 1 + (trustPct / 100) * 0.25; // +25% at full trust
  return base * trustBonus;
}

// ─────────────────────────────────────────────────────────────────
// SIMULATE FLIGHT PAX
// ─────────────────────────────────────────────────────────────────

export function simulateFlightPax(
  demandPaxDay: number,
  planeCapacity: number,
  flightsPerDay: number,
  trustPct: number,
  dayNumber: number,
): number {
  const demandPerFlight = demandPaxDay / Math.max(1, flightsPerDay);

  // Day-of-week effect
  const dayOfWeek = dayNumber % 7;
  const isWeekend = dayOfWeek >= 5;
  const weekendMod = isWeekend ? 1.15 : 0.97;

  // Trust boost — higher trust = more repeat bookings
  const trustBoost = 1 + (trustPct / 100) * 0.25;
  const baseLoad = 0.7 * trustBoost * weekendMod; // 70% base (was 65%)

  // Variance ±20%
  const variance = 0.8 + Math.random() * 0.4;
  const loadFactor = Math.min(0.98, baseLoad * variance);

  const seatsAvail = Math.round(planeCapacity * loadFactor);
  return Math.min(Math.round(demandPerFlight), seatsAvail, planeCapacity);
}

// ─────────────────────────────────────────────────────────────────
// SIMULATE ROUTE — full daily passenger simulation
// ─────────────────────────────────────────────────────────────────

export interface RouteSimResult {
  paxCarried: number;
  revenue: number;
  flightsMade: number;
  loadFactor: number;
}

export function simulateRoute(
  route: Route,
  hub: OwnedHub,
  dayNumber: number,
): RouteSimResult {
  const { demand, plane } = route;
  const distNm = route.total_dist_nm ?? demand.dist_nm;
  const flights = dailyFlights(distNm, plane.plane_model.speed_kts);
  const capacity = plane.plane_model.pax_capacity;
  const trustPct = hub.trust;

  let totalPax = 0;
  for (let f = 0; f < flights; f++) {
    totalPax += simulateFlightPax(
      demand.pax_day,
      capacity,
      flights,
      trustPct,
      dayNumber + f,
    );
  }
  totalPax = Math.min(totalPax, demand.pax_day);

  const ypp = yieldPerPax(demand.haul, trustPct);
  const revenue = Math.round(totalPax * ypp);
  const lf = capacity * flights > 0 ? totalPax / (capacity * flights) : 0;

  return {
    paxCarried: totalPax,
    revenue,
    flightsMade: flights,
    loadFactor: Math.round(lf * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────
// DAILY INTEREST
// ─────────────────────────────────────────────────────────────────

export function dailyInterest(loan: number, annualRatePct: number): number {
  return Math.round((loan * (annualRatePct / 100)) / 365);
}

// ─────────────────────────────────────────────────────────────────
// FORMAT CASH
// ─────────────────────────────────────────────────────────────────

export function fmtCash(v: number): string {
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return "$" + (v / 1_000).toFixed(0) + "K";
  return "$" + Math.round(v).toLocaleString();
}

export function fmtCashShort(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-$" : "+$";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(0) + "K";
  return sign + Math.round(abs).toLocaleString();
}

// Legacy compat shim
export function calcRouteDailyRevenue(
  route: Route,
  hub: OwnedHub,
  day: number,
  _inflation: boolean,
): number {
  return simulateRoute(route, hub, day).revenue;
}
