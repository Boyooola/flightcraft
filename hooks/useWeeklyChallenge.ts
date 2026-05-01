/**
 * hooks/useWeeklyChallenge.ts
 *
 * Generates a special high-reward weekly challenge.
 * Rotates every Monday — seeded by ISO week number so
 * all players globally share the same challenge each week.
 *
 * Displayed as a distinct card in MissionsSheet.
 * Reward is 5-10× a daily mission reward.
 * Completion is tracked in Supabase (airlines.weekly_challenge_completed).
 */

import { seedHash } from "@/lib/seed";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useEffect, useState } from "react";

export interface WeeklyChallenge {
  id: string;
  weekNumber: number;
  icon: string;
  title: string;
  desc: string;
  reward: number;
  type: string;
  target: number;
  completed: boolean;
}

// ── ISO week number ───────────────────────────────────────────────
function getISOWeek(date: Date = new Date()): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - year.getTime()) / 86400000 + 1) / 7);
}

// ── Weekly challenge pool ─────────────────────────────────────────
// Seeded by week — same challenge for all players that week
const WEEKLY_POOL: Omit<WeeklyChallenge, "id" | "weekNumber" | "completed">[] =
  [
    // ── PASSENGER ───────────────────────────────────────────────────
    {
      icon: "airplane-outline",
      title: "Frequent Flyer Week",
      desc: "Carry 2,000 passengers this week across all your routes.",
      reward: 250_000,
      type: "pax_week",
      target: 2000,
    },
    {
      icon: "people-outline",
      title: "Passenger Milestone",
      desc: "Deliver 5,000 passengers this week.",
      reward: 500_000,
      type: "pax_week",
      target: 5000,
    },
    {
      icon: "people-circle-outline",
      title: "Sky Full of People",
      desc: "Carry 10,000 passengers in a single week. Every seat counts.",
      reward: 800_000,
      type: "pax_week",
      target: 10000,
    },
    {
      icon: "body-outline",
      title: "Solo Route Hero",
      desc: "Deliver 500 passengers on a single route this week.",
      reward: 180_000,
      type: "pax_route_week",
      target: 500,
    },
    {
      icon: "walk-outline",
      title: "First Boardings",
      desc: "Carry at least 50 passengers today — every journey starts somewhere.",
      reward: 80_000,
      type: "pax_week",
      target: 50,
    },

    // ── REVENUE ─────────────────────────────────────────────────────
    {
      icon: "cash-outline",
      title: "Revenue Rush",
      desc: "Earn $500,000 in net revenue before this week ends.",
      reward: 300_000,
      type: "revenue_week",
      target: 500_000,
    },
    {
      icon: "diamond-outline",
      title: "Million Dollar Week",
      desc: "Generate $1,000,000 in net revenue this week.",
      reward: 600_000,
      type: "revenue_week",
      target: 1_000_000,
    },
    {
      icon: "trending-up-outline",
      title: "Profit Machine",
      desc: "Have every active route earning positive net revenue.",
      reward: 350_000,
      type: "profit_week",
      target: 1,
    },
    {
      icon: "bar-chart-outline",
      title: "Consistent Earner",
      desc: "Earn positive net revenue for 5 consecutive game-days.",
      reward: 280_000,
      type: "profit_days_week",
      target: 5,
    },
    {
      icon: "card-outline",
      title: "Debt Destroyer",
      desc: "Repay at least $100,000 of your loan this week.",
      reward: 200_000,
      type: "loan_repay_week",
      target: 100_000,
    },

    // ── NETWORK ─────────────────────────────────────────────────────
    {
      icon: "git-network-outline",
      title: "Network Expansion",
      desc: "Open 3 new active routes this week.",
      reward: 200_000,
      type: "routes_week",
      target: 3,
    },
    {
      icon: "globe-outline",
      title: "International Pioneer",
      desc: "Create a route that crosses at least 2 continents.",
      reward: 350_000,
      type: "intercontinental_week",
      target: 1,
    },
    {
      icon: "map-outline",
      title: "Route Collector",
      desc: "Have 10 or more active routes by end of week.",
      reward: 300_000,
      type: "routes_total_week",
      target: 10,
    },
    {
      icon: "swap-horizontal-outline",
      title: "Transatlantic Week",
      desc: "Operate a route between Europe and North America this week.",
      reward: 450_000,
      type: "transatlantic_week",
      target: 1,
    },
    {
      icon: "git-branch-outline",
      title: "Connecting Master",
      desc: "Create 2 connecting routes (routes with a via stop) this week.",
      reward: 300_000,
      type: "connecting_week",
      target: 2,
    },
    {
      icon: "infinite-outline",
      title: "Long Haul Legend",
      desc: "Operate a route longer than 5,000nm this week.",
      reward: 500_000,
      type: "longhaul_week",
      target: 5000,
    },

    // ── HUBS & FLEET ────────────────────────────────────────────────
    {
      icon: "business-outline",
      title: "Empire Builder",
      desc: "Own 5 or more hubs by the end of this week.",
      reward: 450_000,
      type: "hubs_week",
      target: 5,
    },
    {
      icon: "location-outline",
      title: "Hub Opener",
      desc: "Open 2 new airport hubs this week.",
      reward: 250_000,
      type: "hubs_open_week",
      target: 2,
    },
    {
      icon: "airplane-outline",
      title: "Fleet Expansion",
      desc: "Purchase 3 new aircraft this week.",
      reward: 300_000,
      type: "planes_week",
      target: 3,
    },
    {
      icon: "layers-outline",
      title: "Mixed Fleet",
      desc: "Own aircraft from at least 3 different manufacturers.",
      reward: 250_000,
      type: "manufacturers_week",
      target: 3,
    },
    {
      icon: "rocket-outline",
      title: "Widebody Era",
      desc: "Purchase your first Boeing or Airbus widebody this week.",
      reward: 500_000,
      type: "widebody_week",
      target: 1,
    },

    // ── TRUST & OPERATIONS ──────────────────────────────────────────
    {
      icon: "heart-outline",
      title: "Trust Campaign",
      desc: "Reach 80% average trust across all your hubs by end of week.",
      reward: 200_000,
      type: "trust_week",
      target: 80,
    },
    {
      icon: "star-outline",
      title: "Five Star Service",
      desc: "Reach 100% trust at any single hub this week.",
      reward: 300_000,
      type: "trust_max_week",
      target: 100,
    },
    {
      icon: "checkmark-done-outline",
      title: "Zero Delays",
      desc: "Keep all hubs free of overcrowding for 5 consecutive days.",
      reward: 280_000,
      type: "no_crowd_week",
      target: 5,
    },
    {
      icon: "shield-checkmark-outline",
      title: "Spotless Record",
      desc: "End every day this week with all hubs above 60% trust.",
      reward: 320_000,
      type: "trust_maintain_week",
      target: 60,
    },

    // ── MISSIONS & ACHIEVEMENTS ─────────────────────────────────────
    {
      icon: "trophy-outline",
      title: "Achievement Blitz",
      desc: "Earn 3 new achievements this week.",
      reward: 280_000,
      type: "achievement_week",
      target: 3,
    },
    {
      icon: "flag-outline",
      title: "Mission Master",
      desc: "Complete all daily missions for 5 consecutive days this week.",
      reward: 400_000,
      type: "missions_week",
      target: 5,
    },
    {
      icon: "ribbon-outline",
      title: "Perfect Day Streak",
      desc: "Complete all 3 daily missions on at least 3 different days.",
      reward: 250_000,
      type: "perfect_days_week",
      target: 3,
    },
    {
      icon: "medal-outline",
      title: "Point Collector",
      desc: "Earn 200 achievement points this week.",
      reward: 350_000,
      type: "ach_points_week",
      target: 200,
    },

    // ── PRESTIGE ────────────────────────────────────────────────────
    {
      icon: "flash-outline",
      title: "Speed Demon",
      desc: "Play at 3× speed for at least 10 game-days this week.",
      reward: 150_000,
      type: "speed_week",
      target: 10,
    },
    {
      icon: "podium-outline",
      title: "Leaderboard Climber",
      desc: "Improve your global leaderboard rank by at least 3 positions.",
      reward: 400_000,
      type: "rank_week",
      target: 3,
    },
    {
      icon: "earth-outline",
      title: "World Traveller",
      desc: "Have active routes on 4 different continents by end of week.",
      reward: 600_000,
      type: "continents_week",
      target: 4,
    },
    {
      icon: "sunny-outline",
      title: "Weekend Warrior",
      desc: "Log in and play for at least 5 of the 7 days this week.",
      reward: 200_000,
      type: "login_week",
      target: 5,
    },
    {
      icon: "calendar-outline",
      title: "Day 30 Club",
      desc: "Reach day 30 of your airline's operation.",
      reward: 500_000,
      type: "day_week",
      target: 30,
    },
    {
      icon: "navigate-outline",
      title: "Ultra Long Haul",
      desc: "Operate a route longer than 8,000nm — the ultimate test.",
      reward: 750_000,
      type: "longhaul_week",
      target: 8000,
    },
    {
      icon: "wallet-outline",
      title: "Cash Milestone",
      desc: "Hold $5,000,000 in cash at any point this week.",
      reward: 400_000,
      type: "cash_week",
      target: 5_000_000,
    },
  ];

