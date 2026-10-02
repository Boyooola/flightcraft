/**
 * hooks/useRevenueTick.ts
 *
 * Day-end operations settlement.
 *
 * RouteLayer moves passengers and records route earnings during the day.
 * This hook runs once when the day changes: it snapshots yesterday's moved
 * passengers, settles revenue and trust, resets daily counters, and persists.
 * Route opportunities are persistent and are not created from fulfillment.
 */

import { submitNetWorth } from "@/hooks/usePlayGames";
import { useSaveAirlineDay } from "@/hooks/useSupabaseWrite";
import {
  emitDaySummaryToast,
  emitUnlockToast,
  emitWarningToast,
} from "@/hooks/useToast";
import { hubCrowdingLevel } from "@/lib/demands";
import {
  hubOutboundWaitingPax,
  waitingPaxForDemand,
} from "@/lib/passengerFlow";
import { calcRouteRevenue, dailyFlights, dailyInterest } from "@/lib/revenue";
import {
  getActiveSeason,
  getSeasonalMultiplier,
  getSeasonLabel,
} from "@/lib/seasons";
import { supabase } from "@/lib/supabase";
import type { Demand, LedgerEntry, Route } from "@/store";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

const CASH_WARNING_THRESHOLD = 200_000;
const BANKRUPT_DAYS = 5;

function snapshotDeliveredPax(demands: Demand[]) {
  const map = new Map<string, number>();
  demands.forEach((demand) => {
    map.set(demand.id, demand.delivered_pax_today ?? 0);
  });
  return map;
}

/**
 * Distribute each market's carried passengers across its active aircraft by
 * seat capacity. This avoids whichever route happens to appear first receiving
 * all passengers in the day-end summary.
 */
function buildRoutesPaxMap(
  routes: readonly Route[],
  paxSnapshot: Map<string, number>,
): Map<string, number> {
  const routePaxMap = new Map<string, number>();

  // Group active routes by demand id
  const byDemand = new Map<string, Route[]>();
  routes.forEach((r) => {
    if (!r.active) return;
    const key = r.demand.id;
    if (!byDemand.has(key)) byDemand.set(key, []);
    byDemand.get(key)!.push(r);
  });

  byDemand.forEach((demandRoutes, demandId) => {
    const carried = Math.max(0, Math.floor(paxSnapshot.get(demandId) ?? 0));
    const ordered = [...demandRoutes].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const capacityByRoute = new Map(
      ordered.map((route) => {
        const plane = route.plane.plane_model;
        const rotations = dailyFlights(
          route.total_dist_nm ?? route.demand.dist_nm,
          Math.max(1, plane.speed_kts),
        );
        const dailyCapacity = Math.max(0, plane.pax_capacity ?? 0) * rotations;

        return [route.id, dailyCapacity] as const;
      }),
    );
    const totalCapacity = Array.from(capacityByRoute.values()).reduce(
      (total, capacity) => total + capacity,
      0,
    );

    if (totalCapacity <= 0 || carried <= 0) {
      ordered.forEach((route) => routePaxMap.set(route.id, 0));
      return;
    }

    const allocations = ordered.map((route) => {
      const capacity = capacityByRoute.get(route.id) ?? 0;
      const exact = (carried * capacity) / totalCapacity;
      const boarded = Math.floor(exact);
      return { route, boarded, remainder: exact - boarded };
    });
    let remaining =
      carried - allocations.reduce((total, item) => total + item.boarded, 0);

    [...allocations]
      .sort((left, right) => {
        if (right.remainder !== left.remainder) {
          return right.remainder - left.remainder;
        }
        return left.route.id.localeCompare(right.route.id);
      })
      .forEach((item) => {
        if (remaining <= 0) return;
        item.boarded++;
        remaining--;
      });

    allocations.forEach((item) => {
      routePaxMap.set(item.route.id, item.boarded);
    });
  });

  return routePaxMap;
}

function withSnapshotDelivered(demand: Demand, delivered: number): Demand {
  return {
    ...demand,
    delivered_pax_today: delivered,
  };
}

