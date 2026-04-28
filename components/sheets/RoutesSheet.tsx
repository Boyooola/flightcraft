import { useTabBarHeight } from "@/hooks/useSheetLayout";
/**
 * components/sheets/RoutesSheet.tsx
 *
 * Mission control — all active routes.
 * Long-press any route row to deactivate it (frees the plane,
 * resets demand to pending so it can be reassigned).
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import type { Route } from "@/store";
import {
  useAirline,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────
// ROUTE ROW
// ─────────────────────────────────────────────────────────────────

// Animated ticker — flashes green when value increases
function useTickerAnim(value: number) {
  const anim = useRef(new Animated.Value(1)).current;
  const prevVal = useRef(value);

  useEffect(() => {
    if (value > prevVal.current) {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1.25,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1.0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevVal.current = value;
  }, [value]);

  return anim;
}

function RouteRow({
  route,
  hub,
  color,
  day,
  deactivating,
  liveDemands,
  onLongPress,
}: {
  route: Route;
  hub: import("@/store").OwnedHub | undefined;
  color: string;
  day: number;
  deactivating: boolean;
  liveDemands: import("@/store").Demand[];
  onLongPress: (route: Route) => void;
}) {
  // Use total_dist_nm for connecting routes
  const distNm = route.total_dist_nm ?? route.demand.dist_nm;
  const { pax_capacity, speed_kts } = route.plane.plane_model;
  const flightH = distNm / speed_kts;
  const flights = Math.max(1, Math.floor(24 / (flightH * 2)));

  // Read LIVE delivered_pax_today from demands store
  const liveDemand = liveDemands.find((d) => d.id === route.demand.id);
  const deliveredPax = liveDemand?.delivered_pax_today ?? 0;
  const fillPct =
    route.demand.pax_day > 0
      ? Math.min(100, Math.round((deliveredPax / route.demand.pax_day) * 100))
      : 0;

  // Revenue — same calcRouteRevenue as all other components
  const p = route.plane.plane_model;
  const revenueResult = calcRouteRevenue({
    distNm,
    speedKts: p.speed_kts,
    trustPct: 0, // conservative — trust not available per-route here
    deliveredPax,
    paxDay: route.demand.pax_day,
    costPerSector: p.cost_per_sector ?? 500,
    fuelPerNm: p.fuel_per_nm ?? 2.0,
  });
  const routeNetRevenue = revenueResult.net;
  const routeGross = revenueResult.gross;

  const isConnecting = !!route.via_iata;

  const haulColor =
    route.demand.haul === "short"
      ? Colors.green
      : route.demand.haul === "medium"
        ? Colors.amber
        : Colors.purple;
  const barColor =
    fillPct >= 80 ? Colors.green : fillPct > 30 ? Colors.amber : Colors.red;

  return (
    <TouchableOpacity
      style={[rr.row, deactivating && { opacity: 0.4 }]}
      onLongPress={() => onLongPress(route)}
      delayLongPress={400}
      activeOpacity={0.85}
    >
      {/* Colour stripe */}
      <View style={[rr.stripe, { backgroundColor: color }]} />

      <View style={rr.left}>
        {/* Route header */}
        <View style={rr.routeHeader}>
          <Text style={rr.iata}>{route.demand.origin.iata}</Text>
          {isConnecting && (
            <>
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={11}
                color={Colors.purple}
              />
              <Text style={[rr.iata, { color: Colors.purple }]}>
                {route.via_iata}
              </Text>
            </>
          )}
          <Ionicons name="arrow-forward" size={11} color={Colors.dim} />
          <Text style={rr.iata}>{route.demand.dest.iata}</Text>

          <View
            style={[
              rr.haulPill,
              {
                backgroundColor: haulColor + "15",
                borderColor: haulColor + "44",
              },
            ]}
          >
            <Text style={[rr.haulText, { color: haulColor }]}>
              {route.demand.haul.charAt(0).toUpperCase() +
                route.demand.haul.slice(1)}
            </Text>
          </View>

          {isConnecting && (
            <View style={[rr.connectingPill]}>
              <Text style={rr.connectingText}>Via</Text>
            </View>
          )}
        </View>

        {/* Plane + meta */}
        <Text style={rr.planeName} numberOfLines={1}>
          {route.plane.plane_model.nickname}
        </Text>
        <Text style={rr.meta}>
          {route.demand.pax_day.toLocaleString()} pax/day
          {isConnecting
            ? `  ·  ${distNm.toLocaleString()} nm total`
            : `  ·  ${route.demand.dist_nm.toLocaleString()} nm`}
        </Text>

        {/* Fill bar */}
        <View style={rr.barRow}>
          <View style={rr.barTrack}>
            <View
              style={[
                rr.barFill,
                {
                  width: `${fillPct}%` as any,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>
          <Animated.Text
            style={[
              rr.barLabel,
              {
                color: deliveredPax > 0 ? barColor : Colors.dim,
                transform: [{ scale: useTickerAnim(deliveredPax) }],
              },
            ]}
          >
            {deliveredPax > 0
              ? `${deliveredPax.toLocaleString()} pax · ${fillPct}%`
              : "No pax yet today"}
          </Animated.Text>
        </View>
      </View>

      {/* Revenue + deactivate hint */}
      <View style={rr.right}>
        {deactivating ? (
          <ActivityIndicator size="small" color={Colors.dim} />
        ) : (
          <>
            <Text style={rr.revLabel}>DAILY</Text>
            <Text
              style={[
                rr.rev,
                { color: revenueResult.net >= 0 ? Colors.green : Colors.red },
              ]}
            >
              {fmtCash(revenueResult.net)}
            </Text>
            <Text style={rr.holdHint}>hold to remove</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const rr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
    overflow: "hidden",
  },
  stripe: { width: 3, alignSelf: "stretch" },
  left: { flex: 1, minWidth: 0, gap: 3, paddingVertical: Spacing.md },
  right: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
    paddingRight: Spacing.lg,
  },

  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  iata: {
    fontSize: 14,
    color: Colors.sky,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  haulPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  haulText: { fontSize: 9, fontWeight: "700" },
  connectingPill: {
    backgroundColor: Colors.purple + "15",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.purple + "44",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  connectingText: { fontSize: 8, color: Colors.purple, fontWeight: "700" },

  planeName: { fontSize: 11, color: Colors.muted },
  meta: { fontSize: 10, color: Colors.dim },

  barRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  barTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
  barLabel: {
    fontSize: 9,
    fontWeight: "600",
    minWidth: 28,
    textAlign: "right",
  },

  revLabel: { fontSize: 7, color: Colors.dim, letterSpacing: 1.5 },
  rev: { fontSize: 14, fontWeight: "700" },
  holdHint: { fontSize: 8, color: Colors.dim + "88", marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────
// ROUTES SHEET
// ─────────────────────────────────────────────────────────────────

export default function RoutesSheet() {
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const liveDemands = useDemands();
  const tabBarH = useTabBarHeight();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const haptics = useHaptics();
  const deactivate = useDeactivateRoute();

  const [deactivating, setDeactivating] = useState<string | null>(null);

  const activeRoutes = routes.filter((r) => r.active);
  const color = airline?.color ?? Colors.sky;
  const day = airline?.day ?? 1;

  const totalDailyRev = activeRoutes.reduce((sum, r) => {
    const hub = hubs.find((h) => h.airport.iata === r.hub_iata);
    const p = r.plane.plane_model;
    const dist = r.total_dist_nm ?? r.demand.dist_nm;
    const res = calcRouteRevenue({
      distNm: dist,
      speedKts: p.speed_kts,
      trustPct: hub?.trust ?? 0,
      deliveredPax: r.demand.pax_day,
      paxDay: r.demand.pax_day,
      costPerSector: p.cost_per_sector ?? 500,
      fuelPerNm: p.fuel_per_nm ?? 2.0,
    });
    return sum + res.net;
  }, 0);

  const handleLongPress = useCallback(
    (route: Route) => {
      haptics.confirm();

      const via = route.via_iata ? ` via ${route.via_iata}` : "";
      const label = `${route.demand.origin.iata}${via} → ${route.demand.dest.iata}`;
      const plane = route.plane.plane_model.nickname;

      Alert.alert(
        "Remove Route",
        `Stop flying ${label} with ${plane}?\n\nThe plane will become idle and the demand will go back to pending so you can reassign it.`,
        [
          { text: "Keep Flying", style: "cancel" },
          {
            text: "Remove Route",
            style: "destructive",
            onPress: async () => {
              setDeactivating(route.id);
              const { error } = await deactivate(route.id);
              setDeactivating(null);
              if (error) {
                Alert.alert("Error", error);
                haptics.error();
              } else {
                haptics.success();
              }
            },
          },
        ],
      );
    },
    [deactivate, haptics],
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
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <MaterialCommunityIcons name="routes" size={20} color={color} />
          <Text style={s.title}>Routes</Text>
          {activeRoutes.length > 0 && (
            <View
              style={[
                s.badge,
                { backgroundColor: color + "20", borderColor: color + "44" },
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

      {/* Total revenue summary */}
      {activeRoutes.length > 0 && (
        <View style={[s.summaryCard, { borderColor: color + "33" }]}>
          <View style={s.summaryLeft}>
            <Text style={s.summaryLabel}>TOTAL DAILY</Text>
            <Text style={[s.summaryRev, { color: Colors.green }]}>
              {fmtCash(totalDailyRev)}
            </Text>
            <Text style={s.summaryNote}>
              across {activeRoutes.length} route
              {activeRoutes.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chart-line"
            size={32}
            color={color + "44"}
          />
        </View>
      )}

      <View style={s.divider} />

      {/* Empty state */}
      {activeRoutes.length === 0 && (
        <View style={s.empty}>
          <MaterialCommunityIcons name="routes" size={48} color={Colors.dim} />
          <Text style={s.emptyTitle}>No active routes</Text>
          <Text style={s.emptySub}>
            Tap an airport on the map, buy a hub,{"\n"}then assign a plane to a
            demand.
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
            <Text style={[s.emptyBtnText, { color }]}>Explore map</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route list */}
      {activeRoutes.length > 0 && (
        <>
          <View style={s.listHint}>
            <Ionicons name="hand-left-outline" size={11} color={Colors.dim} />
            <Text style={s.listHintTxt}>Hold any route to remove it</Text>
          </View>
          <View style={s.list}>
            {activeRoutes.map((route) => (
              <RouteRow
                key={route.id}
                route={route}
                hub={hubs.find((h) => h.airport.iata === route.hub_iata)}
                color={color}
                day={day}
                deactivating={deactivating === route.id}
                liveDemands={liveDemands}
                onLongPress={handleLongPress}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </BottomSheetScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 11, fontWeight: "700" },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  summaryLeft: { gap: 3 },
  summaryLabel: { fontSize: 8, color: Colors.dim, letterSpacing: 1.5 },
  summaryRev: { fontSize: 26, fontWeight: "700", letterSpacing: 0.3 },
  summaryNote: { fontSize: 10, color: Colors.dim },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },

  listHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  listHintTxt: { fontSize: 10, color: Colors.dim },

  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingLeft: 0,
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  emptyTitle: { fontSize: 18, color: Colors.text, fontWeight: "700" },
  emptySub: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 18,
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
  emptyBtnText: { fontSize: 13, fontWeight: "600" },
});
