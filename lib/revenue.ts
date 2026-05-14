/**
 * lib/revenue.ts
 *
 * v0.3.0 revenue system:
 * - Dynamic pricing affects fare and demand.
 * - Elasticity varies by route distance.
 * - Aircraft utilization affects final profit.
 * - Hub congestion affects efficiency.
 * - Routes can be negative until enough pax are delivered.
 */

import {
  passengerElasticityMultiplier,
  passengerFareMultiplier,
} from "@/lib/passengerTypes";
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
  paxRatio: number;
  completionBonus: number;
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
const COMPLETION_BONUS = 0.25;
const MIN_DAILY_COST_RATIO = 0.45;

export function dailyFlights(distNm: number, speedKts: number): number {
  const flightH = distNm / Math.max(1, speedKts);
  return Math.max(1, Math.floor(24 / Math.max(1, flightH * 2)));
}

export function computeAircraftUtilization(params: {
  distNm: number;
  speedKts: number;
  turnaroundHours?: number;
}): AircraftUtilization {
  const { distNm, speedKts, turnaroundHours = 1 } = params;

  const flightHours = distNm / Math.max(1, speedKts);
  const roundTripHours = flightHours * 2 + turnaroundHours;
  const flightsPerDay = Math.max(
    1,
    Math.floor(24 / Math.max(1, roundTripHours)),
  );

  const utilization = Math.min(1.6, flightsPerDay / 4);

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
      multiplier: 0.92,
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
  if (trust < 50) return 0.85 + (trust / 50) * 0.15;
  return 1.0 + ((trust - 50) / 50) * 0.25;
}

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

export function computePriceElasticity(distNm: number): number {
  if (distNm < 800) return 1.25;
  if (distNm < 3_000) return 1.0;
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
  const safeElasticity = Math.max(0.5, Math.min(1.5, elasticity));

  if (normalized === "low") {
    return {
      strategy: "low",
      label: "Low Fare",
      shortLabel: "Low",
      fareMultiplier: 0.85,
      demandMultiplier: 1 + 0.25 * safeElasticity,
      popularityBonus: 1,
      description: "+Demand, -Profit",
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
      description: "+Profit, -Demand",
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

export function routeOperatingCost(
  distNm: number,
  speedKts: number,
  costPerSector: number,
  fuelPerNm: number,
): number {
  const flights = dailyFlights(distNm, speedKts);
  const rawCost = flights * (costPerSector + distNm * fuelPerNm);
  return Math.round(rawCost * 0.22);
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
  priceStrategy?: PriceStrategy | string | null;
  priceElasticity?: number;
  congestionMultiplier?: number;
  businessPct?: number;
  leisurePct?: number;
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
    priceStrategy = "standard",
    priceElasticity = computePriceElasticity(distNm),
    congestionMultiplier = 1.0,
    businessPct = 0.25,
    leisurePct = 0.75,
  } = params;

  const mix = { businessPct, leisurePct };
  const fareMul = passengerFareMultiplier(mix);
  const elasMul = passengerElasticityMultiplier(mix);

  const safeDelivered = Math.max(0, deliveredPax);
  const safePaxDay = Math.max(1, paxDay);

  const pricing = priceStrategyConfig(priceStrategy, priceElasticity);
  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm) * fareMul;

  const paxRatio = Math.min(1, safeDelivered / safePaxDay);
  const isCompleted = safeDelivered >= safePaxDay;

  const baseGross = Math.round(
    safeDelivered *
      ypp *
      pricing.fareMultiplier *
      crowdMultiplier *
      congestionMultiplier,
  );

  const completionBonus = isCompleted
    ? Math.round(baseGross * COMPLETION_BONUS)
    : 0;

  const fullCost = routeOperatingCost(
    distNm,
    speedKts,
    costPerSector,
    fuelPerNm,
  );

  const costRatio = Math.max(MIN_DAILY_COST_RATIO, paxRatio);
  const cost = Math.round(fullCost * costRatio * elasMul);

  const utilization = computeAircraftUtilization({ distNm, speedKts });

  const gross = baseGross + completionBonus;
  const net = Math.round((gross - cost) * utilization.multiplier);

  return {
    gross,
    cost,
    net,
    ypp,
    paxRatio,
    completionBonus,
    priceStrategy: pricing.strategy,
    fareMultiplier: pricing.fareMultiplier,
    demandMultiplier: pricing.demandMultiplier,
    utilization,
    congestionMultiplier,
  };
}

export function calcInstantDeliveryReward(params: {
  distNm: number;
  trustPct: number;
  deliveredPax: number;
  crowdMultiplier?: number;
  priceStrategy?: PriceStrategy | string | null;
  priceElasticity?: number;
  congestionMultiplier?: number;
  businessPct?: number;
  leisurePct?: number;
  // O&D via route params — if set, uses O&D split revenue
  viaPaxRatio?: number | null;
  leg1DistNm?: number | null;
  leg2DistNm?: number | null;
}): number {
  const {
    distNm,
    trustPct,
    deliveredPax,
    crowdMultiplier = 1.0,
    priceStrategy = "standard",
    priceElasticity = computePriceElasticity(distNm),
    congestionMultiplier = 1.0,
    businessPct = 0.25,
    leisurePct = 0.75,
    viaPaxRatio,
    leg1DistNm,
    leg2DistNm,
  } = params;

  // ── O&D via route — split revenue across two legs ──────────────
  if (viaPaxRatio != null && leg1DistNm != null && leg2DistNm != null) {
    const { calcOdRevenue } = require("@/lib/od");
    const pricing = priceStrategyConfig(priceStrategy, priceElasticity);
    const od = calcOdRevenue({
      totalDeliveredPax: deliveredPax,
      viaPaxRatio,
      leg1DistNm,
      leg2DistNm,
      trustPct,
      fareMultiplier: pricing.fareMultiplier,
      businessPct,
      leisurePct,
    });
    return Math.max(
      0,
      Math.round(od.totalRevenue * crowdMultiplier * congestionMultiplier),
    );
  }

  // ── Standard point-to-point route ─────────────────────────────
  const mix = { businessPct, leisurePct };
  const fareMul = passengerFareMultiplier(mix);

  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm) * fareMul;
  const pricing = priceStrategyConfig(priceStrategy, priceElasticity);

  return Math.max(
    0,
    Math.round(
      deliveredPax *
        ypp *
        pricing.fareMultiplier *
        crowdMultiplier *
        congestionMultiplier,
    ),
  );
}

export function calcDemandCompletionBonus(params: {
  distNm: number;
  trustPct: number;
  paxDay: number;
  priceStrategy?: PriceStrategy | string | null;
  priceElasticity?: number;
}): number {
  const {
    distNm,
    trustPct,
    paxDay,
    priceStrategy = "standard",
    priceElasticity = computePriceElasticity(distNm),
  } = params;

  const haul = haulFromDistance(distNm);
  const ypp = yieldPerPax(haul, trustPct, distNm);
  const pricing = priceStrategyConfig(priceStrategy, priceElasticity);
  const base = paxDay * ypp * pricing.fareMultiplier;

  return Math.round(base * COMPLETION_BONUS);
}

export function dailyInterest(loan: number, annualRatePct: number): number {
  return Math.round((loan * (annualRatePct / 100)) / 365);
}

export function fmtCash(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000)
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}K`;

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
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + Math.round(abs / 1000) + "K";
  return sign + Math.round(abs).toLocaleString();
}
