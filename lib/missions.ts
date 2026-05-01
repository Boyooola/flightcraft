/**
 * lib/missions.ts
 *
 * WorldWide Rush-style missions.
 *
 * CORE IDEA:
 *   - Missions should feel like quick transport contracts.
 *   - Focus on visible demand slots, delivery, cash rewards, and hub flow.
 *   - Avoid heavy "business admin" missions early.
 *   - Always generate up to 3 clear objectives.
 */

import type { Airport, OwnedHub, Route } from "@/store";

export type MissionType =
  | "route_create"
  | "pax_carry"
  | "revenue_earn"
  | "trust_grow"
  | "loan_repay"
  | "fill_rate"
  | "clear_crowding"
  | "plane_buy"
  | "no_crowding";

export interface Mission {
  id: string;
  day: number;
  type: MissionType;
  title: string;
  desc: string;
  reward: number;
  completed: boolean;
  target: {
    originIata?: string;
    destIata?: string;
    haul?: string;
    paxTarget?: number;
    revenueTarget?: number;
    hubIata?: string;
    trustTarget?: number;
    repayTarget?: number;
    fillTarget?: number;
    crowdHubIata?: string;
  };
}

export interface MissionContext {
  day: number;
  cash: number;
  loan: number;
  activeRoutes: number;
  totalPaxToday: number;
  dailyRevenue: number;
  hubs: OwnedHub[];
  demands: {
    hub_iata: string;
    origin: Airport;
    dest: Airport;
    haul: string;
    status: string;
    pax_day: number;
  }[];
  pendingDemands: {
    hub_iata: string;
    origin: Airport;
    dest: Airport;
    haul: string;
  }[];
  lowestTrust: number;
  anyOvercrowded: boolean;
  overcrowdedHub: string | null;
}

export interface MissionProgress {
  totalPaxToday: number;
  totalRevToday: number;
  loan: number;
  hubs: OwnedHub[];
  routes: Route[];
  demands: {
    id: string;
    hub_iata: string;
    origin: Airport;
    dest: Airport;
    haul: string;
    delivered_pax_today: number;
    pax_day: number;
  }[];
  loanRepaidToday: number;
  anyOvercrowded: boolean;
  overcrowdedHub?: string;
  boughtPlaneToday: boolean;
}

// ─────────────────────────────────────────────────────────────────
// FORMAT / SCALING
// ─────────────────────────────────────────────────────────────────

function fmtMissionCash(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function rewardForDay(day: number, base: number): number {
  const multiplier =
    day <= 3 ? 1 : day <= 10 ? 1.5 : day <= 25 ? 2.5 : day <= 50 ? 4 : 6;

  return Math.round((base * multiplier) / 500) * 500;
}

function missionId(day: number, type: MissionType, extra = ""): string {
  return `mission-${type}-${day}${extra ? `-${extra}` : ""}`;
}

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function activeDemandList(ctx: MissionContext) {
  return ctx.demands.filter(
    (d) => d.status !== "served" && d.status !== "expired",
  );
}

// ─────────────────────────────────────────────────────────────────
// WORLDWIDE RUSH-STYLE MISSION BUILDERS
// ─────────────────────────────────────────────────────────────────

function serveSpecificDemandMission(
  ctx: MissionContext,
  day: number,
): Mission | null {
  const demand = randomPick(ctx.pendingDemands);
  if (!demand) return null;

  const reward =
    demand.haul === "long"
      ? rewardForDay(day, 45_000)
      : demand.haul === "medium"
        ? rewardForDay(day, 28_000)
        : rewardForDay(day, 15_000);

  return {
    id: missionId(
      day,
      "route_create",
      `${demand.origin.iata}-${demand.dest.iata}`,
    ),
    day,
    type: "route_create",
    title: `Serve ${demand.origin.iata} → ${demand.dest.iata}`,
    desc: `Open a flight route for this demand slot.`,
    reward,
    completed: false,
    target: {
      originIata: demand.origin.iata,
      destIata: demand.dest.iata,
    },
  };
}

function serveAnyDemandMission(
  ctx: MissionContext,
  day: number,
): Mission | null {
  const active = activeDemandList(ctx);
  if (active.length === 0) return null;

  const reward = rewardForDay(day, 12_000);

  return {
    id: missionId(day, "fill_rate", "clear-one-slot"),
    day,
    type: "fill_rate",
    title: "Clear 1 Demand Slot",
    desc: "Fully deliver passengers for any active demand.",
    reward,
    completed: false,
    target: {
      fillTarget: 100,
    },
  };
}

function paxCarryMission(ctx: MissionContext, day: number): Mission {
  const active = activeDemandList(ctx);

  const visibleDemandPax = active.reduce((sum, d) => sum + d.pax_day, 0);

  const target =
    ctx.totalPaxToday > 0
      ? Math.ceil(Math.max(20, ctx.totalPaxToday * 1.1) / 10) * 10
      : Math.ceil(Math.max(30, visibleDemandPax * 0.35) / 10) * 10;

  return {
    id: missionId(day, "pax_carry"),
    day,
    type: "pax_carry",
    title: `Carry ${target.toLocaleString()} Pax`,
    desc: `Move ${target.toLocaleString()} passengers today.`,
    reward: rewardForDay(day, Math.max(8_000, target * 45)),
    completed: false,
    target: {
      paxTarget: target,
    },
  };
}

function revenueEarnMission(ctx: MissionContext, day: number): Mission {
  const target =
    ctx.dailyRevenue > 0
      ? Math.ceil((ctx.dailyRevenue * 1.15) / 1000) * 1000
      : Math.max(5_000, ctx.activeRoutes * 6_000);

  return {
    id: missionId(day, "revenue_earn"),
    day,
    type: "revenue_earn",
    title: `Earn ${fmtMissionCash(target)}`,
    desc: `Collect ${fmtMissionCash(target)} from passenger deliveries.`,
    reward: rewardForDay(day, Math.max(7_500, target * 0.18)),
    completed: false,
    target: {
      revenueTarget: target,
    },
  };
}

function trustGrowMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.hubs.length === 0) return null;

  const hub = ctx.hubs.reduce(
    (lowest, h) => (h.trust < lowest.trust ? h : lowest),
    ctx.hubs[0],
  );

  const target = Math.min(100, Math.ceil((hub.trust + 5) / 5) * 5);
  if (hub.trust >= target) return null;

  return {
    id: missionId(day, "trust_grow", hub.airport.iata),
    day,
    type: "trust_grow",
    title: `Boost ${hub.airport.iata} Trust`,
    desc: `Raise ${hub.airport.city} trust to ${target}%.`,
    reward: rewardForDay(day, 12_000),
    completed: false,
    target: {
      hubIata: hub.airport.iata,
      trustTarget: target,
    },
  };
}

