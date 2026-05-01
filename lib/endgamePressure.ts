/**
 * lib/endgamePressure.ts
 *
 * Endgame pressure layer — Phase 1.
 *
 * Airport congestion is the foundation for Global Rush:
 * waiting travelers push hubs into busy / overcrowded / crisis states.
 * Those states reduce reward output and slowly damage trust.
 */

import { hubOutboundWaitingPax } from "@/lib/passengerFlow";
import type { Airport, Demand, OwnedHub } from "@/store";

export type PressureLevel = "normal" | "busy" | "overcrowded" | "crisis";

export interface HubPressure {
  hubIata: string;
  level: PressureLevel;
  waitingPax: number;
  capacity: number;
  capacityPct: number;
  rewardMultiplier: number;
  trustDelta: number;
  collapsePoints: number;
}

function fallbackPaxAnnual(airport: Pick<Airport, "tier" | "pax_annual_m">) {
  if (airport.pax_annual_m != null) return airport.pax_annual_m;
  if (airport.tier === "mega") return 60;
  if (airport.tier === "large") return 25;
  if (airport.tier === "major") return 8;
  if (airport.tier === "regional") return 2;
  if (airport.tier === "minor") return 0.5;
  return 0.15;
}

export function airportQueueCapacity(
  airport: Pick<Airport, "tier" | "pax_annual_m">,
) {
  const paxM = fallbackPaxAnnual(airport);

  if (paxM >= 40) return 1_400;
  if (paxM >= 10) return 850;
  if (paxM >= 2) return 420;
  if (paxM >= 0.5) return 220;

  return 120;
}

export function pressureLevelForPct(capacityPct: number): PressureLevel {
  if (capacityPct >= 150) return "crisis";
  if (capacityPct >= 100) return "overcrowded";
  if (capacityPct >= 55) return "busy";
  return "normal";
}

export function rewardMultiplierForPressure(level: PressureLevel) {
  if (level === "crisis") return 0.75;
  if (level === "overcrowded") return 0.88;
  if (level === "busy") return 0.96;
  return 1;
}

export function trustDeltaForPressure(level: PressureLevel) {
  if (level === "crisis") return -6;
  if (level === "overcrowded") return -3;
  if (level === "busy") return -1;
  return 0;
}

export function collapsePointsForPressure(level: PressureLevel) {
  if (level === "crisis") return 2;
  if (level === "overcrowded") return 1;
  return 0;
}

export function computeHubPressure(params: {
  hub: OwnedHub;
  demands: Demand[];
  dayProgress: number;
}): HubPressure {
  const { hub, demands, dayProgress } = params;
  const waitingPax = hubOutboundWaitingPax(
    hub.airport.iata,
    demands,
    dayProgress,
  );

  const capacity = airportQueueCapacity(hub.airport);
  const capacityPct =
    capacity > 0 ? Math.round((waitingPax / capacity) * 100) : 0;
  const level = pressureLevelForPct(capacityPct);

  return {
    hubIata: hub.airport.iata,
    level,
    waitingPax,
    capacity,
    capacityPct,
    rewardMultiplier: rewardMultiplierForPressure(level),
    trustDelta: trustDeltaForPressure(level),
    collapsePoints: collapsePointsForPressure(level),
  };
}

export function summarizeNetworkPressure(pressures: HubPressure[]) {
  const totalWaitingPax = pressures.reduce((sum, p) => sum + p.waitingPax, 0);
  const busyHubs = pressures.filter((p) => p.level === "busy").length;
  const overcrowdedHubs = pressures.filter(
    (p) => p.level === "overcrowded",
  ).length;
  const crisisHubs = pressures.filter((p) => p.level === "crisis").length;
  const collapsePoints = pressures.reduce(
    (sum, p) => sum + p.collapsePoints,
    0,
  );

  const worst =
    pressures.find((p) => p.level === "crisis") ??
    pressures.find((p) => p.level === "overcrowded") ??
    pressures.find((p) => p.level === "busy") ??
    null;

  return {
    totalWaitingPax,
    busyHubs,
    overcrowdedHubs,
    crisisHubs,
    collapsePoints,
    worst,
  };
}

export function pressureWarningMessage(pressure: HubPressure): string | null {
  if (pressure.level === "normal") return null;

  const waiting = pressure.waitingPax.toLocaleString();

  if (pressure.level === "busy") {
    return `${pressure.hubIata} is getting busy — ${waiting} travelers waiting. Add capacity before trust drops.`;
  }

  if (pressure.level === "overcrowded") {
    return `${pressure.hubIata} is overcrowded — ${waiting} travelers stuck. Rewards and trust are taking a hit.`;
  }

  return `Crisis at ${pressure.hubIata} — ${waiting} travelers stuck. Rivals may capture this market.`;
}
