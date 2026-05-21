/**
 * lib/revenue.ts
 *
 * v0.4.0 revenue system
 *
 * Improvements:
 * - Proper utilization-based fixed cost amortization
 * - Demand elasticity affects realized passengers
 * - More realistic aircraft productivity
 * - Explicit load factor support
 * - Stable fixed vs variable airline economics
 * - Sequential group filling retained
 */

import { passengerFareMultiplier } from "@/lib/passengerTypes";

import type { HaulClass } from "@/store";

export type PriceStrategy = "low" | "standard" | "premium";
export type UtilizationBand = "underused" | "healthy" | "overused";

export interface PriceStrategyConfig {
  strategy: PriceStrategy;
  label: string;
  shortLabel: string;
  fareMultiplier: number;
  demandMultiplier: number;
  popularityBonus: number;
  description: string;
}

export interface AircraftUtilization {
  flightsPerDay: number;
  utilization: number;
  band: UtilizationBand;
  multiplier: number;
  label: string;
}

export interface RouteRevenueResult {
  gross: number;
  cost: number;
  net: number;

  ypp: number;

  loadFactor: number;
  marketCapture: number;

  priceStrategy: PriceStrategy;
  fareMultiplier: number;
  demandMultiplier: number;

  utilization: AircraftUtilization;

  congestionMultiplier: number;
}

const SHORT_BASE_FARE = 28;
const MEDIUM_BASE_FARE = 42;
const LONG_BASE_FARE = 95;

const MIN_PAYOUT = 30;

/**
 * Real airline economics:
 *
 * ~90–95% fixed
 * ~5–10% passenger-variable
 */

const FIXED_COST_RATIO = 0.93;
const VARIABLE_COST_RATIO = 0.07;

export function haulFromDistance(distNm: number): HaulClass {
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

  if (trust < 50) {
    return 0.85 + (trust / 50) * 0.15;
  }

  return 1.0 + ((trust - 50) / 50) * 0.25;
}

export function yieldPerPax(
  haul: HaulClass,
  trustPct: number,
  distNm?: number,
): number {
  const dist = distNm ?? 500;
  const resolvedHaul = distNm ? haulFromDistance(distNm) : haul;

  const fare =
    baseFareForHaul(resolvedHaul) *
    distanceBonus(dist) *
    trustMultiplier(trustPct);

  return Math.max(MIN_PAYOUT, Math.round(fare));
}

export function computePriceElasticity(distNm: number): number {
  if (distNm < 800) return 1.25;
  if (distNm < 3_000) return 1.0;
  return 0.75;
}

export function normalizePriceStrategy(
  strategy?: string | null,
): PriceStrategy {
  if (strategy === "low" || strategy === "premium") {
    return strategy;
  }

  return "standard";
}

export function priceStrategyConfig(
  strategy?: string | null,
  elasticity = 1,
): PriceStrategyConfig {
  const normalized = normalizePriceStrategy(strategy);

  const safeElasticity = Math.max(0.5, Math.min(1.5, elasticity));

  if (normalized === "low") {
    return {
      strategy: "low",
      label: "Low Fare",
      shortLabel: "Low",
      fareMultiplier: 0.85,
      demandMultiplier: 1 + 0.25 * safeElasticity,
      popularityBonus: 1,
      description: "+Demand, -Yield",
    };
  }

  if (normalized === "premium") {
    return {
      strategy: "premium",
      label: "Premium",
      shortLabel: "Premium",
      fareMultiplier: 1.28,
      demandMultiplier: Math.max(0.55, 1 - 0.2 * safeElasticity),
      popularityBonus: -1,
      description: "+Yield, -Demand",
    };
  }

  return {
    strategy: "standard",
    label: "Standard",
    shortLabel: "Standard",
    fareMultiplier: 1,
    demandMultiplier: 1,
    popularityBonus: 0,
    description: "Balanced",
  };
}

/**
 * Realistic aircraft productivity.
 *
 * Includes:
 * - flight time
 * - turnaround time
 * - operational buffer
 */

export function dailyFlights(
  distNm: number,
  speedKts: number,
  turnaroundHours = 0.8,
  bufferHours = 0.4,
): number {
  const flightHours = distNm / Math.max(1, speedKts);

  const cycleHours = flightHours * 2 + turnaroundHours + bufferHours;

  return Math.max(1, Math.floor(24 / Math.max(1, cycleHours)));
}

