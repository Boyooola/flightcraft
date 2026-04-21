/**
 * lib/revenue.ts
 *
 * Pure revenue calculation functions.
 * No React, no RN — safe to unit test.
 * Identical to the web FlightcraftRevenue.tsx formulas.
 */

import type { HaulClass, OwnedHub, Route } from "@/types";

const TURNAROUND_H = 1; // 1 hour turnaround between flights

// ── Daily flights ──────────────────────────────────────────────────
export function dailyFlights(distNm: number, speedKts: number): number {
  const flightH = distNm / speedKts;
  return Math.max(1, Math.floor(24 / (flightH * 2 + TURNAROUND_H)));
}

// ── Yield per pax ──────────────────────────────────────────────────
export function yieldPerPax(
  haul: HaulClass,
  distNm: number,
  trustPct: number,
  day: number,
  inflation: boolean,
): number {
  const base = haul === "short" ? 0.12 : haul === "medium" ? 0.09 : 0.07;
  const distFactor = Math.sqrt(distNm / 500);
  const trustBonus = 1 + (trustPct / 100) * 0.5;
  const inflMod = inflation ? 1 + (day / 365) * 0.03 : 1;
  return base * distFactor * trustBonus * inflMod;
}

// ── Route daily revenue ────────────────────────────────────────────
export function calcRouteDailyRevenue(
  route: Route,
  hub: OwnedHub,
  day: number,
  inflation: boolean,
): number {
  const { demand, plane } = route;
  const flights = dailyFlights(demand.dist_nm, plane.plane_model.speed_kts);
  const capacity = plane.plane_model.pax_capacity * flights;
  const paxCarried = Math.min(demand.pax_day, capacity);
  const ypp = yieldPerPax(
    demand.haul,
    demand.dist_nm,
    hub.trust,
    day,
    inflation,
  );
  return Math.round(paxCarried * ypp * demand.dist_nm);
}

// ── Daily interest ─────────────────────────────────────────────────
export function dailyInterest(loan: number, annualRatePct: number): number {
  return Math.round((loan * (annualRatePct / 100)) / 365);
}

// ── Format cash ───────────────────────────────────────────────────
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
