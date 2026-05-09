import { useTabBarHeight } from "@/hooks/useSheetLayout";

import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import { hubCrowdingLevel } from "@/lib/demands";
import { congestionEfficiencyMultiplier } from "@/lib/hubCongestion";
import {
  demandFlowStatus,
  remainingPax,
  waitingPaxForDemand,
} from "@/lib/passengerFlow";
import { passengerTypeBreakdown } from "@/lib/passengerTypes";
import {
  calcRouteRevenue,
  computePriceElasticity,
  fmtCash
} from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type { Demand, Route } from "@/store";
import {
  useAirline,
  useDayProgress,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type RouteFlowStatus = {
  label: "CLEARED" | "JAMMED" | "STALLED" | "BOARDING" | "MOVING" | "WAITING";
  color: string;
  priority: number;
  hint: string;
};

type PriceStrategy = "low" | "standard" | "premium";

const PRICE_OPTIONS: {
  key: PriceStrategy;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "low",
    label: "Low Fare",
    sub: "+Demand · -Fare",
    icon: "people-outline",
  },
  {
    key: "standard",
    label: "Standard",
    sub: "Balanced",
    icon: "remove-outline",
  },
  {
    key: "premium",
    label: "Premium",
    sub: "+Fare · -Demand",
    icon: "diamond-outline",
  },
];

function localPricingConfig(strategy?: PriceStrategy) {
  if (strategy === "low") {
    return {
      fareMultiplier: 0.85,
      demandMultiplier: 1.18,
      color: Colors.sky,
      label: "Low Fare",
    };
  }
  if (strategy === "premium") {
    return {
      fareMultiplier: 1.28,
      demandMultiplier: 0.82,
      color: Colors.purple,
      label: "Premium",
    };
  }
  return {
    fareMultiplier: 1,
    demandMultiplier: 1,
    color: Colors.green,
    label: "Standard",
  };
}

function getRoutePriceStrategy(route: Route): PriceStrategy {
  const value = (route as Route & { price_strategy?: PriceStrategy })
    .price_strategy;

  if (value === "low" || value === "premium") return value;
  return "standard";
}

type RouteGroup = {
  id: string;
  demand: Demand;
  routes: Route[];
  hub_iata: string;
  via_iata: string | null;
  total_dist_nm: number;
  deliveredPax: number;
  targetPax: number;
  waitingPax: number;
  canBoardNow: number;
  leftToMove: number;
  movedPct: number;
  status: RouteFlowStatus;
  totalCapacity: number;
  totalReward: number;
  planeLabel: string;
  priceStrategy: PriceStrategy;
  utilizationLabel: string;
  utilizationPct: number;
  congestionLevel: string;
  congestionMultiplier: number;
};

function getLiveDemand(route: Route, liveDemands: Demand[]) {
  return liveDemands.find((d) => d.id === route.demand.id) ?? route.demand;
}

function buildStatus(
  demand: Demand,
  waitingPax: number,
  deliveredPax: number,
  leftToMove: number,
  canBoardNow: number,
  dayProgress: number,
): RouteFlowStatus {
  const flowStatus = demandFlowStatus(demand, dayProgress);

  if (
    flowStatus === "cleared" ||
    demand.status === "served" ||
    leftToMove <= 0
  ) {
    return {
      label: "CLEARED",
      color: Colors.green,
      priority: 6,
      hint: "Demand slot cleared",
    };
  }

  if (flowStatus === "jammed") {
    return {
      label: "JAMMED",
      color: Colors.red,
      priority: 0,
      hint: "Queue is growing fast",
    };
  }

  if (waitingPax > 0 && deliveredPax <= 0) {
    return {
      label: "STALLED",
      color: Colors.red,
      priority: 1,
      hint: "Passengers are waiting",
    };
  }

  if (canBoardNow > 0) {
    return {
      label: "BOARDING",
      color: Colors.amber,
      priority: 2,
      hint: "Ready to board more pax",
    };
  }

  if (deliveredPax > 0) {
    return {
      label: "MOVING",
      color: Colors.green,
      priority: 3,
      hint: "Flow is moving",
    };
  }

  return {
    label: "WAITING",
    color: Colors.sky,
    priority: 4,
    hint: "Demand is spawning",
  };
}