function serviceTrustDelta(serviceRatePercent: number): number {
  if (serviceRatePercent >= 95) return 3;
  if (serviceRatePercent >= 80) return 2;
  if (serviceRatePercent >= 60) return 0;
  if (serviceRatePercent >= 40) return -1;
  return -3;
}

function nonNegativePassengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

/**
 * Reconstructs a complete day only when live scheduled earnings are missing.
 * Each rotation receives its own capacity and operating cost.
 */
function fallbackDailyRouteRevenue(params: {
  route: Route;
  demand: Demand;
  deliveredPax: number;
  hubTrust: number;
  revenueMultiplier: number;
}): number {
  const plane = params.route.plane.plane_model;
  const distanceNm = params.route.total_dist_nm ?? params.demand.dist_nm;
  const seatCapacity = Math.max(1, plane.pax_capacity ?? 70);
  const rotations = dailyFlights(
    distanceNm,
    Math.max(1, plane.speed_kts ?? 400),
  );
  const totalBoarded = Math.min(
    nonNegativePassengerCount(params.deliveredPax),
    seatCapacity * rotations,
  );
  const baseBoarded = Math.floor(totalBoarded / rotations);
  let remainder = totalBoarded - baseBoarded * rotations;
  let total = 0;

  for (let index = 0; index < rotations; index += 1) {
    const boardedPax = baseBoarded + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    total += calcRouteRevenue({
      distNm: distanceNm,
      speedKts: Math.max(1, plane.speed_kts ?? 400),
      trustPct: params.hubTrust,
      boardedPax,
      seatCapacity,
      costPerSector: plane.cost_per_sector ?? 500,
      fuelPerNm: plane.fuel_per_nm ?? 2,
      priceStrategy: params.route.price_strategy ?? "standard",
      priceElasticity: params.demand.price_elasticity ?? 1,
      crowdMultiplier: params.revenueMultiplier,
      congestionMultiplier: 1,
      businessPct: params.demand.business_pct ?? 0.25,
      leisurePct: params.demand.leisure_pct ?? 0.75,
    }).net;
  }

  return Number.isFinite(total) ? total : 0;
}

