/**
 * lib/AIAirline.ts
 *
 * AIAirline type + deterministic state computation.
 *
 * AI airlines don't run a real tick loop — their state is computed
 * from (seed + day) on demand. Same inputs → same outputs always.
 *
 * Growth model:
 *   - Each AI follows a timeline: buy hub → buy plane → open route → expand
 *   - Timeline is seeded so each AI expands differently
 *   - Revenue is calculated from real calcRouteRevenue using AI routes
 *   - Difficulty controls trust, expansion speed, and aggressiveness
 */

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
  seed: string; // game seed
  index: number; // 0-4 (which AI this is)

  // Computed state (from day)
  day: number;
  cash: number;
  loan: number;
  netWorth: number;
  score: number;
  demandScore: number;
  reputation: number;
  trust: number; // 0-100, affects market share
  hubIatas: string[];
  routeCount: number;
  planeCount: number;
}

// ─────────────────────────────────────────────────────────────────
// AI AIRLINE NAME + COLOR POOL
// ─────────────────────────────────────────────────────────────────

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
  "#ef4444", // red
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

// ─────────────────────────────────────────────────────────────────
// DIFFICULTY PARAMS
// ─────────────────────────────────────────────────────────────────

const DIFFICULTY_PARAMS = {
  passive: {
    growthMultiplier: 0.6,
    trust: 40,
    reputation: 45,
    expansionInterval: 8,
    startingCash: 2_000_000,
    startingRoutes: 2, // pre-existing routes on day 1
    startingHubs: 1,
  },
  balanced: {
    growthMultiplier: 1.0,
    trust: 60,
    reputation: 60,
    expansionInterval: 5,
    startingCash: 3_000_000,
    startingRoutes: 4,
    startingHubs: 1,
  },
  aggressive: {
    growthMultiplier: 1.5,
    trust: 80,
    reputation: 75,
    expansionInterval: 3,
    startingCash: 4_000_000,
    startingRoutes: 6,
    startingHubs: 2,
  },
};

/**
 * Picks AI hub airports from the live airports store.
 * Prefers large/mega airports (high pax_annual_m) seeded deterministically.
 */
export function pickAIHubs(
  gameSeed: string,
  aiIndex: number,
  count: number,
  airports: import("@/store").Airport[],
): string[] {
  // Rank airports — prefer pax_annual_m, fall back to tier ordering
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
          ? a.pax_annual_m * 10 // real data wins
          : (tierScore[a.tier ?? "regional"] ?? 10), // fall back to tier
    }))
    .filter((a) => a.score >= 30) // major+ airports only (tier or by pax)
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

/**
 * Build routes for an AI airline — used by both AIRouteLayer (visual)
 * and market share calculation. Single source of truth.
 */
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

  // Destination pool — large+ airports, ranked by traffic
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
// DETERMINISTIC AI STATE — computed from game seed + day
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

  // Identity — stable across all days
  const name = AI_NAMES[seedHash(aiSeed, "name") % AI_NAMES.length];
  const color = AI_COLORS[seedHash(aiSeed, "color") % AI_COLORS.length];

  // How many expansion steps has this AI taken by day N?
  const steps = Math.floor(day / params.expansionInterval);

  // Hubs — starts with startingHubs, gains more over time
  const maxHubs = Math.min(10, params.startingHubs + Math.floor(steps / 2));
  const hubIatas = pickAIHubs(aiSeed, index, maxHubs, airports);

  // Routes — starts with startingRoutes on day 1, grows each step
  const routeCount = Math.min(50, params.startingRoutes + steps);
  const planeCount = Math.max(1, Math.floor(routeCount * 0.8));

  // Revenue model — estimate daily net from routes
  // AI has generic routes at average distance 2000nm, 200 pax/day
  const avgDistNm = 1500 + (seedHash(aiSeed, "avgdist") % 3000);
  const avgPaxDay = 80 + (seedHash(aiSeed, "avgpax") % 200);
  const dailyNetPerRoute = calcRouteRevenue({
    distNm: avgDistNm,
    speedKts: 450,
    trustPct: params.trust,
    deliveredPax: Math.round(avgPaxDay * (params.trust / 100)),
    paxDay: avgPaxDay,
    costPerSector: 400,
    fuelPerNm: 2.0,
  }).net;

  // Accumulate cash over days
  const dailyNet = dailyNetPerRoute * routeCount * params.growthMultiplier;
  const cash = params.startingCash + Math.round(dailyNet * day);
  const loan = Math.max(0, params.startingCash * 0.5 - day * 5000);
  const netWorth = Math.max(0, cash - loan);

  // Demand score grows with routes
  const demandScore = routeCount;

  // Reputation — starts at params level, grows slowly
  const reputation = Math.min(100, params.reputation + Math.floor(day * 0.1));

  // Score — same formula as calcScore in LeaderboardSheet
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
//
// If the player has many routes in a region, aggressive AI
// will expand there faster. Simulates competitive response.
// ─────────────────────────────────────────────────────────────────

