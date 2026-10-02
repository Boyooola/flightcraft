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
  /** Kept for compatibility. Passenger preference is calculated elsewhere. */
  popularityBonus: number;
  description: string;
}

export interface AircraftUtilization {
  flightsPerDay: number;
  utilization: number;
  band: UtilizationBand;
  /** Scheduling is descriptive and never changes route economics. */
  multiplier: number;
  label: string;
}

export interface RouteRevenueResult {
  gross: number;
  cost: number;
  net: number;
  ypp: number;
  loadFactor: number;
  /** Legacy alias for load factor. True market share is calculated elsewhere. */
  marketCapture: number;
  priceStrategy: PriceStrategy;
  fareMultiplier: number;
  demandMultiplier: number;
  utilization: AircraftUtilization;
  congestionMultiplier: number;
}

const MIN_FARE = 28;
const HOURS_PER_DAY = 24;
const DEFAULT_TURNAROUND_HOURS = 0.8;
const DEFAULT_BUFFER_HOURS = 0.4;

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function nonNegative(value: number): number {
  return Math.max(0, finiteNumber(value));
}

export function haulFromDistance(distNm: number): HaulClass {
  const distance = nonNegative(distNm);
  if (distance < 1_000) return "short";
  if (distance < 3_500) return "medium";
  return "long";
}

/**
 * Base fare for one passenger before passenger mix and pricing strategy.
 *
 * The stepped distance bands keep the rule easy to tune without abrupt fare
 * jumps at the short, medium, and long-haul boundaries.
 */
function distanceFare(distNm: number): number {
  const distance = nonNegative(distNm);
  const shortDistance = Math.min(distance, 1_000);
  const mediumDistance = Math.min(Math.max(distance - 1_000, 0), 2_500);
  const longDistance = Math.max(distance - 3_500, 0);

  return (
    24 + shortDistance * 0.016 + mediumDistance * 0.022 + longDistance * 0.026
  );
}

export function yieldPerPax(
  haul: HaulClass,
  trustPct: number,
  distNm?: number,
): number {
  // These parameters remain in the public API for existing callers. Haul is
  // derived from distance and trust affects passenger choice, not ticket price.
  void haul;
  void trustPct;

  const fare = distanceFare(distNm ?? 500);
  return Math.max(MIN_FARE, Math.round(fare));
}

export function computePriceElasticity(distNm: number): number {
  const distance = nonNegative(distNm);
  if (distance < 800) return 1.25;
  if (distance < 3_000) return 1;
  return 0.75;
}

export function normalizePriceStrategy(
  strategy?: string | null,
): PriceStrategy {
  if (strategy === "low" || strategy === "premium") return strategy;
  return "standard";
}

export function priceStrategyConfig(
  strategy?: string | null,
  elasticity = 1,
): PriceStrategyConfig {
  const normalized = normalizePriceStrategy(strategy);
  const safeElasticity = clamp(elasticity, 0.5, 1.5);

  if (normalized === "low") {
    return {
      strategy: "low",
      label: "Low fare",
      shortLabel: "Low",
      fareMultiplier: 0.85,
      demandMultiplier: Math.min(1.3, 1 + 0.2 * safeElasticity),
      popularityBonus: 0,
      description: "More demand, lower fare",
    };
  }

  if (normalized === "premium") {
    return {
      strategy: "premium",
      label: "Premium fare",
      shortLabel: "Premium",
      fareMultiplier: 1.2,
      demandMultiplier: Math.max(0.7, 1 - 0.18 * safeElasticity),
      popularityBonus: 0,
      description: "Higher fare, lower demand",
    };
  }

  return {
    strategy: "standard",
    label: "Standard fare",
    shortLabel: "Standard",
    fareMultiplier: 1,
    demandMultiplier: 1,
    popularityBonus: 0,
    description: "Balanced fare and demand",
  };
}

/**
 * Maximum complete service cycles an aircraft can operate in one game day.
 * One cycle includes the outbound flight, return flight, turnaround, and a
 * small recovery buffer.
 */
export function dailyFlights(
  distNm: number,
  speedKts: number,
  turnaroundHours = DEFAULT_TURNAROUND_HOURS,
  bufferHours = DEFAULT_BUFFER_HOURS,
): number {
  const distance = Math.max(1, nonNegative(distNm));
  const speed = Math.max(1, nonNegative(speedKts));
  const turnaround = nonNegative(turnaroundHours);
  const buffer = nonNegative(bufferHours);
  const cycleHours = (distance / speed) * 2 + turnaround + buffer;

  return Math.max(1, Math.floor(HOURS_PER_DAY / Math.max(1, cycleHours)));
}

