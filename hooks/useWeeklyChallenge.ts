/**
 * Builds one measurable weekly objective and safely settles its reward.
 *
 * Every challenge in the pool is backed by either a real weekly counter or
 * current game state. Objectives that require untracked history are excluded.
 */

import { seedHash } from "@/lib/seed";
import { supabase } from "@/lib/supabase";
import { useGameStore, type GameStore } from "@/store";
import { useCallback, useEffect, useRef, useState } from "react";

export type WeeklyChallengeType =
  | "pax_week"
  | "revenue_week"
  | "profit_days_week"
  | "routes_total_week"
  | "hubs_total_week"
  | "planes_total_week"
  | "manufacturers_total_week"
  | "trust_average_week"
  | "trust_max_week"
  | "game_days_week"
  | "speed_days_week"
  | "achievement_points_week";

export interface WeeklyChallenge {
  id: string;
  weekNumber: number;
  weekYear: number;
  icon: string;
  title: string;
  desc: string;
  reward: number;
  type: WeeklyChallengeType;
  target: number;
  completed: boolean;
}

type WeeklyChallengeTemplate = Omit<
  WeeklyChallenge,
  "id" | "weekNumber" | "weekYear" | "completed"
>;

interface ISOWeek {
  week: number;
  year: number;
  key: number;
}

const WEEKLY_POOL: WeeklyChallengeTemplate[] = [
  {
    icon: "people-outline",
    title: "Steady traffic",
    desc: "Carry 750 passengers during this calendar week.",
    reward: 120_000,
    type: "pax_week",
    target: 750,
  },
  {
    icon: "people-outline",
    title: "Busy network",
    desc: "Carry 2,000 passengers during this calendar week.",
    reward: 250_000,
    type: "pax_week",
    target: 2_000,
  },
  {
    icon: "cash-outline",
    title: "Revenue target",
    desc: "Earn $100K in route revenue during this calendar week.",
    reward: 100_000,
    type: "revenue_week",
    target: 100_000,
  },
  {
    icon: "cash-outline",
    title: "Strong revenue week",
    desc: "Earn $300K in route revenue during this calendar week.",
    reward: 220_000,
    type: "revenue_week",
    target: 300_000,
  },
  {
    icon: "trending-up-outline",
    title: "Profitable operations",
    desc: "Close 3 game days with positive airline earnings and no loss-making active routes.",
    reward: 160_000,
    type: "profit_days_week",
    target: 3,
  },
  {
    icon: "git-network-outline",
    title: "Route network",
    desc: "Operate at least 3 active routes at the same time.",
    reward: 120_000,
    type: "routes_total_week",
    target: 3,
  },
  {
    icon: "business-outline",
    title: "Second base",
    desc: "Own at least 2 operating hubs.",
    reward: 150_000,
    type: "hubs_total_week",
    target: 2,
  },
  {
    icon: "airplane-outline",
    title: "Fleet of three",
    desc: "Own at least 3 aircraft.",
    reward: 140_000,
    type: "planes_total_week",
    target: 3,
  },
  {
    icon: "layers-outline",
    title: "Mixed fleet",
    desc: "Own aircraft from at least 2 manufacturers.",
    reward: 160_000,
    type: "manufacturers_total_week",
    target: 2,
  },
  {
    icon: "heart-outline",
    title: "Trusted network",
    desc: "Reach 70% average trust across your hubs.",
    reward: 140_000,
    type: "trust_average_week",
    target: 70,
  },
  {
    icon: "star-outline",
    title: "Trusted hub",
    desc: "Reach 90% trust at any hub.",
    reward: 180_000,
    type: "trust_max_week",
    target: 90,
  },
  {
    icon: "calendar-outline",
    title: "Five operating days",
    desc: "Complete 5 game days during this calendar week.",
    reward: 100_000,
    type: "game_days_week",
    target: 5,
  },
  {
    icon: "flash-outline",
    title: "Fast dispatch",
    desc: "Close 3 game days while the simulation is running at 3x speed.",
    reward: 80_000,
    type: "speed_days_week",
    target: 3,
  },
  {
    icon: "medal-outline",
    title: "Achievement points",
    desc: "Earn 100 achievement points during this calendar week.",
    reward: 120_000,
    type: "achievement_points_week",
    target: 100,
  },
];

function getISOWeek(date: Date = new Date()): ISOWeek {
  const value = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);

  const year = value.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return { week, year, key: year * 100 + week };
}

function getWeeklyChallenge(week: ISOWeek, gameSeed: string): WeeklyChallenge {
  const index = seedHash(gameSeed, "weekly", week.key) % WEEKLY_POOL.length;
  const template = WEEKLY_POOL[index];

  return {
    ...template,
    id: `weekly-${week.year}-${week.week}`,
    weekNumber: week.week,
    weekYear: week.year,
    completed: false,
  };
}

function boundedRatio(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, value / target));
}

type WeeklyProgressState = Pick<
  GameStore,
  "routes" | "hubs" | "ownedPlanes" | "weeklyProgress"
>;

