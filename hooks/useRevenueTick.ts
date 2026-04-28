/**
 * hooks/useRevenueTick.ts
 *
 * Fires once per game-day:
 *   1. Reset delivered_pax_today on all demands
 *   2. Run passenger simulation for every active route
 *   3. Track pax delivered per demand
 *   4. Calculate revenue from pax carried
 *   5. Apply trust growth, interest, reputation
 *   6. Emit toasts, check warnings, persist
 */

import {
  useSaveAirlineDay,
  useSpawnDailyDemand,
} from "@/hooks/useSupabaseWrite";
import {
  emitDaySummaryToast,
  emitUnlockToast,
  emitWarningToast,
} from "@/hooks/useToast";
import { allDemandsServed, hubCrowdingLevel } from "@/lib/demands";
import { calcRouteRevenue, dailyInterest } from "@/lib/revenue";
import type { LedgerEntry } from "@/store";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

const TRUST_PER_ROUTE_DAY = 0.5;
const TRUST_MAX = 100;
const CASH_WARNING_THRESHOLD = 200_000;
const BANKRUPT_DAYS = 3;
const REP_STREAK_DAYS = 10;

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

    if (prevDemandScore.current === -1) {
      prevDemandScore.current = airline.demand_score ?? 0;
    }

    const {
      earnCash,
      accrueInterest,
      addLedgerEntries,
      updateHub,
      setPhase,
      updateAirline,
      resetDailyPax,
    } = useGameStore.getState();

    const entries: LedgerEntry[] = [];
    let totalRev = 0;
    let totalPaxToday = 0;
    let activeRouteCount = 0;

    // ── 1. Overcrowding — computed from YESTERDAY's delivered_pax_today
    //    Must happen BEFORE resetDailyPax so we evaluate actual performance
    const crowdingByHub = new Map<
      string,
      ReturnType<typeof hubCrowdingLevel>
    >();
    hubs.forEach((hub) => {
      crowdingByHub.set(
        hub.airport.iata,
        hubCrowdingLevel(hub.airport.iata, demands, hub.airport),
      );
    });

    // ── 2. Snapshot pax BEFORE reset — then reset ───────────────
    // resetDailyPax() zeroes delivered_pax_today. We must capture
    // the values first or the route loop reads 0 for everything.
    const paxSnapshot = new Map<string, number>();
    demands.forEach((d) => {
      paxSnapshot.set(d.id, d.delivered_pax_today ?? 0);
    });
    resetDailyPax();

    // ── 3. Trust — adjusted by overcrowding level ────────────────
    const routesByHub = new Map<string, number>();
    routes.forEach((r) => {
      if (!r.active) return;
      routesByHub.set(r.hub_iata, (routesByHub.get(r.hub_iata) ?? 0) + 1);
    });

    hubs.forEach((hub) => {
      const n = routesByHub.get(hub.airport.iata) ?? 0;
      const crowding = crowdingByHub.get(hub.airport.iata);

      if (!crowding) return;

      let newTrust = hub.trust;

      if (crowding.level === "normal" || crowding.level === "busy") {
        // Normal: trust grows proportional to routes × avg fill performance
        // Busy: trust growth pauses
        if (crowding.level === "normal" && n > 0) {
          const hubRoutes = routes.filter(
            (r) => r.active && r.hub_iata === hub.airport.iata,
          );
          const avgFill =
            hubRoutes.reduce((sum, r) => {
              const d = demands.find((d) => d.id === r.demand.id);
              const fill =
                d && d.pax_day > 0
                  ? (paxSnapshot.get(d.id) ?? 0) / d.pax_day
                  : 0;
              return sum + fill;
            }, 0) / Math.max(1, hubRoutes.length);
          // Gain scales with fill: empty planes = minimal trust growth
          const gain = TRUST_PER_ROUTE_DAY * n * Math.max(0.1, avgFill);
          newTrust = Math.min(TRUST_MAX, hub.trust + gain);
        }
      } else if (crowding.level === "overcrowded") {
        // Passengers frustrated — trust slowly decays
        newTrust = Math.max(0, hub.trust - 0.3);
      } else if (crowding.level === "crisis") {
        // Crisis — trust decays faster
        newTrust = Math.max(0, hub.trust - 0.8);
      }

      if (newTrust !== hub.trust) updateHub(hub.id, { trust: newTrust });
    });

    // ── 3. Passenger simulation per route ────────────────────────
    // Daily event multiplier — applies to all routes this day
    const eventMultiplier =
      useGameStore.getState().dailyEvent?.revenueMultiplier ?? 1.0;

    routes.forEach((route) => {
      if (!route.active) return;
      const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
      if (!hub) return;

      // Revenue = actual pax delivered today × yield per pax
      // Use paxSnapshot — captured before resetDailyPax() zeroed the counters
      const demand = route.demand;
      const deliveredPax = paxSnapshot.get(demand.id) ?? 0;
      const routeCrowding = crowdingByHub.get(route.hub_iata);
      const crowdMultiplier =
        routeCrowding?.level === "crisis"
          ? 0.8
          : routeCrowding?.level === "overcrowded"
            ? 0.9
            : 1.0;
      const revMultiplier = crowdMultiplier * eventMultiplier;
      const routeDist = route.total_dist_nm ?? demand.dist_nm;
      const plane = route.plane.plane_model;
      const res = calcRouteRevenue({
        distNm: routeDist,
        speedKts: plane.speed_kts,
        trustPct: hub.trust,
        deliveredPax,
        paxDay: demand.pax_day,
        costPerSector: plane.cost_per_sector ?? 500,
        fuelPerNm: plane.fuel_per_nm ?? 2.0,
        crowdMultiplier: revMultiplier,
      });
      const finalRevenue = res.net;
      totalRev += finalRevenue;
      totalPaxToday += deliveredPax; // from paxSnapshot, not zeroed demand
      activeRouteCount++;

      const via = route.via_iata ? ` → ${route.via_iata}` : "";
      entries.push({
        id: `rev-${route.id}-${airline.day}`,
        day: airline.day,
        type: "revenue",
        label: `${route.demand.origin.iata}${via} → ${route.demand.dest.iata} · ${deliveredPax} pax`,
        amount: finalRevenue, // net after operating costs
        route_id: route.id,
      });
    });

    // ── 4. Loan interest ─────────────────────────────────────────
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
        label: "Loan interest",
        amount: -interest,
        route_id: null,
      });
    }

    // ── 5. Apply to store ────────────────────────────────────────
    const net = totalRev - interest;
    // Revenue already credited live in RouteLayer per arrival
    // Day tick only handles interest and ledger
    if (interest > 0) accrueInterest(interest);
    if (entries.length) addLedgerEntries(entries);

    // ── 6. Day summary card ───────────────────────────────────────
    const {
      dailyMissions,
      missionsCompleted,
      airline: latestAirline,
    } = useGameStore.getState();
    const doneToday = dailyMissions.filter((m) => m.completed).length;
    const currentCash = latestAirline?.cash ?? airline.cash;
    const currentLoan = latestAirline?.loan ?? airline.loan;
    const netWorth = Math.max(0, currentCash - currentLoan);
    const prevNetWorth = Math.max(0, airline.cash - airline.loan);

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
    });

    // ── 7. Overcrowding toasts ───────────────────────────────────
    crowdingByHub.forEach((crowding, hubIata) => {
      if (crowding.level === "normal") return;
      const hub = hubs.find((h) => h.airport.iata === hubIata);
      const name = hub?.airport.iata ?? hubIata;
      if (crowding.level === "busy") {
        emitWarningToast({
          id: `crowd-busy-${hubIata}-${airline.day}`,
          level: "low",
          cash: airline.cash,
          message: `${name} is getting busy — ${crowding.waitingPax.toLocaleString()} passengers waiting. Open more routes to keep up.`,
        });
      } else if (crowding.level === "overcrowded") {
        emitWarningToast({
          id: `crowd-over-${hubIata}-${airline.day}`,
          level: "critical",
          cash: airline.cash,
          message: `${name} is overcrowded — ${crowding.waitingPax.toLocaleString()} passengers stranded. Trust declining. Revenue −10%.`,
        });
      } else if (crowding.level === "crisis") {
        emitWarningToast({
          id: `crowd-crisis-${hubIata}-${airline.day}`,
          level: "critical",
          cash: airline.cash,
          message: `Crisis at ${name} — ${crowding.waitingPax.toLocaleString()} passengers leaving for rival airlines. Trust −0.8/day. Revenue −20%.`,
        });
      }
    });

    // ── 8. Cash warnings & bankruptcy ───────────────────────────
    const cashAfter = airline.cash + net;
    if (cashAfter < 0) {
      negativeDays.current += 1;
      if (negativeDays.current >= BANKRUPT_DAYS) {
        setPhase("bankrupt" as any);
      }
      // No toast for negative cash — bankruptcy overlay handles this
    } else {
      negativeDays.current = 0;
      profitableStreak.current += 1;

      // Reputation growth
      let repGain = 0;
      if (profitableStreak.current % REP_STREAK_DAYS === 0) repGain += 1;
      const highTrustHubs = hubs.filter((h) => h.trust >= 50).length;
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
          message: "Cash running low. Assign more planes to grow revenue.",
        });
      }
    }

    // ── 9. Plane unlock detection ────────────────────────────────
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

    // ── 10. Persist & spawn ───────────────────────────────────────
    saveDay();
    hubs.forEach((hub) => {
      if (allDemandsServed(hub.airport.iata, demands)) {
        spawnDemand(hub.airport.iata);
      }
    });
  }, [airline?.day]);
}
