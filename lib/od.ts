/**
 * lib/od.ts
 *
 * Origin & Destination (O&D) economics for connecting (via) routes.
 *
 * ONLY applies to routes with a via stop (via_iata is set).
 * Point-to-point routes are unaffected.
 *
 * A via route MNL → DXB → LHR carries two types of passengers:
 *   LOCAL   — board at MNL, deplane at DXB (leg 1 only)
 *   TRANSIT — board at MNL, continue to LHR (both legs)
 *
 * The split is computed automatically from route characteristics.
 * Players never set it manually — it emerges from the network.
 *
 * Transit passengers pay a fare premium (THROUGH_FARE_PREMIUM)
 * because they are booking a full connecting itinerary.
 */

import { haulFromDistance, yieldPerPax } from "@/lib/revenue";
import type { Airport, AirportTier } from "@/store";

// Through-passenger fare premium over local leg fare
export const THROUGH_FARE_PREMIUM = 1.35;

// Clamp range for auto-computed ratio
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.7;

// Minimum absolute transit pax regardless of ratio
// A connecting route must always have meaningful through traffic
const MIN_TRANSIT_PAX = 5;

// Airport tier weights — higher tier = more connecting traffic
const TIER_APPEAL: Record<AirportTier, number> = {
  mega: 1.0, // mega hub — LHR, DXB, SIN → lots of through pax
  large: 0.75, // large hub
  major: 0.55, // major airport
  minor: 0.35, // small airport
  regional: 0.2, // regional
  local: 0.1, // local airport — mostly origin/destination, few connections
};

export interface OdSplit {
  localPax: number;
  transitPax: number;
  viaPaxRatio: number;
}

export interface OdRevenueResult {
  leg1Revenue: number;
  leg2Revenue: number;
  totalRevenue: number;
  localPax: number;
  transitPax: number;
  throughPremium: number;
}

/**
 * Automatically compute via_pax_ratio from route characteristics.
 * Called when a connecting route is created and updated daily.
 *
 * Higher ratio = more transit pax (up to MAX_RATIO).
 * Lower ratio  = more local pax  (down to MIN_RATIO).
 */
export function computeViaPaxRatio(params: {
  leg1Nm: number; // origin → via distance
  leg2Nm: number; // via → dest distance
  viaAirport: Airport; // the stopover airport
  destAirport: Airport; // final destination
  businessPct: number; // from demand (0–1)
}): number {
  const { leg1Nm, leg2Nm, viaAirport, destAirport, businessPct } = params;

  const totalNm = leg1Nm + leg2Nm;
  if (totalNm === 0) return MIN_RATIO;

  // Factor 1: leg ratio — longer second leg means more committed through pax
  // e.g. MNL→DXB(3200nm)→LHR(3400nm): leg2/total = 0.51 → more transit
  // e.g. SIN→KUL(250nm)→BKK(800nm):   leg2/total = 0.76 → very high transit
  const legRatio = leg2Nm / totalNm;

  // Factor 2: final destination appeal — major hubs attract through pax
  const destTier = destAirport.tier ?? 3;
  const destAppeal = TIER_APPEAL[destTier] ?? 0.5;

  // Factor 3: stopover appeal — if via airport is very major,
  // more pax actually WANT to stop there (reduces transit ratio)
  const viaTier = viaAirport.tier ?? 3;
  const viaLocal = TIER_APPEAL[viaTier] ?? 0.5; // high = more local demand at via

  // Factor 4: business pax are more likely to be through-routing
  const bizBonus = 0.8 + businessPct * 0.4; // 0.8 → 1.2

  // Combine factors
  // Base: legRatio drives the primary split
  // Scaled by: destAppeal (pull through) and inverse viaLocal (push through)
  const raw =
    legRatio *
    destAppeal *
    (1.2 - viaLocal * 0.4) * // high via appeal reduces transit (pax stop there)
    bizBonus;

  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, raw));
}

/**
 * Split total pax into local and transit.
 * Enforces MIN_TRANSIT_PAX — a connecting route always has
 * meaningful through traffic to the final destination.
 */
export function splitOdPax(totalPax: number, viaPaxRatio: number): OdSplit {
  const ratio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, viaPaxRatio));

  // Raw split
  let transitPax = Math.round(totalPax * ratio);

  // Enforce minimum absolute transit count
  // A connecting route must always deliver pax to the final destination
  transitPax = Math.max(MIN_TRANSIT_PAX, transitPax);

  // But never more than 80% of total (always some local pax)
  transitPax = Math.min(transitPax, Math.floor(totalPax * MAX_RATIO));

  // If total pax is too small to support a connecting route
  // (can't meet minimum transit), clamp to what's available
  transitPax = Math.min(transitPax, totalPax);

  const localPax = Math.max(0, totalPax - transitPax);

  return { localPax, transitPax, viaPaxRatio: ratio };
}

/**
 * Calculate revenue for a connecting route with O&D split.
 *
 * Leg 1 revenue: all pax (local + transit) × leg1 fare
 * Leg 2 revenue: transit pax only × leg2 fare × THROUGH_FARE_PREMIUM
 */
export function calcOdRevenue(params: {
  totalDeliveredPax: number;
  viaPaxRatio: number;
  leg1DistNm: number;
  leg2DistNm: number;
  trustPct: number;
  fareMultiplier: number;
}): OdRevenueResult {
  const {
    totalDeliveredPax,
    viaPaxRatio,
    leg1DistNm,
    leg2DistNm,
    trustPct,
    fareMultiplier,
  } = params;

  const { localPax, transitPax } = splitOdPax(totalDeliveredPax, viaPaxRatio);

  const leg1Ypp = yieldPerPax(
    haulFromDistance(leg1DistNm),
    trustPct,
    leg1DistNm,
  );
  const leg2Ypp = yieldPerPax(
    haulFromDistance(leg2DistNm),
    trustPct,
    leg2DistNm,
  );

  // Leg 1: all pax fly this segment
  const leg1Revenue = Math.round(
    (localPax + transitPax) * leg1Ypp * fareMultiplier,
  );

  // Leg 2: only transit pax, with through-fare premium
  const leg2Revenue = Math.round(
    transitPax * leg2Ypp * fareMultiplier * THROUGH_FARE_PREMIUM,
  );

  const throughPremium = Math.round(
    transitPax * leg2Ypp * fareMultiplier * (THROUGH_FARE_PREMIUM - 1),
  );

  return {
    leg1Revenue,
    leg2Revenue,
    totalRevenue: leg1Revenue + leg2Revenue,
    localPax,
    transitPax,
    throughPremium,
  };
}

/**
 * Format split for display in RoutesSheet.
 * e.g. "42 local · 18 transit"
 * Returns null if demand is too low to show a meaningful split.
 */
export function formatOdSplit(
  localPax: number,
  transitPax: number,
  totalPax: number,
): string | null {
  // Don't show split if total demand is too low to be meaningful
  if (totalPax < 8) return null;
  return `${localPax} local · ${transitPax} transit`;
}