export function computeAircraftUtilization(params: {
  distNm: number;
  speedKts: number;
  turnaroundHours?: number;
}): AircraftUtilization {
  const flightsPerDay = dailyFlights(
    params.distNm,
    params.speedKts,
    params.turnaroundHours,
  );
  const utilization = clamp(flightsPerDay / 4, 0, 1.5);

  if (flightsPerDay <= 1) {
    return {
      flightsPerDay,
      utilization,
      band: "underused",
      multiplier: 1,
      label: "Light schedule",
    };
  }

  if (flightsPerDay >= 6) {
    return {
      flightsPerDay,
      utilization,
      band: "overused",
      multiplier: 1,
      label: "Intensive schedule",
    };
  }

  return {
    flightsPerDay,
    utilization,
    band: "healthy",
    multiplier: 1,
    label: "Balanced schedule",
  };
}

/** Operating cost for one completed service cycle. */
function rotationOperatingCost(
  distNm: number,
  costPerSector: number,
  fuelPerNm: number,
  loadFactor: number,
): number {
  const distance = nonNegative(distNm);
  const fixedCost = nonNegative(costPerSector);
  const fuelCost = distance * nonNegative(fuelPerNm);
  const fuelLoadMultiplier = 0.92 + clamp(loadFactor, 0, 1) * 0.08;

  return Math.round(fixedCost + fuelCost * fuelLoadMultiplier);
}

/** Estimated operating cost for every scheduled cycle in one day. */
export function routeOperatingCost(
  distNm: number,
  speedKts: number,
  costPerSector: number,
  fuelPerNm: number,
  loadFactor = 1,
): number {
  const flights = dailyFlights(distNm, speedKts);
  return (
    flights *
    rotationOperatingCost(distNm, costPerSector, fuelPerNm, loadFactor)
  );
}

/**
 * Settles one completed service cycle. Only boarded passengers earn revenue;
 * the aircraft's operating cost is paid even when the flight is empty.
 */
export function calcRouteRevenue(params: {
  distNm: number;
  speedKts: number;
  trustPct: number;
  boardedPax: number;
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
  const distance = nonNegative(params.distNm);
  const seatCapacity = Math.max(
    1,
    Math.floor(nonNegative(params.seatCapacity)),
  );
  const boardedPax = Math.min(
    seatCapacity,
    Math.floor(nonNegative(params.boardedPax)),
  );
  const loadFactor = boardedPax / seatCapacity;
  const pricing = priceStrategyConfig(
    params.priceStrategy,
    params.priceElasticity,
  );
  const businessPct = nonNegative(params.businessPct);
  const leisurePct = nonNegative(params.leisurePct);
  const mixTotal = businessPct + leisurePct;
  const mix =
    mixTotal > 0
      ? {
          businessPct: businessPct / mixTotal,
          leisurePct: leisurePct / mixTotal,
        }
      : { businessPct: 0.25, leisurePct: 0.75 };
  const ypp = Math.round(
    yieldPerPax(haulFromDistance(distance), params.trustPct, distance) *
      passengerFareMultiplier(mix),
  );
  const operatingMultiplier = clamp(params.crowdMultiplier, 0, 2);
  const congestionMultiplier = clamp(params.congestionMultiplier, 0, 2);
  const gross = Math.round(
    boardedPax *
      ypp *
      pricing.fareMultiplier *
      operatingMultiplier *
      congestionMultiplier,
  );
  const cost = rotationOperatingCost(
    distance,
    params.costPerSector,
    params.fuelPerNm,
    loadFactor,
  );
  const utilization = computeAircraftUtilization({
    distNm: distance,
    speedKts: params.speedKts,
  });

  return {
    gross,
    cost,
    net: gross - cost,
    ypp,
    loadFactor,
    marketCapture: loadFactor,
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
  const principal = nonNegative(loan);
  const annualRate = nonNegative(annualRatePct) / 100;
  return Math.round((principal * annualRate) / 365);
}

function safeCashValue(value: number): number {
  const safe = finiteNumber(value);
  return Math.abs(safe) < 0.5 ? 0 : safe;
}

export function fmtCash(value: number): string {
  const safe = safeCashValue(value);
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);

  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function fmtCashExact(value: number): string {
  const safe = safeCashValue(value);
  const sign = safe < 0 ? "-$" : "+$";
  return sign + Math.round(Math.abs(safe)).toLocaleString();
}

export function fmtCashShort(value: number): string {
  const safe = safeCashValue(value);
  const abs = Math.abs(safe);
  const sign = safe < 0 ? "-$" : "+$";

  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + Math.round(abs / 1_000) + "K";
  return sign + Math.round(abs).toLocaleString();
}
