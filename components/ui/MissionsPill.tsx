/**
 * One-tap access to the daily dispatch board with live mission readiness.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useHudHeight } from "@/hooks/useSheetLayout";
import type { Mission } from "@/lib/missions";
import type { Demand, OwnedHub, Route } from "@/store";
import {
  useActiveSheet,
  useBoughtPlaneToday,
  useDailyMissions,
  useDemands,
  useGameStore,
  useHubs,
  useRouteCreationActive,
  useRouteEarnings,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const FLOAT_GAP = Spacing.sm;
const PILL_HEIGHT = 44;

interface LiveMissionContext {
  demands: Demand[];
  routes: Route[];
  hubs: OwnedHub[];
  loan: number;
  routeEarnings: Record<string, number>;
  boughtPlane: boolean;
}

function isMissionReady(mission: Mission, context: LiveMissionContext) {
  if (mission.completed) return true;

  const target = mission.target;

  switch (mission.type) {
    case "route_create":
      if (target.originIata && target.destIata) {
        return context.routes.some(
          (route) =>
            route.active &&
            route.demand.origin.iata === target.originIata &&
            route.demand.dest.iata === target.destIata,
        );
      }
      return context.routes.some(
        (route) => route.active && route.demand.haul === target.haul,
      );

    case "pax_carry": {
      const moved = context.demands.reduce(
        (total, demand) => total + (demand.delivered_pax_today ?? 0),
        0,
      );
      return moved >= (target.paxTarget ?? 0);
    }

    case "revenue_earn": {
      const earned = Object.values(context.routeEarnings).reduce(
        (total, amount) => total + amount,
        0,
      );
      return earned >= (target.revenueTarget ?? 0);
    }

    case "trust_grow": {
      const hub = context.hubs.find(
        (item) => item.airport.iata === target.hubIata,
      );
      return (hub?.trust ?? 0) >= (target.trustTarget ?? 0);
    }

    case "loan_repay":
      return context.loan <= 0;

    case "fill_rate":
      return context.demands.some((demand) => {
        if (demand.base_pax_day <= 0) return false;
        const fill =
          ((demand.delivered_pax_today ?? 0) / demand.base_pax_day) * 100;
        return fill >= (target.fillTarget ?? 0);
      });

    case "plane_buy":
      return context.boughtPlane;

    // These two missions are intentionally judged when the day closes.
    case "clear_crowding":
    case "no_crowding":
      return false;

    default:
      return false;
  }
}

export default function MissionsPill() {
  const missions = useDailyMissions();
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const routeEarnings = useRouteEarnings();
  const boughtPlane = useBoughtPlaneToday();
  const isCreating = useRouteCreationActive();
  const activeSheet = useActiveSheet();
  const loan = useGameStore((state) => state.airline?.loan ?? 0);
  const openSheet = useGameStore((state) => state.openSheet);
  const hudHeight = useHudHeight();
  const haptics = useHaptics();

  const readyCount = useMemo(
    () =>
      missions.filter((mission) =>
        isMissionReady(mission, {
          demands,
          routes,
          hubs,
          loan,
          routeEarnings,
          boughtPlane,
        }),
      ).length,
    [boughtPlane, demands, hubs, loan, missions, routeEarnings, routes],
  );

  if (activeSheet || isCreating || missions.length === 0) return null;

  const total = missions.length;
  const allReady = readyCount >= total;
  const accent = allReady ? Colors.green : Colors.sky;
  const progress = `${Math.round((readyCount / total) * 100)}%` as const;

  const openMissions = () => {
    haptics.tap();
    openSheet("missions");
  };

  return (
    <TouchableOpacity
      accessibilityHint="Opens the daily mission dispatch board"
      accessibilityLabel={`Daily missions. ${readyCount} of ${total} ready.`}
      accessibilityRole="button"
      activeOpacity={0.78}
      onPress={openMissions}
      style={[styles.pill, { top: hudHeight + FLOAT_GAP }]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: allReady ? Palette.greenSoft : Palette.blueSoft },
        ]}
      >
        <Ionicons
          name={allReady ? "checkmark" : "flag-outline"}
          size={18}
          color={accent}
        />
      </View>

      <View style={styles.body}>
        <Text style={[styles.kicker, { color: accent }]}>DAILY MISSIONS</Text>
        <Text style={styles.title} numberOfLines={1}>
          {allReady ? "Ready to settle" : `${readyCount}/${total} ready`}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: progress, backgroundColor: accent },
            ]}
          />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={17} color={Colors.muted} />
    </TouchableOpacity>
  );
}

export const MISSIONS_PILL_HEIGHT = PILL_HEIGHT;
export const MISSIONS_PILL_GAP = FLOAT_GAP;

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 30,
    minWidth: 174,
    maxWidth: 220,
    minHeight: Math.max(PILL_HEIGHT, MIN_TOUCH),
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  icon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  title: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: Typography.weight.bold,
  },
  progressTrack: {
    height: 3,
    marginTop: Spacing.xs,
    overflow: "hidden",
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
});
