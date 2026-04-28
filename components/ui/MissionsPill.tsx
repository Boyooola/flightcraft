/**
 * components/ui/MissionsPill.tsx
 *
 * Persistent missions button on the map.
 * Computes live completion count from store state directly —
 * does not rely on mission.completed (which only updates at day tick).
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import type { Mission } from "@/lib/missions";
import {
  useAirline,
  useBoughtPlaneToday,
  useDailyMissions,
  useDemands,
  useGameStore,
  useHubs,
  useRouteCreationActive,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function computeLiveComplete(
  mission: Mission,
  {
    demands,
    routes,
    hubs,
    loan,
    ledger,
    day,
    boughtPlane,
  }: {
    demands: any[];
    routes: any[];
    hubs: any[];
    loan: number;
    ledger: any[];
    day: number;
    boughtPlane: boolean;
  },
): boolean {
  if (mission.completed) return true;
  const t = mission.target;

  switch (mission.type) {
    case "route_create":
      if (t.originIata && t.destIata)
        return routes.some(
          (r) =>
            r.active &&
            r.demand.origin.iata === t.originIata &&
            r.demand.dest.iata === t.destIata,
        );
      return routes.some((r) => r.active && r.demand.haul === t.haul);

    case "pax_carry": {
      const total = demands.reduce(
        (s: number, d: any) => s + (d.delivered_pax_today ?? 0),
        0,
      );
      return total >= (t.paxTarget ?? 0);
    }

    case "revenue_earn": {
      const rev = ledger
        .filter(
          (e: any) =>
            e.day === day &&
            e.type === "revenue" &&
            !e.label?.startsWith("Mission:"),
        )
        .reduce((s: number, e: any) => s + e.amount, 0);
      return rev >= (t.revenueTarget ?? 0);
    }

    case "trust_grow": {
      const hub = hubs.find((h: any) => h.airport.iata === t.hubIata);
      return hub ? hub.trust >= (t.trustTarget ?? 0) : false;
    }

    case "loan_repay":
      return loan <= 0;

    case "fill_rate":
      return demands.some((d: any) => {
        if (d.pax_day <= 0) return false;
        return (
          ((d.delivered_pax_today ?? 0) / d.pax_day) * 100 >=
          (t.fillTarget ?? 0)
        );
      });

    case "plane_buy":
      return boughtPlane || mission.completed;

    case "no_crowding":
    case "clear_crowding":
      return mission.completed;

    default:
      return false;
  }
}

export default function MissionsPill() {
  const airline = useAirline();
  const missions = useDailyMissions();
  const isCreating = useRouteCreationActive();
  const openSheet = useGameStore((s) => s.openSheet);
  const hudH = useHudHeight();
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const loan = useGameStore((s) => s.airline?.loan ?? 0);
  const boughtPlane = useBoughtPlaneToday();
  const ledger = useGameStore((s) => s.ledger);
  const day = useGameStore((s) => s.airline?.day ?? 1);

  const liveCount = useMemo(() => {
    return missions.filter((m) =>
      computeLiveComplete(m, {
        demands,
        routes,
        hubs,
        loan,
        ledger,
        day,
        boughtPlane,
      }),
    ).length;
  }, [missions, demands, routes, hubs, loan, ledger, day, boughtPlane]);

  if (isCreating || missions.length === 0) return null;

  const color = airline?.color ?? Colors.sky;
  const total = missions.length;
  const allDone = liveCount === total;
  const accent = allDone ? "#22c55e" : color;

  return (
    <TouchableOpacity
      style={[
        s.pill,
        {
          top: hudH + Spacing.sm,
          borderColor: accent + "55",
          backgroundColor: allDone ? "#22c55e18" : "rgba(8,15,30,0.92)",
        },
      ]}
      onPress={() => openSheet("missions")}
      activeOpacity={0.85}
    >
      <Ionicons name="flag-outline" size={12} color={accent} />

      <View style={s.textWrap}>
        <Text style={[s.label, { color: accent }]}>
          {allDone ? "Missions Done!" : "Missions"}
        </Text>
        {!allDone && (
          <Text style={[s.count, { color: accent }]}>
            {liveCount} of {total} complete
          </Text>
        )}
      </View>

      {allDone ? (
        <Ionicons name="checkmark-circle" size={13} color={accent} />
      ) : (
        <View style={s.dotsRow}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                { backgroundColor: i < liveCount ? accent : accent + "33" },
              ]}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  textWrap: { gap: 1 },
  label: { fontSize: 11, fontWeight: "700", lineHeight: 13 },
  count: { fontSize: 8, opacity: 0.8, lineHeight: 10 },
  dotsRow: { flexDirection: "row", gap: 3, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
