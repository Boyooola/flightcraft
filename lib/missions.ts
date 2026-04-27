/**
 * lib/missions.ts
 *
 * Daily missions — 3 generated per game-day, expire at end of day.
 * Targets scale with yesterday's performance so they're always achievable.
 *
 * 10 mission types:
 *   route_create   — open a specific or any route
 *   pax_carry      — carry N passengers today
 *   revenue_earn   — earn $X today
 *   trust_grow     — reach X% trust at a hub
 *   loan_repay     — pay back $X of loan
 *   fill_rate      — achieve X% fill on any route
 *   clear_crowding — relieve an overcrowded hub
 *   plane_buy      — buy a new aircraft today
 *   no_crowding    — keep all hubs below busy threshold
 *   consecutive    — earn positive revenue (tracked via day)
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
  totalPaxToday: number; // yesterday's pax (before reset)
  dailyRevenue: number; // yesterday's revenue
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
// REWARD SCALING
// ─────────────────────────────────────────────────────────────────

function rewardScale(day: number): number {
  if (day <= 5) return 0.3;
  if (day <= 15) return 0.6;
  if (day <= 30) return 1.0;
  if (day <= 60) return 2.0;
  return 4.0;
}

function scaledReward(base: number, day: number): number {
  return Math.round((base * rewardScale(day)) / 1000) * 1000;
}

function fmtMissionCash(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────
// MISSION BUILDERS
// ─────────────────────────────────────────────────────────────────

function routeCreateMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.pendingDemands.length === 0) return null;
  const pick =
    ctx.pendingDemands[Math.floor(Math.random() * ctx.pendingDemands.length)];
  const specific = Math.random() > 0.4;
  const reward = scaledReward(
    pick.haul === "long" ? 80_000 : pick.haul === "medium" ? 50_000 : 30_000,
    day,
  );
  return {
    id: `mission-route-${day}-${pick.origin.iata}-${pick.dest.iata}`,
    day,
    type: "route_create",
    title: specific
      ? `Open ${pick.origin.iata} → ${pick.dest.iata}`
      : `Open a ${pick.haul} haul route`,
    desc: specific
      ? `Create a route from ${pick.origin.city} to ${pick.dest.city} today.`
      : `Open any ${pick.haul} haul route from one of your hubs.`,
    reward,
    completed: false,
    target: {
      originIata: specific ? pick.origin.iata : undefined,
      destIata: specific ? pick.dest.iata : undefined,
      haul: specific ? undefined : pick.haul,
    },
  };
}

function paxCarryMission(ctx: MissionContext, day: number): Mission {
  // Use yesterday's pax if available, else estimate from active routes
  const estimated = Math.max(30, ctx.activeRoutes * 80);
  const base =
    ctx.totalPaxToday > 0
      ? Math.round(ctx.totalPaxToday * (1.05 + Math.random() * 0.2))
      : estimated;
  const target = Math.max(10, Math.ceil(base / 10) * 10);
  const reward = scaledReward(Math.max(15_000, target * 50), day);
  return {
    id: `mission-pax-${day}`,
    day,
    type: "pax_carry",
    title: `Carry ${target.toLocaleString()} Passengers`,
    desc: `Deliver ${target.toLocaleString()} passengers across all routes today.`,
    reward,
    completed: false,
    target: { paxTarget: target },
  };
}

function revenueEarnMission(ctx: MissionContext, day: number): Mission {
  // Use yesterday's revenue if available, else estimate from active routes
  const estimated = Math.max(5_000, ctx.activeRoutes * 8_000);
  const base =
    ctx.dailyRevenue > 0
      ? Math.round(ctx.dailyRevenue * (1.05 + Math.random() * 0.2))
      : estimated;
  const target = Math.max(1_000, Math.ceil(base / 1_000) * 1_000);
  const reward = scaledReward(Math.max(10_000, target * 0.25), day);
  return {
    id: `mission-rev-${day}`,
    day,
    type: "revenue_earn",
    title: `Earn ${fmtMissionCash(target)} Today`,
    desc: `Generate ${fmtMissionCash(target)} in revenue from your routes today.`,
    reward,
    completed: false,
    target: { revenueTarget: target },
  };
}

function trustGrowMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.hubs.length === 0) return null;
  const hub = ctx.hubs.reduce(
    (min, h) => (h.trust < min.trust ? h : min),
    ctx.hubs[0],
  );
  const target = Math.min(
    100,
    Math.ceil((hub.trust + 10 + Math.random() * 10) / 5) * 5,
  );
  if (hub.trust >= target) return null;
  const reward = scaledReward(20_000, day);
  return {
    id: `mission-trust-${day}-${hub.airport.iata}`,
    day,
    type: "trust_grow",
    title: `Grow ${hub.airport.iata} Trust to ${target}%`,
    desc: `Increase passenger trust at ${hub.airport.city} to ${target}%.`,
    reward,
    completed: false,
    target: { hubIata: hub.airport.iata, trustTarget: target },
  };
}

function loanRepayMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.loan <= 0) return null;
  const target = Math.min(
    ctx.loan,
    Math.ceil((ctx.loan * (0.05 + Math.random() * 0.08)) / 10_000) * 10_000,
  );
  if (target <= 0) return null;
  const reward = scaledReward(15_000, day);
  return {
    id: `mission-loan-${day}`,
    day,
    type: "loan_repay",
    title: `Repay ${fmtMissionCash(target)} of Loan`,
    desc: `Pay back ${fmtMissionCash(target)} of your outstanding loan today.`,
    reward,
    completed: false,
    target: { repayTarget: target },
  };
}

function fillRateMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.activeRoutes === 0) return null;
  const target = day <= 10 ? 50 : day <= 30 ? 65 : 75;
  const reward = scaledReward(20_000, day);
  return {
    id: `mission-fill-${day}`,
    day,
    type: "fill_rate",
    title: `Achieve ${target}% Fill Rate`,
    desc: `Get any of your routes to ${target}% passenger fill today.`,
    reward,
    completed: false,
    target: { fillTarget: target },
  };
}

function clearCrowdingMission(
  ctx: MissionContext,
  day: number,
): Mission | null {
  if (!ctx.anyOvercrowded || !ctx.overcrowdedHub) return null;
  const reward = scaledReward(60_000, day);
  return {
    id: `mission-crowd-${day}-${ctx.overcrowdedHub}`,
    day,
    type: "clear_crowding",
    title: `Relieve ${ctx.overcrowdedHub} Congestion`,
    desc: `Serve more demands at ${ctx.overcrowdedHub} to reduce passenger backlog.`,
    reward,
    completed: false,
    target: { crowdHubIata: ctx.overcrowdedHub },
  };
}

function planeBuyMission(ctx: MissionContext, day: number): Mission | null {
  // Only suggest buying a plane if they have unserved demands and enough cash
  if (ctx.pendingDemands.length === 0) return null;
  if (ctx.cash < 1_000_000) return null;
  const reward = scaledReward(25_000, day);
  return {
    id: `mission-plane-${day}`,
    day,
    type: "plane_buy",
    title: "Expand Your Fleet",
    desc: "Purchase any new aircraft from the Fleet tab today.",
    reward,
    completed: false,
    target: {},
  };
}

function noCrowdingMission(ctx: MissionContext, day: number): Mission | null {
  if (ctx.hubs.length < 2) return null; // need multiple hubs to be meaningful
  if (ctx.anyOvercrowded) return null; // already overcrowded — use clear_crowding instead
  const reward = scaledReward(30_000, day);
  return {
    id: `mission-nocrowd-${day}`,
    day,
    type: "no_crowding",
    title: "Keep Hubs Clear",
    desc: "End the day with no overcrowded hubs across your network.",
    reward,
    completed: false,
    target: {},
  };
}

// ─────────────────────────────────────────────────────────────────
// GENERATE 3 MISSIONS — always varied types
// ─────────────────────────────────────────────────────────────────

export function generateDailyMissions(ctx: MissionContext): Mission[] {
  const { day } = ctx;
  const missions: Mission[] = [];
  const usedTypes = new Set<MissionType>();

  // Shuffled priority — varies each day
  const builders: (() => Mission | null)[] = [
    () =>
      !usedTypes.has("route_create") ? routeCreateMission(ctx, day) : null,
    () => (!usedTypes.has("pax_carry") ? paxCarryMission(ctx, day) : null),
    () =>
      !usedTypes.has("revenue_earn") ? revenueEarnMission(ctx, day) : null,
    () =>
      !usedTypes.has("clear_crowding") ? clearCrowdingMission(ctx, day) : null,
    () => (!usedTypes.has("plane_buy") ? planeBuyMission(ctx, day) : null),
    () => (!usedTypes.has("trust_grow") ? trustGrowMission(ctx, day) : null),
    () => (!usedTypes.has("fill_rate") ? fillRateMission(ctx, day) : null),
    () => (!usedTypes.has("loan_repay") ? loanRepayMission(ctx, day) : null),
    () => (!usedTypes.has("no_crowding") ? noCrowdingMission(ctx, day) : null),
  ].sort(() => Math.random() - 0.5);

  for (const build of builders) {
    if (missions.length >= 3) break;
    const m = build();
    if (!m) continue;
    missions.push(m);
    usedTypes.add(m.type);
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
    case "route_create":
      if (t.originIata && t.destIata) {
        return prog.routes.some(
          (r) =>
            r.active &&
            r.demand.origin.iata === t.originIata &&
            r.demand.dest.iata === t.destIata,
        );
      }
      return prog.routes.some((r) => r.active && r.demand.haul === t.haul);

    case "pax_carry":
      return prog.totalPaxToday >= (t.paxTarget ?? 0);

    case "revenue_earn":
      return prog.totalRevToday >= (t.revenueTarget ?? 0);

    case "trust_grow": {
      if (t.hubIata === "__all__") {
        return prog.hubs.every((h) => h.trust >= (t.trustTarget ?? 0));
      }
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