function getWeeklyChallenge(
  weekNumber: number,
  gameSeed: string = "DEFAULT",
): Omit<WeeklyChallenge, "id" | "completed"> {
  // Seeded by game seed + week — different seeds give different challenge rotations
  const idx = seedHash(gameSeed, "weekly", weekNumber) % WEEKLY_POOL.length;
  const base = WEEKLY_POOL[idx];
  return { ...base, weekNumber, id: `weekly-${weekNumber}` } as any;
}

// ── Live progress for display ─────────────────────────────────────
export function useWeeklyProgress(challenge: WeeklyChallenge | null): number {
  const routes = useGameStore((s) => s.routes);
  const hubs = useGameStore((s) => s.hubs);
  const demands = useGameStore((s) => s.demands);
  const airline = useGameStore((s) => s.airline);
  const wp = useGameStore((s) => s.weeklyProgress); // accumulated totals

  if (!challenge || challenge.completed) return challenge ? 1 : 0;

  const active = routes.filter((r) => r.active);

  switch (challenge.type) {
    // ── Instant state checks (no accumulation needed) ─────────────
    case "routes_week":
      return Math.min(1, active.length / challenge.target);

    case "routes_total_week":
      return Math.min(1, active.length / challenge.target);

    case "trust_week": {
      const avg =
        hubs.length > 0
          ? hubs.reduce((s, h) => s + h.trust, 0) / hubs.length
          : 0;
      return Math.min(1, avg / challenge.target);
    }

    case "trust_max_week": {
      const max = hubs.reduce((m, h) => Math.max(m, h.trust), 0);
      return Math.min(1, max / challenge.target);
    }

    case "hubs_week":
      return Math.min(1, hubs.length / challenge.target);

    case "hubs_open_week":
      return Math.min(1, hubs.length / challenge.target);

    case "intercontinental_week": {
      const has = active.some((r) => {
        const oc = r.demand.origin.continent;
        const dc = r.demand.dest.continent;
        return oc && dc && oc !== dc;
      });
      return has ? 1 : 0;
    }

    case "transatlantic_week": {
      const has = active.some((r) => {
        const oc = r.demand.origin.continent;
        const dc = r.demand.dest.continent;
        return (oc === "EU" && dc === "NA") || (oc === "NA" && dc === "EU");
      });
      return has ? 1 : 0;
    }

    case "longhaul_week": {
      const max = active.reduce(
        (m, r) => Math.max(m, r.total_dist_nm ?? r.demand.dist_nm),
        0,
      );
      return Math.min(1, max / challenge.target);
    }

    case "connecting_week": {
      const count = active.filter((r) => !!r.via_iata).length;
      return Math.min(1, count / challenge.target);
    }

    case "widebody_week": {
      const owned = useGameStore.getState().ownedPlanes;
      const hasWide = owned.some((p) => {
        const cap = p.plane_model.pax_capacity;
        return cap >= 200;
      });
      return hasWide ? 1 : 0;
    }

    case "manufacturers_week": {
      const owned = useGameStore.getState().ownedPlanes;
      const mfrs = new Set(owned.map((p) => p.plane_model.manufacturer));
      return Math.min(1, mfrs.size / challenge.target);
    }

    case "planes_week": {
      const owned = useGameStore.getState().ownedPlanes;
      return Math.min(1, owned.length / challenge.target);
    }

    case "profit_week": {
      const allProfit = active.every((r) => {
        const d = demands.find((d) => d.id === r.demand.id);
        const hub = hubs.find((h) => h.airport.iata === r.hub_iata);
        const p = r.plane.plane_model;
        if (!d) return true;
        const dist = r.total_dist_nm ?? d.dist_nm;
        return (
          d.pax_day * Math.min(750, Math.max(15, dist * 0.12)) >
          (p.cost_per_sector ?? 500) + dist * (p.fuel_per_nm ?? 2.0)
        );
      });
      return allProfit ? 1 : 0;
    }

    case "cash_week":
      return Math.min(1, (airline?.cash ?? 0) / challenge.target);

    case "day_week":
      return Math.min(1, (airline?.day ?? 0) / challenge.target);

    // ── Accumulated progress (from weeklyProgress in store) ───────
    case "pax_week":
    case "pax_route_week":
      return Math.min(1, wp.paxTotal / challenge.target);

    case "revenue_week":
      return Math.max(0, Math.min(1, wp.revenueTotal / challenge.target));

    case "login_week":
      return Math.min(1, wp.loginDays / challenge.target);

    case "perfect_days_week":
    case "missions_week":
      return Math.min(1, wp.perfectDays / challenge.target);

    case "profit_days_week":
      return Math.min(1, wp.profitDays / challenge.target);

    case "speed_week":
      return Math.min(1, wp.speedDays / challenge.target);

    case "no_crowd_week":
      return Math.min(1, wp.profitDays / challenge.target); // re-use profitDays

    case "trust_maintain_week":
      return Math.min(1, wp.profitDays / challenge.target);

    case "achievement_week":
    case "ach_points_week":
      return Math.min(1, wp.achEarned / challenge.target);

    case "rank_week":
      return Math.min(1, wp.rankImproved / challenge.target);

    case "loan_repay_week":
      return Math.min(1, wp.revenueTotal / challenge.target);

    case "continents_week": {
      const continents = new Set(
        active
          .flatMap((r) => [r.demand.origin.continent, r.demand.dest.continent])
          .filter(Boolean),
      );
      return Math.min(1, continents.size / challenge.target);
    }

    default:
      return 0;
  }
}