function clearCrowdingMission(
  ctx: MissionContext,
  day: number,
): Mission | null {
  if (!ctx.anyOvercrowded || !ctx.overcrowdedHub) return null;

  return {
    id: missionId(day, "clear_crowding", ctx.overcrowdedHub),
    day,
    type: "clear_crowding",
    title: `Clear ${ctx.overcrowdedHub}`,
    desc: `Reduce overcrowding by serving waiting passengers.`,
    reward: rewardForDay(day, 30_000),
    completed: false,
    target: {
      crowdHubIata: ctx.overcrowdedHub,
    },
  };
}

function planeBuyMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.pendingDemands.length < 2) return null;
  if (ctx.cash < 250_000) return null;

  return {
    id: missionId(day, "plane_buy"),
    day,
    type: "plane_buy",
    title: "Add 1 Plane",
    desc: "Buy a new aircraft to move more passengers.",
    reward: rewardForDay(day, 10_000),
    completed: false,
    target: {},
  };
}

function noCrowdingMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.hubs.length < 2) return null;
  if (ctx.anyOvercrowded) return null;

  return {
    id: missionId(day, "no_crowding"),
    day,
    type: "no_crowding",
    title: "Keep Flow Smooth",
    desc: "End the day with no overcrowded hubs.",
    reward: rewardForDay(day, 15_000),
    completed: false,
    target: {},
  };
}

function loanRepayMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.loan <= 0) return null;
  if (day < 7) return null;

  const target = Math.min(ctx.loan, Math.ceil((ctx.loan * 0.05) / 5000) * 5000);
  if (target <= 0) return null;

  return {
    id: missionId(day, "loan_repay"),
    day,
    type: "loan_repay",
    title: `Repay ${fmtMissionCash(target)}`,
    desc: `Pay down part of your loan.`,
    reward: rewardForDay(day, 12_000),
    completed: false,
    target: {
      repayTarget: target,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// GENERATE MISSIONS
// ─────────────────────────────────────────────────────────────────

export function generateDailyMissions(ctx: MissionContext): Mission[] {
  const day = ctx.day;
  const missions: Mission[] = [];
  const usedTypes = new Set<MissionType>();

  const priorityBuilders: (() => Mission | null)[] = [];

  if (ctx.anyOvercrowded) {
    priorityBuilders.push(() => clearCrowdingMission(ctx, day));
  }

  priorityBuilders.push(
    () => serveSpecificDemandMission(ctx, day),
    () => serveAnyDemandMission(ctx, day),
    () => paxCarryMission(ctx, day),
    () => revenueEarnMission(ctx, day),
    () => trustGrowMission(ctx, day),
    () => planeBuyMission(ctx, day),
    () => noCrowdingMission(ctx, day),
    () => loanRepayMission(ctx, day),
  );

  for (const build of priorityBuilders) {
    if (missions.length >= 3) break;

    const mission = build();
    if (!mission) continue;
    if (usedTypes.has(mission.type)) continue;

    missions.push(mission);
    usedTypes.add(mission.type);
  }

  return missions;
}

// ─────────────────────────────────────────────────────────────────
// CHECK COMPLETION
// ─────────────────────────────────────────────────────────────────

export function checkMissionComplete(
  mission: Mission,
  prog: MissionProgress,
): boolean {
  if (mission.completed) return true;

  const t = mission.target;

  switch (mission.type) {
    case "route_create": {
      if (t.originIata && t.destIata) {
        return prog.routes.some(
          (r) =>
            r.active &&
            r.demand.origin.iata === t.originIata &&
            r.demand.dest.iata === t.destIata,
        );
      }

      return prog.routes.some((r) => r.active && r.demand.haul === t.haul);
    }

    case "pax_carry":
      return prog.totalPaxToday >= (t.paxTarget ?? 0);

    case "revenue_earn":
      return prog.totalRevToday >= (t.revenueTarget ?? 0);

    case "trust_grow": {
      const hub = prog.hubs.find((h) => h.airport.iata === t.hubIata);
      return hub ? hub.trust >= (t.trustTarget ?? 0) : false;
    }

    case "loan_repay":
      return prog.loanRepaidToday >= (t.repayTarget ?? 0);

    case "fill_rate":
      return prog.demands.some((d) => {
        if (d.pax_day <= 0) return false;
        return (d.delivered_pax_today / d.pax_day) * 100 >= (t.fillTarget ?? 0);
      });

    case "clear_crowding":
      return !prog.anyOvercrowded || prog.overcrowdedHub !== t.crowdHubIata;

    case "plane_buy":
      return prog.boughtPlaneToday;

    case "no_crowding":
      return !prog.anyOvercrowded;

    default:
      return false;
  }
}