export function computeAircraftUtilization(params: {
  distNm: number;
  speedKts: number;
  turnaroundHours?: number;
}): AircraftUtilization {
  const { distNm, speedKts, turnaroundHours = 0.8 } = params;

  const flightsPerDay = dailyFlights(distNm, speedKts, turnaroundHours);

  const utilization = Math.min(1.5, flightsPerDay / 4);

  if (utilization < 0.6) {
    return {
      flightsPerDay,
      utilization,
      band: "underused",
      multiplier: 0.88,
      label: "Underused",
    };
  }

  if (utilization > 1.15) {
    return {
      flightsPerDay,
      utilization,
      band: "overused",
      multiplier: 0.94,
      label: "Overused",
    };
  }

  return {
    flightsPerDay,
    utilization,
    band: "healthy",
    multiplier: 1.0,
    label: "Healthy",
  };
}

export function routeOperatingCost(
  distNm: number,
  speedKts: number,
  costPerSector: number,
  fuelPerNm: number,
  loadFactor = 1,
): number {
  const flights = dailyFlights(distNm, speedKts);

  /**
   * Fuel varies slightly with load.
   * Most costs remain fixed.
   */

  const fuelMultiplier = 0.92 + loadFactor * 0.08;

  const rawCost =
    flights * (costPerSector + distNm * fuelPerNm * fuelMultiplier);

  return Math.round(rawCost);
}

export function calcRouteRevenue(params: {
  distNm: number;
  speedKts: number;
  trustPct: number;
  /** Actual passengers boarded this rotation */
  boardedPax: number;
  /** Maximum seats on this plane */
  seatCapacity: number;
  costPerSector: number;
  fuelPerNm: number;
  crowdMultiplier: number;
  priceStrategy: PriceStrategy | string | null;
  priceElasticity: number;
  congestionMultiplier: number;
  businessPct: number;
  leisurePct: number;
}): RouteRevenueResult {
  const {
    distNm,
    speedKts,
    trustPct,
    boardedPax,
    seatCapacity,
    costPerSector,
    fuelPerNm,
    crowdMultiplier = 1.0,
    priceStrategy = "standard",
    priceElasticity = computePriceElasticity(distNm),
    congestionMultiplier = 1.0,
    businessPct = 0.25,
    leisurePct = 0.75,
  } = params;

  const mix = { businessPct, leisurePct };
  const fareMul = passengerFareMultiplier(mix);

  const safeBoarded = Math.max(0, Math.min(boardedPax, seatCapacity));
  const safeSeatCap = Math.max(1, seatCapacity);

  const pricing = priceStrategyConfig(priceStrategy, priceElasticity);
  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm) * fareMul;

  // Load factor — how full the plane is (0–1)
  const loadFactor = safeBoarded / safeSeatCap;
  // Market capture — how much of seated pax were delivered
  const marketCapture = loadFactor;

  // Revenue — only from boarded pax
  const gross = Math.round(
    safeBoarded *
      ypp *
      pricing.fareMultiplier *
      crowdMultiplier *
      congestionMultiplier,
  );

  // Utilization
  const utilization = computeAircraftUtilization({ distNm, speedKts });

  // Cost per rotation — daily cost divided by rotations
  const rotations = Math.max(1, dailyFlights(distNm, speedKts));
  const dailyCost = routeOperatingCost(
    distNm,
    speedKts,
    costPerSector,
    fuelPerNm,
    loadFactor,
  );
  const costPerRotation = Math.round(dailyCost / rotations);

  // Fixed costs — paid regardless of how many pax boarded
  const fixedCost = Math.round(
    (costPerRotation * FIXED_COST_RATIO) /
      Math.max(0.7, utilization.multiplier),
  );
  // Variable costs — tiny portion that scales with load
  const variableCost = Math.round(
    costPerRotation * VARIABLE_COST_RATIO * loadFactor,
  );

  const cost = fixedCost + variableCost;
  const net = gross - cost;

  return {
    gross,
    cost,
    net,
    ypp,
    loadFactor,
    marketCapture,
    priceStrategy: pricing.strategy,
    fareMultiplier: pricing.fareMultiplier,
    demandMultiplier: pricing.demandMultiplier,
    utilization,
    congestionMultiplier,
  };
}

export interface GroupRevenueResult {
  net: number;
  gross: number;
  totalCost: number;
  perRoute: (RouteRevenueResult & { boardedPax: number })[];
}

export function dailyInterest(loan: number, annualRatePct: number): number {
  return Math.round((loan * (annualRatePct / 100)) / 365);
}

export function fmtCash(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }

  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1000)}K`;
  }

  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function fmtCashExact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-$" : "+$";

  return sign + Math.round(abs).toLocaleString();
}

export function fmtCashShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-$" : "+$";

  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(1) + "M";
  }

  if (abs >= 1_000) {
    return sign + Math.round(abs / 1000) + "K";
  }

  return sign + Math.round(abs).toLocaleString();
}
