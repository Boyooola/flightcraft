/**
 * lib/aiPressure.ts
 *
 * Lightweight AI pressure system.
 *
 * Important: this does NOT simulate AI planes yet.
 * It creates competitive pressure by letting AI airlines steal ignored
 * waiting travelers from your active demand queues at day end.
 */

import type { AIAirline } from "@/lib/AIAirline";
import { waitingPaxForDemand } from "@/lib/passengerFlow";
import { seedHash } from "@/lib/seed";
import type { Demand } from "@/store";

export type AIPressureDifficulty = "passive" | "balanced" | "aggressive";

export interface AIDemandSteal {
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
  steals: AIDemandSteal[];
  demandUpdates: {
    demandId: string;
    pax_day: number;
  }[];
}

const PRESSURE_CONFIG: Record<
  AIPressureDifficulty,
  {
    minWaiting: number;
    maxStealRate: number;
    routeMatchChance: number;
    hubMatchBonus: number;
  }
> = {
  passive: {
    minWaiting: 260,
    maxStealRate: 0.08,
    routeMatchChance: 18,
    hubMatchBonus: 12,
  },
  balanced: {
    minWaiting: 140,
    maxStealRate: 0.15,
    routeMatchChance: 34,
    hubMatchBonus: 18,
  },
  aggressive: {
    minWaiting: 70,
    maxStealRate: 0.25,
    routeMatchChance: 52,
    hubMatchBonus: 26,
  },
};

function clampDifficulty(value: string | undefined): AIPressureDifficulty {
  if (value === "passive" || value === "balanced" || value === "aggressive") {
    return value;
  }
  return "balanced";
}

function aiCanContestDemand(
  ai: AIAirline,
  demand: Demand,
  difficulty: AIPressureDifficulty,
): boolean {
  const cfg = PRESSURE_CONFIG[difficulty];
  const origin = demand.origin.iata;
  const dest = demand.dest.iata;

  const hubOverlap = ai.hubIatas.includes(origin) || ai.hubIatas.includes(dest);
  const hubBonus = hubOverlap ? cfg.hubMatchBonus : 0;

  // Deterministic corridor ownership. Higher route count = wider reach.
  const roll = seedHash(ai.seed, "ai-pressure", ai.index, origin, dest) % 100;
  const chance = Math.min(
    82,
    cfg.routeMatchChance + hubBonus + ai.routeCount * 2,
  );

  return roll < chance;
}

function stealRateFor(
  ai: AIAirline,
  waiting: number,
  demand: Demand,
  difficulty: AIPressureDifficulty,
): number {
  const cfg = PRESSURE_CONFIG[difficulty];
  const pressure = Math.min(1, waiting / Math.max(1, demand.pax_day));
  const trustFactor = Math.max(0.5, Math.min(1.2, ai.trust / 80));
  const aggressionFactor =
    difficulty === "aggressive" ? 1.2 : difficulty === "passive" ? 0.75 : 1;

  return Math.min(
    cfg.maxStealRate,
    cfg.maxStealRate * pressure * trustFactor * aggressionFactor,
  );
}

export function applyAIPressure(params: {
  demands: Demand[];
  aiAirlines: AIAirline[];
  dayProgress: number;
  day: number;
  difficulty?: string;
}): AIPressureResult {
  const difficulty = clampDifficulty(params.difficulty);
  const cfg = PRESSURE_CONFIG[difficulty];

  if (params.aiAirlines.length === 0) {
    return { totalStolenPax: 0, steals: [], demandUpdates: [] };
  }

  const steals: AIDemandSteal[] = [];
  const updatedPaxDay = new Map<string, number>();

  for (const demand of params.demands) {
    if (demand.status === "no_plane") continue;

    const currentPaxDay = updatedPaxDay.get(demand.id) ?? demand.pax_day;
    const currentDemand = { ...demand, pax_day: currentPaxDay };
    const waiting = waitingPaxForDemand(currentDemand, params.dayProgress);

    if (waiting < cfg.minWaiting) continue;

    const contenders = params.aiAirlines.filter((ai) =>
      aiCanContestDemand(ai, demand, difficulty),
    );

    if (contenders.length === 0) continue;

    // Choose one AI deterministically so this feels fair/replayable.
    const pickIndex =
      seedHash(demand.id, "ai-steal-pick", params.day, contenders.length) %
      contenders.length;
    const ai = contenders[pickIndex];

    const baseRate = stealRateFor(ai, waiting, currentDemand, difficulty);
    const noise =
      0.75 + (seedHash(demand.id, "ai-steal-noise", params.day) % 51) / 100;
    const stolen = Math.max(0, Math.floor(waiting * baseRate * noise));

    if (stolen <= 0) continue;

    const delivered = currentDemand.delivered_pax_today ?? 0;
    const nextPaxDay = Math.max(delivered, currentPaxDay - stolen);
    const actualStolen = currentPaxDay - nextPaxDay;

    if (actualStolen <= 0) continue;

    updatedPaxDay.set(demand.id, nextPaxDay);
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

  const demandUpdates = Array.from(updatedPaxDay.entries()).map(
    ([demandId, pax_day]) => ({ demandId, pax_day }),
  );

  return {
    totalStolenPax: steals.reduce((sum, steal) => sum + steal.stolenPax, 0),
    steals,
    demandUpdates,
  };
}
