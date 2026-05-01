/**
 * lib/revenue.ts
 *
 * WorldWide Rush-style revenue system.
 *
 * CORE IDEA:
 *   - Revenue should feel immediate, readable, and rewarding.
 *   - Do NOT punish the player with heavy airline accounting early.
 *   - Player earns cash when passengers are delivered.
 *   - Completing a full demand gives a bonus.
 *   - Trust boosts payout.
 *   - Crowding slightly reduces payout.
 */

import type { HaulClass } from "@/store";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const SHORT_BASE_FARE = 18;
const MEDIUM_BASE_FARE = 42;
const LONG_BASE_FARE = 95;

const MIN_PAYOUT = 25;
const COMPLETION_BONUS = 0.25;

// ─────────────────────────────────────────────────────────────────
// DAILY FLIGHTS
// Kept for API compatibility.
// ─────────────────────────────────────────────────────────────────

export function dailyFlights(distNm: number, speedKts: number): number {
  const flightH = distNm / speedKts;
  return Math.max(1, Math.floor(24 / Math.max(1, flightH * 2)));
}

// ─────────────────────────────────────────────────────────────────
// HAUL HELPERS
// ─────────────────────────────────────────────────────────────────

function haulFromDistance(distNm: number): HaulClass {
  if (distNm < 1_000) return "short";
  if (distNm < 3_500) return "medium";
  return "long";
}

function baseFareForHaul(haul: HaulClass): number {
  if (haul === "long") return LONG_BASE_FARE;
  if (haul === "medium") return MEDIUM_BASE_FARE;
  return SHORT_BASE_FARE;
}

function distanceBonus(distNm: number): number {
  if (distNm < 300) return 1.0;
  if (distNm < 1_000) return 1.15;
  if (distNm < 2_500) return 1.35;
  if (distNm < 5_000) return 1.65;
  return 2.0;
}

function trustMultiplier(trustPct: number): number {
  const trust = Math.max(0, Math.min(100, trustPct));

  // 0 trust  = 0.85x
  // 50 trust = 1.00x
  // 100 trust = 1.25x
  if (trust < 50) return 0.85 + (trust / 50) * 0.15;
  return 1.0 + ((trust - 50) / 50) * 0.25;
}

// ─────────────────────────────────────────────────────────────────
// YIELD PER PAX
// WorldWide Rush-style fare, not realistic airline yield.
// ─────────────────────────────────────────────────────────────────

export function yieldPerPax(
  haul: HaulClass,
  trustPct: number,
  distNm?: number,
): number {
  const dist = distNm ?? 500;
  const resolvedHaul = distNm ? haulFromDistance(dist) : haul;

  const fare =
    baseFareForHaul(resolvedHaul) *
    distanceBonus(dist) *
    trustMultiplier(trustPct);

  return Math.max(MIN_PAYOUT, Math.round(fare));
}

// ─────────────────────────────────────────────────────────────────
// ROUTE OPERATING COST
// Kept for compatibility, but softened heavily.
// In WorldWide Rush style, costs should not dominate the reward loop.
// ─────────────────────────────────────────────────────────────────

export function routeOperatingCost(
  distNm: number,
  speedKts: number,
  costPerSector: number,
  fuelPerNm: number,
): number {
  const flights = dailyFlights(distNm, speedKts);
  const rawCost = flights * (costPerSector + distNm * fuelPerNm);

  // Softened to keep gameplay positive.
  return Math.round(rawCost * 0.15);
}

// ─────────────────────────────────────────────────────────────────
// CORE REVENUE FUNCTION
// ─────────────────────────────────────────────────────────────────

export interface RouteRevenueResult {
  gross: number;
  cost: number;
  net: number;
  ypp: number;
  paxRatio: number;
  completionBonus?: number;
}

export function calcRouteRevenue(params: {
  distNm: number;
  speedKts: number;
  trustPct: number;
  deliveredPax: number;
  paxDay: number;
  costPerSector: number;
  fuelPerNm: number;
  crowdMultiplier?: number;
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

  const safeDelivered = Math.max(0, deliveredPax);
  const safePaxDay = Math.max(1, paxDay);

  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm);

  const paxRatio = Math.min(1, safeDelivered / safePaxDay);
  const isCompleted = safeDelivered >= safePaxDay;

  const baseGross = Math.round(safeDelivered * ypp * crowdMultiplier);

  const completionBonus = isCompleted
    ? Math.round(baseGross * COMPLETION_BONUS)
    : 0;

  const fullCost = routeOperatingCost(
    distNm,
    speedKts,
    costPerSector,
    fuelPerNm,
  );

  const cost = Math.round(fullCost * paxRatio);

  // Important: WorldWide Rush style should usually feel rewarding.
  // Cost exists, but it should not easily make early deliveries negative.
  const gross = baseGross + completionBonus;
  const net = Math.max(0, gross - cost);

  return {
    gross,
    cost,
    net,
    ypp,
    paxRatio,
    completionBonus,
  };
}

// ─────────────────────────────────────────────────────────────────
// INSTANT DELIVERY REWARD
// Use this for popups like "+$4.2K"
// ─────────────────────────────────────────────────────────────────

export function calcInstantDeliveryReward(params: {
  distNm: number;
  trustPct: number;
  deliveredPax: number;
  crowdMultiplier?: number;
}): number {
  const { distNm, trustPct, deliveredPax, crowdMultiplier = 1.0 } = params;

  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm);

  return Math.max(0, Math.round(deliveredPax * ypp * crowdMultiplier));
}

// ─────────────────────────────────────────────────────────────────
// DEMAND COMPLETION BONUS
// Use this when a demand reaches 100% delivered.
// ─────────────────────────────────────────────────────────────────

export function calcDemandCompletionBonus(params: {
  distNm: number;
  trustPct: number;
  paxDay: number;
}): number {
  const { distNm, trustPct, paxDay } = params;

  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm);
  const base = paxDay * ypp;

  return Math.round(base * COMPLETION_BONUS);
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
