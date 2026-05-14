/**
 * components/ui/MissionsPill.tsx
 *
 * Worldwide Rush-style mission pill.
 *
 * Positioned below the taller 2-row TopHUD.
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

const FLOAT_GAP = Spacing.sm;
const PILL_HEIGHT = 36;

function computeLiveComplete(
  mission: Mission,
  ctx: {
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
      if (t.originIata && t.destIata) {
        return ctx.routes.some(
          (r) =>
            r.active &&
            r.demand.origin.iata === t.originIata &&
            r.demand.dest.iata === t.destIata,
        );
      }
      return ctx.routes.some((r) => r.active && r.demand.haul === t.haul);

    case "pax_carry": {
      const moved = ctx.demands.reduce(
        (sum, d) => sum + (d.delivered_pax_today ?? 0),
        0,
      );
      return moved >= (t.paxTarget ?? 0);
    }

    case "revenue_earn": {
      const earned = ctx.ledger
        .filter(
          (e) =>
            e.day === ctx.day &&
            e.type === "revenue" &&
            !e.label?.startsWith("Mission:"),
        )
        .reduce((sum, e) => sum + e.amount, 0);

      return earned >= (t.revenueTarget ?? 0);
    }

    case "trust_grow": {
      const hub = ctx.hubs.find((h) => h.airport.iata === t.hubIata);
      return hub ? hub.trust >= (t.trustTarget ?? 0) : false;
    }

    case "loan_repay":
      return ctx.loan <= 0;

    case "fill_rate":
      return ctx.demands.some((d) => {
        if (d.base_pax_day <= 0) return false;
        return (
          ((d.delivered_pax_today ?? 0) / d.base_pax_day) * 100 >=
          (t.fillTarget ?? 0)
        );
      });

    case "plane_buy":
      return ctx.boughtPlane;

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
    return missions.filter((mission) =>
      computeLiveComplete(mission, {
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
  const allDone = liveCount >= total;
  const accent = allDone ? "#22c55e" : color;

  return (
    <TouchableOpacity
      style={[
        s.pill,
        {
          top: hudH + FLOAT_GAP,
          borderColor: accent + "55",
          backgroundColor: allDone ? "#22c55e18" : "rgba(8,15,30,0.94)",
        },
      ]}
      onPress={() => openSheet("missions")}
      activeOpacity={0.88}
    >
      <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
        <Ionicons
          name={allDone ? "checkmark-circle" : "flash-outline"}
          size={13}
          color={accent}
        />
      </View>

      <View style={s.body}>
        <Text style={[s.label, { color: accent }]} numberOfLines={1}>
          {allDone ? "All done!" : "Missions"}
        </Text>
        <Text style={s.sub}>
          {liveCount}/{total} complete
        </Text>
      </View>

      <View style={s.dotsRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              {
                backgroundColor: i < liveCount ? accent : accent + "30",
              },
            ]}
          />
        ))}
      </View>
    </TouchableOpacity>
  );
}

export const MISSIONS_PILL_HEIGHT = PILL_HEIGHT;
export const MISSIONS_PILL_GAP = FLOAT_GAP;

const s = StyleSheet.create({
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 30,
    minHeight: PILL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: Spacing.sm + 3,
    paddingVertical: (Spacing.xs ?? 4) + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    maxWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 7,
    elevation: 7,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    gap: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 13,
  },
  sub: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
    lineHeight: 10,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
    flexShrink: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
});
