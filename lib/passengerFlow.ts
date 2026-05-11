/**
 * lib/passengerFlow.ts
 *
 * WorldWide Rush-style passenger flow helpers.
 *
 * Supports:
 * - single-plane boarding
 * - multi-plane route group boarding
 */

import type { Demand, DemandStatus } from "@/store";

export type FlowStatus = "empty" | "waiting" | "moving" | "cleared" | "jammed";

export type PassengerFlowDemand = Pick<
  Demand,
  "id" | "hub_iata" | "base_pax_day" | "delivered_pax_today"
> & {
  status?: DemandStatus | "preview";
};

export type FlowDemand = PassengerFlowDemand;

export type RouteBoardingInput = {
  id: string;
  plane: {
    id: string;
    plane_model: {
      pax_capacity: number;
    };
  };
};

export type RouteBoardingResult = {
  routeId: string;
  planeId: string;
  capacity: number;
  practicalCapacity: number;
  boarded: number;
};

export type RouteGroupBoardingResult = {
  totalBoarded: number;
  waitingBefore: number;
  totalPracticalCapacity: number;
  results: RouteBoardingResult[];
};

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
  if (demand.status === "served") return demand.base_pax_day ?? 0;

  const progress = clampDayProgress(dayProgress);

  // Smooth ease-in-out — peak spawn mid-day (rush hour feel)
  const eased =
    progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  // 20% front-load, 80% rolling. Use Math.round (not floor) so the
  // last pax spawns before dayProgress hits 1.0 exactly.
  const total = demand.base_pax_day * 0.2 + demand.base_pax_day * 0.8 * eased;

  return Math.min(demand.base_pax_day, Math.round(total));
}

export function remainingPax(demand: PassengerFlowDemand): number {
  return Math.max(
    0,
    (demand.base_pax_day ?? 0) - (demand.delivered_pax_today ?? 0),
  );
}

export function waitingPaxForDemand(
  demand: PassengerFlowDemand,
  dayProgress: number,
): number {
  const spawned = spawnedPaxForDay(demand, dayProgress);
  const delivered = demand.delivered_pax_today ?? 0;
  const remaining = remainingPax(demand);

  const waiting = spawned - delivered;

  // If negative, respawn from remaining pool
  if (waiting < 0) {
    return remaining;
  }

  return Math.max(0, Math.min(remaining, waiting));
}

function randomLoadFactor(min = 0.65, max = 1): number {
  const safeMin = Math.max(0, Math.min(1, min));
  const safeMax = Math.max(safeMin, Math.min(1, max));
  return safeMin + Math.random() * Math.max(0, safeMax - safeMin);
}

export function practicalPlaneCapacity(params: {
  planeCapacity: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): number {
  const loadFactor = randomLoadFactor(
    params.loadFactorMin ?? 0.65,
    params.loadFactorMax ?? 1,
  );

  return Math.max(1, Math.round(params.planeCapacity * loadFactor));
}

/**
 * Single-plane boarding.
 * Boards as many waiting pax as the plane can carry.
 * No random load factor — randomness caused demands to never fully clear.
 */
export function boardPassengers(params: {
  demand: PassengerFlowDemand;
  planeCapacity: number;
  dayProgress: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): number {
  const waiting = waitingPaxForDemand(params.demand, params.dayProgress);
  if (waiting <= 0) return 0;

  // Board up to plane capacity — always fill available seats with waiting pax
  return Math.min(waiting, params.planeCapacity);
}

/**
 * Multi-plane boarding for one demand / one route group.
 *
 * Use this when several active route rows share the same demand_id.
 *
 * Important:
 * - Waiting passengers are calculated once.
 * - Every plane gets a practical capacity.
 * - Passengers are distributed fairly across all assigned planes.
 * - Total boarded never exceeds waiting passengers.
 */
export function boardPassengersForRouteGroup(params: {
  demand: PassengerFlowDemand;
  routes: RouteBoardingInput[];
  dayProgress: number;
  loadFactorMin?: number;
  loadFactorMax?: number;
}): RouteGroupBoardingResult {
  const waitingBefore = waitingPaxForDemand(params.demand, params.dayProgress);

  if (waitingBefore <= 0 || params.routes.length === 0) {
    return {
      totalBoarded: 0,
      waitingBefore,
      totalPracticalCapacity: 0,
      results: params.routes.map((route) => ({
        routeId: route.id,
        planeId: route.plane.id,
        capacity: route.plane.plane_model.pax_capacity,
        practicalCapacity: 0,
        boarded: 0,
      })),
    };
  }

  const prepared = params.routes.map((route) => {
    const capacity = route.plane.plane_model.pax_capacity;
    const practicalCapacity = practicalPlaneCapacity({
      planeCapacity: capacity,
      loadFactorMin: params.loadFactorMin,
      loadFactorMax: params.loadFactorMax,
    });

    return {
      routeId: route.id,
      planeId: route.plane.id,
      capacity,
      practicalCapacity,
      boarded: 0,
    };
  });

  const totalPracticalCapacity = prepared.reduce(
    (sum, item) => sum + item.practicalCapacity,
    0,
  );

  if (totalPracticalCapacity <= 0) {
    return {
      totalBoarded: 0,
      waitingBefore,
      totalPracticalCapacity: 0,
      results: prepared,
    };
  }

  const totalBoarded = Math.min(waitingBefore, totalPracticalCapacity);

  if (totalPracticalCapacity <= waitingBefore) {
    return {
      totalBoarded,
      waitingBefore,
      totalPracticalCapacity,
      results: prepared.map((item) => ({
        ...item,
        boarded: item.practicalCapacity,
      })),
    };
  }

  let assigned = 0;

  const results = prepared.map((item) => {
    const share = item.practicalCapacity / totalPracticalCapacity;
    const boarded = Math.min(
      item.practicalCapacity,
      Math.floor(totalBoarded * share),
    );

    assigned += boarded;

    return {
      ...item,
      boarded,
    };
  });

  let remaining = totalBoarded - assigned;

  for (let i = 0; i < results.length && remaining > 0; i++) {
    const room = results[i].practicalCapacity - results[i].boarded;
    if (room <= 0) continue;

    const add = Math.min(room, remaining);
    results[i].boarded += add;
    remaining -= add;
  }

  return {
    totalBoarded,
    waitingBefore,
    totalPracticalCapacity,
    results,
  };
}

export function totalRouteGroupCapacity(routes: RouteBoardingInput[]): number {
  return routes.reduce(
    (sum, route) => sum + route.plane.plane_model.pax_capacity,
    0,
  );
}

export function routeGroupCanClearDemand(params: {
  demand: PassengerFlowDemand;
  routes: RouteBoardingInput[];
}): boolean {
  return totalRouteGroupCapacity(params.routes) >= remainingPax(params.demand);
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
  if (waiting >= Math.max(10, (demand.base_pax_day ?? 0) * 0.6))
    return "jammed";
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
  const total = hubDemands.reduce((sum, d) => sum + (d.base_pax_day ?? 0), 0);

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