function buildPlaneLabel(routes: Route[]) {
  const counts = new Map<string, number>();

  routes.forEach((route) => {
    const name = route.plane.plane_model.nickname;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(" · ");
}

function routeGrowthLabel(demand: Demand) {
  const popularity = demand.popularity ?? 0;

  if (popularity >= 30) {
    return {
      text: `+${popularity}% booming`,
      color: Colors.green,
      icon: "flame-outline" as const,
    };
  }

  if (popularity >= 10) {
    return {
      text: `+${popularity}% growing`,
      color: Colors.green,
      icon: "trending-up-outline" as const,
    };
  }

  if (popularity <= -20) {
    return {
      text: `${popularity}% declining`,
      color: Colors.red,
      icon: "trending-down-outline" as const,
    };
  }

  if (popularity <= -5) {
    return {
      text: `${popularity}% soft`,
      color: Colors.amber,
      icon: "arrow-down-outline" as const,
    };
  }

  return {
    text: "Stable demand",
    color: Colors.dim,
    icon: "remove-outline" as const,
  };
}

function RouteGroupRow({
  group,
  deactivating,
  onLongPress,
  onPriceChange,
}: {
  group: RouteGroup;
  deactivating: boolean;
  onLongPress: (group: RouteGroup) => void;
  onPriceChange: (group: RouteGroup, strategy: PriceStrategy) => void;
}) {
  const isConnecting = !!group.via_iata;
  const isProblem =
    group.status.label === "STALLED" || group.status.label === "JAMMED";
  const isCleared = group.status.label === "CLEARED";
  const accent = group.status.color;
  const growth = routeGrowthLabel(group.demand);
  const pricing = localPricingConfig(group.priceStrategy);

  return (
    <TouchableOpacity
      style={[
        rr.card,
        isProblem && rr.problem,
        isCleared && rr.cleared,
        deactivating && { opacity: 0.45 },
      ]}
      onLongPress={() => onLongPress(group)}
      delayLongPress={400}
      activeOpacity={0.88}
    >
      <View style={[rr.stripe, { backgroundColor: accent }]} />

      <View style={rr.body}>
        <View style={rr.top}>
          <View style={rr.routeLine}>
            <Text style={rr.iata}>{group.demand.origin.iata}</Text>

            {isConnecting && (
              <>
                <Ionicons
                  name="git-branch-outline"
                  size={11}
                  color={Colors.purple}
                />
                <Text style={[rr.iata, { color: Colors.purple }]}>
                  {group.via_iata}
                </Text>
              </>
            )}

            <Ionicons name="arrow-forward" size={11} color={Colors.dim} />
            <Text style={rr.iata}>{group.demand.dest.iata}</Text>
          </View>

          <View
            style={[
              rr.status,
              {
                backgroundColor: accent + "18",
                borderColor: accent + "44",
              },
            ]}
          >
            <Text style={[rr.statusTxt, { color: accent }]}>
              {group.status.label}
            </Text>
          </View>
        </View>

        <View style={rr.metaRow}>
          <Ionicons name="airplane" size={11} color={Colors.dim} />

          <Text style={rr.meta} numberOfLines={1}>
            {group.planeLabel}
          </Text>

          <Text style={rr.dot}>•</Text>

          <Text
            style={[rr.moved, { color: accent, fontFamily: Typography.mono }]}
          >
            ×{group.routes.length}
          </Text>

          <Text style={rr.dot}>•</Text>

          <Text
            style={[
              rr.moved,
              { color: Colors.text, fontFamily: Typography.mono },
            ]}
          >
            {group.deliveredPax.toLocaleString()} /{" "}
            {group.targetPax.toLocaleString()} pax
          </Text>

          {(() => {
            const mix = passengerTypeBreakdown({
              businessPct: group.demand.business_pct,
              leisurePct: group.demand.leisure_pct,
            });
            return mix.businessPct > 0 ? (
              <>
                <Text style={rr.dot}>•</Text>
                <Text
                  style={[
                    rr.paxMix,
                    {
                      color: mix.businessPct >= 35 ? Colors.amber : Colors.dim,
                    },
                  ]}
                >
                  {mix.businessPct}% biz
                </Text>
              </>
            ) : null;
          })()}
        </View>

        <View style={rr.bottom}>
          <View style={rr.progressTrack}>
            <View
              style={[
                rr.progressFill,
                {
                  width: `${group.movedPct}%` as `${number}%`,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>

          <Text style={[rr.percent, { color: accent }]}>{group.movedPct}%</Text>

          <Text
            style={[
              rr.cash,
              { color: group.totalReward >= 0 ? Colors.green : Colors.red },
            ]}
          >
            {group.totalReward >= 0 ? "+" : ""}
            {fmtCash(group.totalReward)}
          </Text>
        </View>

        <View style={rr.hintRow}>
          <Text style={rr.hint} numberOfLines={1}>
            {group.waitingPax.toLocaleString()} waiting ·{" "}
            {group.totalCapacity.toLocaleString()} seats · Util{" "}
            {group.utilizationPct}%
            {group.congestionLevel !== "normal"
              ? ` · Cong -${Math.round((1 - group.congestionMultiplier) * 100)}%`
              : ""}
          </Text>

          <View style={rr.growthWrap}>
            <Ionicons name={growth.icon} size={11} color={growth.color} />
            <Text style={[rr.growth, { color: growth.color }]}>
              {growth.text}
            </Text>
          </View>
        </View>

        <View style={[rr.pricingBox, { borderColor: pricing.color + "30" }]}>
          <View style={rr.pricingHeader}>
            <View style={rr.pricingTitleRow}>
              <Ionicons
                name="pricetag-outline"
                size={11}
                color={pricing.color}
              />
              <Text style={[rr.pricingTitle, { color: pricing.color }]}>
                Pricing
              </Text>
            </View>
            <Text style={rr.pricingEffect}>
              {group.priceStrategy === "low"
                ? "+18% demand, -15% fare"
                : group.priceStrategy === "premium"
                  ? "-18% demand, +28% fare"
                  : "Balanced demand and fare"}
            </Text>
          </View>

          <View style={rr.priceButtons}>
            {PRICE_OPTIONS.map((option) => {
              const active = option.key === group.priceStrategy;
              const optionConfig = localPricingConfig(option.key);

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    rr.priceBtn,
                    active && {
                      borderColor: optionConfig.color + "66",
                      backgroundColor: optionConfig.color + "12",
                    },
                  ]}
                  onPress={() => onPriceChange(group, option.key)}
                  disabled={deactivating || active}
                  activeOpacity={0.82}
                >
                  <Ionicons
                    name={option.icon}
                    size={12}
                    color={active ? optionConfig.color : Colors.dim}
                  />
                  <Text
                    style={[
                      rr.priceBtnTitle,
                      { color: active ? optionConfig.color : Colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text style={rr.priceBtnSub} numberOfLines={1}>
                    {option.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {deactivating && (
        <View style={rr.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.dim} />
        </View>
      )}
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
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const haptics = useHaptics();
  const deactivate = useDeactivateRoute();

  const [deactivating, setDeactivating] = useState<string | null>(null);
  const gameAlert = useGameAlert();

  const color = airline?.color ?? Colors.sky;
  const activeRoutes = routes.filter((r) => r.active);

  const groupedRoutes = useMemo<RouteGroup[]>(() => {
    const map = new Map<string, Route[]>();

    activeRoutes.forEach((route) => {
      const key = route.demand.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(route);
    });

    return Array.from(map.entries()).map(([demandId, groupRoutes]) => {
      const first = groupRoutes[0];
      const demand = getLiveDemand(first, liveDemands);
      const deliveredPax = demand.delivered_pax_today ?? 0;
      const targetPax = demand.base_pax_day ?? 0;
      const waitingPax = waitingPaxForDemand(demand, dayProgress);
      const leftToMove = remainingPax(demand);
      const totalCapacity = groupRoutes.reduce(
        (sum, route) => sum + route.plane.plane_model.pax_capacity,
        0,
      );
      const canBoardNow = Math.min(waitingPax, totalCapacity);
      const movedPct =
        targetPax > 0
          ? Math.min(100, Math.round((deliveredPax / targetPax) * 100))
          : 0;

      const status = buildStatus(
        demand,
        waitingPax,
        deliveredPax,
        leftToMove,
        canBoardNow,
        dayProgress,
      );

      const hub = hubs.find((h) => h.airport.iata === first.hub_iata);

      const priceStrategy = getRoutePriceStrategy(first);
      const dist = first.total_dist_nm ?? demand.dist_nm;

      // Congestion — computed once per group, used in reward + display
      const hubCrowding = hub
        ? hubCrowdingLevel(first.hub_iata, liveDemands, hub.airport)
        : null;
      const congestionMul = congestionEfficiencyMultiplier(hubCrowding?.level);
      const priceElasticity =
        demand.price_elasticity ?? computePriceElasticity(dist);

      // Representative result from first plane — used for utilization display
      const firstPlane = first.plane.plane_model;
      const representativeResult = calcRouteRevenue({
        distNm: dist,
        speedKts: firstPlane.speed_kts,
        trustPct: hub?.trust ?? 0,
        deliveredPax,
        paxDay: demand.base_pax_day,
        costPerSector: firstPlane.cost_per_sector ?? 500,
        fuelPerNm: firstPlane.fuel_per_nm ?? 2,
        priceStrategy,
        priceElasticity,
        congestionMultiplier: congestionMul,
        businessPct: demand.business_pct ?? 0.25,
        leisurePct: demand.leisure_pct ?? 0.75,
      });

      const totalReward = groupRoutes.reduce((sum, route) => {
        const p = route.plane.plane_model;

        const result = calcRouteRevenue({
          distNm: dist,
          speedKts: p.speed_kts,
          trustPct: hub?.trust ?? 0,
          deliveredPax,
          paxDay: demand.base_pax_day,
          costPerSector: p.cost_per_sector ?? 500,
          fuelPerNm: p.fuel_per_nm ?? 2,
          priceStrategy,
          priceElasticity,
          congestionMultiplier: congestionMul,
          businessPct: demand.business_pct ?? 0.25,
          leisurePct: demand.leisure_pct ?? 0.75,
        });

        return sum + result.gross;
      }, 0);

      return {
        id: demandId,
        demand,
        routes: groupRoutes,
        hub_iata: first.hub_iata,
        via_iata: first.via_iata,
        total_dist_nm: dist,
        deliveredPax,
        targetPax,
        waitingPax,
        canBoardNow,
        leftToMove,
        movedPct,
        status,
        totalCapacity,
        totalReward,
        planeLabel: buildPlaneLabel(groupRoutes),
        priceStrategy,
        utilizationLabel: representativeResult.utilization?.label ?? "Healthy",
        utilizationPct: Math.round(
          (representativeResult.utilization?.utilization ?? 1) * 100,
        ),
        congestionLevel: hubCrowding?.level ?? "normal",
        congestionMultiplier: congestionMul,
      };
    });
  }, [activeRoutes, liveDemands, dayProgress, hubs]);

  const sortedGroups = useMemo(() => {
    return [...groupedRoutes].sort((a, b) => {
      if (a.status.priority !== b.status.priority) {
        return a.status.priority - b.status.priority;
      }

      if (a.waitingPax !== b.waitingPax) return b.waitingPax - a.waitingPax;
      return b.leftToMove - a.leftToMove;
    });
  }, [groupedRoutes]);

  const totalMoved = groupedRoutes.reduce((sum, r) => sum + r.deliveredPax, 0);
  const totalTarget = groupedRoutes.reduce((sum, r) => sum + r.targetPax, 0);
  const totalWaiting = groupedRoutes.reduce((sum, r) => sum + r.waitingPax, 0);
  const totalCanBoard = groupedRoutes.reduce(
    (sum, r) => sum + r.canBoardNow,
    0,
  );
  const totalReward = groupedRoutes.reduce((sum, r) => sum + r.totalReward, 0);

  const avgFlow =
    totalTarget > 0
      ? Math.min(100, Math.round((totalMoved / totalTarget) * 100))
      : 0;

  const stalledCount = groupedRoutes.filter(
    (r) => r.status.label === "STALLED" || r.status.label === "JAMMED",
  ).length;

  const clearedCount = groupedRoutes.filter(
    (r) => r.status.label === "CLEARED",
  ).length;

  const flowHighlight =
    stalledCount > 0 ? Colors.red : avgFlow >= 80 ? Colors.green : color;

  const summaryBorder =
    stalledCount > 0
      ? Colors.red + "55"
      : avgFlow >= 80
        ? Colors.green + "44"
        : color + "33";

  const handleCreateRoute = useCallback(() => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startCreation(), 120);
  }, [closeSheet, haptics, startCreation]);

  const handlePriceChange = useCallback(
    async (group: RouteGroup, strategy: PriceStrategy) => {
      if (strategy === group.priceStrategy) return;

      haptics.tap();

      const routeIds = new Set(group.routes.map((route) => route.id));
      const previousRoutes = useGameStore.getState().routes;

      useGameStore
        .getState()
        .setRoutes(
          previousRoutes.map((route) =>
            routeIds.has(route.id)
              ? ({ ...route, price_strategy: strategy } as Route)
              : route,
          ),
        );

      const { error } = await supabase
        .from("routes")
        .update({ price_strategy: strategy })
        .in("id", Array.from(routeIds));

      if (error) {
        useGameStore.getState().setRoutes(previousRoutes);
        haptics.error();
        gameAlert.show({
          title: "Pricing not saved",
          message: error.message,
          buttons: [{ label: "OK", style: "cancel" }],
        });
        return;
      }

      haptics.success();
    },
    [gameAlert, haptics],
  );

  const handleLongPress = useCallback(
    (group: RouteGroup) => {
      haptics.confirm();

      const via = group.via_iata ? ` via ${group.via_iata}` : "";
      const label = `${group.demand.origin.iata}${via} → ${group.demand.dest.iata}`;

      gameAlert.show({
        icon: "git-branch-outline",
        title: "Remove Route Group",
        message: `Stop flying ${label}?\n\nThis removes ${group.routes.length} plane assignment${group.routes.length !== 1 ? "s" : ""}.`,
        buttons: [
          { label: "Keep Flying", style: "cancel" },
          {
            label: "Remove Group",
            style: "destructive",
            onPress: async () => {
              setDeactivating(group.id);

              for (const route of group.routes) {
                const { error } = await deactivate(route.id);

                if (error) {
                  setDeactivating(null);
                  gameAlert.show({
                    title: "Error",
                    message: error,
                    buttons: [{ label: "OK", style: "cancel" }],
                  });
                  haptics.error();
                  return;
                }
              }

              setDeactivating(null);
              haptics.success();
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
            <Text style={s.subtitle}>Grouped by destination</Text>
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
              <Text style={[s.badgeTxt, { color }]}>{activeRoutes.length}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => {
            haptics.tap();
            closeSheet();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
              <Text style={s.rushLbl}>FLOW</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text style={[s.rushVal, { color: Colors.amber }]}>
                {totalWaiting.toLocaleString()}
              </Text>
              <Text style={s.rushLbl}>WAITING</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text style={[s.rushVal, { color: Colors.sky }]}>
                {totalCanBoard.toLocaleString()}
              </Text>
              <Text style={s.rushLbl}>READY</Text>
            </View>
            <View style={s.rushDivider} />
            <View style={s.rushStat}>
              <Text style={[s.rushVal, { color: Colors.green }]}>
                {fmtCash(totalReward)}
              </Text>
              <Text style={s.rushLbl}>EARNED</Text>
            </View>
          </View>
        </>
      )}

      {stalledCount > 0 && (
        <View style={s.alertBanner}>
          <Ionicons name="warning-outline" size={16} color={Colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={s.alertTitle}>
              {stalledCount} route group{stalledCount !== 1 ? "s" : ""} need
              attention
            </Text>
            <Text style={s.alertSub}>
              Queues are building. Add aircraft, upgrade capacity, or cut weak
              routes.
            </Text>
          </View>
        </View>
      )}

      {activeRoutes.length === 0 && (
        <View style={s.empty}>
          <Ionicons name="git-network-outline" size={48} color={Colors.dim} />
          <Text style={s.emptyTitle}>No active routes</Text>
          <Text style={s.emptySub}>
            Open the map, assign a hub demand to planes, and the rush starts
            here.
          </Text>

          <TouchableOpacity
            style={[s.emptyBtn, { borderColor: color + "55" }]}
            onPress={handleCreateRoute}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={15} color={color} />
            <Text style={[s.emptyBtnText, { color }]}>Open map</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeRoutes.length > 0 && (
        <>
          <Text style={s.eyebrow}>ROUTE GROUPS</Text>
          <Text style={s.eyebrowSub}>
            Same destination routes are grouped · hold a row to remove all
            assigned planes
          </Text>

          <View style={s.section}>
            {sortedGroups.map((group) => (
              <RouteGroupRow
                key={group.id}
                group={group}
                deactivating={deactivating === group.id}
                onLongPress={handleLongPress}
                onPriceChange={handlePriceChange}
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
  card: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  problem: {
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "06",
  },
  cleared: {
    borderColor: Colors.green + "28",
    backgroundColor: Colors.green + "05",
  },
  stripe: { width: 4 },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 7,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  routeLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  iata: {
    fontSize: 15,
    color: Colors.sky,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  status: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusTxt: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: Colors.muted,
    fontWeight: "700",
  },
  dot: {
    fontSize: 10,
    color: Colors.dim,
  },
  moved: {
    fontSize: 11,
    fontWeight: "900",
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  percent: {
    minWidth: 34,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "900",
    fontFamily: Typography.mono,
  },
  cash: {
    minWidth: 64,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "900",
    fontFamily: Typography.mono,
  },
  hint: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
  loadingOverlay: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  growth: {
    fontSize: 10,
    fontWeight: "900",
    flexShrink: 0,
  },
  growthWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  paxMix: { fontSize: 10, fontWeight: "700" },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  aiText: {
    fontSize: 10,
    fontWeight: "700",
  },
  pricingBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.018)",
    padding: 8,
    gap: 7,
  },
  pricingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  pricingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pricingTitle: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pricingEffect: {
    flex: 1,
    textAlign: "right",
    fontSize: 9,
    color: Colors.dim,
    fontWeight: "700",
  },
  priceButtons: {
    flexDirection: "row",
    gap: 6,
  },
  priceBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  priceBtnTitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "900",
  },
  priceBtnSub: {
    marginTop: 1,
    fontSize: 7,
    color: Colors.dim,
    fontWeight: "700",
  },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },
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
  topActions: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
  },
  primaryCtaText: {
    fontSize: 13,
    color: Colors.bg,
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

const es = StyleSheet.create({
  wrap: { flex: 1, padding: Spacing.lg },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
