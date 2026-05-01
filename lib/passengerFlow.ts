/**
 * lib/passengerFlow.ts
 *
 * WorldWide Rush-style passenger flow helpers.
 *
 * IMPORTANT:
 *   Demand is still the source of truth.
 *   These helpers only derive passenger-flow numbers from Demand-like data.
 *   Do not store PassengerFlowDemand separately in Zustand/Supabase.
 */

import type { Demand, DemandStatus } from "@/store";

export type FlowStatus = "empty" | "waiting" | "moving" | "cleared" | "jammed";

export type PassengerFlowDemand = Pick<
  Demand,
  "id" | "hub_iata" | "pax_day" | "delivered_pax_today"
> & {
  status?: DemandStatus | "preview";
};

// Backward-compatible alias for older imports while we migrate files.
export type FlowDemand = PassengerFlowDemand;

export function clampDayProgress(dayProgress: number): number {
  return Math.max(
    0,
    Math.min(1, Number.isFinite(dayProgress) ? dayProgress : 0),
  );
}

export function spawnedPaxForDay(
  demand: PassengerFlowDemand,
  dayProgress: number,
): number {
  const paxDay = Math.max(0, demand.pax_day ?? 0);
  return Math.min(paxDay, Math.floor(paxDay * clampDayProgress(dayProgress)));
}

export function remainingPax(demand: PassengerFlowDemand): number {
  return Math.max(0, (demand.pax_day ?? 0) - (demand.delivered_pax_today ?? 0));
}

export function waitingPaxForDemand(
  demand: PassengerFlowDemand,
  dayProgress: number,
): number {
  const spawned = spawnedPaxForDay(demand, dayProgress);
  const delivered = demand.delivered_pax_today ?? 0;

  return Math.max(0, Math.min(remainingPax(demand), spawned - delivered));
}

export function boardPassengers(params: {
  demand: PassengerFlowDemand;
  planeCapacity: number;
  dayProgress: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): number {
  const waiting = waitingPaxForDemand(params.demand, params.dayProgress);
  if (waiting <= 0) return 0;

  const min = params.loadFactorMin ?? 0.65;
  const max = params.loadFactorMax ?? 1;
  const loadFactor = min + Math.random() * Math.max(0, max - min);
  const practicalCapacity = Math.max(
    1,
    Math.round(params.planeCapacity * loadFactor),
  );

  return Math.max(0, Math.min(waiting, practicalCapacity));
}

export function isDemandCleared(demand: PassengerFlowDemand): boolean {
  return demand.status === "served" || remainingPax(demand) <= 0;
}

export function demandFlowStatus(
  demand: PassengerFlowDemand,
  dayProgress: number,
): FlowStatus {
  if (isDemandCleared(demand)) return "cleared";

  const waiting = waitingPaxForDemand(demand, dayProgress);
  const delivered = demand.delivered_pax_today ?? 0;

  if (waiting <= 0 && delivered <= 0) return "empty";
  if (waiting >= Math.max(10, (demand.pax_day ?? 0) * 0.6)) return "jammed";
  if (delivered > 0) return "moving";

  return "waiting";
}

export function hubOutboundWaitingPax(
  hubIata: string,
  demands: PassengerFlowDemand[],
  dayProgress: number,
): number {
  return demands
    .filter((d) => d.hub_iata === hubIata && d.status !== "served")
    .reduce((sum, demand) => sum + waitingPaxForDemand(demand, dayProgress), 0);
}

export function hubOutboundDeliveredPax(
  hubIata: string,
  demands: PassengerFlowDemand[],
): number {
  return demands
    .filter((d) => d.hub_iata === hubIata)
    .reduce((sum, demand) => sum + (demand.delivered_pax_today ?? 0), 0);
}

export function hubFlowPercent(
  hubIata: string,
  demands: PassengerFlowDemand[],
): number {
  const hubDemands = demands.filter((d) => d.hub_iata === hubIata);
  const total = hubDemands.reduce((sum, d) => sum + (d.pax_day ?? 0), 0);
  if (total <= 0) return 0;

  return Math.min(
    100,
    Math.round((hubOutboundDeliveredPax(hubIata, demands) / total) * 100),
  );
}

export function inboundArrivalsForAirport(
  iata: string,
  demands: (PassengerFlowDemand & { dest?: { iata: string } })[],
): number {
  return demands
    .filter((d) => d.dest?.iata === iata)
    .reduce((sum, demand) => sum + (demand.delivered_pax_today ?? 0), 0);
}
