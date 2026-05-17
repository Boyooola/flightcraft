/**
 * hooks/useRevenueTick.ts
 *
 * WorldWide Rush-style day-end settlement.
 *
 * RouteLayer moves passengers and credits route cash live on arrivals.
 * This hook runs once when the day changes: it snapshots yesterday's moved
 * passengers, writes the summary ledger, applies loan drag, emits warnings,
 * spawns new demand, resets daily pax, and persists.
 */

import { submitNetWorth } from "@/hooks/usePlayGames";
import {
  useSaveAirlineDay,
  useSpawnDailyDemand,
} from "@/hooks/useSupabaseWrite";
import {
  emitDaySummaryToast,
  emitUnlockToast,
  emitWarningToast,
} from "@/hooks/useToast";
import { computePlayerMarketShare } from "@/lib/AIAirline";
import { applyAIPressure } from "@/lib/aiPressure";
import { allDemandsServed, hubCrowdingLevel } from "@/lib/demands";
import { applyDemandWave, isDemandWaveDay } from "@/lib/demandWaves";
import {
  applyGlobalContractDay,
  createGlobalContract,
  shouldStartGlobalContracts,
} from "@/lib/globalContracts";
import { hubOutboundWaitingPax } from "@/lib/passengerFlow";
import { calcRouteRevenue, dailyInterest } from "@/lib/revenue";
import { getActiveSeason, getSeasonLabel } from "@/lib/seasons";
import { supabase } from "@/lib/supabase";
import type { Demand, LedgerEntry } from "@/store";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

const CASH_WARNING_THRESHOLD = 200_000;
const BANKRUPT_DAYS = 5;
const REP_STREAK_DAYS = 10;

function snapshotDeliveredPax(demands: Demand[]) {
  const map = new Map<string, number>();
  demands.forEach((demand) => {
    map.set(demand.id, demand.delivered_pax_today ?? 0);
  });
  return map;
}

function withSnapshotDelivered(demand: Demand, delivered: number): Demand {
  return {
    ...demand,
    delivered_pax_today: delivered,
  };
}

