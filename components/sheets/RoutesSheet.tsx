import SwapPlaneSheet from "@/components/sheets/SwapPlaneSheet";
import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import { hubCrowdingLevel } from "@/lib/demands";
import { congestionEfficiencyMultiplier } from "@/lib/hubCongestion";
import { splitOdPax } from "@/lib/od";
import {
  demandFlowStatus,
  remainingPax,
  waitingPaxForDemand,
} from "@/lib/passengerFlow";
import { passengerTypeBreakdown } from "@/lib/passengerTypes";
import {
  calcRouteRevenue,
  computePriceElasticity,
  fmtCash,
} from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type { Demand, OwnedHub, Route } from "@/store";
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
  label:
    | "DONE"
    | "OVERLOADED"
    | "NEEDS HELP"
    | "BOARDING"
    | "FLYING"
    | "PENDING";
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

const PRICING_COLOR: Record<string, string> = {
  low: Colors.sky,
  standard: Colors.green,
  premium: Colors.purple,
};

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
  routeId: string;
  currentPlaneId: string;
  viaPaxRatio: number | null;
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
      label: "DONE",
      color: Colors.green,
      priority: 6,
      hint: "All passengers moved today",
    };
  }

  if (flowStatus === "jammed") {
    return {
      label: "OVERLOADED",
      color: Colors.red,
      priority: 0,
      hint: "Queue growing faster than capacity",
    };
  }

  if (waitingPax > 0 && deliveredPax <= 0) {
    return {
      label: "NEEDS HELP",
      color: Colors.red,
      priority: 1,
      hint: "Passengers waiting with no movement",
    };
  }

  if (canBoardNow > 0) {
    return {
      label: "BOARDING",
      color: Colors.amber,
      priority: 2,
      hint: "Passengers boarding now",
    };
  }

  if (deliveredPax > 0) {
    return {
      label: "FLYING",
      color: Colors.green,
      priority: 3,
      hint: "Route is running well",
    };
  }

  return {
    label: "PENDING",
    color: Colors.sky,
    priority: 4,
    hint: "Waiting for passengers to appear",
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

// ── Route quality rating ──────────────────────────────────────────
// Derived from demand.popularity (-40 → +80 range).
// No DB column needed — purely a display layer.
function routeQuality(popularity: number): {
  stars: number;
  label: string;
  color: string;
} {
  if (popularity >= 40)
    return { stars: 5, label: "Excellent", color: "#22c55e" };
  if (popularity >= 15) return { stars: 4, label: "Strong", color: "#4ade80" };
  if (popularity >= 0) return { stars: 3, label: "Solid", color: "#94a3b8" };
  if (popularity >= -10)
    return { stars: 2, label: "Developing", color: "#f59e0b" };
  return { stars: 1, label: "Struggling", color: "#ef4444" };
}

function StarRating({ stars, color }: { stars: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < stars ? "star" : "star-outline"}
          size={9}
          color={i < stars ? color : Colors.dim}
        />
      ))}
    </View>
  );
}

