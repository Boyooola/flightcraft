/**
 * Evaluates achievements once after each completed game day.
 *
 * The checker reads the finished day's route and demand snapshot. It derives
 * crowding, opportunity coverage, passenger totals, and mission completions
 * from real game state rather than placeholder values.
 */

import type { AchievementId } from "@/constants/playGames";
import {
  setAchievementSteps as setPlayGamesSteps,
  unlockAchievement as unlockPlayGamesAchievement,
} from "@/hooks/usePlayGames";
import {
  ACHIEVEMENTS,
  isPlayGamesAchievementId,
  type AchievementState,
} from "@/lib/achievements";
import {
  activeDemandCount,
  demandSlotsForHub,
  hubCrowdingLevel,
  type CrowdingLevel,
} from "@/lib/demands";
import { useEarnedAchievements, useGameStore } from "@/store";
import { useEffect, useRef } from "react";

const CROWDING_PRIORITY: Record<CrowdingLevel, number> = {
  normal: 0,
  busy: 1,
  overcrowded: 2,
  crisis: 3,
};

function totalPresencePassengers(
  presence: ReturnType<typeof useGameStore.getState>["presence"],
): number {
  return presence.reduce(
    (total, row) => total + Math.max(0, row.total_pax_delivered ?? 0),
    0,
  );
}