export function computeAIResponseMultiplier(
  ai: AIAirline,
  playerHubIatas: string[],
  airports: import("@/store").Airport[],
): number {
  if (ai.difficulty !== "aggressive") return 1.0;

  // Count overlap between player hubs and AI hubs
  const sharedHubs = playerHubIatas.filter((iata) =>
    ai.hubIatas.includes(iata),
  ).length;

  // More overlap → AI is more aggressive (expands faster, higher trust)
  if (sharedHubs >= 3) return 1.5; // heavy competition
  if (sharedHubs >= 1) return 1.25; // some competition
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────
// COMPETITION NOTIFICATION DATA
//
// Returns routes where AI JUST started competing with the player.
// Compares previous AI state (day-1) with current.
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

  // Did AI gain any new routes today?
  if (current.routeCount <= previous.routeCount) return [];

  const aiSeed = `${gameSeed}-ai-${aiIndex}`;
  const conflicts: { aiName: string; origin: string; dest: string }[] = [];

  // Check if any new AI routes overlap with player's demands
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
//
// When AI operates on the same corridor as the player,
// pax is split by trust weighting.
// ─────────────────────────────────────────────────────────────────

export function computePlayerMarketShare(
  playerTrust: number,
  aiAirlines: AIAirline[],
  origin: string,
  dest: string,
): number {
  // Check which AIs operate this corridor (seeded, deterministic)
  const competitors = aiAirlines.filter((ai) => {
    const operatesRoute =
      seedHash(ai.seed, "ai", ai.index, "route", origin, dest) % 100;
    // Probability of AI operating this route scales with their route count
    return operatesRoute < Math.min(60, ai.routeCount * 3);
  });

  if (competitors.length === 0) return 1.0; // no competition

  const playerWeight = playerTrust;
  const totalWeight =
    playerWeight + competitors.reduce((s, ai) => s + ai.trust, 0);
  return playerWeight / Math.max(1, totalWeight);
}

// ─────────────────────────────────────────────────────────────────
// WORLDWIDE RUSH AI PRESSURE
//
// This is the gameplay-pressure layer that sits on top of deterministic
// AI growth. AI routes are still computed, but ignored passenger queues can
// now be captured by rivals at day end.
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
  demandUpdates: {
    demandId: string;
    pax_day: number;
  }[];
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
  const origin = demand.origin.iata;
  const dest = demand.dest.iata;
  const roll = seedHash(ai.seed, "ai-pressure", ai.index, origin, dest) % 100;
  return roll < aiContestChance(ai, origin, dest);
}

function aiStealRate(
  ai: AIAirline,
  waitingPax: number,
  paxDay: number,
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

  return Math.min(
    cfg.maxStealRate,
    cfg.maxStealRate * pressure * trustFactor * difficultyFactor,
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

    const currentPaxDay = nextPaxDayByDemand.get(demand.id) ?? demand.pax_day;
    const currentDemand = { ...demand, pax_day: currentPaxDay };
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
    const rate = aiStealRate(ai, waiting, currentDemand.pax_day);
    const noise =
      0.75 + (seedHash(demand.id, "ai-pressure-noise", params.day) % 51) / 100;
    const requestedStolen = Math.floor(waiting * rate * noise);

    if (requestedStolen <= 0) continue;

    // Never reduce the demand below already-moved passengers.
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
    totalStolenPax: steals.reduce((sum, steal) => sum + steal.stolenPax, 0),
    steals,
    demandUpdates: Array.from(nextPaxDayByDemand.entries()).map(
      ([demandId, pax_day]) => ({ demandId, pax_day }),
    ),
  };
}

export function summarizeAIPressure(steals: AIPressureSteal[]): string | null {
  if (steals.length === 0) return null;

  const total = steals.reduce((sum, steal) => sum + steal.stolenPax, 0);
  const biggest = [...steals].sort((a, b) => b.stolenPax - a.stolenPax)[0];

  return `${biggest.aiName} captured ${biggest.stolenPax.toLocaleString()} travelers on ${biggest.originIata}→${biggest.destIata}. ${total.toLocaleString()} travelers switched to rivals today.`;
}