function calculateWeeklyProgress(
  challenge: WeeklyChallenge,
  state: WeeklyProgressState,
): number {
  if (challenge.completed) return 1;

  const currentWeek = getISOWeek();
  const challengeIsCurrent =
    challenge.weekNumber === currentWeek.week &&
    challenge.weekYear === currentWeek.year;
  if (!challengeIsCurrent) return 0;

  const countersAreCurrent = state.weeklyProgress.weekKey === currentWeek.key;
  const activeRoutes = state.routes.filter((route) => route.active);

  switch (challenge.type) {
    case "pax_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.passengers : 0,
        challenge.target,
      );

    case "revenue_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.routeEarnings : 0,
        challenge.target,
      );

    case "profit_days_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.profitableDays : 0,
        challenge.target,
      );

    case "game_days_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.gameDays : 0,
        challenge.target,
      );

    case "speed_days_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.speedThreeDays : 0,
        challenge.target,
      );

    case "achievement_points_week":
      return boundedRatio(
        countersAreCurrent ? state.weeklyProgress.achievementPoints : 0,
        challenge.target,
      );

    case "routes_total_week":
      return boundedRatio(activeRoutes.length, challenge.target);

    case "hubs_total_week":
      return boundedRatio(state.hubs.length, challenge.target);

    case "planes_total_week":
      return boundedRatio(state.ownedPlanes.length, challenge.target);

    case "manufacturers_total_week": {
      const manufacturers = new Set(
        state.ownedPlanes.map((plane) => plane.plane_model.manufacturer),
      );
      return boundedRatio(manufacturers.size, challenge.target);
    }

    case "trust_average_week": {
      const averageTrust =
        state.hubs.length > 0
          ? state.hubs.reduce((total, hub) => total + hub.trust, 0) /
            state.hubs.length
          : 0;
      return boundedRatio(averageTrust, challenge.target);
    }

    case "trust_max_week": {
      const highestTrust = state.hubs.reduce(
        (highest, hub) => Math.max(highest, hub.trust),
        0,
      );
      return boundedRatio(highestTrust, challenge.target);
    }
  }
}

export function useWeeklyProgress(challenge: WeeklyChallenge | null): number {
  const routes = useGameStore((state) => state.routes);
  const hubs = useGameStore((state) => state.hubs);
  const ownedPlanes = useGameStore((state) => state.ownedPlanes);
  const weeklyProgress = useGameStore((state) => state.weeklyProgress);

  if (!challenge) return 0;
  return calculateWeeklyProgress(challenge, {
    routes,
    hubs,
    ownedPlanes,
    weeklyProgress,
  });
}

function claimErrorMessage(): string {
  return "Unable to claim the weekly reward. Check your connection and try again.";
}

export function useWeeklyChallenge() {
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const airline = useGameStore((state) => state.airline);
  const airlineId = airline?.id ?? null;
  const airlineSeed = airline?.seed ?? "DEFAULT";

  useEffect(() => {
    if (!airlineId) {
      setChallenge(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const week = getISOWeek();
    const baseChallenge = getWeeklyChallenge(week, airlineSeed);

    const loadChallenge = async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("airlines")
        .select("weekly_challenge_week, weekly_challenge_done")
        .eq("id", airlineId)
        .single();

      if (cancelled) return;

      if (loadError) {
        setChallenge(null);
        setError("Unable to load the weekly objective. Try again.");
        setLoading(false);
        return;
      }

      const completed =
        data?.weekly_challenge_week === week.key &&
        data?.weekly_challenge_done === true;

      setChallenge({ ...baseChallenge, completed });
      setLoading(false);
    };

    void loadChallenge();
    return () => {
      cancelled = true;
    };
  }, [airlineId, airlineSeed]);

  const completeWeekly = useCallback(async () => {
    if (
      !challenge ||
      challenge.completed ||
      !airline ||
      claimInFlight.current
    ) {
      return;
    }

    const week = getISOWeek();
    const challengeIsCurrent =
      challenge.weekNumber === week.week && challenge.weekYear === week.year;
    if (!challengeIsCurrent) {
      setError(
        "This weekly objective has expired. Reopen Missions to refresh it.",
      );
      return;
    }

    claimInFlight.current = true;
    setCompleting(true);
    setError(null);

    try {
      const currentState = useGameStore.getState();
      const currentAirline = currentState.airline;
      if (!currentAirline || currentAirline.id !== airline.id) {
        throw new Error("Airline changed before the reward was claimed");
      }
      if (calculateWeeklyProgress(challenge, currentState) < 1) {
        setError("This weekly objective is not complete yet.");
        return;
      }

      const newCash = currentAirline.cash + challenge.reward;
      const { error: updateError } = await supabase
        .from("airlines")
        .update({
          cash: newCash,
          weekly_challenge_week: week.key,
          weekly_challenge_done: true,
        })
        .eq("id", currentAirline.id)
        .select("id")
        .single();

      if (updateError) throw updateError;

      useGameStore.getState().earnCash(challenge.reward);
      useGameStore.getState().addLedgerEntries([
        {
          id: `weekly-reward-${challenge.id}`,
          day: currentAirline.day,
          type: "revenue",
          label: `Weekly objective: ${challenge.title}`,
          amount: challenge.reward,
          route_id: null,
        },
      ]);
      setChallenge((current) =>
        current?.id === challenge.id
          ? { ...current, completed: true }
          : current,
      );
    } catch {
      setError(claimErrorMessage());
    } finally {
      claimInFlight.current = false;
      setCompleting(false);
    }
  }, [airline, challenge]);

  const clearError = useCallback(() => setError(null), []);

  return {
    challenge,
    loading,
    completing,
    error,
    completeWeekly,
    clearError,
  };
}