export function useRevenueTick() {
  const lastDay = useRef<number>(-1);
  const lastAirlineId = useRef<string | null>(null);
  const negativeDays = useRef<number>(0);
  const prevDemandScore = useRef<number>(-1);

  const airlineId = useGameStore((state) => state.airline?.id ?? null);
  const day = useGameStore((state) => state.airline?.day ?? null);
  const phase = useGameStore((s) => s.phase);

  const saveDay = useSaveAirlineDay();

  useEffect(() => {
    if (!airlineId || day === null || phase !== "playing") return;

    // Loading or entering gameplay establishes the baseline. A settlement is
    // only valid after the clock advances beyond that loaded day.
    if (lastAirlineId.current !== airlineId || lastDay.current < 0) {
      const baselineAirline = useGameStore.getState().airline;
      lastAirlineId.current = airlineId;
      lastDay.current = day;
      negativeDays.current = 0;
      prevDemandScore.current = baselineAirline?.demand_score ?? 0;
      return;
    }
    if (day <= lastDay.current) {
      lastDay.current = day;
      return;
    }

    const settlementDay = lastDay.current;
    lastDay.current = day;

    const store = useGameStore.getState();
    const airline = store.airline;
    if (!airline || airline.id !== airlineId || airline.day !== day) return;

    const routes = store.routes;
    const activeRoutes = routes.filter((route) => route.active);
    const hubs = store.hubs;
    const demands = store.demands;
    const planes = store.planes;

    if (prevDemandScore.current === -1) {
      prevDemandScore.current = airline.demand_score ?? 0;
    }

    const {
      accrueInterest,
      addLedgerEntries,
      updateHub,
      setPhase,
      updateAirline,
      earnCash,
      resetDailyPax,
      upsertPresence,
    } = store;

    const entries: LedgerEntry[] = [];
    let totalRev = 0;
    let totalPaxToday = 0;
    let stalledRouteCount = 0;

    // Snapshot yesterday's moved travelers BEFORE resetDailyPax().
    const paxSnapshot = snapshotDeliveredPax(demands);

    // Distribute demand pax across routes proportionally by plane capacity
    const routePaxMap = buildRoutesPaxMap(routes, paxSnapshot);
    const demandSnapshot = demands.map((demand) =>
      withSnapshotDelivered(demand, paxSnapshot.get(demand.id) ?? 0),
    );
    const rivalCarriedPax = demandSnapshot.reduce(
      (total, demand) =>
        total + nonNegativePassengerCount(demand.ai_stolen_pax),
      0,
    );

    const endOfDayProgress = 1;

    // Crowding reads the final queue after both player and rival carriage.
    const crowdingByHub = new Map<
      string,
      ReturnType<typeof hubCrowdingLevel>
    >();
    hubs.forEach((hub) => {
      crowdingByHub.set(
        hub.airport.iata,
        hubCrowdingLevel(hub.airport.iata, demandSnapshot, hub.airport),
      );
    });

    // Revenue multipliers
    // eventMultiplier:  today's passive daily event (existing)
    // choiceMultiplier: lingering effect from a player choice decision
    //                   expires when day >= revenueMultiplierEndsDay
    const eventMultiplier = store.dailyEvent?.revenueMultiplier ?? 1.0;

    const activeChoiceConsequence = store.activeChoiceConsequence;
    const choiceMultiplier =
      activeChoiceConsequence?.revenueMultiplier != null &&
      activeChoiceConsequence?.revenueMultiplierEndsDay != null &&
      settlementDay < activeChoiceConsequence.revenueMultiplierEndsDay
        ? activeChoiceConsequence.revenueMultiplier
        : 1.0;

    // Daily conditions and an active decision each apply once.
    const globalRevMul = eventMultiplier * choiceMultiplier;

    // Trust measures whether the airline carried travelers who preferred it.
    // Rival-carried passengers are not counted as a player service failure.
    hubs.forEach((hub) => {
      const iata = hub.airport.iata;
      const hubRoutes = activeRoutes.filter((route) => route.hub_iata === iata);
      const operatedDemandIds = new Set(
        hubRoutes.map((route) => route.demand.id),
      );
      const operatedMarkets = demandSnapshot.filter((demand) =>
        operatedDemandIds.has(demand.id),
      );
      const movedPax = operatedMarkets.reduce(
        (total, demand) =>
          total + nonNegativePassengerCount(demand.delivered_pax_today),
        0,
      );
      const playerPreferredPax = operatedMarkets.reduce((total, demand) => {
        const marketPax = nonNegativePassengerCount(demand.base_pax_day);
        const rivalPax = nonNegativePassengerCount(demand.ai_stolen_pax);
        const carriedPax = nonNegativePassengerCount(
          demand.delivered_pax_today,
        );

        // Preference totals are derived from the fixed daily split. Rival
        // carriage never counts as a player service failure.
        return total + Math.max(carriedPax, marketPax - rivalPax);
      }, 0);
      const serviceRatePercent =
        playerPreferredPax > 0
          ? Math.max(
              0,
              Math.min(100, Math.round((movedPax / playerPreferredPax) * 100)),
            )
          : null;
      const trustDelta =
        serviceRatePercent === null ? 0 : serviceTrustDelta(serviceRatePercent);
      const newTrust = Math.max(0, Math.min(100, hub.trust + trustDelta));

      // Accumulate pax moved through this hub today
      const newHubPax = (hub.hub_pax ?? 0) + movedPax;

      const patch: Partial<typeof hub> = {};
      if (Math.round(newTrust) !== Math.round(hub.trust))
        patch.trust = newTrust;
      if (movedPax > 0) patch.hub_pax = newHubPax;
      if (Object.keys(patch).length > 0) updateHub(hub.id, patch);
    });

    // RouteLayer accumulates scheduled earnings during the day. Settlement
    // credits that total once and creates the route and presence summaries.
    const presencePaxByIata = new Map<string, number>();
    const routeRevenueById = new Map<string, number>();

    activeRoutes.forEach((route) => {
      const demand =
        demandSnapshot.find((d) => d.id === route.demand.id) ?? route.demand;
      const deliveredPax = routePaxMap.get(route.id) ?? 0;
      const remaining = waitingPaxForDemand(demand, endOfDayProgress);

      if (deliveredPax <= 0) stalledRouteCount++;

      // Accumulate presence for the destination airport
      // For connecting routes, also credit the via (stopover) airport
      // with the passengers who got off there.
      if (deliveredPax > 0) {
        if (route.via_iata && (route.via_pax_ratio ?? 0) > 0) {
          // Connecting route: split pax between via stop and final dest
          const viaPax = Math.round(deliveredPax * route.via_pax_ratio!);
          const destPax = deliveredPax - viaPax;

          // Via airport gets the dropoff pax
          if (viaPax > 0) {
            presencePaxByIata.set(
              route.via_iata,
              (presencePaxByIata.get(route.via_iata) ?? 0) + viaPax,
            );
          }
          // Final destination gets the through pax
          if (destPax > 0) {
            presencePaxByIata.set(
              demand.dest.iata,
              (presencePaxByIata.get(demand.dest.iata) ?? 0) + destPax,
            );
          }
        } else {
          // Direct route: all pax credited to the destination
          presencePaxByIata.set(
            demand.dest.iata,
            (presencePaxByIata.get(demand.dest.iata) ?? 0) + deliveredPax,
          );
        }
      }

      const routeCrowding = crowdingByHub.get(route.hub_iata);
      const crowdMultiplier =
        routeCrowding?.level === "crisis"
          ? 0.8
          : routeCrowding?.level === "overcrowded"
            ? 0.9
            : 1.0;

      const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
      const seasonalMultiplier = getSeasonalMultiplier(
        settlementDay,
        demand.dest.country,
        demand.dest.continent,
      );
      const condition = route.plane.condition ?? 100;
      const conditionMultiplier =
        condition <= 15 ? 0.7 : condition <= 40 ? 0.85 : 1;

      // Market share has already reduced deliveredPax while boarding. Applying
      // it again here would square the competition penalty.
      const revMultiplier =
        crowdMultiplier *
        globalRevMul *
        seasonalMultiplier *
        conditionMultiplier;
      const recordedRevenue = store.routeEarnings[route.id];
      const finalRevenue = Number.isFinite(recordedRevenue)
        ? recordedRevenue
        : fallbackDailyRouteRevenue({
            route,
            demand,
            deliveredPax,
            hubTrust: hub?.trust ?? 0,
            revenueMultiplier: revMultiplier,
          });
      routeRevenueById.set(route.id, finalRevenue);
      totalRev += finalRevenue;
      totalPaxToday += deliveredPax;

      const via = route.via_iata ? ` → ${route.via_iata}` : "";
      entries.push({
        id: `rev-${route.id}-${settlementDay}`,
        day: settlementDay,
        type: "revenue",
        label:
          deliveredPax > 0
            ? `${demand.origin.iata}${via} → ${demand.dest.iata} · ${deliveredPax} moved · ${remaining} waiting`
            : `${demand.origin.iata}${via} → ${demand.dest.iata} · stalled · ${remaining} waiting`,
        amount: finalRevenue,
        route_id: route.id,
      });
    });

    // Flush presence accumulations to store (DB sync handled separately)
    presencePaxByIata.forEach((pax, iata) => {
      upsertPresence(iata, pax);
    });

    const rate =
      airline.loan_rate ??
      { easy: 3, normal: 5, hard: 9 }[airline.difficulty] ??
      5;
    const interest = dailyInterest(airline.loan, rate);
    if (interest > 0) {
      entries.push({
        id: `int-${settlementDay}`,
        day: settlementDay,
        type: "interest",
        label: "Loan drag",
        amount: -interest,
        route_id: null,
      });
    }

    const safeRev = Number.isFinite(totalRev) ? totalRev : 0;
    const net = safeRev - interest;
    const settledCash = airline.cash + net;

    if (rivalCarriedPax > 0) {
      const topRivalMarket = [...demandSnapshot].sort(
        (left, right) =>
          nonNegativePassengerCount(right.ai_stolen_pax) -
          nonNegativePassengerCount(left.ai_stolen_pax),
      )[0];

      const topRivalPax = nonNegativePassengerCount(
        topRivalMarket?.ai_stolen_pax,
      );
      if (topRivalMarket && topRivalPax >= 50) {
        emitWarningToast({
          id: `rival-market-${settlementDay}-${topRivalMarket.id}`,
          level: topRivalPax >= 250 ? "critical" : "low",
          cash: settledCash,
          message: `Rivals carried ${topRivalPax.toLocaleString()} passengers on ${topRivalMarket.origin.iata} to ${topRivalMarket.dest.iata}. Improve trust, fares, or route quality to win more of this market.`,
        });
      }
    }

    // Credit route revenue once at settlement.
    if (safeRev !== 0) earnCash(safeRev);
    if (interest > 0) accrueInterest(interest);

    const activePlaneIds = new Set(activeRoutes.map((route) => route.plane.id));
    const activeRouteByPlaneId = new Map(
      activeRoutes.map((route) => [route.plane.id, route]),
    );
    if (entries.length) addLedgerEntries(entries);

    // Plane wear and recovery
    // Active planes lose 2–3 condition/day. Idle planes recover 5/day.
    // Player triggers full restoration via FleetSheet maintenance button.
    {
      const { ownedPlanes, updateOwnedPlane } = useGameStore.getState();
      const wearUpdates: {
        id: string;
        condition: number;
        days_active: number;
      }[] = [];

      ownedPlanes.forEach((plane) => {
        const isActive = activePlaneIds.has(plane.id);
        const condition = plane.condition ?? 100;
        const daysActive = plane.days_active ?? 0;

        if (isActive) {
          const activeRoute = activeRouteByPlaneId.get(plane.id);
          const routeDistance =
            activeRoute?.total_dist_nm ?? activeRoute?.demand.dist_nm ?? 0;
          const wearRate = routeDistance >= 3_500 ? 3 : 2;
          const newCondition = Math.max(0, condition - wearRate);
          const newDaysActive = daysActive + 1;

          updateOwnedPlane(plane.id, {
            condition: newCondition,
            days_active: newDaysActive,
          });
          wearUpdates.push({
            id: plane.id,
            condition: newCondition,
            days_active: newDaysActive,
          });

          // Warn at 40% the first time the aircraft crosses the threshold.
          if (newCondition <= 40 && condition > 40) {
            emitWarningToast({
              id: `wear-warn-${plane.id}-${settlementDay}`,
              level: "low",
              cash: settledCash,
              message: `${plane.plane_model.nickname} condition is below 40%. Schedule maintenance soon.`,
            });
          }
          // Critical at 15%
          if (newCondition <= 15 && condition > 15) {
            emitWarningToast({
              id: `wear-crit-${plane.id}-${settlementDay}`,
              level: "critical",
              cash: settledCash,
              message: `${plane.plane_model.nickname} condition is critical. Route revenue is reduced.`,
            });
          }
        } else {
          // Idle aircraft recover gradually.
          const recovered = Math.min(100, condition + 5); // ~2 week rest = full recovery
          const newDaysActive = 0;
          if (recovered !== condition || daysActive !== 0) {
            updateOwnedPlane(plane.id, {
              condition: recovered,
              days_active: newDaysActive,
            });
            wearUpdates.push({
              id: plane.id,
              condition: recovered,
              days_active: newDaysActive,
            });
          }
        }
      });

      // Batch database write. A later settlement corrects a failed update.
      if (wearUpdates.length > 0) {
        void Promise.all(
          wearUpdates.map(({ id, condition, days_active }) =>
            supabase
              .from("owned_planes")
              .update({ condition, days_active })
              .eq("id", id),
          ),
        )
          .then((results) => {
            const failed = results.find((result) => result.error)?.error;
            if (failed) {
              console.warn(
                "[revenue-tick] failed to save aircraft condition",
                failed.message,
              );
            }
          })
          .catch((error) => {
            console.warn(
              "[revenue-tick] failed to save aircraft condition",
              error,
            );
          });
      }
    }

    // Weekly progress accumulation.
    {
      const { addWeeklyProgress, airline: latestAirline } =
        useGameStore.getState();

      const allRoutesProfitable =
        activeRoutes.length > 0 &&
        activeRoutes.every((route) => {
          const deliveredPax = routePaxMap.get(route.id) ?? 0;
          if (deliveredPax <= 0) return false;

          return (routeRevenueById.get(route.id) ?? 0) > 0;
        });

      addWeeklyProgress({
        passengers: totalPaxToday,
        routeEarnings: Math.max(0, safeRev),
        gameDays: 1,
        profitableDays: net > 0 && allRoutesProfitable ? 1 : 0,
        speedThreeDays: latestAirline?.speed === 3 ? 1 : 0,
      });
    }

    const { dailyMissions, airline: latestAirline } = useGameStore.getState();
    const doneToday = dailyMissions.filter(
      (mission) => mission.completed,
    ).length;
    const currentCash = latestAirline?.cash ?? airline.cash;
    const currentLoan = latestAirline?.loan ?? airline.loan;
    const netWorth = Math.max(0, currentCash - currentLoan);
    const prevNetWorth = Math.max(0, airline.cash - airline.loan);
    const totalWaitingPax = hubs.reduce((sum, hub) => {
      return (
        sum +
        hubOutboundWaitingPax(
          hub.airport.iata,
          demandSnapshot,
          endOfDayProgress,
        )
      );
    }, 0);

    // Hub crowding counts are included in the daily summary.
    let busyCount = 0,
      overcrowdedCount = 0,
      crisisHubs = 0;
    hubs.forEach((hub) => {
      const level = crowdingByHub.get(hub.airport.iata)?.level;
      if (level === "busy") busyCount++;
      else if (level === "overcrowded") overcrowdedCount++;
      else if (level === "crisis") crisisHubs++;
    });

    const choiceEffectSummary =
      choiceMultiplier !== 1.0 &&
      activeChoiceConsequence?.revenueMultiplierEndsDay
        ? (() => {
            const pct = Math.round((choiceMultiplier - 1) * 100);
            const daysLeft =
              activeChoiceConsequence.revenueMultiplierEndsDay - settlementDay;
            return {
              pctLabel: pct >= 0 ? `+${pct}%` : `${pct}%`,
              daysLeft: Math.max(0, daysLeft),
              color: pct >= 0 ? "#24734E" : "#B43A35",
            };
          })()
        : null;

    emitDaySummaryToast({
      id: `day-summary-${settlementDay}`,
      day: settlementDay,
      revenue: safeRev,
      interest,
      net,
      paxToday: totalPaxToday,
      missionsToday: doneToday,
      missionsTotal: dailyMissions.length,
      netWorth,
      prevNetWorth,
      waitingPax: totalWaitingPax,
      stalledRoutes: stalledRouteCount,
      aiStolenPax: rivalCarriedPax,
      busyHubs: busyCount,
      overcrowdedHubs: overcrowdedCount,
      crisisHubs: crisisHubs,
      choiceEffect: choiceEffectSummary,
    });

    // Seasonal note shown once when a new season begins.
    const nextDay = settlementDay + 1;
    const seasonLabel = getSeasonLabel(nextDay);
    const prevSeason = getSeasonLabel(settlementDay);
    if (seasonLabel && seasonLabel !== prevSeason) {
      const { effects } = getActiveSeason(nextDay);
      const top = effects[0];
      if (top) {
        emitWarningToast({
          id: `season-${nextDay}`,
          level: "low",
          cash: currentCash,
          message:
            top.multiplier > 1
              ? `${seasonLabel}. ${top.region.replace(/_/g, " ")} routes are busier this season.`
              : `${seasonLabel}. ${top.region.replace(/_/g, " ")} routes are quieter this season.`,
        });
      }
    }

    const crowdingPriority = { normal: 0, busy: 1, overcrowded: 2, crisis: 3 };
    const highestCrowding = hubs
      .map((hub) => {
        const iata = hub.airport.iata;
        return {
          iata,
          level: crowdingByHub.get(iata)?.level ?? "normal",
          waitingPax: hubOutboundWaitingPax(
            iata,
            demandSnapshot,
            endOfDayProgress,
          ),
        };
      })
      .filter((item) => item.level === "overcrowded" || item.level === "crisis")
      .sort(
        (left, right) =>
          crowdingPriority[right.level] - crowdingPriority[left.level] ||
          right.waitingPax - left.waitingPax,
      )[0];

    if (highestCrowding) {
      emitWarningToast({
        id: `crowding-${highestCrowding.iata}-${settlementDay}`,
        level: "critical",
        cash: currentCash,
        message:
          highestCrowding.level === "crisis"
            ? `${highestCrowding.iata} has ${highestCrowding.waitingPax.toLocaleString()} waiting passengers. Add capacity now.`
            : `${highestCrowding.iata} is overcrowded with ${highestCrowding.waitingPax.toLocaleString()} waiting passengers.`,
      });
    }

    if (stalledRouteCount > 0 && activeRoutes.length > 0) {
      emitWarningToast({
        id: `stalled-routes-${settlementDay}`,
        level: stalledRouteCount >= 3 ? "critical" : "low",
        cash: currentCash,
        message: `${stalledRouteCount} route${stalledRouteCount === 1 ? "" : "s"} moved no travelers today. Review fares, aircraft, and market demand.`,
      });
    }

    const cashAfter = currentCash;
    if (cashAfter < 0) {
      negativeDays.current += 1;
      if (negativeDays.current >= BANKRUPT_DAYS) {
        setPhase("bankrupt");
      }
    } else {
      negativeDays.current = 0;

      if (cashAfter < CASH_WARNING_THRESHOLD) {
        emitWarningToast({
          id: `warn-low-${settlementDay}`,
          level: "low",
          cash: cashAfter,
          message:
            "Cash is running low. Review unprofitable routes and idle aircraft.",
        });
      }
    }

    // Global reputation follows the average trust of the player's hubs. It
    // moves gradually so one unusually good or bad day does not cause a jump.
    const settledHubs = useGameStore.getState().hubs;
    if (settledHubs.length > 0) {
      const averageTrust =
        settledHubs.reduce((total, hub) => total + hub.trust, 0) /
        settledHubs.length;
      const currentReputation = airline.reputation ?? 50;
      const nextReputation =
        Math.round(
          (currentReputation + (averageTrust - currentReputation) * 0.2) * 10,
        ) / 10;
      if (nextReputation !== currentReputation) {
        updateAirline({ reputation: nextReputation });
      }
    }

    const oldScore = prevDemandScore.current;
    const newScore = airline.demand_score ?? 0;
    if (newScore > oldScore) {
      planes.forEach((plane) => {
        const gate = plane.unlock_demands;
        if (gate > 0 && oldScore < gate && newScore >= gate) {
          if (plane.unlock_cash <= currentCash * 5) {
            emitUnlockToast({
              id: `unlock-${plane.id}-day-${settlementDay}`,
              nickname: plane.nickname,
              family: plane.family,
              price: plane.price,
            });
          }
        }
      });
    }
    prevDemandScore.current = newScore;

    // Submit net worth to Play Games leaderboard daily
    {
      const { airline: a } = useGameStore.getState();
      if (a) submitNetWorth(Math.max(0, a.cash - a.loan));
    }

    resetDailyPax();
    void saveDay();
  }, [airlineId, day, phase, saveDay]);
}