export function useRevenueTick() {
  const lastDay = useRef<number>(-1);
  const negativeDays = useRef<number>(0);
  const prevDemandScore = useRef<number>(-1);
  const profitableStreak = useRef<number>(0);

  const airline = useGameStore((s) => s.airline);
  const routes = useGameStore((s) => s.routes);
  const hubs = useGameStore((s) => s.hubs);
  const demands = useGameStore((s) => s.demands);
  const planes = useGameStore((s) => s.planes);
  const phase = useGameStore((s) => s.phase);

  const saveDay = useSaveAirlineDay();
  const spawnDemand = useSpawnDailyDemand();

  useEffect(() => {
    if (!airline || phase !== "playing") return;
    if (airline.day === lastDay.current) return;
    lastDay.current = airline.day;

    if (useGameStore.getState().isApplyingAwayEarnings) return;

    if (prevDemandScore.current === -1) {
      prevDemandScore.current = airline.demand_score ?? 0;
    }

    const store = useGameStore.getState();
    const {
      accrueInterest,
      addLedgerEntries,
      updateHub,
      setPhase,
      updateAirline,
      updateDemand,
      setGlobalContract,
      completeGlobalContract,
      updateGlobalContract,
      earnCash,
      resetDailyPax,
      applyWaveToStore,
      setActiveDemandWave,
      upsertPresence,
    } = store;

    const entries: LedgerEntry[] = [];
    let totalRev = 0;
    let totalPaxToday = 0;
    let activeRouteCount = 0;
    let stalledRouteCount = 0;

    // Snapshot yesterday's moved travelers BEFORE resetDailyPax().
    const paxSnapshot = snapshotDeliveredPax(demands);
    let demandSnapshot = demands.map((demand) =>
      withSnapshotDelivered(demand, paxSnapshot.get(demand.id) ?? 0),
    );

    const endOfDayProgress = 1;

    const aiPressure = applyAIPressure({
      demands: demandSnapshot,
      aiAirlines: store.aiAirlines,
      dayProgress: endOfDayProgress,
      day: airline.day,
      difficulty: airline.ai_difficulty,
    });

    if (aiPressure.demandUpdates.length > 0) {
      const updateMap = new Map(
        aiPressure.demandUpdates.map((u) => [u.demandId, u.base_pax_day]),
      );
      demandSnapshot = demandSnapshot.map((demand) =>
        updateMap.has(demand.id)
          ? { ...demand, base_pax_day: updateMap.get(demand.id)! }
          : demand,
      );
    }

    // Crowding reads the day-end passenger queue after AI pressure.
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

    const eventMultiplier = store.dailyEvent?.revenueMultiplier ?? 1.0;
    const aiAirlines = store.aiAirlines;

    // Trust = fill-rate based delta clamped by trust_floor.
    // Fill rate = player moved pax / total demand pax at this hub.
    hubs.forEach((hub) => {
      const iata = hub.airport.iata;
      const hubRoutes = routes.filter((r) => r.active && r.hub_iata === iata);

      const movedPax = hubRoutes.reduce((sum, route) => {
        return sum + (paxSnapshot.get(route.demand.id) ?? 0);
      }, 0);

      const totalDemandPax = hubRoutes.reduce((sum, route) => {
        const demand = demands.find((d) => d.id === route.demand.id);
        return sum + (demand?.base_pax_day ?? route.demand.base_pax_day ?? 0);
      }, 0);

      const fillRate =
        totalDemandPax > 0
          ? Math.round((movedPax / totalDemandPax) * 100)
          : hubRoutes.length === 0
            ? 0
            : 100; // all demands served with no quota = perfect fill

      // Fill-rate → daily trust delta
      let trustDelta =
        fillRate >= 90
          ? 4
          : fillRate >= 70
            ? 2
            : fillRate >= 50
              ? 1
              : fillRate >= 25
                ? -2
                : -5;

      // Crowding penalties on top
      const crowding = crowdingByHub.get(iata);
      if (crowding?.level === "crisis") trustDelta -= 3;
      else if (crowding?.level === "overcrowded") trustDelta -= 1;

      const floor = hub.trust_floor ?? 0;
      // Neglected hubs (no routes assigned) bypass the trust floor so decay
      // actually bites — the floor only protects active hubs.
      const effectiveFloor = hubRoutes.length === 0 ? 0 : floor;
      const newTrust = Math.max(
        effectiveFloor,
        Math.min(100, hub.trust + trustDelta),
      );

      // Accumulate pax moved through this hub today
      const newHubPax = (hub.hub_pax ?? 0) + movedPax;

      const patch: Partial<typeof hub> = {};
      if (Math.round(newTrust) !== Math.round(hub.trust))
        patch.trust = newTrust;
      if (movedPax > 0) patch.hub_pax = newHubPax;
      if (Object.keys(patch).length > 0) updateHub(hub.id, patch);
    });

    // Day-end route summaries. Cash was credited live by RouteLayer.
    // Also accumulate presence pax per destination for hub unlock gating.
    const presencePaxByIata = new Map<string, number>();

    routes.forEach((route) => {
      if (!route.active) return;

      const demand =
        demandSnapshot.find((d) => d.id === route.demand.id) ?? route.demand;
      const deliveredPax = paxSnapshot.get(demand.id) ?? 0;
      const remaining = Math.max(0, demand.base_pax_day - deliveredPax);

      if (deliveredPax <= 0) stalledRouteCount++;

      // Accumulate presence for the destination airport
      if (deliveredPax > 0) {
        const destIata = demand.dest.iata;
        presencePaxByIata.set(
          destIata,
          (presencePaxByIata.get(destIata) ?? 0) + deliveredPax,
        );
      }

      const routeCrowding = crowdingByHub.get(route.hub_iata);
      const crowdMultiplier =
        routeCrowding?.level === "crisis"
          ? 0.8
          : routeCrowding?.level === "overcrowded"
            ? 0.9
            : 1.0;

      const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
      const marketShare = computePlayerMarketShare(
        hub?.trust ?? 50,
        aiAirlines,
        demand.origin.iata,
        demand.dest.iata,
      );

      const revMultiplier = crowdMultiplier * eventMultiplier * marketShare;
      const routeDist = route.total_dist_nm ?? demand.dist_nm;
      const plane = route.plane.plane_model;
      const res = calcRouteRevenue({
        distNm: routeDist,
        speedKts: plane.speed_kts,
        trustPct: hub?.trust ?? 0,
        deliveredPax,
        paxDay: demand.base_pax_day,
        costPerSector: plane.cost_per_sector ?? 500,
        fuelPerNm: plane.fuel_per_nm ?? 2.0,
        crowdMultiplier: revMultiplier,
        businessPct: demand.business_pct ?? 0.25,
        leisurePct: demand.leisure_pct ?? 0.75,
      });
      const finalRevenue = res.net;
      totalRev += finalRevenue;
      totalPaxToday += deliveredPax;
      activeRouteCount++;

      const via = route.via_iata ? ` → ${route.via_iata}` : "";
      entries.push({
        id: `rev-${route.id}-${airline.day}`,
        day: airline.day,
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
        id: `int-${airline.day}`,
        day: airline.day,
        type: "interest",
        label: "Loan drag",
        amount: -interest,
        route_id: null,
      });
    }

    if (aiPressure.totalStolenPax > 0) {
      const topSteal = [...aiPressure.steals].sort(
        (a, b) => b.stolenPax - a.stolenPax,
      )[0];

      entries.push({
        id: `ai-steal-${airline.day}`,
        day: airline.day,
        type: "event",
        label: `Rivals captured ${aiPressure.totalStolenPax.toLocaleString()} waiting travelers`,
        amount: 0,
        route_id: null,
      });

      if (topSteal) {
        emitWarningToast({
          id: `ai-steal-${airline.day}-${topSteal.demandId}`,
          level: aiPressure.totalStolenPax >= 250 ? "critical" : "low",
          cash: airline.cash,
          message: `${topSteal.aiName} captured ${topSteal.stolenPax.toLocaleString()} waiting travelers on ${topSteal.originIata} → ${topSteal.destIata}. Clear queues faster to protect demand.`,
        });
      }
    }

    const net = totalRev - interest;

    // Route rewards already happened live. Only interest + maintenance change cash here.
    if (interest > 0) accrueInterest(interest);

    // Idle plane maintenance cost — planes with no active route still cost money
    const { ownedPlanes: allPlanes } = useGameStore.getState();
    const activePlaneIds = new Set(routes.map((r) => r.plane.id));
    const idlePlanes = (allPlanes ?? []).filter(
      (p) => !activePlaneIds.has(p.id),
    );
    const maintenanceCost = idlePlanes.reduce((sum, p) => {
      const dailyOps =
        (p.plane_model.cost_per_sector ?? 500) * 2 +
        (p.plane_model.fuel_per_nm ?? 2) * 500;
      return sum + Math.round(dailyOps * 0.15);
    }, 0);
    if (maintenanceCost > 0) {
      earnCash(-maintenanceCost);
      entries.push({
        id: `maint-${airline.day}`,
        day: airline.day,
        type: "interest" as const,
        label: `Idle maintenance (${idlePlanes.length} plane${idlePlanes.length !== 1 ? "s" : ""})`,
        amount: -maintenanceCost,
        route_id: null,
      });
    }
    if (entries.length) addLedgerEntries(entries);

    // ── Plane wear — condition decreases daily with use ───────────
    // Active planes lose 2–4 condition/day. Idle planes recover 1/day.
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
          // Long-haul planes wear faster
          const wearRate = plane.plane_model.range_nm > 4000 ? 3 : 2;
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

          // Warn at 40% — first time crossing threshold
          if (newCondition <= 40 && condition > 40) {
            emitWarningToast({
              id: `wear-warn-${plane.id}-${airline.day}`,
              level: "low",
              cash: airline.cash,
              message: `✈ ${plane.plane_model.nickname} is getting worn — consider maintenance soon.`,
            });
          }
          // Critical at 15%
          if (newCondition <= 15 && condition > 15) {
            emitWarningToast({
              id: `wear-crit-${plane.id}-${airline.day}`,
              level: "critical",
              cash: airline.cash,
              message: `⚠ ${plane.plane_model.nickname} is in critical condition — revenue is reduced.`,
            });
          }
        } else {
          // Idle — slow natural recovery (1/day)
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

      // Batch DB write — fire and forget
      if (wearUpdates.length > 0) {
        Promise.all(
          wearUpdates.map(({ id, condition, days_active }) =>
            supabase
              .from("owned_planes")
              .update({ condition, days_active })
              .eq("id", id),
          ),
        ).catch(() => {}); // Silent fail — corrects on next tick
      }
    }

    // Weekly progress accumulation.
    {
      const {
        weeklyProgress,
        updateWeeklyProgress,
        resetWeeklyProgress,
        dailyMissions: dMissions,
        airline: latestAirline,
      } = useGameStore.getState();

      const now = new Date();
      const d = new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
      );
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dow);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(
        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      );

      if (weeklyProgress.weekNumber !== weekNum) resetWeeklyProgress(weekNum);

      const allMissionsDone =
        dMissions.length > 0 && dMissions.every((mission) => mission.completed);

      const activeRoutes = routes.filter((route) => route.active);
      const allRoutesMoving =
        activeRoutes.length === 0 ||
        activeRoutes.every(
          (route) => (paxSnapshot.get(route.demand.id) ?? 0) > 0,
        );

      const allRoutesProfitable =
        activeRoutes.length === 0 ||
        activeRoutes.every((route) => {
          const demand = demands.find((d) => d.id === route.demand.id);
          const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
          const plane = route.plane.plane_model;
          if (!demand) return true;

          const deliveredPax = paxSnapshot.get(demand.id) ?? 0;
          if (deliveredPax <= 0) return false;

          return (
            calcRouteRevenue({
              distNm: route.total_dist_nm ?? demand.dist_nm,
              speedKts: plane.speed_kts,
              trustPct: hub?.trust ?? 0,
              deliveredPax,
              paxDay: demand.base_pax_day,
              costPerSector: plane.cost_per_sector ?? 500,
              fuelPerNm: plane.fuel_per_nm ?? 2.0,
              priceStrategy: (route as any).price_strategy ?? "standard",
              priceElasticity: demand.price_elasticity ?? 1,
              businessPct: demand.business_pct ?? 0.25,
              leisurePct: demand.leisure_pct ?? 0.75,
            }).net >= 0
          );
        });

      updateWeeklyProgress({
        paxTotal: weeklyProgress.paxTotal + totalPaxToday,
        revenueTotal: weeklyProgress.revenueTotal + totalRev,
        loginDays: weeklyProgress.loginDays + 1,
        perfectDays: weeklyProgress.perfectDays + (allMissionsDone ? 1 : 0),
        profitDays:
          weeklyProgress.profitDays +
          (allRoutesMoving && allRoutesProfitable ? 1 : 0),
        speedDays:
          weeklyProgress.speedDays + (latestAirline?.speed === 3 ? 1 : 0),
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

    // Hub crowding counts — used in DaySummaryCard and global contracts
    let busyCount = 0,
      overcrowdedCount = 0,
      crisisHubs = 0;
    hubs.forEach((hub) => {
      const level = crowdingByHub.get(hub.airport.iata)?.level;
      if (level === "busy") busyCount++;
      else if (level === "overcrowded") overcrowdedCount++;
      else if (level === "crisis") crisisHubs++;
    });

    emitDaySummaryToast({
      id: `day-summary-${airline.day}`,
      day: airline.day,
      revenue: totalRev,
      interest,
      net,
      paxToday: totalPaxToday,
      missionsToday: doneToday,
      missionsTotal: dailyMissions.length,
      netWorth,
      prevNetWorth,
      waitingPax: totalWaitingPax,
      stalledRoutes: stalledRouteCount,
      aiStolenPax: aiPressure.totalStolenPax,
      busyHubs: busyCount,
      overcrowdedHubs: overcrowdedCount,
      crisisHubs: crisisHubs,
    });

    // Seasonal note — shown once at start of each new month (every ~30 days)
    const nextDay = airline.day + 1;
    const seasonLabel = getSeasonLabel(nextDay);
    const prevSeason = getSeasonLabel(airline.day);
    if (seasonLabel && seasonLabel !== prevSeason) {
      const { effects } = getActiveSeason(nextDay);
      const top = effects[0];
      if (top) {
        emitWarningToast({
          id: `season-${nextDay}`,
          level: top.multiplier > 1 ? "low" : "low",
          cash: airline.cash,
          message:
            top.multiplier > 1
              ? `✈ ${seasonLabel} — ${top.region.replace(/_/g, " ")} routes are busier this season.`
              : `✈ ${seasonLabel} — ${top.region.replace(/_/g, " ")} routes are quieter this season.`,
        });
      }
    }

    hubs.forEach((hub) => {
      const hubIata = hub.airport.iata;
      const waitingPax = hubOutboundWaitingPax(
        hubIata,
        demandSnapshot,
        endOfDayProgress,
      );
      const crowding = crowdingByHub.get(hubIata);
      if (!crowding || crowding.level === "normal") return;

      if (crowding.level === "busy") {
        emitWarningToast({
          id: `crowd-busy-${hubIata}-${airline.day}`,
          level: "low",
          cash: airline.cash,
          message: `${hubIata} is getting busy — ${waitingPax.toLocaleString()} travelers waiting. Add capacity to keep flow moving.`,
        });
      } else if (crowding.level === "overcrowded") {
        emitWarningToast({
          id: `crowd-over-${hubIata}-${airline.day}`,
          level: "critical",
          cash: airline.cash,
          message: `${hubIata} is overcrowded — ${waitingPax.toLocaleString()} travelers stuck. Trust and rewards are taking a hit.`,
        });
      } else if (crowding.level === "crisis") {
        emitWarningToast({
          id: `crowd-crisis-${hubIata}-${airline.day}`,
          level: "critical",
          cash: airline.cash,
          message: `Crisis at ${hubIata} — ${waitingPax.toLocaleString()} travelers may switch to rivals. Clear the queue now.`,
        });
      }
    });

    if (stalledRouteCount > 0 && activeRouteCount > 0) {
      emitWarningToast({
        id: `stalled-routes-${airline.day}`,
        level: stalledRouteCount >= 3 ? "critical" : "low",
        cash: airline.cash,
        message: `${stalledRouteCount} route${stalledRouteCount === 1 ? "" : "s"} moved no travelers today. Reassign planes to routes with waiting demand.`,
      });
    }

    const cashAfter = currentCash;
    if (cashAfter < 0) {
      negativeDays.current += 1;
      if (negativeDays.current >= BANKRUPT_DAYS) {
        setPhase("bankrupt" as any);
      }
    } else {
      negativeDays.current = 0;
      if (net > 0) profitableStreak.current += 1;
      else profitableStreak.current = 0;

      let repGain = 0;
      if (
        profitableStreak.current > 0 &&
        profitableStreak.current % REP_STREAK_DAYS === 0
      ) {
        repGain += 1;
      }
      const highTrustHubs = hubs.filter((hub) => hub.trust >= 50).length;
      repGain += Math.min(5, highTrustHubs * 0.5);
      if (repGain > 0) {
        updateAirline({
          reputation:
            Math.round(((airline.reputation ?? 0) + repGain) * 10) / 10,
        });
      }

      if (cashAfter < CASH_WARNING_THRESHOLD) {
        emitWarningToast({
          id: `warn-low-${airline.day}`,
          level: "low",
          cash: cashAfter,
          message:
            "Cash running low. Clear more waiting travelers to boost rewards.",
        });
      }
    }

    const oldScore = prevDemandScore.current;
    const newScore = airline.demand_score ?? 0;
    if (newScore > oldScore) {
      planes.forEach((plane) => {
        const gate = plane.unlock_demands;
        if (gate > 0 && oldScore < gate && newScore >= gate) {
          if (plane.unlock_cash <= airline.cash * 5) {
            emitUnlockToast({
              id: `unlock-${plane.id}-day-${airline.day}`,
              nickname: plane.nickname,
              family: plane.family,
              price: plane.price,
            });
          }
        }
      });
    }
    prevDemandScore.current = newScore;

    // Spawn new demand before reset, while served statuses are still visible.
    hubs.forEach((hub) => {
      if (allDemandsServed(hub.airport.iata, demands)) {
        spawnDemand(hub.airport.iata);
      }
    });

    aiPressure.demandUpdates.forEach((update) => {
      updateDemand(update.demandId, { base_pax_day: update.base_pax_day });
    });

    // ── Demand waves ─────────────────────────────────────────────
    // Clear previous wave first (it only lasts one day)
    setActiveDemandWave(null);

    if (isDemandWaveDay(airline.day)) {
      const {
        demands: latestDemands,
        hubs: latestHubsForWave,
        airline: latestAirline,
      } = useGameStore.getState();
      const gameSeed = latestAirline?.seed ?? "DEFAULT";

      const wave = applyDemandWave({
        day: airline.day,
        gameSeed,
        demands: latestDemands,
        hubs: latestHubsForWave,
      });

      if (wave) {
        // Apply pax_day boosts to store + set active wave for UI
        applyWaveToStore(wave);

        // Notify player
        try {
          const Notifications = require("expo-notifications");
          Notifications.scheduleNotificationAsync({
            content: {
              title: `${wave.wave.title}!`,
              body: `${wave.wave.desc} ${wave.wave.effect}.`,
              data: { type: "demand_wave", waveKind: wave.wave.kind },
            },
            trigger: null,
          }).catch(() => {});
        } catch {}
      }
    }

    // ── Global contracts ─────────────────────────────────────
    {
      const {
        globalContract,
        completedGlobalContracts,
        airline: latestAirline,
        hubs: latestHubs,
      } = useGameStore.getState();

      const gameSeed = latestAirline?.seed ?? "DEFAULT";
      const day = latestAirline?.day ?? 1;

      // Start a new contract if conditions met
      if (!globalContract && shouldStartGlobalContracts(day)) {
        const contract = createGlobalContract({
          day,
          seed: gameSeed,
          completedContracts: completedGlobalContracts,
        });
        setGlobalContract(contract);
      }

      // Advance active contract
      if (globalContract?.status === "active") {
        const crisisCount = crisisHubs;

        const updated = applyGlobalContractDay(globalContract, {
          day,
          movedPax: totalPaxToday,
          clearedSlots: activeRouteCount,
          net: totalRev - interest,
          crisisHubs: crisisCount,
          rivalCapturedPax: aiPressure.totalStolenPax,
        });

        if (updated.status === "completed") {
          updateGlobalContract(updated);
          completeGlobalContract();
          emitWarningToast({
            id: `contract-done-${airline.day}`,
            level: "low",
            cash: useGameStore.getState().airline?.cash ?? 0,
            message: `Contract Complete — ${updated.title}. Reward: +$${(updated.rewardCash ?? 0).toLocaleString()}`,
          });
          if (updated.rewardCash) earnCash(updated.rewardCash);
        } else if (updated.status === "failed") {
          updateGlobalContract(updated);
        } else {
          updateGlobalContract(updated);
        }
      }
    }

    // Submit net worth to Play Games leaderboard daily
    {
      const { airline: a } = useGameStore.getState();
      if (a) submitNetWorth(Math.max(0, a.cash - a.loan));
    }

    resetDailyPax();
    saveDay();
  }, [airline?.day]);
}
