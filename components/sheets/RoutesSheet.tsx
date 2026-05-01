import { useTabBarHeight } from "@/hooks/useSheetLayout";
/**
 * components/sheets/RoutesSheet.tsx
 *
 * Route flow dashboard — prioritized active routes with live passenger flow.
 *
 * Focus:
 *   - active routes sorted by live passenger-flow priority
 *   - waiting / can board / moved visible at a glance
 *   - stalled and jammed routes rise to the top
 *   - cleared routes sink to the bottom
 *   - long-press removes a route and frees the plane
 */

import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import {
  demandFlowStatus,
  remainingPax,
  waitingPaxForDemand,
} from "@/lib/passengerFlow";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import type { Demand, OwnedHub, Route } from "@/store";
import {
  useAirline,
  useDayProgress,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function useTickerAnim(value: number) {
  const anim = useRef(new Animated.Value(1)).current;
  const prevVal = useRef(value);

  useEffect(() => {
    if (value > prevVal.current) {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1.18,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }

    prevVal.current = value;
  }, [anim, value]);

  return anim;
}

type RouteFlowStatus = {
  label: "CLEARED" | "JAMMED" | "STALLED" | "BOARDING" | "MOVING" | "WAITING";
  color: string;
  priority: number;
  hint: string;
};

function getLiveDemand(route: Route, liveDemands: Demand[]) {
  return liveDemands.find((d) => d.id === route.demand.id) ?? route.demand;
}

function routeFlowInfo(
  route: Route,
  liveDemands: Demand[],
  dayProgress: number,
) {
  const demand = getLiveDemand(route, liveDemands);
  const deliveredPax = demand.delivered_pax_today ?? 0;
  const targetPax = demand.pax_day ?? 0;
  const waitingPax = waitingPaxForDemand(demand, dayProgress);
  const leftToMove = remainingPax(demand);
  const planeCapacity = route.plane.plane_model.pax_capacity;
  const canBoardNow = Math.min(waitingPax, planeCapacity);

  const movedPct =
    targetPax > 0
      ? Math.min(100, Math.round((deliveredPax / targetPax) * 100))
      : 0;

  const flowStatus = demandFlowStatus(demand, dayProgress);

  let status: RouteFlowStatus;

  if (
    flowStatus === "cleared" ||
    demand.status === "served" ||
    leftToMove <= 0
  ) {
    status = {
      label: "CLEARED",
      color: Colors.green,
      priority: 6,
      hint: "Demand slot cleared",
    };
  } else if (flowStatus === "jammed") {
    status = {
      label: "JAMMED",
      color: Colors.red,
      priority: 0,
      hint: "Queue is growing fast",
    };
  } else if (waitingPax > 0 && deliveredPax <= 0) {
    status = {
      label: "STALLED",
      color: Colors.red,
      priority: 1,
      hint: "Passengers are waiting",
    };
  } else if (canBoardNow > 0) {
    status = {
      label: "BOARDING",
      color: Colors.amber,
      priority: 2,
      hint: "Ready to board more pax",
    };
  } else if (deliveredPax > 0) {
    status = {
      label: "MOVING",
      color: Colors.green,
      priority: 3,
      hint: "Flow is moving",
    };
  } else {
    status = {
      label: "WAITING",
      color: Colors.sky,
      priority: 4,
      hint: "Demand is spawning",
    };
  }

  return {
    demand,
    deliveredPax,
    targetPax,
    waitingPax,
    canBoardNow,
    leftToMove,
    movedPct,
    status,
  };
}

function MetricCell({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <View style={rr.metricCell}>
      <Text
        style={[
          rr.metricVal,
          accent ? { color: accent } : { color: Colors.text },
          { fontFamily: Typography.mono },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      <Text style={rr.metricLbl}>{label}</Text>
    </View>
  );
}

function RouteRow({
  route,
  hub,
  deactivating,
  liveDemands,
  dayProgress,
  onLongPress,
}: {
  route: Route;
  hub: OwnedHub | undefined;
  deactivating: boolean;
  liveDemands: Demand[];
  dayProgress: number;
  onLongPress: (route: Route) => void;
}) {
  const distNm = route.total_dist_nm ?? route.demand.dist_nm;
  const p = route.plane.plane_model;
  const isConnecting = !!route.via_iata;

  const {
    demand,
    deliveredPax,
    targetPax,
    waitingPax,
    canBoardNow,
    leftToMove,
    movedPct,
    status,
  } = routeFlowInfo(route, liveDemands, dayProgress);

  const tickerScale = useTickerAnim(deliveredPax);

  const revenueResult = calcRouteRevenue({
    distNm,
    speedKts: p.speed_kts,
    trustPct: hub?.trust ?? 0,
    deliveredPax,
    paxDay: targetPax,
    costPerSector: p.cost_per_sector ?? 500,
    fuelPerNm: p.fuel_per_nm ?? 2,
  });

  const haulColor =
    demand.haul === "short"
      ? Colors.green
      : demand.haul === "medium"
        ? Colors.amber
        : Colors.purple;

  const isProblem = status.label === "STALLED" || status.label === "JAMMED";
  const isCleared = status.label === "CLEARED";

  const accent = status.color;
  const summaryTint = isProblem
    ? Colors.red + "22"
    : isCleared
      ? Colors.green + "14"
      : "rgba(255,255,255,.04)";

  return (
    <TouchableOpacity
      style={[
        rr.cardWrap,
        isProblem && rr.cardProblem,
        isCleared && rr.cardCleared,
        deactivating && { opacity: 0.45 },
      ]}
      onLongPress={() => onLongPress(route)}
      delayLongPress={400}
      activeOpacity={0.88}
    >
      <View style={[rr.stripe, { backgroundColor: accent }]} />

      <View style={rr.cardBody}>
        <View style={rr.topBand}>
          <View style={rr.routeLine}>
            <Text style={rr.iata}>{demand.origin.iata}</Text>
            {isConnecting && (
              <>
                <MaterialCommunityIcons
                  name="swap-horizontal"
                  size={12}
                  color={Colors.purple}
                />
                <Text style={[rr.iata, { color: Colors.purple }]}>
                  {route.via_iata}
                </Text>
              </>
            )}
            <Ionicons name="arrow-forward" size={12} color={Colors.dim} />
            <Text style={rr.iata}>{demand.dest.iata}</Text>
          </View>

          <View
            style={[
              rr.statusPill,
              {
                backgroundColor: accent + "22",
                borderColor: accent + "44",
              },
            ]}
          >
            <Text style={[rr.statusText, { color: accent }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={rr.planeRow}>
          <Ionicons name="airplane" size={12} color={Colors.muted} />
          <Text style={rr.planeName} numberOfLines={1}>
            {p.nickname}
            {isConnecting ? ` · via ${route.via_iata}` : ""}
          </Text>
          <View
            style={[
              rr.haulPill,
              {
                backgroundColor: haulColor + "18",
                borderColor: haulColor + "44",
              },
            ]}
          >
            <Text style={[rr.haulText, { color: haulColor }]}>
              {demand.haul.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={[rr.metricsRow, { backgroundColor: summaryTint }]}>
          <MetricCell
            value={waitingPax.toLocaleString()}
            label="WAIT"
            accent={waitingPax > 0 ? Colors.amber : Colors.dim}
          />
          <View style={rr.metricSep} />
          <MetricCell
            value={canBoardNow.toLocaleString()}
            label="BOARD"
            accent={
              canBoardNow > 0 ? Colors.sky : Colors.dim
            }
          />
          <View style={rr.metricSep} />
          <MetricCell value={leftToMove.toLocaleString()} label="LEFT" />
        </View>

        <View style={rr.progressBlock}>
          <View style={rr.barRow}>
            <View style={rr.barTrack}>
              <View
                style={[
                  rr.barFill,
                  {
                    width: `${movedPct}%` as `${number}%`,
                    backgroundColor: accent,
                  },
                ]}
              />
            </View>
            <Animated.Text
              style={[
                rr.barLabel,
                {
                  color: deliveredPax > 0 ? accent : Colors.dim,
                  transform: [{ scale: tickerScale }],
                  fontFamily: Typography.mono,
                },
              ]}
            >
              {movedPct}%
            </Animated.Text>
          </View>
          <Text style={rr.paxLine} numberOfLines={1}>
            {deliveredPax.toLocaleString()} / {targetPax.toLocaleString()} moved
            today
          </Text>
        </View>

        <View style={rr.footerRow}>
          <Text style={[rr.hint, { color: accent }]} numberOfLines={1}>
            {status.hint}
          </Text>
          <Text style={rr.nmTxt}>{distNm.toLocaleString()} nm</Text>
        </View>
      </View>

      <View style={[rr.sideCol, { borderLeftColor: Colors.border }]}>
        {deactivating ? (
          <ActivityIndicator size="small" color={Colors.dim} />
        ) : (
          <>
            <Text style={rr.sideLbl}>TODAY</Text>
            <Text style={[rr.sideNum, { color: accent, fontFamily: Typography.mono }]}>
              {deliveredPax.toLocaleString()}
            </Text>
            <Text style={rr.sideSub}>pax</Text>
            <View style={rr.sideRule} />
            <Text style={[rr.sideCash, { fontFamily: Typography.mono }]}>
              {fmtCash(revenueResult.net)}
            </Text>
            <Text style={rr.sideCashLbl}>net</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function RoutesSheet() {
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const liveDemands = useDemands();
  const dayProgress = useDayProgress();
  const tabBarH = useTabBarHeight();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const haptics = useHaptics();
  const deactivate = useDeactivateRoute();

  const [deactivating, setDeactivating] = useState<string | null>(null);
  const gameAlert = useGameAlert();

  const color = airline?.color ?? Colors.sky;
  const activeRoutes = routes.filter((r) => r.active);

  const routeStats = useMemo(() => {
    return activeRoutes.map((route) => {
      const info = routeFlowInfo(route, liveDemands, dayProgress);
      return { route, ...info };
    });
  }, [activeRoutes, liveDemands, dayProgress]);

  const sortedRoutes = useMemo(() => {
    return [...routeStats].sort((a, b) => {
      if (a.status.priority !== b.status.priority) {
        return a.status.priority - b.status.priority;
      }

      if (a.waitingPax !== b.waitingPax) return b.waitingPax - a.waitingPax;
      return b.leftToMove - a.leftToMove;
    });
  }, [routeStats]);

  const totalMoved = routeStats.reduce((sum, r) => sum + r.deliveredPax, 0);
  const totalTarget = routeStats.reduce((sum, r) => sum + r.targetPax, 0);
  const totalWaiting = routeStats.reduce((sum, r) => sum + r.waitingPax, 0);
  const totalCanBoard = routeStats.reduce((sum, r) => sum + r.canBoardNow, 0);
  const avgFlow =
    totalTarget > 0
      ? Math.min(100, Math.round((totalMoved / totalTarget) * 100))
      : 0;

  const stalledCount = routeStats.filter(
    (r) => r.status.label === "STALLED" || r.status.label === "JAMMED",
  ).length;
  const clearedCount = routeStats.filter(
    (r) => r.status.label === "CLEARED",
  ).length;

  const totalReward = activeRoutes.reduce((sum, route) => {
    const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
    const demand = getLiveDemand(route, liveDemands);
    const deliveredPax = demand.delivered_pax_today ?? 0;
    const p = route.plane.plane_model;
    const dist = route.total_dist_nm ?? demand.dist_nm;

    const result = calcRouteRevenue({
      distNm: dist,
      speedKts: p.speed_kts,
      trustPct: hub?.trust ?? 0,
      deliveredPax,
      paxDay: demand.pax_day,
      costPerSector: p.cost_per_sector ?? 500,
      fuelPerNm: p.fuel_per_nm ?? 2,
    });

    return sum + result.net;
  }, 0);

  const flowHighlight =
    stalledCount > 0
      ? Colors.red
      : avgFlow >= 80
        ? Colors.green
        : color;

  const summaryBorder =
    stalledCount > 0
      ? Colors.red + "55"
      : avgFlow >= 80
        ? Colors.green + "44"
        : color + "33";

  const handleLongPress = useCallback(
    (route: Route) => {
      haptics.confirm();

      const via = route.via_iata ? ` via ${route.via_iata}` : "";
      const label = `${route.demand.origin.iata}${via} → ${route.demand.dest.iata}`;
      const plane = route.plane.plane_model.nickname;

      gameAlert.show({
        icon: "git-branch-outline",
        title: "Remove Route",
        message: `Stop flying ${label} with ${plane}?\n\nThe plane becomes idle and this demand returns to pending.`,
        buttons: [
          { label: "Keep Flying", style: "cancel" },
          {
            label: "Remove Route",
            style: "destructive",
            onPress: async () => {
              setDeactivating(route.id);

              const { error } = await deactivate(route.id);

              setDeactivating(null);

              if (error) {
                gameAlert.show({
                  title: "Error",
                  message: error,
                  buttons: [{ label: "OK", style: "cancel" }],
                });
                haptics.error();
              } else {
                haptics.success();
              }
            },
          },
        ],
      });
    },
    [deactivate, gameAlert, haptics],
  );

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.handle} accessibilityRole="none" />

      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <View>
            <Text style={s.title}>Route Rush</Text>
            <Text style={s.subtitle}>Live demand · priority order</Text>
          </View>
          {activeRoutes.length > 0 && (
            <View
              style={[
                s.badge,
                {
                  backgroundColor: color + "20",
                  borderColor: color + "44",
                },
              ]}
            >
              <Text style={[s.badgeTxt, { color }]}>
                {activeRoutes.length}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => {
            haptics.tap();
            closeSheet();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {activeRoutes.length > 0 && (
        <>
          <View style={[s.rushStats, { borderColor: summaryBorder }]}>
            <View style={s.rushStat}>
              <Text style={[s.rushVal, { color: flowHighlight }]}>
                {avgFlow}%
              </Text>
              <Text style={s.rushLbl}>DAY FLOW</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text
                style={[s.rushVal, { fontFamily: Typography.mono, color: totalWaiting > 0 ? Colors.amber : Colors.text }]}
              >
                {totalWaiting.toLocaleString()}
              </Text>
              <Text style={s.rushLbl}>WAITING</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text
                style={[s.rushVal, { fontFamily: Typography.mono, color: Colors.sky }]}
              >
                {totalCanBoard.toLocaleString()}
              </Text>
              <Text style={s.rushLbl}>READY</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text
                style={[
                  s.rushVal,
                  {
                    fontFamily: Typography.mono,
                    color: Colors.green,
                  },
                ]}
              >
                {fmtCash(totalReward)}
              </Text>
              <Text style={s.rushLbl}>EARNED</Text>
            </View>
          </View>

          <View style={[s.miniBarWrap, { borderColor: summaryBorder }]}>
            <Text style={s.miniStatPair}>
              <Text style={[s.miniStatKey, { color: stalledCount > 0 ? Colors.red : Colors.green }]}>
                {stalledCount}
              </Text>
              <Text style={s.miniStatWord}> stalled</Text>
              <Text style={s.miniStatSep}> · </Text>
              <Text style={[s.miniStatKey, { color: Colors.green }]}>
                {clearedCount}
              </Text>
              <Text style={s.miniStatWord}> cleared</Text>
              <Text style={s.miniStatSep}> · </Text>
              <Text style={s.miniStatKey}>{totalMoved.toLocaleString()}</Text>
              <Text style={s.miniStatWord}> moved</Text>
            </Text>

            <View style={s.throughTrack}>
              <View
                style={[
                  s.throughFill,
                  {
                    width: `${avgFlow}%` as `${number}%`,
                    backgroundColor: flowHighlight,
                  },
                ]}
              />
            </View>
          </View>
        </>
      )}

      {stalledCount > 0 && (
        <View style={s.alertBanner}>
          <Ionicons name="warning-outline" size={16} color={Colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={s.alertTitle}>
              {stalledCount} route{stalledCount !== 1 ? "s" : ""} need attention
            </Text>
            <Text style={s.alertSub}>
              Queues are building. Add capacity, upgrade aircraft, or cut weak
              routes.
            </Text>
          </View>
        </View>
      )}

      {activeRoutes.length === 0 && (
        <View style={s.empty}>
          <MaterialCommunityIcons name="routes" size={48} color={Colors.dim} />
          <Text style={s.emptyTitle}>No active routes</Text>
          <Text style={s.emptySub}>
            Open the map, assign a hub demand to a plane, and the rush starts
            here.
          </Text>

          <TouchableOpacity
            style={[s.emptyBtn, { borderColor: color + "55" }]}
            onPress={() => {
              haptics.tap();
              closeSheet();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={15} color={color} />
            <Text style={[s.emptyBtnText, { color }]}>Open map</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeRoutes.length > 0 && (
        <>
          <Text style={s.eyebrow}>PRIORITY ROUTES</Text>
          <Text style={s.eyebrowSub}>
            Hold a card to remove a route · worst problems listed first
          </Text>

          <View style={s.section}>
            {sortedRoutes.map(({ route }) => (
              <RouteRow
                key={route.id}
                route={route}
                hub={hubs.find((h) => h.airport.iata === route.hub_iata)}
                deactivating={deactivating === route.id}
                liveDemands={liveDemands}
                dayProgress={dayProgress}
                onLongPress={handleLongPress}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 36 }} />
      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const rr = StyleSheet.create({
  cardWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.022)",
  },
  cardProblem: {
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "06",
  },
  cardCleared: {
    borderColor: Colors.green + "28",
    backgroundColor: Colors.green + "05",
  },
  stripe: {
    width: 4,
    alignSelf: "stretch",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  topBand: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  routeLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  iata: {
    fontSize: 15,
    color: Colors.sky,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  statusPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  planeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  planeName: {
    flex: 1,
    fontSize: 11,
    color: Colors.muted,
    fontWeight: "600",
    minWidth: 120,
  },
  haulPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  haulText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    gap: 2,
  },
  metricSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: "800",
    maxWidth: "100%",
  },
  metricLbl: {
    fontSize: 7,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 1,
  },
  progressBlock: {
    gap: 4,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  barTrack: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: "900",
    minWidth: 38,
    textAlign: "right",
  },
  paxLine: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  hint: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
  },
  nmTxt: {
    fontSize: 9,
    color: Colors.dim,
    fontWeight: "700",
  },
  sideCol: {
    width: 78,
    borderLeftWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.035)",
    gap: 1,
    paddingVertical: Spacing.sm,
  },
  sideLbl: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.6,
    fontWeight: "900",
  },
  sideNum: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: 1,
  },
  sideSub: {
    fontSize: 9,
    color: Colors.dim,
    marginBottom: 2,
  },
  sideRule: {
    height: StyleSheet.hairlineWidth,
    width: "70%",
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  sideCash: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.green,
    textAlign: "center",
  },
  sideCashLbl: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.12)",
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  hdrL: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: "900",
  },
  rushStats: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.025)",
  },
  rushDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    alignSelf: "stretch",
  },
  rushStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
  },
  rushVal: {
    fontSize: 15,
    fontWeight: "900",
  },
  rushLbl: {
    fontSize: 8,
    color: Colors.dim,
    marginTop: 4,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  miniBarWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: "rgba(255,255,255,.02)",
    gap: Spacing.sm,
  },
  miniStatPair: {
    fontSize: 10,
    textAlign: "center",
  },
  miniStatKey: {
    fontWeight: "900",
    color: Colors.text,
    fontFamily: Typography.mono,
  },
  miniStatWord: {
    color: Colors.dim,
    fontWeight: "600",
  },
  miniStatSep: {
    color: Colors.dim,
  },
  throughTrack: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.06)",
    overflow: "hidden",
  },
  throughFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "08",
    padding: Spacing.md,
  },
  alertTitle: {
    fontSize: 12,
    color: Colors.red,
    fontWeight: "900",
  },
  alertSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 3,
    lineHeight: 15,
    fontWeight: "500",
  },
  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 4,
    fontWeight: "900",
  },
  eyebrowSub: {
    fontSize: 10,
    color: Colors.dim,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: "900",
  },
  emptySub: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