function RouteGroupRow({
  group,
  deactivating,
  onLongPress,
  onPriceChange,
  onSwap,
}: {
  group: RouteGroup;
  deactivating: boolean;
  onLongPress: (group: RouteGroup) => void;
  onPriceChange: (group: RouteGroup, strategy: PriceStrategy) => void;
  onSwap: (group: RouteGroup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnecting = !!group.via_iata;
  const viaPaxRatio = group.viaPaxRatio ?? 0.3;
  const paxDay = group.demand.base_pax_day ?? group.demand.base_pax_day ?? 0;
  // Use targetPax (pax_day) for the split — more reliable than delivered count
  const odPaxBase = group.targetPax > 0 ? group.targetPax : paxDay;
  const odSplit =
    isConnecting && odPaxBase > 0 ? splitOdPax(odPaxBase, viaPaxRatio) : null;
  const isProblem =
    group.status.label === "NEEDS HELP" || group.status.label === "OVERLOADED";
  const isCleared = group.status.label === "DONE";
  const accent = group.status.color;
  const growth = routeGrowthLabel(group.demand);
  const pricingColor = PRICING_COLOR[group.priceStrategy] ?? Colors.green;
  const quality = routeQuality(group.demand.popularity ?? 0);

  return (
    <TouchableOpacity
      style={[
        rr.card,
        isProblem && rr.problem,
        isCleared && rr.cleared,
        deactivating && { opacity: 0.45 },
      ]}
      onPress={() => setExpanded((v) => !v)}
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
          {group.routes.length > 1 && (
            <Text style={[rr.moved, { color: accent }]}>
              ×{group.routes.length}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={12}
            color={Colors.dim}
          />
        </View>

        {/* Always visible — compact progress */}
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

          <StarRating stars={quality.stars} color={quality.color} />

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

        {expanded && (
          <View style={rr.hintRow}>
            <Text style={rr.hint} numberOfLines={1}>
              {group.waitingPax.toLocaleString()} waiting ·{" "}
              {group.totalCapacity.toLocaleString()} seats
              {group.congestionLevel !== "normal"
                ? ` · hub busy -${Math.round((1 - group.congestionMultiplier) * 100)}%`
                : ""}
            </Text>

            <View style={rr.growthWrap}>
              <Ionicons name={growth.icon} size={11} color={growth.color} />
              <Text style={[rr.growth, { color: growth.color }]}>
                {growth.text}
              </Text>
            </View>

            <View style={rr.qualityWrap}>
              <Text style={[rr.qualityLabel, { color: quality.color }]}>
                {quality.label}
              </Text>
            </View>
          </View>
        )}

        {expanded && (
          <View style={rr.expandedExtra}>
            {/* O&D breakdown — connecting routes */}
            {isConnecting && odSplit && (
              <View style={rr.odRow}>
                <Ionicons
                  name="git-branch-outline"
                  size={11}
                  color={Colors.sky}
                />
                <Text style={rr.odTxt}>
                  {odSplit.localPax} stop at {group.via_iata} ·{" "}
                  {odSplit.transitPax} continue to {group.demand.dest.iata}
                </Text>
              </View>
            )}
            {/* Biz/leisure mix */}
            {(() => {
              const mix = passengerTypeBreakdown({
                businessPct: group.demand.business_pct,
                leisurePct: group.demand.leisure_pct,
              });
              return mix.businessPct > 0 ? (
                <Text style={rr.mixTxt}>
                  {mix.businessPct}% business · {mix.leisurePct}% leisure
                </Text>
              ) : null;
            })()}
            {/* Swap button */}
            <TouchableOpacity
              style={rr.swapBtnFull}
              onPress={() => onSwap(group)}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={13} color={Colors.sky} />
              <Text style={rr.swapFullTxt}>Swap Plane</Text>
            </TouchableOpacity>
          </View>
        )}

        {expanded && (
          <View style={[rr.pricingBox, { borderColor: pricingColor + "30" }]}>
            <View style={rr.pricingHeader}>
              <View style={rr.pricingTitleRow}>
                <Ionicons
                  name="pricetag-outline"
                  size={11}
                  color={pricingColor}
                />
                <Text style={[rr.pricingTitle, { color: pricingColor }]}>
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
                const pricingColor =
                  PRICING_COLOR[group.priceStrategy] ?? Colors.green;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      rr.priceBtn,
                      active && {
                        borderColor: pricingColor + "66",
                        backgroundColor: pricingColor + "12",
                      },
                    ]}
                    onPress={() => onPriceChange(group, option.key)}
                    disabled={deactivating || active}
                    activeOpacity={0.82}
                  >
                    <Ionicons
                      name={option.icon}
                      size={12}
                      color={active ? pricingColor : Colors.dim}
                    />
                    <Text
                      style={[
                        rr.priceBtnTitle,
                        { color: active ? pricingColor : Colors.text },
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
        )}
      </View>

      {deactivating && (
        <View style={rr.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.dim} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Hub row for Hubs tab ──────────────────────────────────────────
function HubRow({
  hub,
  demands,
  dayProgress,
  onPress,
  color,
}: {
  hub: OwnedHub;
  demands: Demand[];
  dayProgress: number;
  onPress: () => void;
  color: string;
}) {
  const hubDemands = demands.filter((d) => d.hub_iata === hub.airport.iata);
  const active = hubDemands; // all demands for this hub
  const waiting = active.reduce(
    (sum, d) => sum + waitingPaxForDemand(d, dayProgress),
    0,
  );
  const moved = active.reduce(
    (sum, d) => sum + (d.delivered_pax_today ?? 0),
    0,
  );
  const total = active.reduce((sum, d) => sum + (d.base_pax_day ?? 0), 0);
  const flowPct =
    total > 0 ? Math.min(100, Math.round((moved / total) * 100)) : 0;
  const trustColor =
    hub.trust >= 70
      ? Colors.green
      : hub.trust >= 40
        ? Colors.amber
        : Colors.red;
  const crowding = hubCrowdingLevel(hub.airport.iata, demands, hub.airport);
  const isBusy = crowding?.level !== "normal";

  return (
    <TouchableOpacity style={hr.row} onPress={onPress} activeOpacity={0.88}>
      <View style={[hr.stripe, { backgroundColor: color }]} />
      <View style={hr.body}>
        <View style={hr.top}>
          <View style={hr.left}>
            <Text style={hr.iata}>{hub.airport.iata}</Text>
            <Text style={hr.city} numberOfLines={1}>
              {hub.airport.city}
            </Text>
          </View>
          <View style={hr.right}>
            <Text style={[hr.trust, { color: trustColor }]}>{hub.trust}%</Text>
            <Text style={hr.trustLbl}>trust</Text>
          </View>
        </View>

        <View style={hr.stats}>
          <Text style={hr.stat}>
            <Text style={{ color: Colors.sky }}>
              {waiting.toLocaleString()}
            </Text>
            {" waiting"}
          </Text>
          <Text style={hr.dot}>·</Text>
          <Text style={hr.stat}>
            {active.length} slot{active.length !== 1 ? "s" : ""}
          </Text>
          {isBusy && (
            <>
              <Text style={hr.dot}>·</Text>
              <Text style={[hr.stat, { color: Colors.amber }]}>Hub busy</Text>
            </>
          )}
        </View>

        <View style={hr.barRow}>
          <View style={hr.track}>
            <View
              style={[
                hr.fill,
                { width: `${flowPct}%` as any, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={[hr.pct, { color }]}>{flowPct}%</Text>
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={Colors.dim}
        style={{ marginRight: Spacing.sm }}
      />
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
  const openSheet = useGameStore((s) => s.openSheet);
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
      // Include via_iata in key — same demand, different via = different group
      const key = `${route.demand.id}__${route.via_iata ?? "direct"}`;
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
        routeId: first.id,
        currentPlaneId: first.plane.id,
        viaPaxRatio: first.via_pax_ratio ?? null,
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
    (r) => r.status.label === "NEEDS HELP" || r.status.label === "OVERLOADED",
  ).length;

  const clearedCount = groupedRoutes.filter(
    (r) => r.status.label === "DONE",
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

  const [activeTab, setActiveTab] = useState<"routes" | "hubs">("routes");
  const [swapGroup, setSwapGroup] = useState<RouteGroup | null>(null);

  const handleSwap = useCallback((group: RouteGroup) => {
    setSwapGroup(group);
  }, []);

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
    <>
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
              <Text style={s.title}>Operations</Text>
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
          >
            <Ionicons name="close" size={22} color={Colors.dim} />
          </TouchableOpacity>
        </View>

        {/* Segmented control */}
        <View style={s.segWrap}>
          <TouchableOpacity
            style={[
              s.seg,
              activeTab === "routes" && {
                backgroundColor: color + "18",
                borderColor: color + "55",
              },
            ]}
            onPress={() => setActiveTab("routes")}
            activeOpacity={0.8}
          >
            <Text style={[s.segTxt, activeTab === "routes" && { color }]}>
              Routes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.seg,
              activeTab === "hubs" && {
                backgroundColor: color + "18",
                borderColor: color + "55",
              },
            ]}
            onPress={() => setActiveTab("hubs")}
            activeOpacity={0.8}
          >
            <Text style={[s.segTxt, activeTab === "hubs" && { color }]}>
              Hubs
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "routes" && activeRoutes.length > 0 && (
          <>
            <View style={[s.rushStats, { borderColor: summaryBorder }]}>
              <View style={s.rushStat}>
                <Text style={[s.rushVal, { color: flowHighlight }]}>
                  {avgFlow}%
                </Text>
                <Text style={s.rushLbl}>Flow</Text>
              </View>
              <View style={s.rushDivider} />
              <View style={s.rushStat}>
                <Text style={[s.rushVal, { color: Colors.amber }]}>
                  {totalWaiting.toLocaleString()}
                </Text>
                <Text style={s.rushLbl}>Waiting</Text>
              </View>
              <View style={s.rushDivider} />
              <View style={s.rushStat}>
                <Text style={[s.rushVal, { color: Colors.sky }]}>
                  {totalCanBoard.toLocaleString()}
                </Text>
                <Text style={s.rushLbl}>Ready</Text>
              </View>
              <View style={s.rushDivider} />
              <View style={s.rushStat}>
                <Text style={[s.rushVal, { color: Colors.green }]}>
                  {fmtCash(totalReward)}
                </Text>
                <Text style={s.rushLbl}>Earned</Text>
              </View>
            </View>
          </>
        )}

        {activeTab === "routes" && stalledCount > 0 && (
          <View style={s.alertBanner}>
            <Ionicons name="warning-outline" size={16} color={Colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>
                {stalledCount} route group{stalledCount !== 1 ? "s" : ""} need
                attention
              </Text>
              <Text style={s.alertSub}>
                Passengers are piling up. Try adding more planes or opening new
                routes.
              </Text>
            </View>
          </View>
        )}

        {activeTab === "routes" && activeRoutes.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="git-network-outline" size={48} color={Colors.dim} />
            <Text style={s.emptyTitle}>No routes yet</Text>
            <Text style={s.emptySub}>
              Tap a hub on the map, pick a destination, assign a plane and your
              first route will appear here.
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

        {activeTab === "routes" && activeRoutes.length > 0 && (
          <>
            <Text style={s.eyebrow}>YOUR ROUTES</Text>
            <Text style={s.eyebrowSub}>
              Tap a route to see details · hold to remove
            </Text>

            <View style={s.section}>
              {sortedGroups.map((group) => (
                <RouteGroupRow
                  key={group.id}
                  group={group}
                  deactivating={deactivating === group.id}
                  onLongPress={handleLongPress}
                  onSwap={handleSwap}
                  onPriceChange={handlePriceChange}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Hubs Tab ── */}
        {activeTab === "hubs" && (
          <>
            {hubs.length === 0 ? (
              <View style={s.empty}>
                <Ionicons
                  name="location-outline"
                  size={48}
                  color={Colors.dim}
                />
                <Text style={s.emptyTitle}>No hubs yet</Text>
                <Text style={s.emptySub}>
                  Tap an airport on the map to buy your first hub.
                </Text>
              </View>
            ) : (
              <View style={s.section}>
                {hubs.map((hub) => (
                  <HubRow
                    key={hub.id}
                    hub={hub}
                    demands={liveDemands}
                    dayProgress={dayProgress}
                    color={color}
                    onPress={() => {
                      closeSheet();
                      setTimeout(() => openSheet("airport", hub.airport), 120);
                    }}
                  />
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 36 }} />
        <GameAlert ref={gameAlert.ref} />
      </BottomSheetScrollView>

      {swapGroup && (
        <SwapPlaneSheet group={swapGroup} onClose={() => setSwapGroup(null)} />
      )}
    </>
  );
}

const hr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 5 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  left: { gap: 2 },
  right: { alignItems: "flex-end" },
  iata: { fontSize: 16, fontWeight: "900", color: Colors.text },
  city: { fontSize: 10, color: Colors.dim },
  trust: { fontSize: 14, fontWeight: "900" },
  trustLbl: { fontSize: 8, color: Colors.dim },
  stats: { flexDirection: "row", alignItems: "center", gap: 5 },
  stat: { fontSize: 10, color: Colors.muted },
  dot: { fontSize: 10, color: Colors.dim },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  fill: { height: "100%" as any, borderRadius: 2 },
  pct: { fontSize: 9, fontWeight: "700", minWidth: 24 },
});

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
  expandedExtra: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  odRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  odTxt: {
    fontSize: 11,
    color: Colors.sky,
    flex: 1,
  },
  mixTxt: {
    fontSize: 11,
    color: Colors.dim,
  },
  swapBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.3)",
    backgroundColor: "rgba(56,189,248,0.08)",
    alignSelf: "flex-start",
  },
  swapFullTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.sky,
  },
  odPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: "rgba(56,189,248,0.25)",
  },
  odPillTxt: {
    fontSize: 8,
    fontWeight: "700",
    color: Colors.sky,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(56,189,248,0.1)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: "rgba(56,189,248,0.3)",
  },
  swapTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.sky,
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
  qualityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  qualityLabel: {
    fontSize: 9,
    fontWeight: "700",
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
  segWrap: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs ?? 4,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  segTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dim,
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

// ─────────────────────────────────────────────────────────────────
// SWAP PLANE MODAL
// Shows idle compatible planes for this route, sorted by efficiency
// ─────────────────────────────────────────────────────────────────