// ── Hook ──────────────────────────────────────────────────────────
export function useWeeklyChallenge() {
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [completing, setCompleting] = useState(false);
  const airline = useGameStore((s) => s.airline);

  useEffect(() => {
    if (!airline) return;

    const weekNumber = getISOWeek();
    const gameSeed = useGameStore.getState().airline?.seed ?? "DEFAULT";
    const base = getWeeklyChallenge(weekNumber, gameSeed);

    // Load completion status from DB
    const load = async () => {
      try {
        const { data } = await supabase
          .from("airlines")
          .select("weekly_challenge_week, weekly_challenge_done")
          .eq("id", airline.id)
          .single();

        const completed =
          data?.weekly_challenge_week === weekNumber &&
          data?.weekly_challenge_done === true;

        setChallenge({ ...base, id: `weekly-${weekNumber}`, completed });
      } catch {
        setChallenge({ ...base, id: `weekly-${weekNumber}`, completed: false });
      }
    };

    load();
  }, [airline?.id]);

  // Complete the weekly challenge
  const completeWeekly = async () => {
    if (!challenge || challenge.completed || !airline || completing) return;
    setCompleting(true);

    try {
      const weekNumber = getISOWeek();
      await supabase
        .from("airlines")
        .update({
          weekly_challenge_week: weekNumber,
          weekly_challenge_done: true,
        })
        .eq("id", airline.id);

      useGameStore.getState().earnCash(challenge.reward);
      useGameStore.getState().addLedgerEntries([
        {
          id: `weekly-reward-${Date.now()}`,
          day: airline.day,
          type: "revenue",
          label: `Weekly Challenge: ${challenge.title}`,
          amount: challenge.reward,
          route_id: null,
        },
      ]);

      setChallenge((c) => (c ? { ...c, completed: true } : c));
    } catch {}

    setCompleting(false);
  };

  return { challenge, completeWeekly, completing };
}
