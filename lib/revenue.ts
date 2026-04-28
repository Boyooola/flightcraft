/**
 * lib/revenue.ts
 *
 * SINGLE SOURCE OF TRUTH for all revenue calculations.
 * Every component that shows revenue numbers imports from here.
 * Never inline revenue math in components.
 *
 * Formula:
 *   yield_per_pax  = dist_nm × $0.12  (min $15, max $750)
 *                  × trust_bonus      (up to +25% at 100% trust)
 *
 *   gross_revenue  = delivered_pax × yield_per_pax
 *
 *   operating_cost = flights × (cost_per_sector + dist_nm × fuel_per_nm)
 *                  × pax_ratio  ← scales cost to actual delivery fraction
 *
 *   net_revenue    = gross - operating_cost  (can be negative)
 *
 * pax_ratio ensures operating cost scales with actual pax delivered:
 *   delivered 50 of 100 pax_day → pay 50% of daily operating cost
 *   delivered 100 of 100 pax_day → pay 100% of daily operating cost
 *   This prevents "pay full cost but deliver no pax" penalty spikes.
 */

import type { HaulClass } from "@/store";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const BASE_RATE_PER_NM = 0.12; // $ per nm per pax
const MIN_YIELD = 15; // floor — tiny hops still earn something
const MAX_YIELD = 750; // ceiling — ultra long haul cap

// ─────────────────────────────────────────────────────────────────
// DAILY FLIGHTS
// ─────────────────────────────────────────────────────────────────

export function dailyFlights(distNm: number, speedKts: number): number {
  const flightH = distNm / speedKts;
  return Math.max(1, Math.floor(24 / (flightH * 2)));
}

// ─────────────────────────────────────────────────────────────────
// YIELD PER PAX — distance-based
// ─────────────────────────────────────────────────────────────────

export function yieldPerPax(
  _haul: HaulClass, // kept for API compat, not used — dist drives yield
  trustPct: number,
  distNm?: number,
): number {
  const dist = distNm ?? 1000;
  const base = dist * BASE_RATE_PER_NM;
  const trustBonus = 1 + (trustPct / 100) * 0.25;
  return Math.round(
    Math.min(MAX_YIELD, Math.max(MIN_YIELD, base * trustBonus)),
  );
}

// ─────────────────────────────────────────────────────────────────
// ROUTE OPERATING COST — full daily cost
// ─────────────────────────────────────────────────────────────────

export function routeOperatingCost(
  distNm: number,
  speedKts: number,
  costPerSector: number,
  fuelPerNm: number,
): number {
  const flights = dailyFlights(distNm, speedKts);
  const costPerFlight = costPerSector + distNm * fuelPerNm;
  return Math.round(flights * costPerFlight);
}

// ─────────────────────────────────────────────────────────────────
// CORE FUNCTION — used by ALL components
//
// Returns gross, cost, and net for a given pax delivery.
// pax_ratio scales the cost: if only 50% of daily pax are delivered,
// only 50% of the daily operating cost is charged.
// ─────────────────────────────────────────────────────────────────

export interface RouteRevenueResult {
  gross: number; // pax × yield — always ≥ 0
  cost: number; // proportional operating cost — always ≥ 0
  net: number; // gross - cost — can be negative
  ypp: number; // yield per pax used
  paxRatio: number; // fraction of daily demand delivered (0-1)
}

export function calcRouteRevenue(params: {
  distNm: number;
  speedKts: number;
  trustPct: number;
  deliveredPax: number;
  paxDay: number; // daily demand — used to compute pax_ratio
  costPerSector: number;
  fuelPerNm: number;
  crowdMultiplier?: number; // 0.8 for crisis, 0.9 for overcrowded, 1.0 default
}): RouteRevenueResult {
  const {
    distNm,
    speedKts,
    trustPct,
    deliveredPax,
    paxDay,
    costPerSector,
    fuelPerNm,
    crowdMultiplier = 1.0,
  } = params;

  const ypp = yieldPerPax("short", trustPct, distNm);
  const gross = Math.round(deliveredPax * ypp * crowdMultiplier);

  // Scale operating cost to fraction of pax actually delivered
  const paxRatio = paxDay > 0 ? Math.min(1, deliveredPax / paxDay) : 0;
  const fullCost = routeOperatingCost(
    distNm,
    speedKts,
    costPerSector,
    fuelPerNm,
  );
  const cost = Math.round(fullCost * paxRatio);

  const net = gross - cost;

  return { gross, cost, net, ypp, paxRatio };
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

export function fmtCashExact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-$" : "+$";
  return sign + Math.round(abs).toLocaleString();
}

export function fmtCashShort(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-$" : "+$";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(0) + "K";
  return sign + Math.round(abs).toLocaleString();
}
