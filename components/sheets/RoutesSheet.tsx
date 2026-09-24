import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import {
  Colors,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import { HUB_TIER_CONFIG, hubCrowdingLevel } from "@/lib/demands";
import { splitOdPax } from "@/lib/od";
import { demandFlowStatus, waitingPaxForDemand } from "@/lib/passengerFlow";
import { passengerTypeBreakdown } from "@/lib/passengerTypes";
import { fmtCash, normalizePriceStrategy } from "@/lib/revenue";
import { getSeasonForRoute } from "@/lib/seasons";
import { supabase } from "@/lib/supabase";
import type { Demand, OwnedHub, Route } from "@/store";
import {
  useAirline,
  useDayProgress,
  useGameStore,
  useHubs,
  useRouteEarnings,
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

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

type RouteFlowStatus = {
  label:
    "DONE" | "OVERLOADED" | "NEEDS HELP" | "BOARDING" | "FLYING" | "PENDING";
  color: string;
  priority: number;
  hint: string;
};

type PriceStrategy = "low" | "standard" | "premium";

type RouteGroup = {
  id: string;
  demand: Demand;
  routes: Route[];
  hub_iata: string;
  via_iata: string | null;
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
  congestionLevel: string;
  congestionMultiplier: number;
  viaPaxRatio: number | null;
};

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

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

const PRICING_EFFECT: Record<PriceStrategy, string> = {
  low: "+18% demand, -15% fare",
  standard: "Balanced demand and fare",
  premium: "-18% demand, +28% fare",
};

// ─────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────

function buildStatus(
  demand: Demand,
  waitingPax: number,
  deliveredPax: number,
  leftToMove: number,
  canBoardNow: number,
  dayProgress: number,
): RouteFlowStatus {
  const flowStatus = demandFlowStatus(demand, dayProgress);

  if (flowStatus === "cleared" || demand.status === "served" || leftToMove <= 0)
    return {
      label: "DONE",
      color: Colors.green,
      priority: 6,
      hint: "All passengers moved today",
    };
  if (flowStatus === "jammed")
    return {
      label: "OVERLOADED",
      color: Colors.red,
      priority: 0,
      hint: "Queue growing faster than capacity",
    };
  if (waitingPax > 0 && deliveredPax <= 0)
    return {
      label: "NEEDS HELP",
      color: Colors.red,
      priority: 1,
      hint: "Passengers waiting with no movement",
    };
  if (canBoardNow > 0)
    return {
      label: "BOARDING",
      color: Colors.amber,
      priority: 2,
      hint: "Passengers boarding now",
    };
  if (deliveredPax > 0)
    return {
      label: "FLYING",
      color: Colors.green,
      priority: 3,
      hint: "Route is running well",
    };
  return {
    label: "PENDING",
    color: Colors.sky,
    priority: 4,
    hint: "Waiting for passengers to appear",
  };
}

function buildPlaneLabel(routes: Route[]) {
  const counts = new Map<string, number>();
  routes.forEach((r) => {
    const name = r.plane.plane_model.nickname;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(" · ");
}

function routeYieldLabel(demand: Demand) {
  const p = demand.popularity ?? 0;
  if (p >= 30)
    return {
      text: "Passengers love this route",
      color: Colors.green,
      icon: "heart-outline" as const,
    };
  if (p >= 10)
    return {
      text: "Strong passenger interest",
      color: Colors.green,
      icon: "trending-up-outline" as const,
    };
  if (p <= -20)
    return {
      text: "Passengers choosing other options",
      color: Colors.red,
      icon: "trending-down-outline" as const,
    };
  if (p <= -5)
    return {
      text: "Lukewarm — check your service",
      color: Colors.amber,
      icon: "alert-circle-outline" as const,
    };
  return {
    text: "Steady — passengers are happy",
    color: Colors.dim,
    icon: "checkmark-circle-outline" as const,
  };
}

function routeQuality(popularity: number): {
  stars: number;
  label: string;
  color: string;
} {
  if (popularity >= 40)
    return { stars: 5, label: "Outstanding", color: Colors.green };
  if (popularity >= 15)
    return { stars: 4, label: "Great service", color: Colors.green };
  if (popularity >= 0) return { stars: 3, label: "Good", color: Colors.muted };
  if (popularity >= -10)
    return { stars: 2, label: "Needs attention", color: Colors.amber };
  return { stars: 1, label: "Poor service", color: Colors.red };
}

// ─────────────────────────────────────────────────────────────────
// STAR RATING
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// ROUTE GROUP ROW
// day is passed from parent — avoids per-row store subscription
// ─────────────────────────────────────────────────────────────────

function RouteGroupRow({
  group,
  day,
  deactivating,
  onLongPress,
  onPriceChange,
}: {
  group: RouteGroup;
  day: number;
  deactivating: boolean;
  onLongPress: (group: RouteGroup) => void;
  onPriceChange: (group: RouteGroup, strategy: PriceStrategy) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isConnecting = !!group.via_iata;
  const viaPaxRatio = group.viaPaxRatio ?? 0.3;
  const odPaxBase =
    group.targetPax > 0 ? group.targetPax : (group.demand.base_pax_day ?? 0);
  const odSplit =
    isConnecting && odPaxBase > 0 ? splitOdPax(odPaxBase, viaPaxRatio) : null;

  const isProblem =
    group.status.label === "NEEDS HELP" || group.status.label === "OVERLOADED";
  const isCleared = group.status.label === "DONE";
  const accent = group.status.color;
  const growth = routeYieldLabel(group.demand);
  const pricingColor = PRICING_COLOR[group.priceStrategy] ?? Colors.green;
  const quality = routeQuality(group.demand.popularity ?? 0);

  const season = getSeasonForRoute(
    day,
    group.demand.dest?.country,
    group.demand.dest?.continent,
  );

  const minCondition = Math.min(
    ...group.routes.map((r) => r.plane.condition ?? 100),
  );
  const condBadge =
    minCondition <= 15
      ? { color: Colors.red, txt: `COND ${minCondition}%` }
      : minCondition <= 40
        ? { color: Colors.amber, txt: `COND ${minCondition}%` }
        : null;

  return (
    <TouchableOpacity
      accessibilityHint="Tap for details. Long press to remove this route group."
      accessibilityLabel={`${group.demand.origin.iata} to ${group.demand.dest.iata}, ${group.status.label}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
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
        {/* ── Row 1: route path + status pill ── */}
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
              { backgroundColor: accent + "18", borderColor: accent + "44" },
            ]}
          >
            <Text style={[rr.statusTxt, { color: accent }]}>
              {group.status.label}
            </Text>
          </View>
        </View>

        {/* ── Row 2: plane label + condition badge + multi-plane count + chevron ── */}
        <View style={rr.metaRow}>
          <Ionicons name="airplane" size={11} color={Colors.dim} />
          <Text style={rr.meta} numberOfLines={1}>
            {group.planeLabel}
          </Text>
          {condBadge && (
            <Text style={[rr.condBadge, { color: condBadge.color }]}>
              {condBadge.txt}
            </Text>
          )}
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

        {/* ── Row 3: progress bar + % + stars + season + revenue ── */}
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
          {season && (
            <View
              style={[rr.seasonBadge, { backgroundColor: season.color + "18" }]}
            >
              <Ionicons
                name={season.icon as any}
                size={9}
                color={season.color}
              />
              <Text style={[rr.seasonTxt, { color: season.color }]}>
                {season.pctLabel}
              </Text>
            </View>
          )}
          <Text
            style={[
              rr.cash,
              {
                color:
                  group.totalReward === 0
                    ? Colors.dim
                    : group.totalReward > 0
                      ? Colors.green
                      : Colors.red,
              },
            ]}
          >
            {group.totalReward === 0
              ? "—"
              : (group.totalReward > 0 ? "+" : "") + fmtCash(group.totalReward)}
          </Text>
        </View>

        {/* ── Expanded: stats + growth signal + passenger mix + pricing ── */}
        {expanded && (
          <>
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

            <View style={rr.expandedExtra}>
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
            </View>

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
                  {PRICING_EFFECT[group.priceStrategy]}
                </Text>
              </View>

              <View style={rr.priceButtons}>
                {PRICE_OPTIONS.map((option) => {
                  const active = option.key === group.priceStrategy;
                  const btnColor = PRICING_COLOR[option.key] ?? Colors.green;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        rr.priceBtn,
                        active && {
                          borderColor: btnColor + "66",
                          backgroundColor: btnColor + "12",
                        },
                      ]}
                      onPress={() => onPriceChange(group, option.key)}
                      disabled={deactivating || active}
                      activeOpacity={0.82}
                    >
                      <Ionicons
                        name={option.icon}
                        size={12}
                        color={active ? btnColor : Colors.dim}
                      />
                      <Text
                        style={[
                          rr.priceBtnTitle,
                          { color: active ? btnColor : Colors.text },
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
          </>
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

// ─────────────────────────────────────────────────────────────────
// HUB ROW — shows used/total routes, not demand count
// ─────────────────────────────────────────────────────────────────

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
  const waiting = hubDemands.reduce(
    (sum, d) => sum + waitingPaxForDemand(d, dayProgress),
    0,
  );
  const moved = hubDemands.reduce(
    (sum, d) => sum + (d.delivered_pax_today ?? 0),
    0,
  );
  const total = hubDemands.reduce((sum, d) => sum + (d.base_pax_day ?? 0), 0);
  const flowPct =
    total > 0 ? Math.min(100, Math.round((moved / total) * 100)) : 0;

  const tierNum = (hub.tier ?? 1) as number;
  const totalSlots = HUB_TIER_CONFIG[tierNum]?.routes ?? "?";
  const usedSlots = hubDemands.length;

  const trustColor =
    hub.trust >= 70
      ? Colors.green
      : hub.trust >= 40
        ? Colors.amber
        : Colors.red;
  const crowding = hubCrowdingLevel(hub.airport.iata, demands, hub.airport);
  const isBusy = crowding?.level !== "normal";
  const crowdColor =
    crowding?.level === "crisis"
      ? Colors.red
      : crowding?.level === "overcrowded"
        ? Colors.orange
        : Colors.amber;

  return (
    <TouchableOpacity
      accessibilityLabel={`${hub.airport.iata} hub in ${hub.airport.city}, ${hub.trust}% trust`}
      accessibilityRole="button"
      style={hr.row}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View
        style={[hr.stripe, { backgroundColor: isBusy ? crowdColor : color }]}
      />
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
          {waiting > 0 && (
            <>
              <Text style={[hr.stat, { color: Colors.amber }]}>
                {waiting.toLocaleString()} waiting
              </Text>
              <Text style={hr.dot}>·</Text>
            </>
          )}
          {/* used/total slots — correct source */}
          <Text style={hr.stat}>
            <Text style={{ color: Colors.sky }}>{usedSlots}</Text>
            <Text style={{ color: Colors.dim }}> / {totalSlots} routes</Text>
          </Text>
          {isBusy && (
            <>
              <Text style={hr.dot}>·</Text>
              <Text style={[hr.stat, { color: crowdColor }]}>
                {crowding?.level === "crisis" ? "Crisis" : "Busy"}
              </Text>
            </>
          )}
        </View>

        <View style={hr.barRow}>
          <View style={hr.track}>
            <View
              style={[
                hr.fill,
                {
                  width: `${flowPct}%` as any,
                  backgroundColor: isBusy ? crowdColor : color,
                },
              ]}
            />
          </View>
          <Text style={[hr.pct, { color: isBusy ? crowdColor : color }]}>
            {flowPct}%
          </Text>
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

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function RoutesSheet() {
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const routeEarnings = useRouteEarnings();
  const liveDemands = useGameStore((s) => s.demands);
  const dayProgress = useDayProgress();
  // day derived once here — passed to RouteGroupRow to avoid per-row store subscriptions
  const day = useGameStore((s) => s.airline?.day ?? 1);
  const tabBarH = useTabBarHeight();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const openSheet = useGameStore((s) => s.openSheet);
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const haptics = useHaptics();
  const deactivate = useDeactivateRoute();

  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"routes" | "hubs">("routes");
  const gameAlert = useGameAlert();

  const color = airline?.color ?? Colors.sky;
  const activeRoutes = useMemo(
    () => routes.filter((route) => route.active),
    [routes],
  );

  const hubCrowdMul = useMemo(() => {
    const multipliers = new Map<string, number>();

    hubs.forEach((hub) => {
      const crowding = hubCrowdingLevel(
        hub.airport.iata,
        liveDemands,
        hub.airport,
      );
      const multiplier =
        crowding?.level === "crisis"
          ? 0.8
          : crowding?.level === "overcrowded"
            ? 0.9
            : 1.0;
      multipliers.set(hub.airport.iata, multiplier);
    });

    return multipliers;
  }, [hubs, liveDemands]);

  // ── Build + sort route groups ──────────────────────────────────
  // Priority: OVERLOADED(0) → NEEDS HELP(1) → BOARDING(2) → FLYING(3) → PENDING(4) → DONE(6)
  const groupedRoutes = useMemo<RouteGroup[]>(() => {
    const map = new Map<string, Route[]>();
    activeRoutes.forEach((route) => {
      const key = `${route.demand.id}__${route.via_iata ?? "direct"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(route);
    });

    const groups = Array.from(map.entries()).map(([demandId, groupRoutes]) => {
      const first = groupRoutes[0];
      const hub = hubs.find((h) => h.airport.iata === first.hub_iata);
      const liveDemand =
        liveDemands.find((d) => d.id === first.demand.id) ?? first.demand;

      const deliveredPax = liveDemand.delivered_pax_today ?? 0;
      const targetPax = liveDemand.base_pax_day ?? 0;
      const waitingPax = waitingPaxForDemand(liveDemand, dayProgress);
      const totalCapacity = groupRoutes.reduce(
        (sum, r) => sum + r.plane.plane_model.pax_capacity,
        0,
      );
      const leftToMove = Math.max(0, targetPax - deliveredPax);
      const canBoardNow = Math.min(waitingPax, totalCapacity);
      const movedPct =
        targetPax > 0
          ? Math.min(100, Math.round((deliveredPax / targetPax) * 100))
          : 0;
      const priceStrategy = normalizePriceStrategy(first.price_strategy);
      const hubCrowding = hubCrowdingLevel(
        first.hub_iata,
        liveDemands,
        hub?.airport ?? first.demand.origin,
      );
      const congestionMul = hubCrowdMul.get(first.hub_iata) ?? 1.0;
      const status = buildStatus(
        liveDemand,
        waitingPax,
        deliveredPax,
        leftToMove,
        canBoardNow,
        dayProgress,
      );
      const totalReward = groupRoutes.reduce(
        (sum, r) => sum + (routeEarnings[r.id] ?? 0),
        0,
      );

      return {
        id: demandId,
        demand: first.demand,
        routes: groupRoutes,
        hub_iata: first.hub_iata,
        via_iata: first.via_iata,
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
        congestionLevel: hubCrowding?.level ?? "normal",
        congestionMultiplier: congestionMul,
        viaPaxRatio: first.via_pax_ratio ?? null,
      };
    });

    // Sort by urgency priority ascending — most urgent first
    return groups.sort((a, b) => a.status.priority - b.status.priority);
  }, [
    activeRoutes,
    dayProgress,
    hubCrowdMul,
    hubs,
    liveDemands,
    routeEarnings,
  ]);

  // ── Summary stats ──────────────────────────────────────────────
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

  const stalledGroups = groupedRoutes.filter(
    (r) => r.status.label === "NEEDS HELP" || r.status.label === "OVERLOADED",
  );
  const stalledCount = stalledGroups.length;
  const flowHighlight =
    stalledCount > 0 ? Colors.red : avgFlow >= 80 ? Colors.green : color;
  const summaryBorder =
    stalledCount > 0
      ? Colors.red + "55"
      : avgFlow >= 80
        ? Colors.green + "44"
        : color + "33";

  // Hubs summary stats
  const totalHubWaiting = hubs.reduce((sum, hub) => {
    const hd = liveDemands.filter((d) => d.hub_iata === hub.airport.iata);
    return (
      sum + hd.reduce((s, d) => s + waitingPaxForDemand(d, dayProgress), 0)
    );
  }, 0);
  const busyHubCount = hubs.filter((hub) => {
    const c = hubCrowdingLevel(hub.airport.iata, liveDemands, hub.airport);
    return c?.level !== "normal";
  }).length;

  // ── Handlers ──────────────────────────────────────────────────

  const handleCreateRoute = useCallback(() => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startCreation(), 120);
  }, [closeSheet, haptics, startCreation]);

  const handlePriceChange = useCallback(
    async (group: RouteGroup, strategy: PriceStrategy) => {
      if (strategy === group.priceStrategy) return;
      haptics.tap();

      const routeIds = new Set(group.routes.map((r) => r.id));
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

  // ── Render ────────────────────────────────────────────────────

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
        <View style={s.header}>
          <View
            style={[
              s.headerMark,
              { borderColor: color, backgroundColor: color + "14" },
            ]}
          >
            <Ionicons name="git-branch-outline" size={20} color={color} />
          </View>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>NETWORK CONTROL</Text>
            <Text style={s.title}>Route Operations</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {groupedRoutes.length} corridor
              {groupedRoutes.length === 1 ? "" : "s"} · {activeRoutes.length}{" "}
              aircraft assigned
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close route operations"
            accessibilityRole="button"
            style={s.closeButton}
            onPress={() => {
              haptics.tap();
              closeSheet();
            }}
            activeOpacity={0.68}
          >
            <Ionicons name="close" size={20} color={Colors.muted} />
          </TouchableOpacity>
        </View>

        {/* ── Segmented control ── */}
        <View style={s.segWrap}>
          {(["routes", "hubs"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[s.seg, activeTab === tab && s.segActive]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              activeOpacity={0.72}
            >
              <Text style={[s.segTxt, activeTab === tab && s.segTxtActive]}>
                {tab === "routes" ? "Routes" : "Hubs"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ════════════════════════════════════════════════════════
            ROUTES TAB
            ════════════════════════════════════════════════════════ */}
        {activeTab === "routes" && (
          <>
            {activeRoutes.length === 0 ? (
              <View style={s.empty}>
                <Ionicons
                  name="git-network-outline"
                  size={48}
                  color={Colors.dim}
                />
                <Text style={s.emptyTitle}>No routes yet</Text>
                <Text style={s.emptySub}>
                  Tap a hub on the map, pick a destination, assign a plane and
                  your first route will appear here.
                </Text>
                <TouchableOpacity
                  accessibilityLabel="Start creating a route on the map"
                  accessibilityRole="button"
                  style={s.emptyBtn}
                  onPress={handleCreateRoute}
                  activeOpacity={0.72}
                >
                  <Ionicons
                    name="map-outline"
                    size={16}
                    color={Colors.textOnColor}
                  />
                  <Text style={s.emptyBtnText}>Open map</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* ── Summary stat bar
                    Flow dominates (larger); Waiting/Ready/Earned secondary ── */}
                <View style={[s.rushStats, { borderColor: summaryBorder }]}>
                  {/* Flow — hero stat, wider */}
                  <View
                    style={[
                      s.rushStat,
                      {
                        flex: 1.4,
                        borderRightWidth: StyleSheet.hairlineWidth,
                        borderRightColor: Colors.border,
                      },
                    ]}
                  >
                    <Text style={[s.rushValHero, { color: flowHighlight }]}>
                      {avgFlow}%
                    </Text>
                    <Text style={s.rushLbl}>Flow</Text>
                  </View>
                  <View style={s.rushStat}>
                    <Text
                      style={[
                        s.rushVal,
                        { color: totalWaiting > 0 ? Colors.amber : Colors.dim },
                      ]}
                    >
                      {totalWaiting.toLocaleString()}
                    </Text>
                    <Text style={s.rushLbl}>Waiting</Text>
                  </View>
                  <View style={[s.rushDivider]} />
                  <View style={s.rushStat}>
                    <Text style={[s.rushVal, { color: Colors.sky }]}>
                      {totalCanBoard.toLocaleString()}
                    </Text>
                    <Text style={s.rushLbl}>Ready</Text>
                  </View>
                  <View style={[s.rushDivider]} />
                  <View style={s.rushStat}>
                    <Text
                      style={[
                        s.rushVal,
                        {
                          color:
                            totalReward > 0
                              ? Colors.green
                              : totalReward < 0
                                ? Colors.red
                                : Colors.dim,
                        },
                      ]}
                    >
                      {totalReward === 0 ? "—" : fmtCash(totalReward)}
                    </Text>
                    <Text style={s.rushLbl}>Earned</Text>
                  </View>
                </View>

                {/* ── Alert banner — names the stalled routes specifically ── */}
                {stalledCount > 0 && (
                  <View style={s.alertBanner}>
                    <Ionicons
                      name="warning-outline"
                      size={16}
                      color={Colors.red}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertTitle}>
                        {stalledCount} route{stalledCount !== 1 ? "s" : ""} need
                        attention
                      </Text>
                      <Text style={s.alertRoutes}>
                        {stalledGroups
                          .map((g) => {
                            const via = g.via_iata ? ` via ${g.via_iata}` : "";
                            return `${g.demand.origin.iata}${via}→${g.demand.dest.iata}`;
                          })
                          .join("  ·  ")}
                      </Text>
                      <Text style={s.alertSub}>
                        Passengers are piling up. Add planes or open new routes.
                      </Text>
                    </View>
                  </View>
                )}

                {/* ── Route list — already sorted by urgency ── */}
                <Text style={s.eyebrow}>YOUR ROUTES</Text>
                <Text style={s.eyebrowSub}>Tap to expand · hold to remove</Text>

                <View style={s.routeList}>
                  {groupedRoutes.map((group) => (
                    <RouteGroupRow
                      key={group.id}
                      group={group}
                      day={day}
                      deactivating={deactivating === group.id}
                      onLongPress={handleLongPress}
                      onPriceChange={handlePriceChange}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            HUBS TAB
            ════════════════════════════════════════════════════════ */}
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
              <>
                {/* ── Hubs overview summary ── */}
                <View
                  style={[
                    s.rushStats,
                    {
                      borderColor:
                        busyHubCount > 0 ? Colors.amber + "55" : color + "33",
                    },
                  ]}
                >
                  <View
                    style={[
                      s.rushStat,
                      {
                        flex: 1.2,
                        borderRightWidth: StyleSheet.hairlineWidth,
                        borderRightColor: Colors.border,
                      },
                    ]}
                  >
                    <Text style={[s.rushValHero, { color }]}>
                      {hubs.length}
                    </Text>
                    <Text style={s.rushLbl}>Hubs</Text>
                  </View>
                  <View style={s.rushStat}>
                    <Text
                      style={[
                        s.rushVal,
                        {
                          color:
                            totalHubWaiting > 0 ? Colors.amber : Colors.dim,
                        },
                      ]}
                    >
                      {totalHubWaiting.toLocaleString()}
                    </Text>
                    <Text style={s.rushLbl}>Waiting</Text>
                  </View>
                  <View style={s.rushDivider} />
                  <View style={s.rushStat}>
                    <Text
                      style={[
                        s.rushVal,
                        {
                          color: busyHubCount > 0 ? Colors.amber : Colors.green,
                        },
                      ]}
                    >
                      {busyHubCount}
                    </Text>
                    <Text style={s.rushLbl}>Busy</Text>
                  </View>
                </View>

                <Text style={s.eyebrow}>YOUR HUBS</Text>

                <View style={s.routeList}>
                  {hubs.map((hub) => (
                    <HubRow
                      key={hub.id}
                      hub={hub}
                      demands={liveDemands}
                      dayProgress={dayProgress}
                      color={color}
                      onPress={() => {
                        closeSheet();
                        setTimeout(
                          () => openSheet("airport", hub.airport),
                          120,
                        );
                      }}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <View style={{ height: 36 }} />
        <GameAlert ref={gameAlert.ref} />
      </BottomSheetScrollView>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  headerMark: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: Radius.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.25,
    lineHeight: 11,
  },
  title: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 24,
    letterSpacing: 0.3,
    lineHeight: 27,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
  },

  segWrap: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: 3,
    gap: 3,
    backgroundColor: Colors.inset,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  seg: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.sm,
  },
  segActive: {
    backgroundColor: Colors.sky,
  },
  segTxt: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  segTxtActive: {
    color: Colors.textOnColor,
  },

  rushStats: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: Colors.panel,
    ...Shadow.card,
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
  rushValHero: {
    fontFamily: Typography.mono,
    fontSize: 20,
    fontWeight: "700",
  },
  rushVal: {
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: "700",
  },
  rushLbl: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
    marginTop: 4,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  alertBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.red + "40",
    backgroundColor: Palette.redSoft,
    padding: Spacing.md,
  },
  alertTitle: { fontSize: 12, color: Colors.red, fontWeight: "700" },
  alertRoutes: {
    fontSize: 11,
    color: Colors.red,
    fontFamily: Typography.mono,
    fontWeight: "700",
    marginTop: 2,
    opacity: 0.75,
  },
  alertSub: {
    fontSize: 10,
    color: Colors.muted,
    fontWeight: "500",
    marginTop: 3,
    lineHeight: 15,
  },

  eyebrow: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 4,
    fontWeight: "700",
  },
  eyebrowSub: {
    fontSize: 10,
    color: Colors.muted,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },

  routeList: { paddingHorizontal: Spacing.lg },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 22,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
  },
  emptyBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  emptyBtnText: {
    color: Colors.textOnColor,
    fontSize: 13,
    fontWeight: "700",
  },
});

const hr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 6 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  left: { gap: 2 },
  right: { alignItems: "flex-end" },
  iata: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 16,
    fontWeight: "700",
  },
  city: { fontSize: 10, color: Colors.muted },
  trust: {
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: "700",
  },
  trustLbl: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
    textTransform: "uppercase",
  },
  stats: { flexDirection: "row", alignItems: "center", gap: 5 },
  stat: { fontSize: 10, color: Colors.muted },
  dot: { fontSize: 10, color: Colors.dim },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%" as any, borderRadius: Radius.full },
  pct: {
    minWidth: 28,
    fontFamily: Typography.mono,
    fontSize: 9,
    fontWeight: "700",
  },
});

const rr = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  problem: {
    borderColor: Colors.red + "45",
    backgroundColor: Palette.redSoft,
  },
  cleared: {
    borderColor: Colors.green + "38",
    backgroundColor: Palette.greenSoft,
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
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  status: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusTxt: {
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
  },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { flex: 1, fontSize: 11, color: Colors.muted, fontWeight: "600" },
  condBadge: {
    flexShrink: 0,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
  },
  moved: {
    flexShrink: 0,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: "700",
  },

  bottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: Radius.full },
  percent: {
    minWidth: 30,
    textAlign: "right",
    fontSize: 10,
    fontFamily: Typography.mono,
    fontWeight: "700",
  },
  cash: {
    minWidth: 54,
    textAlign: "right",
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: "700",
  },
  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: Radius.sm ?? 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  seasonTxt: { fontSize: 8, fontWeight: "800" },

  hintRow: { gap: 4 },
  hint: { fontSize: 10, color: Colors.muted, fontWeight: "600" },
  growthWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  growth: { fontSize: 10, fontWeight: "700" },
  qualityWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  qualityLabel: { fontSize: 9, fontWeight: "700" },

  expandedExtra: { gap: 4 },
  odRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  odTxt: { fontSize: 10, color: Colors.sky, fontWeight: "700" },
  mixTxt: { fontSize: 10, color: Colors.muted, fontWeight: "600" },

  pricingBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.bg,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  pricingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  pricingTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pricingTitle: {
    fontSize: 9,
    fontFamily: Typography.mono,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pricingEffect: {
    flex: 1,
    textAlign: "right",
    fontSize: 9,
    color: Colors.muted,
    fontWeight: "700",
  },
  priceButtons: { flexDirection: "row", gap: 6 },
  priceBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  priceBtnTitle: { marginTop: 2, fontSize: 9, fontWeight: "700" },
  priceBtnSub: {
    marginTop: 1,
    fontSize: 7,
    color: Colors.muted,
    fontWeight: "700",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayLight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.lg,
  },
});
