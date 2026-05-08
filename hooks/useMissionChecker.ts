/**
 * hooks/useMissionChecker.ts
 *
 * Runs every day tick:
 *   1. Checks if missions from today are complete — awards reward
 *   2. Generates 3 fresh missions for the new day
 *
 * Tracks yesterday's pax + revenue via refs so mission targets
 * are always achievable (based on proven performance).
 */

import { emitMissionToast } from "@/hooks/useToast";
import { hubCrowdingLevel } from "@/lib/demands";
import {
  checkMissionComplete,
  generateDailyMissions,
  type MissionContext,
  type MissionProgress,
} from "@/lib/missions";
import { useBoughtPlaneToday, useDailyMissions, useGameStore } from "@/store";
import { useEffect, useRef } from "react";

export function useMissionChecker() {
  const lastDay = useRef<number>(-1);
  const loanRepaidRef = useRef<number>(0);
  const prevLoanRef = useRef<number>(-1);
  const startDayLoanRef = useRef<number>(-1); // loan at start of this day
  const prevPaxRef = useRef<number>(0); // yesterday's total pax
  const prevRevRef = useRef<number>(0); // yesterday's total revenue

  const airline = useGameStore((s) => s.airline);
  const boughtPlaneToday = useBoughtPlaneToday();
  const routes = useGameStore((s) => s.routes);
  const hubs = useGameStore((s) => s.hubs);
  const demands = useGameStore((s) => s.demands);
  const ledger = useGameStore((s) => s.ledger);
  const missions = useDailyMissions();

  // boughtPlaneToday tracked in store — set by useBuyPlane, reset at day tick

  // Track loan repayment — accumulate within the day
  // Fires whenever loan changes (repayment or new loan)
  useEffect(() => {
    if (!airline) return;
    if (prevLoanRef.current < 0) {
      // First render — just record current loan, don't credit anything
      prevLoanRef.current = airline.loan;
      return;
    }
    const diff = prevLoanRef.current - airline.loan;
    if (diff > 0) {
      // Loan decreased — player repaid
      loanRepaidRef.current += diff;
    }
    prevLoanRef.current = airline.loan;
  }, [airline?.loan]);

  useEffect(() => {
    if (!airline) return;
    if (airline.day === lastDay.current) return;
    lastDay.current = airline.day;

    const activeRoutes = routes.filter((r) => r.active);
    const pendingDemands = demands.filter((d) => d.status === "pending");

    // Compute total pax + revenue for today before reset
    const totalPaxToday = demands.reduce(
      (s, d) => s + (d.delivered_pax_today ?? 0),
      0,
    );
    const totalRevToday = ledger
      .filter((e) => e.day === airline.day - 1 && e.type === "revenue")
      .reduce((s, e) => s + e.amount, 0);

    // Crowding check
    let anyOvercrowded = false;
    let overcrowdedHub: string | null = null;
    hubs.forEach((hub) => {
      const c = hubCrowdingLevel(hub.airport.iata, demands, hub.airport);
      if (c.level === "overcrowded" || c.level === "crisis") {
        anyOvercrowded = true;
        overcrowdedHub = hub.airport.iata;
      }
    });

    const lowestTrust =
      hubs.length > 0 ? Math.min(...hubs.map((h) => h.trust)) : 0;

    // ── Check yesterday's missions ──────────────────────────────
    if (missions.length > 0) {
      const { completeMission, earnCash, addLedgerEntries } =
        useGameStore.getState();

      const prog: MissionProgress = {
        totalPaxToday,
        totalRevToday,
        loan: airline.loan,
        hubs,
        routes: activeRoutes,
        demands: demands.map((d) => ({
          id: d.id,
          hub_iata: d.hub_iata,
          origin: d.origin,
          dest: d.dest,
          haul: d.haul,
          delivered_pax_today: d.delivered_pax_today ?? 0,
          base_pax_day: d.base_pax_day,
        })),
        loanRepaidToday: loanRepaidRef.current,
        anyOvercrowded,
        overcrowdedHub: overcrowdedHub ?? undefined,
        boughtPlaneToday: boughtPlaneToday, // from store — live
      };

      missions.forEach((mission) => {
        if (mission.completed) return;
        if (!checkMissionComplete(mission, prog)) return;

        completeMission(mission.id);
        earnCash(mission.reward);
        addLedgerEntries([
          {
            id: `mission-reward-${mission.id}`,
            day: airline.day,
            type: "revenue",
            label: `Mission: ${mission.title}`,
            amount: mission.reward,
            route_id: null,
          },
        ]);
        emitMissionToast({
          id: `toast-mission-${mission.id}`,
          missionId: mission.id,
          title: mission.title,
          reward: mission.reward,
          icon: "checkmark-circle",
        });
      });
    }

    // ── Generate fresh missions for new day ─────────────────────
    const ctx: MissionContext = {
      day: airline.day,
      cash: airline.cash,
      loan: airline.loan,
      activeRoutes: activeRoutes.length,
      totalPaxToday: prevPaxRef.current, // yesterday's proven pax
      dailyRevenue: prevRevRef.current, // yesterday's proven revenue
      hubs,
      demands: demands.map((d) => ({
        hub_iata: d.hub_iata,
        origin: d.origin,
        dest: d.dest,
        haul: d.haul,
        status: d.status,
        base_pax_day: d.base_pax_day,
      })),
      pendingDemands: pendingDemands.map((d) => ({
        hub_iata: d.hub_iata,
        origin: d.origin,
        dest: d.dest,
        haul: d.haul,
        base_pax_day: d.base_pax_day,
      })),
      lowestTrust,
      anyOvercrowded,
      overcrowdedHub,
    };

    useGameStore.getState().setDailyMissions(generateDailyMissions(ctx));

    // Store today's pax + revenue as "yesterday" for next day's targets
    prevPaxRef.current = totalPaxToday;
    prevRevRef.current = totalRevToday;

    // Reset daily counters
    loanRepaidRef.current = 0;
    startDayLoanRef.current = airline.loan;
    useGameStore.getState().setBoughtPlaneToday(false); // reset for new day
  }, [airline?.day]);
}