export function useAchievementChecker() {
  const activeAirlineId = useRef<string | null>(null);
  const lastDay = useRef(-1);
  const totalPassengers = useRef(0);
  const previousMissionTotal = useRef(0);

  const earned = useEarnedAchievements();
  const airline = useGameStore((state) => state.airline);
  const routes = useGameStore((state) => state.routes);
  const hubs = useGameStore((state) => state.hubs);
  const ownedPlanes = useGameStore((state) => state.ownedPlanes);
  const demands = useGameStore((state) => state.demands);
  const presence = useGameStore((state) => state.presence);
  const loadComplete = useGameStore((state) => state.loadComplete);
  const phase = useGameStore((state) => state.phase);

  useEffect(() => {
    if (!airline || !loadComplete || phase !== "playing") return;

    const changedAirline = activeAirlineId.current !== airline.id;
    if (changedAirline || lastDay.current < 0) {
      activeAirlineId.current = airline.id;
      lastDay.current = airline.day;
      totalPassengers.current = totalPresencePassengers(presence);
      previousMissionTotal.current = useGameStore.getState().missionsCompleted;
      return;
    }

    if (airline.day <= lastDay.current) {
      lastDay.current = airline.day;
      return;
    }
    lastDay.current = airline.day;

    const activeRoutes = routes.filter((route) => route.active);
    const continents = new Set<string>();
    const countries = new Set<string>();

    activeRoutes.forEach((route) => {
      [route.demand.origin, route.demand.dest].forEach((airport) => {
        if (airport.continent) continents.add(airport.continent);
        if (airport.country) countries.add(airport.country);
      });
    });

    const planeFamilies = new Set(
      ownedPlanes.map((plane) => plane.plane_model.family).filter(Boolean),
    );

    const totalPaxToday = demands.reduce(
      (total, demand) => total + Math.max(0, demand.delivered_pax_today ?? 0),
      0,
    );

    // Revenue settlement runs before this effect. The rendered presence value
    // is the previous total, while the live store may already include today.
    // Taking the larger valid total avoids both missed and double-counted pax.
    const livePresenceTotal = totalPresencePassengers(
      useGameStore.getState().presence,
    );
    totalPassengers.current = Math.max(
      totalPassengers.current + totalPaxToday,
      livePresenceTotal,
    );

    const maxTrust = hubs.reduce(
      (highest, hub) => Math.max(highest, hub.trust),
      0,
    );
    const averageTrust =
      hubs.length > 0
        ? hubs.reduce((total, hub) => total + hub.trust, 0) / hubs.length
        : 0;

    const longestRoute = activeRoutes.reduce(
      (longest, route) =>
        Math.max(longest, route.total_dist_nm ?? route.demand.dist_nm),
      0,
    );

    const crowdingLevels = hubs.map(
      (hub) => hubCrowdingLevel(hub.airport.iata, demands, hub.airport).level,
    );
    const maxCrowding = crowdingLevels.reduce<CrowdingLevel>(
      (highest, level) =>
        CROWDING_PRIORITY[level] > CROWDING_PRIORITY[highest] ? level : highest,
      "normal",
    );

    const allHubsFull =
      hubs.length > 0 &&
      hubs.every(
        (hub) =>
          activeDemandCount(hub.airport.iata, demands) >=
          demandSlotsForHub({ hubLevel: hub.tier }),
      );

    const transAtlantic = activeRoutes.some((route) => {
      const continentsForRoute = [
        route.demand.origin.continent,
        route.demand.dest.continent,
      ].sort();
      return continentsForRoute[0] === "EU" && continentsForRoute[1] === "NA";
    });

    const transPacific = activeRoutes.some((route) => {
      const origin = route.demand.origin.continent;
      const destination = route.demand.dest.continent;
      const originInAmericas = origin === "NA" || origin === "SA";
      const destinationInAmericas =
        destination === "NA" || destination === "SA";
      const originAcrossPacific = origin === "AS" || origin === "OC";
      const destinationAcrossPacific =
        destination === "AS" || destination === "OC";

      return (
        (originInAmericas && destinationAcrossPacific) ||
        (destinationInAmericas && originAcrossPacific)
      );
    });

    // Mission checking is declared before this hook and completes missions
    // synchronously at rollover. Read the live lifetime count so achievements
    // include missions completed during this exact settlement.
    const missionTotal = useGameStore.getState().missionsCompleted;
    const missionsToday = Math.max(
      0,
      missionTotal - previousMissionTotal.current,
    );
    previousMissionTotal.current = missionTotal;

    const launchedRoutes = Math.max(
      activeRoutes.length,
      airline.demand_score ?? 0,
    );

    const state: AchievementState = {
      day: airline.day,
      cash: airline.cash,
      netWorth: airline.cash - airline.loan,
      activeRoutes: activeRoutes.length,
      totalRoutes: launchedRoutes,
      hubs: hubs.length,
      ownedPlanes: ownedPlanes.length,
      totalPaxToday,
      totalPaxAllTime: totalPassengers.current,
      maxTrust,
      avgTrust: averageTrust,
      continents,
      countries,
      hasConnecting: activeRoutes.some((route) => Boolean(route.via_iata)),
      hasLongHaul: activeRoutes.some((route) => route.demand.haul === "long"),
      hasUltraLong: longestRoute > 6_000,
      debtFree: airline.loan <= 0,
      allHubsFull,
      maxCrowding,
      transAtlantic,
      transPacific,
      planesFamilies: planeFamilies,
      speed3Active: airline.speed === 3 && activeRoutes.length >= 10,
      missionsCompleted: missionTotal,
      missionsToday,
    };

    ACHIEVEMENTS.forEach((achievement) => {
      if (earned[achievement.id] !== undefined) return;
      if (!achievement.check(state)) return;

      useGameStore.getState().earnAchievement(achievement.id, airline.day);
      if (isPlayGamesAchievementId(achievement.id)) {
        void unlockPlayGamesAchievement(achievement.id);
      }

      useGameStore.getState().addWeeklyProgress({
        achievementPoints: achievement.points,
      });
    });

    const incrementalUpdates: [AchievementId, number][] = [
      ["pax_10k_all_time", Math.min(10_000, totalPassengers.current)],
      [
        "pax_100k_all_time",
        Math.min(10_000, Math.floor(totalPassengers.current / 10)),
      ],
      ["routes_5", Math.min(5, activeRoutes.length)],
      ["routes_10", Math.min(10, activeRoutes.length)],
      ["routes_20", Math.min(20, activeRoutes.length)],
      ["routes_35", Math.min(35, activeRoutes.length)],
      ["hubs_5", Math.min(5, hubs.length)],
      ["hubs_10", Math.min(10, hubs.length)],
      ["planes_3", Math.min(3, ownedPlanes.length)],
      ["planes_10", Math.min(10, ownedPlanes.length)],
      ["planes_25", Math.min(25, ownedPlanes.length)],
      ["missions_10", Math.min(10, missionTotal)],
      ["missions_30", Math.min(30, missionTotal)],
      ["countries_5", Math.min(5, countries.size)],
      ["countries_15", Math.min(15, countries.size)],
    ];

    incrementalUpdates.forEach(([id, steps]) => {
      if (steps > 0) void setPlayGamesSteps(id, steps);
    });
  }, [
    airline,
    demands,
    earned,
    hubs,
    loadComplete,
    ownedPlanes,
    phase,
    presence,
    routes,
  ]);
}
