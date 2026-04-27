/**
 * hooks/useAchievementChecker.ts
 *
 * Checks all achievements every day tick.
 * State is derived purely from airport data (continent, country)
 * with no hardcoded country sets — intercontinental checks use
 * the continent field directly.
 */

import { emitAchievementToast } from "@/hooks/useToast";
import { ACHIEVEMENTS, type AchievementState } from "@/lib/achievements";
import {
  useDailyMissions,
  useEarnedAchievements,
  useGameStore,
  useMissionsCompleted,
} from "@/store";
import { useEffect, useRef } from "react";

export function useAchievementChecker() {
  const lastDay = useRef<number>(-1);
  const totalPaxRef = useRef<number>(0);

  const earned = useEarnedAchievements();
  const airline = useGameStore((s) => s.airline);
  const routes = useGameStore((s) => s.routes);
  const hubs = useGameStore((s) => s.hubs);
  const ownedPlanes = useGameStore((s) => s.ownedPlanes);
  const demands = useGameStore((s) => s.demands);
  const missionsCompleted = useMissionsCompleted();
  const dailyMissions = useDailyMissions();
  const earnAchievement = useGameStore((s) => s.earnAchievement);

  useEffect(() => {
    if (!airline) return;
    if (airline.day === lastDay.current) return;
    lastDay.current = airline.day;

    const activeRoutes = routes.filter((r) => r.active);

    // Continents + countries from active route endpoints
    const continents = new Set<string>();
    const countries = new Set<string>();
    activeRoutes.forEach((r) => {
      [r.demand.origin, r.demand.dest].forEach((ap) => {
        if (ap.continent) continents.add(ap.continent);
        if (ap.country) countries.add(ap.country);
      });
    });

    // Plane families owned
    const planesFamilies = new Set(
      ownedPlanes.map((p) => p.plane_model.family).filter(Boolean),
    );

    // Pax
    const totalPaxToday = demands.reduce(
      (sum, d) => sum + (d.delivered_pax_today ?? 0),
      0,
    );
    totalPaxRef.current += totalPaxToday;

    // Trust
    const maxTrust = hubs.reduce((max, h) => Math.max(max, h.trust), 0);
    const avgTrust =
      hubs.length > 0 ? hubs.reduce((s, h) => s + h.trust, 0) / hubs.length : 0;

    // Longest route
    const longestRoute = activeRoutes.reduce(
      (max, r) => Math.max(max, r.total_dist_nm ?? r.demand.dist_nm),
      0,
    );

    // Hubs on different continents
    const hubContinents = new Set(
      hubs.map((h) => h.airport.continent).filter(Boolean),
    );
    const hubsOnDiffCont = hubContinents.size >= 2;

    // Intercontinental route checks — derived from continent field, no hardcoded lists
    // "AS" = Asia, "EU" = Europe, "NA" = North America, "SA" = South America, "OC" = Oceania, "AF" = Africa
    const intraAsiaRoute = activeRoutes.some(
      (r) =>
        r.demand.origin.continent === "AS" && r.demand.dest.continent === "AS",
    );
    const intraEuropeRoute = activeRoutes.some(
      (r) =>
        r.demand.origin.continent === "EU" && r.demand.dest.continent === "EU",
    );
    const transAtlantic = activeRoutes.some((r) => {
      const conts = [r.demand.origin.continent, r.demand.dest.continent]
        .sort()
        .join("-");
      return conts === "EU-NA";
    });
    const transPacific = activeRoutes.some((r) => {
      const oc = r.demand.origin.continent;
      const dc = r.demand.dest.continent;
      return (
        (oc === "NA" && (dc === "AS" || dc === "OC")) ||
        ((oc === "AS" || oc === "OC") && dc === "NA")
      );
    });

    // Home continent → another continent
    // "Home" = continent of first hub purchased
    const homeContinent = hubs.length > 0 ? hubs[0].airport.continent : null;
    const homeToWorld = homeContinent
      ? activeRoutes.some(
          (r) =>
            (r.demand.origin.continent === homeContinent &&
              r.demand.dest.continent !== homeContinent) ||
            (r.demand.dest.continent === homeContinent &&
              r.demand.origin.continent !== homeContinent),
        )
      : false;

    // Labour corridor — any route to Middle East region
    // Derived from continent "AS" + country in Gulf area via a simple heuristic:
    // Middle East airports are in Asia (AS) but not East/SE Asia
    // We flag routes >2500nm within AS continent as likely ME corridors
    const labourCorridor = activeRoutes.some(
      (r) =>
        r.demand.origin.continent === "AS" &&
        r.demand.dest.continent === "AS" &&
        (r.total_dist_nm ?? r.demand.dist_nm) > 2_500,
    );

    // Diaspora route — any long haul >4000nm
    const diasporaRoute = longestRoute > 4_000;

    // Missions
    const doneToday = dailyMissions.filter((m) => m.completed).length;
    const allMissionsToday = doneToday >= 3 && dailyMissions.length >= 3;

    const state: AchievementState = {
      day: airline.day,
      cash: airline.cash,
      loan: airline.loan,
      netWorth: airline.cash - airline.loan,
      activeRoutes: activeRoutes.length,
      totalRoutes: airline.demand_score ?? 0,
      hubs: hubs.length,
      ownedPlanes: ownedPlanes.length,
      reputation: airline.reputation ?? 0,
      totalPaxToday,
      totalPaxAllTime: totalPaxRef.current,
      maxTrust,
      avgTrust,
      continents,
      countries,
      regions: new Set(),
      hasConnecting: activeRoutes.some((r) => !!r.via_iata),
      hasLongHaul: longestRoute > 3_500,
      hasUltraLong: longestRoute > 6_000,
      hasUltraUltra: longestRoute > 9_000,
      debtFree: airline.loan <= 0,
      allHubsFull: hubs.length > 0 && hubs.every((h) => h.trust >= 100),
      maxCrowding: "normal",
      homeToWorld,
      labourCorridor,
      diasporaRoute,
      intraAsiaRoute,
      intraEuropeRoute,
      transAtlantic,
      transPacific,
      planesFamilies,
      speed3Active: airline.speed === 3 && activeRoutes.length >= 10,
      missionsCompleted,
      missionsToday: doneToday,
      allMissionsToday,
      routeStreak: 0,
      hubsOnDiffCont,
      longestRoute,
      mostTrustedHub: maxTrust,
      hasRouteToEvery: continents.size >= 6,
      // PH fields removed — replaced by global equivalents above
      phHub: false,
      phMidEastRoute: false,
      phEuropeRoute: false,
      phAmericaRoute: false,
    };

    ACHIEVEMENTS.forEach((achievement) => {
      if (earned[achievement.id] !== undefined) return;
      if (!achievement.check(state)) return;

      earnAchievement(achievement.id, airline.day);
      emitAchievementToast({
        id: `ach-${achievement.id}-day-${airline.day}`,
        achievementId: achievement.id,
        title: achievement.title,
        flavor: achievement.flavor,
        icon: achievement.icon,
        points: achievement.points,
        category: achievement.category,
      });
    });
  }, [airline?.day]);
}
