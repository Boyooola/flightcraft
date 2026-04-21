/**
 * hooks/useRevenueTick.ts
 *
 * Fires once per game-day (driven by useGameClock).
 * Calculates revenue for every active route, deducts interest,
 * and writes both to the store.
 *
 * Usage in GameScreen:
 *   useGameClock();      // drives day advancement
 *   useRevenueTick();    // reacts to day changes, updates cash
 */

import { calcRouteDailyRevenue, dailyInterest } from "@/lib/revenue";
import { useGameStore } from "@/store";
import type { LedgerEntry } from "@/types";
import { useEffect, useRef } from "react";

export function useRevenueTick() {
  const lastDay = useRef<number>(-1);

  const airline = useGameStore((s) => s.airline);
  const routes = useGameStore((s) => s.routes);
  const hubs = useGameStore((s) => s.hubs);
  const phase = useGameStore((s) => s.phase);
  const { earnCash, accrueInterest, addLedgerEntries } =
    useGameStore.getState();

  useEffect(() => {
    if (!airline || phase !== "playing") return;
    if (airline.day === lastDay.current) return;
    lastDay.current = airline.day;

    const entries: LedgerEntry[] = [];
    let totalRev = 0;

    // ── Route revenue ──────────────────────────────────────────
    routes.forEach((route) => {
      const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
      if (!hub) return;

      const rev = calcRouteDailyRevenue(
        route,
        hub,
        airline.day,
        airline.difficulty !== "easy",
      );
      totalRev += rev;

      entries.push({
        id: `rev-${route.id}-${airline.day}`,
        day: airline.day,
        type: "revenue",
        label: `${route.demand.origin.iata} → ${route.demand.dest.iata}`,
        amount: rev,
        route_id: route.id,
      });
    });

    // ── Interest ───────────────────────────────────────────────
    const interest = dailyInterest(airline.loan, airline.speed ?? 5);
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

    // ── Apply ──────────────────────────────────────────────────
    if (totalRev > 0) earnCash(totalRev);
    if (interest > 0) accrueInterest(interest);
    if (entries.length) addLedgerEntries(entries);
  }, [airline?.day]);
}
