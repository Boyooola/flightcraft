/**
 * lib/AIAirline.ts
 *
 * AIAirline type + deterministic state computation.
 */

import {
  passengerElasticityMultiplier,
  passengerMixFromDistance,
} from "@/lib/passengerTypes";
import { calcRouteRevenue } from "@/lib/revenue";
import { seedHash } from "@/lib/seed";
import { Demand } from "@/store";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface AIAirline {
  id: string;
  name: string;
  color: string;
  difficulty: "passive" | "balanced" | "aggressive";
  seed: string;
  index: number;
  day: number;
  cash: number;
  loan: number;
  netWorth: number;
  score: number;
  demandScore: number;
  reputation: number;
  trust: number;
  hubIatas: string[];
  routeCount: number;
  planeCount: number;
}

const AI_NAMES = [
  "SkyAsia Airways",
  "EuroWings",
  "PacificAir",
  "Gulf Express",
  "AmeriJet",
  "ArcticAir",
  "SunRoute",
  "BlazeAir",
  "StarluxConnect",
  "TerraFly",
  "OrbitAir",
  "NovaSky",
];

const AI_COLORS = [
  "#ef4444",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const DIFFICULTY_PARAMS = {
  passive: {
    growthMultiplier: 0.35,
    trust: 30,
    reputation: 45,
    expansionInterval: 8,
    startingCash: 1_000_000,
    startingRoutes: 2,
    startingHubs: 1,
  },
  balanced: {
    growthMultiplier: 0.6,
    trust: 45,
    reputation: 60,
    expansionInterval: 5,
    startingCash: 1_500_000,
    startingRoutes: 4,
    startingHubs: 1,
  },
  aggressive: {
    growthMultiplier: 0.9,
    trust: 65,
    reputation: 75,
    expansionInterval: 3,
    startingCash: 2_000_000,
    startingRoutes: 6,
    startingHubs: 2,
  },
};

export function pickAIHubs(
  gameSeed: string,
  aiIndex: number,
  count: number,
  airports: import("@/store").Airport[],
): string[] {
  const tierScore: Record<string, number> = {
    mega: 100,
    major: 70,
    large: 50,
    minor: 30,
    regional: 10,
    local: 5,
  };

  const ranked = [...airports]
    .map((a) => ({
      iata: a.iata,
      score:
        a.pax_annual_m != null
          ? a.pax_annual_m * 10
          : (tierScore[a.tier ?? "regional"] ?? 10),
    }))
    .filter((a) => a.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80);

  if (ranked.length === 0) return [];

  const picked: string[] = [];
  let attempts = 0;
  while (picked.length < count && attempts < ranked.length * 2) {
    const idx =
      seedHash(gameSeed, "ai", aiIndex, "hub", attempts) % ranked.length;
    const iata = ranked[idx].iata;
    if (!picked.includes(iata)) picked.push(iata);
    attempts++;
  }
  return picked;
}

export function buildAIRoutes(
  ai: AIAirline,
  airports: import("@/store").Airport[],
): {
  id: string;
  origin: import("@/store").Airport;
  dest: import("@/store").Airport;
  color: string;
}[] {
  if (ai.routeCount === 0 || airports.length === 0) return [];

  const tierScore: Record<string, number> = {
    mega: 100,
    major: 70,
    large: 50,
    minor: 30,
    regional: 10,
    local: 5,
  };

  const pool = [...airports]
    .map((a) => ({
      airport: a,
      score:
        a.pax_annual_m != null
          ? a.pax_annual_m * 10
          : (tierScore[a.tier ?? "regional"] ?? 10),
    }))
    .filter((a) => a.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((a) => a.airport);

  if (pool.length < 2) return [];

  const routes: {
    id: string;
    origin: import("@/store").Airport;
    dest: import("@/store").Airport;
    color: string;
  }[] = [];
  const aiSeed = `${ai.seed}-ai-${ai.index}`;

  for (const hubIata of ai.hubIatas) {
    const hub = airports.find((a) => a.iata === hubIata);
    if (!hub) continue;

    const routesFromHub = Math.max(
      1,
      Math.ceil(ai.routeCount / Math.max(1, ai.hubIatas.length)),
    );

    for (let r = 0; r < routesFromHub && routes.length < ai.routeCount; r++) {
      const destIdx = seedHash(aiSeed, "route", hubIata, r) % pool.length;
      const dest = pool[destIdx];
      if (dest.iata === hubIata) continue;

      const exists = routes.some(
        (rt) => rt.origin.iata === hubIata && rt.dest.iata === dest.iata,
      );
      if (!exists) {
        routes.push({
          id: `${ai.id}-${hubIata}-${dest.iata}`,
          origin: hub,
          dest,
          color: ai.color,
        });
      }
    }
  }

  return routes;
}

// ─────────────────────────────────────────────────────────────────
// DETERMINISTIC AI STATE
// ─────────────────────────────────────────────────────────────────

export function computeAIState(
  gameSeed: string,
  index: number,
  day: number,
  difficulty: "passive" | "balanced" | "aggressive",
  airports: import("@/store").Airport[] = [],
): AIAirline {
  const params = DIFFICULTY_PARAMS[difficulty];
  const aiSeed = `${gameSeed}-ai-${index}`;

  const name = AI_NAMES[seedHash(aiSeed, "name") % AI_NAMES.length];
  const color = AI_COLORS[seedHash(aiSeed, "color") % AI_COLORS.length];

  const steps = Math.floor(day / params.expansionInterval);
  const maxHubs = Math.min(10, params.startingHubs + Math.floor(steps / 2));
  const hubIatas = pickAIHubs(aiSeed, index, maxHubs, airports);
  const routeCount = Math.min(50, params.startingRoutes + steps);
  const planeCount = Math.max(1, Math.floor(routeCount * 0.8));

  // Passenger mix based on AI's typical route distance
  const avgDistNm = 1500 + (seedHash(aiSeed, "avgdist") % 3000);
  const avgPaxDay = 80 + (seedHash(aiSeed, "avgpax") % 200);
  const aiMix = passengerMixFromDistance(avgDistNm);

  const dailyNetPerRoute = calcRouteRevenue({
    distNm: avgDistNm,
    speedKts: 450,
    trustPct: params.trust,
    deliveredPax: Math.round(avgPaxDay * (params.trust / 100)),
    paxDay: avgPaxDay,
    costPerSector: 400,
    fuelPerNm: 2.0,
    // Passenger mix — business-heavy AI routes yield more per pax
    businessPct: aiMix.businessPct,
    leisurePct: aiMix.leisurePct,
  }).net;

  const dailyNet = dailyNetPerRoute * routeCount * params.growthMultiplier;
  const cash = params.startingCash + Math.round(dailyNet * day);
  const loan = Math.max(0, params.startingCash * 0.5 - day * 5000);
  const netWorth = Math.max(0, cash - loan);

  const demandScore = routeCount;
  const reputation = Math.min(100, params.reputation + Math.floor(day * 0.1));
  const score = Math.round(
    netWorth * 0.35 + demandScore * 1000 * 0.35 + reputation * 500 * 0.15,
  );

  return {
    id: `ai-${gameSeed}-${index}`,
    name,
    color,
    difficulty,
    seed: gameSeed,
    index,
    day,
    cash,
    loan,
    netWorth,
    score,
    demandScore,
    reputation,
    trust: params.trust,
    hubIatas,
    routeCount,
    planeCount,
  };
}

// ─────────────────────────────────────────────────────────────────
// AI RESPONDS TO PLAYER
// ─────────────────────────────────────────────────────────────────

export function computeAIResponseMultiplier(
  ai: AIAirline,
  playerHubIatas: string[],
): number {
  if (ai.difficulty !== "aggressive") return 1.0;
  const sharedHubs = playerHubIatas.filter((iata) =>
    ai.hubIatas.includes(iata),
  ).length;
  if (sharedHubs >= 3) return 1.5;
  if (sharedHubs >= 1) return 1.25;
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────
// COMPETITION NOTIFICATION DATA
// ─────────────────────────────────────────────────────────────────

export function getNewAIRouteConflicts(
  gameSeed: string,
  aiIndex: number,
  currentDay: number,
  difficulty: "passive" | "balanced" | "aggressive",
  playerDemands: { origin: { iata: string }; dest: { iata: string } }[],
  airports: import("@/store").Airport[],
): { aiName: string; origin: string; dest: string }[] {
  if (currentDay < 2) return [];

  const current = computeAIState(
    gameSeed,
    aiIndex,
    currentDay,
    difficulty,
    airports,
  );
  const previous = computeAIState(
    gameSeed,
    aiIndex,
    currentDay - 1,
    difficulty,
    airports,
  );

  if (current.routeCount <= previous.routeCount) return [];

  const aiSeed = `${gameSeed}-ai-${aiIndex}`;
  const conflicts: { aiName: string; origin: string; dest: string }[] = [];

  for (const demand of playerDemands) {
    const operatesNow =
      seedHash(aiSeed, "route", demand.origin.iata, demand.dest.iata) % 100 <
      Math.min(60, current.routeCount * 3);
    const operatedPrev =
      seedHash(aiSeed, "route", demand.origin.iata, demand.dest.iata) % 100 <
      Math.min(60, previous.routeCount * 3);
    if (operatesNow && !operatedPrev) {
      conflicts.push({
        aiName: current.name,
        origin: demand.origin.iata,
        dest: demand.dest.iata,
      });
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────
// MARKET SHARE
// ─────────────────────────────────────────────────────────────────

export function computePlayerMarketShare(
  playerTrust: number,
  aiAirlines: any[],
  origin: string,
  dest: string,
): number {
  const competitors = aiAirlines.filter((ai) => {
    const destinationMarket =
      seedHash(ai.seed, "ai", ai.index, "destination", dest) % 100 <
      Math.min(70, ai.routeCount * 4);
    const exactCorridor =
      seedHash(ai.seed, "ai", ai.index, "route", origin, dest) % 100 <
      Math.min(45, ai.routeCount * 2);
    return destinationMarket || exactCorridor;
  });

  if (competitors.length === 0) return 1.0;

  const safePlayerTrust = Math.max(20, playerTrust);
  const playerWeight = safePlayerTrust + 35;

  const totalAIWeight = competitors.reduce((sum, ai) => {
    const difficultyBonus =
      ai.difficulty === "aggressive"
        ? 1.25
        : ai.difficulty === "balanced"
          ? 1.0
          : 0.75;
    return sum + ai.trust * difficultyBonus;
  }, 0);

  const share = playerWeight / Math.max(1, playerWeight + totalAIWeight);
  return Math.max(0.35, Math.min(1, share));
}

// ─────────────────────────────────────────────────────────────────
// WORLDWIDE RUSH AI PRESSURE
// ─────────────────────────────────────────────────────────────────

export interface AIPressureSteal {
  aiId: string;
  aiName: string;
  aiColor: string;
  demandId: string;
  originIata: string;
  destIata: string;
  stolenPax: number;
  waitingBefore: number;
}

export interface AIPressureResult {
  totalStolenPax: number;
  steals: AIPressureSteal[];
  demandUpdates: { demandId: string; base_pax_day: number }[];
}

const AI_PRESSURE_CONFIG = {
  passive: {
    minWaiting: 260,
    maxStealRate: 0.08,
    baseContestChance: 18,
    hubBonus: 16,
  },
  balanced: {
    minWaiting: 140,
    maxStealRate: 0.15,
    baseContestChance: 34,
    hubBonus: 22,
  },
  aggressive: {
    minWaiting: 70,
    maxStealRate: 0.25,
    baseContestChance: 52,
    hubBonus: 30,
  },
} satisfies Record<
  AIAirline["difficulty"],
  {
    minWaiting: number;
    maxStealRate: number;
    baseContestChance: number;
    hubBonus: number;
  }
>;

function aiContestChance(ai: AIAirline, origin: string, dest: string): number {
  const cfg = AI_PRESSURE_CONFIG[ai.difficulty];
  const hubOverlap = ai.hubIatas.includes(origin) || ai.hubIatas.includes(dest);
  const routeReach = Math.min(34, ai.routeCount * 2);
  return Math.min(
    88,
    cfg.baseContestChance + routeReach + (hubOverlap ? cfg.hubBonus : 0),
  );
}

export function aiCanContestDemand(ai: AIAirline, demand: Demand): boolean {
  const roll =
    seedHash(
      ai.seed,
      "ai-pressure",
      ai.index,
      demand.origin.iata,
      demand.dest.iata,
    ) % 100;
  return roll < aiContestChance(ai, demand.origin.iata, demand.dest.iata);
}

function aiStealRate(
  ai: AIAirline,
  waitingPax: number,
  paxDay: number,
  demand?: Demand,
): number {
  const cfg = AI_PRESSURE_CONFIG[ai.difficulty];
  const pressure = Math.min(1, waitingPax / Math.max(1, paxDay));
  const trustFactor = Math.max(0.55, Math.min(1.25, ai.trust / 75));
  const difficultyFactor =
    ai.difficulty === "aggressive"
      ? 1.15
      : ai.difficulty === "passive"
        ? 0.75
        : 1;

  // Passenger mix elasticity:
  //   Leisure passengers switch airlines readily  → easier to steal (elasticity > 1)
  //   Business passengers are brand-loyal         → harder to steal (elasticity < 1)
  const mix = demand
    ? {
        businessPct: demand.business_pct ?? 0.25,
        leisurePct: demand.leisure_pct ?? 0.75,
      }
    : { businessPct: 0.25, leisurePct: 0.75 };
  const elasticity = passengerElasticityMultiplier(mix);

  return Math.min(
    cfg.maxStealRate,
    cfg.maxStealRate * pressure * trustFactor * difficultyFactor * elasticity,
  );
}

export function applyAIPressure(params: {
  demands: Demand[];
  aiAirlines: AIAirline[];
  day: number;
  waitingForDemand: (demand: Demand) => number;
}): AIPressureResult {
  if (params.aiAirlines.length === 0) {
    return { totalStolenPax: 0, steals: [], demandUpdates: [] };
  }

  const steals: AIPressureSteal[] = [];
  const nextPaxDayByDemand = new Map<string, number>();

  for (const demand of params.demands) {
    if (demand.status === "served") continue;

    const currentPaxDay =
      nextPaxDayByDemand.get(demand.id) ?? demand.base_pax_day;
    const currentDemand = { ...demand, base_pax_day: currentPaxDay };
    const waiting = params.waitingForDemand(currentDemand);

    const eligibleAis = params.aiAirlines.filter((ai) => {
      const cfg = AI_PRESSURE_CONFIG[ai.difficulty];
      return waiting >= cfg.minWaiting && aiCanContestDemand(ai, demand);
    });

    if (eligibleAis.length === 0) continue;

    const pick =
      seedHash(demand.id, "ai-pressure-pick", params.day, eligibleAis.length) %
      eligibleAis.length;
    const ai = eligibleAis[pick];

    // Pass demand so steal rate accounts for passenger mix
    const rate = aiStealRate(
      ai,
      waiting,
      currentDemand.base_pax_day,
      currentDemand,
    );
    const noise =
      0.75 + (seedHash(demand.id, "ai-pressure-noise", params.day) % 51) / 100;
    const requestedStolen = Math.floor(waiting * rate * noise);

    if (requestedStolen <= 0) continue;

    const delivered = currentDemand.delivered_pax_today ?? 0;
    const nextPaxDay = Math.max(delivered, currentPaxDay - requestedStolen);
    const actualStolen = currentPaxDay - nextPaxDay;

    if (actualStolen <= 0) continue;

    nextPaxDayByDemand.set(demand.id, nextPaxDay);
    steals.push({
      aiId: ai.id,
      aiName: ai.name,
      aiColor: ai.color,
      demandId: demand.id,
      originIata: demand.origin.iata,
      destIata: demand.dest.iata,
      stolenPax: actualStolen,
      waitingBefore: waiting,
    });
  }

  return {
    totalStolenPax: steals.reduce((sum, s) => sum + s.stolenPax, 0),
    steals,
    demandUpdates: Array.from(nextPaxDayByDemand.entries()).map(
      ([demandId, base_pax_day]) => ({ demandId, base_pax_day }),
    ),
  };
}

export function summarizeAIPressure(steals: AIPressureSteal[]): string | null {
  if (steals.length === 0) return null;
  const total = steals.reduce((sum, s) => sum + s.stolenPax, 0);
  const biggest = [...steals].sort((a, b) => b.stolenPax - a.stolenPax)[0];
  return `${biggest.aiName} captured ${biggest.stolenPax.toLocaleString()} travelers on ${biggest.originIata}→${biggest.destIata}. ${total.toLocaleString()} travelers switched to rivals today.`;
}
