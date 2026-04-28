import { useTabBarHeight } from "@/hooks/useSheetLayout";
/**
 * components/sheets/AirportSheet.tsx
 *
 * Airport sheet with live departures/arrivals board.
 *
 * DEPARTURES — routes leaving this hub today (player-operated)
 *   Shows: destination, pax today, load bar, revenue, status
 *   "WAITING" rows for unserved demands — tap to create route
 *
 * ARRIVALS — return legs arriving at this airport today
 *   Shows: origin, pax arrived, flight count
 *
 * DEMANDS section remains for unowned preview.
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import {
  useBuyHub,
  useRefreshDemands,
  useSellHub,
} from "@/hooks/useSupabaseWrite";
import {
  airportClassification,
  allDemandsServed,
  generateDemands,
  hubCrowdingLevel,
  hubPurchaseCost,
} from "@/lib/demands";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import type { Airport, Demand, OwnedHub, Route } from "@/store";
import {
  useAirline,
  useCash,
  useDemands,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRoutes,
  useSelectedAirport,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CountryFlag from "react-native-country-flag";

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function getDemandFill(
  demand: Demand,
  routes: Route[],
): {
  fillPct: number;
  planesCount: number;
  dailyCapacity: number;
} {
  const activeRoutes = routes.filter(
    (r) => r.demand.id === demand.id && r.active,
  );
  const deliveredToday = demand.delivered_pax_today ?? 0;
  const fillPct =
    demand.pax_day > 0
      ? Math.min(100, Math.round((deliveredToday / demand.pax_day) * 100))
      : 0;
  const totalCapacity = activeRoutes.reduce((sum, r) => {
    const flightH = demand.dist_nm / r.plane.plane_model.speed_kts;
    return (
      sum +
      r.plane.plane_model.pax_capacity *
        Math.max(1, Math.floor(24 / (flightH * 2)))
    );
  }, 0);
  return {
    fillPct,
    planesCount: activeRoutes.length,
    dailyCapacity: totalCapacity,
  };
}

const TIER_COLORS: Record<string, string> = {
  "Mega Hub": Colors.sky,
  International: "#a78bfa",
  Regional: Colors.amber,
  Domestic: Colors.dim,
};

// ─────────────────────────────────────────────────────────────────
// DEPARTURE ROW — a route leaving this hub
// ─────────────────────────────────────────────────────────────────

function DepartureRow({
  demand,
  route,
  hub,
  color,
  day,
  onCreateRoute,
  maxPlaneRange,
}: {
  demand: Demand;
  route: Route | null; // null = unserved demand
  hub: OwnedHub;
  color: string;
  day: number;
  onCreateRoute: (d: Demand) => void;
  maxPlaneRange: number;
}) {
  const isServed = route !== null;
  const noPlaneInRange = !isServed && demand.dist_nm > maxPlaneRange;
  const haulColor =
    demand.haul === "short"
      ? Colors.green
      : demand.haul === "medium"
        ? Colors.amber
        : Colors.purple;

  const paxToday = demand.delivered_pax_today ?? 0;
  const fillPct =
    demand.pax_day > 0
      ? Math.min(100, Math.round((paxToday / demand.pax_day) * 100))
      : 0;
  const barColor =
    fillPct >= 80 ? Colors.green : fillPct > 0 ? Colors.amber : Colors.red;
  const revenue = (() => {
    if (!route || !hub) return 0;
    const p = route.plane.plane_model;
    const dist = route.total_dist_nm ?? route.demand.dist_nm;
    return calcRouteRevenue({
      distNm: dist,
      speedKts: p.speed_kts,
      trustPct: hub.trust,
      deliveredPax: demand.pax_day, // full daily estimate
      paxDay: demand.pax_day,
      costPerSector: p.cost_per_sector ?? 500,
      fuelPerNm: p.fuel_per_nm ?? 2.0,
    }).net;
  })();

  return (
    <View style={dep.row}>
      {/* Status stripe */}
      <View
        style={[
          dep.stripe,
          { backgroundColor: isServed ? color : Colors.red + "80" },
        ]}
      />

      <View style={dep.body}>
        {/* Top — dest + haul + pax */}
        <View style={dep.topRow}>
          <View style={dep.destWrap}>
            <Text style={dep.flag}>
              <CountryFlag isoCode={demand.dest.country} size={18} />
            </Text>
            <View>
              <Text
                style={[
                  dep.destIata,
                  { color: isServed ? Colors.sky : Colors.dim },
                ]}
              >
                {demand.dest.iata}
              </Text>
              <Text style={dep.destCity} numberOfLines={1}>
                {demand.dest.city}
              </Text>
            </View>
          </View>

          <View style={dep.midWrap}>
            <View
              style={[
                dep.haulPill,
                {
                  borderColor: haulColor + "44",
                  backgroundColor: haulColor + "12",
                },
              ]}
            >
              <Text style={[dep.haulTxt, { color: haulColor }]}>
                {demand.haul.charAt(0).toUpperCase() + demand.haul.slice(1)}
              </Text>
            </View>
            <Text style={dep.dist}>{demand.dist_nm.toLocaleString()} nm</Text>
          </View>

          {/* Right — pax count or WAITING */}
          {isServed ? (
            <View style={dep.paxWrap}>
              <Text
                style={[
                  dep.paxCount,
                  { color: paxToday > 0 ? Colors.green : Colors.dim },
                ]}
              >
                {paxToday > 0 ? `${paxToday.toLocaleString()}` : "–"}
              </Text>
              <Text style={dep.paxLabel}>pax today</Text>
              {revenue > 0 && (
                <Text style={dep.revenue}>{fmtCash(revenue)}</Text>
              )}
            </View>
          ) : (
            <View style={dep.waitingWrap}>
              <View style={dep.waitingBadge}>
                <Text style={dep.waitingTxt}>WAITING</Text>
              </View>
              <Text style={dep.waitingPax}>
                {demand.pax_day.toLocaleString()} pax
              </Text>
            </View>
          )}
        </View>

        {/* Fill bar — served routes only */}
        {isServed && (
          <View style={dep.barRow}>
            <View style={dep.barTrack}>
              <View
                style={[
                  dep.barFill,
                  {
                    width: `${fillPct}%` as any,
                    backgroundColor: barColor,
                  },
                ]}
              />
            </View>
            <Text style={[dep.barPct, { color: barColor }]}>{fillPct}%</Text>
          </View>
        )}

        {/* Plane info — served routes */}
        {isServed && route && (
          <Text style={dep.planeTxt}>
            <Ionicons name="airplane" size={9} color={Colors.dim} />{" "}
            {route.plane.plane_model.nickname}
            {route.via_iata ? `  ·  via ${route.via_iata}` : ""}
          </Text>
        )}

        {/* Create route CTA — unserved */}
        {!isServed && (
          <View style={dep.unservedWrap}>
            <TouchableOpacity
              style={[
                dep.createBtn,
                { borderColor: color + "55", backgroundColor: color + "10" },
              ]}
              onPress={() => onCreateRoute(demand)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="airplane-takeoff"
                size={12}
                color={color}
              />
              <Text style={[dep.createTxt, { color }]}>Create Route</Text>
            </TouchableOpacity>
            {noPlaneInRange && (
              <View style={dep.connectHint}>
                <Ionicons
                  name="git-branch-outline"
                  size={10}
                  color={Colors.purple}
                />
                <Text style={dep.connectHintTxt}>
                  No plane covers {demand.dist_nm.toLocaleString()}nm — try a
                  connecting stop
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const dep = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stripe: { width: 3, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.xs },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  destWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  flag: { fontSize: 18 },
  destIata: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  destCity: { fontSize: 9, color: Colors.dim, marginTop: 1 },
  midWrap: { alignItems: "center", gap: 3 },
  haulPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  haulTxt: { fontSize: 8, fontWeight: "700" },
  dist: { fontSize: 8, color: Colors.dim },
  paxWrap: { alignItems: "flex-end", gap: 1 },
  paxCount: { fontSize: 16, fontWeight: "700" },
  paxLabel: { fontSize: 8, color: Colors.dim },
  revenue: { fontSize: 10, color: Colors.green, fontWeight: "600" },
  waitingWrap: { alignItems: "flex-end", gap: 3 },
  waitingBadge: {
    backgroundColor: Colors.red + "20",
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.red + "44",
  },
  waitingTxt: {
    fontSize: 8,
    color: Colors.red,
    fontWeight: "700",
    letterSpacing: 1,
  },
  waitingPax: { fontSize: 9, color: Colors.dim },
  barRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
  barPct: { fontSize: 9, fontWeight: "600", minWidth: 28, textAlign: "right" },
  planeTxt: { fontSize: 9, color: Colors.dim },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  unservedWrap: { gap: 5 },
  connectHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  connectHintTxt: {
    fontSize: 9,
    color: Colors.purple,
    flex: 1,
    lineHeight: 13,
  },
  createTxt: { fontSize: 11, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// ARRIVAL ROW — return leg arriving at this airport
// ─────────────────────────────────────────────────────────────────

function ArrivalRow({ route, color }: { route: Route; color: string }) {
  const paxToday = route.demand.delivered_pax_today ?? 0;
  return (
    <View style={arr.row}>
      <View style={[arr.dot, { backgroundColor: color + "60" }]} />
      <View style={arr.info}>
        <Text style={arr.origin}>
          <CountryFlag isoCode={route.demand.origin.country} size={18} />{" "}
          {route.demand.origin.iata}
        </Text>
        <Text style={arr.sub}>{route.demand.origin.city}</Text>
      </View>
      <View style={arr.right}>
        {paxToday > 0 && (
          <Text style={arr.pax}>{paxToday.toLocaleString()} arrived</Text>
        )}
        <Text style={arr.plane}>{route.plane.plane_model.nickname}</Text>
      </View>
    </View>
  );
}

const arr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  info: { flex: 1 },
  origin: { fontSize: 13, color: Colors.muted, fontWeight: "600" },
  sub: { fontSize: 9, color: Colors.dim },
  right: { alignItems: "flex-end", gap: 2 },
  pax: { fontSize: 10, color: Colors.green, fontWeight: "600" },
  plane: { fontSize: 9, color: Colors.dim },
});

// ─────────────────────────────────────────────────────────────────
// AIRPORT SHEET
// ─────────────────────────────────────────────────────────────────

function usePreviewDemands(airport: Airport | null, allAirports: Airport[]) {
  // Memoised on airport.iata only — stable across day ticks

  return useMemo(() => {
    if (!airport) return [];
    return generateDemands(airport, allAirports, 3, [], 0, true);
  }, [airport?.iata]); // intentionally exclude allAirports — prevents daily regeneration
}

export default function AirportSheet() {
  const airport = useSelectedAirport();
  const hubs = useHubs();
  const demands = useDemands();
  const routes = useRoutes();
  const airline = useAirline();
  const cash = useCash();
  const airports = useGameStore((s) => s.airports);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const buyHub = useBuyHub();
  const sellHub = useSellHub();
  const refreshDemands = useRefreshDemands();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const ownedPlanes = useOwnedPlanes();
  const [selling, setSelling] = useState(false);

  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const previewDemands = usePreviewDemands(airport, airports);

  if (!airport) return null;

  const isOwned = hubs.some((h) => h.airport.iata === airport.iata);
  const hub = hubs.find((h) => h.airport.iata === airport.iata);
  const color = airline?.color ?? Colors.sky;
  const cost = hubPurchaseCost(airport);
  const canAfford = cash >= cost;
  const classification = airportClassification(airport);
  const tierColor = TIER_COLORS[classification.label] ?? Colors.dim;
  const day = airline?.day ?? 1;

  // Hub demands
  const hubDemands = demands.filter((d) => d.hub_iata === airport.iata);
  // Max range across all owned planes (for connecting hint)
  const maxPlaneRange =
    ownedPlanes.length > 0
      ? Math.max(...ownedPlanes.map((p) => p.plane_model.range_nm))
      : 0;
  const allServed = hub ? allDemandsServed(airport.iata, demands) : false;

  // Overcrowding
  const crowding = isOwned
    ? hubCrowdingLevel(airport.iata, demands, airport)
    : null;

  // DEPARTURES — demands at this hub, served or not
  // For served demands, find the active route
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const departures = useMemo(() => {
    const base = isOwned ? hubDemands : (previewDemands as Demand[]);
    return base.map((d) => {
      const route =
        routes.find((r) => r.demand.id === d.id && r.active) ?? null;
      return { demand: d, route };
    });
  }, [hubDemands, previewDemands, routes, isOwned]);

  // ARRIVALS — routes where this airport is the destination (return legs)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const arrivals = useMemo(() => {
    return routes.filter(
      (r) =>
        r.active &&
        r.demand.dest.iata === airport.iata &&
        r.hub_iata !== airport.iata, // not originating here
    );
  }, [routes, airport.iata]);

  // Stats
  const totalPaxToday = hubDemands.reduce(
    (s, d) => s + (d.delivered_pax_today ?? 0),
    0,
  );
  const servedCount = hubDemands.filter((d) => d.status === "served").length;
  const pendingCount = hubDemands.filter((d) => d.status === "pending").length;

  const handleRefresh = async () => {
    if (!hub) return;
    haptics.confirm();
    setRefreshing(true);
    setRefreshError(null);
    const { error } = await refreshDemands(hub.airport.iata);
    setRefreshing(false);
    if (error) {
      setRefreshError(error);
      haptics.error();
    } else {
      haptics.success();
    }
  };

  const handleSell = () => {
    const hubRouteCount = routes.filter(
      (r) => r.hub_iata === airport.iata && r.active,
    ).length;
    const refund = Math.round(hubPurchaseCost(airport) * 0.5);
    Alert.alert(
      "Sell Hub",
      `Sell ${airport.iata} hub for ${fmtCash(refund)}?

` +
        (hubRouteCount > 0
          ? `⚠️ This will deactivate ${hubRouteCount} active route${hubRouteCount !== 1 ? "s" : ""} and free ${hubRouteCount} plane${hubRouteCount !== 1 ? "s" : ""}.

`
          : "") +
        "You'll receive 50% of the purchase price.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sell Hub",
          style: "destructive",
          onPress: async () => {
            setSelling(true);
            const { error, refund: amount } = await sellHub(hub!.id);
            setSelling(false);
            if (error) {
              Alert.alert("Error", error);
              haptics.error();
              sounds.error();
            } else {
              haptics.success();
              sounds.hubSell();
              closeSheet();
            }
          },
        },
      ],
    );
  };

  const handleBuy = async () => {
    haptics.confirm();
    setBuying(true);
    setBuyError(null);
    // Pass the already-shown previewDemands so the same destinations
    // appear after purchase — no second random generation
    const { error } = await buyHub(airport, previewDemands as any);
    setBuying(false);
    if (error) {
      setBuyError(error);
      haptics.error();
    } else {
      haptics.success();
      sounds.hubBuy();
    }
  };

  const handleCreateRoute = (demand: Demand) => {
    haptics.tap();
    closeSheet();
    useGameStore.getState().startRouteCreation([demand.origin, demand.dest]);
  };

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: tabBarH }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ══ HEADER ══ */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.flag}>
            <CountryFlag isoCode={airport.country} size={18} />
          </Text>
          <View style={s.headerText}>
            <View style={s.iataRow}>
              <Text style={s.iata}>{airport.iata}</Text>
              <View
                style={[
                  s.tierPill,
                  {
                    backgroundColor: tierColor + "18",
                    borderColor: tierColor + "44",
                  },
                ]}
              >
                <Text style={[s.tierText, { color: tierColor }]}>
                  {classification.label}
                </Text>
              </View>
              {classification.paxM > 0 && (
                <Text style={s.paxNote}>
                  {classification.paxM >= 10
                    ? `${Math.round(classification.paxM)}M/yr`
                    : `${classification.paxM.toFixed(1)}M/yr`}
                </Text>
              )}
              {isOwned && (
                <View
                  style={[
                    s.ownedPill,
                    {
                      backgroundColor: color + "18",
                      borderColor: color + "44",
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={10}
                    color={color}
                  />
                  <Text style={[s.ownedPillText, { color }]}>Your hub</Text>
                </View>
              )}
            </View>
            <Text style={s.name} numberOfLines={1}>
              {airport.name}
            </Text>
            <Text style={s.location}>
              {[airport.city, airport.country, airport.continent]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
            {isOwned && hub && (
              <View style={s.trustWrap}>
                <View style={s.trustTrack}>
                  <View
                    style={[
                      s.trustFill,
                      { width: `${hub.trust}%` as any, backgroundColor: color },
                    ]}
                  />
                </View>
                <Text style={s.trustLabel}>{Math.round(hub.trust)}% trust</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            haptics.tap();
            closeSheet();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={s.closeBtn}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View style={s.divider} />

      {/* ── SELL HUB ── */}
      {isOwned && hub && (
        <TouchableOpacity
          style={s.sellHubBtn}
          onPress={handleSell}
          disabled={selling}
          activeOpacity={0.8}
        >
          {selling ? (
            <ActivityIndicator size="small" color={Colors.red} />
          ) : (
            <Ionicons name="storefront-outline" size={13} color={Colors.red} />
          )}
          <Text style={s.sellHubTxt}>
            {selling
              ? "Selling..."
              : `Sell Hub · ${fmtCash(Math.round(hubPurchaseCost(airport) * 0.5))} refund`}
          </Text>
        </TouchableOpacity>
      )}

      {/* ══ BUY HUB ══ */}
      {!isOwned && (
        <View style={s.buySection}>
          <View style={s.costRow}>
            <View>
              <Text style={s.metaLbl}>HUB COST</Text>
              <Text
                style={[
                  s.bigMoney,
                  { color: canAfford ? Colors.green : Colors.red },
                ]}
              >
                {fmtCash(cost)}
              </Text>
              {!canAfford && (
                <Text style={s.shortfall}>
                  Need {fmtCash(cost - cash)} more
                </Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.metaLbl}>YOUR CASH</Text>
              <Text style={[s.bigMoney, { color: Colors.text }]}>
                {fmtCash(cash)}
              </Text>
            </View>
          </View>
          {buyError && (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={13} color={Colors.red} />
              <Text style={s.errorText}>{buyError}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              s.buyBtn,
              { backgroundColor: canAfford ? color : "rgba(255,255,255,.05)" },
              (!canAfford || buying) && { opacity: 0.5 },
            ]}
            onPress={handleBuy}
            disabled={buying || !canAfford}
            activeOpacity={0.85}
          >
            {buying ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <>
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={canAfford ? Colors.bg : Colors.dim}
                />
                <Text
                  style={[
                    s.buyText,
                    { color: canAfford ? Colors.bg : Colors.dim },
                  ]}
                >
                  {canAfford
                    ? `Buy Hub — ${fmtCash(cost)}`
                    : "Insufficient Funds"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ══ HUB STATS (owned) ══ */}
      {isOwned && hub && (
        <>
          <View style={s.statsRow}>
            {[
              {
                val:
                  totalPaxToday > 0
                    ? totalPaxToday.toLocaleString()
                    : hubDemands.length.toString(),
                lbl: totalPaxToday > 0 ? "Pax Today" : "Demands",
                col: totalPaxToday > 0 ? Colors.green : Colors.text,
              },
              { val: servedCount.toString(), lbl: "Served", col: Colors.green },
              {
                val: pendingCount.toString(),
                lbl: "Pending",
                col: pendingCount > 0 ? Colors.amber : Colors.muted,
              },
            ].map(({ val, lbl, col }) => (
              <View key={lbl} style={s.statBox}>
                <Text style={[s.statVal, { color: col }]}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
          {allServed && (
            <View style={s.allServedBanner}>
              <MaterialCommunityIcons
                name="check-all"
                size={13}
                color={Colors.green}
              />
              <Text style={s.allServedText}>
                All demands served — new route unlocks each day
              </Text>
            </View>
          )}
        </>
      )}

      <View style={s.divider} />

      {/* ══ OVERCROWDING STATUS (owned + not normal) ══ */}
      {crowding &&
        crowding.level !== "normal" &&
        (() => {
          const cfg =
            {
              busy: {
                color: "#f59e0b",
                bg: "rgba(245,158,11,0.08)",
                border: "rgba(245,158,11,0.3)",
                icon: "alert" as const,
                label: "Getting Busy",
              },
              overcrowded: {
                color: "#f97316",
                bg: "rgba(249,115,22,0.08)",
                border: "rgba(249,115,22,0.3)",
                icon: "alert-circle" as const,
                label: "Overcrowded",
              },
              crisis: {
                color: "#ef4444",
                bg: "rgba(239,68,68,0.08)",
                border: "rgba(239,68,68,0.3)",
                icon: "warning" as const,
                label: "Crisis",
              },
            }[crowding.level] ?? null;
          if (!cfg) return null;

          const consequence =
            crowding.level === "crisis"
              ? "Trust −0.8/day · Revenue −20%"
              : crowding.level === "overcrowded"
                ? "Trust −0.3/day · Revenue −10%"
                : "Trust growth paused";

          return (
            <View
              style={[
                s.crowdingBanner,
                { backgroundColor: cfg.bg, borderColor: cfg.border },
              ]}
            >
              <Ionicons name={cfg.icon} size={18} color={cfg.color} />
              <View style={s.crowdingBody}>
                <View style={s.crowdingTop}>
                  <Text style={[s.crowdingLabel, { color: cfg.color }]}>
                    {cfg.label}
                  </Text>
                  <Text style={s.crowdingCap}>
                    {crowding.capacityPct}% capacity
                  </Text>
                </View>
                <Text style={s.crowdingPax}>
                  {crowding.waitingPax.toLocaleString()} passengers waiting for
                  routes that don&apos;t exist
                </Text>
                <Text style={[s.crowdingConsequence, { color: cfg.color }]}>
                  {consequence}
                </Text>
                <View style={s.crowdingBar}>
                  <View
                    style={[
                      s.crowdingBarFill,
                      {
                        width: `${Math.min(100, crowding.capacityPct)}%` as any,
                        backgroundColor: cfg.color,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })()}

      {/* ══ DEPARTURES BOARD ══ */}
      <View style={s.sectionHeader}>
        <View style={s.sectionTitleRow}>
          <Ionicons name="airplane" size={13} color={color} />
          <Text style={s.eyebrow}>DEPARTURES</Text>
        </View>
        {isOwned && pendingCount > 0 && (
          <View style={s.waitingBadge}>
            <Text style={s.waitingBadgeTxt}>{pendingCount} waiting</Text>
          </View>
        )}
      </View>

      {departures.length === 0 ? (
        <View style={s.emptyBoard}>
          <Text style={s.emptyTxt}>No routes yet</Text>
        </View>
      ) : (
        departures.map(({ demand, route }, i) => (
          <DepartureRow
            key={(demand as any).id ?? `preview-${i}`}
            demand={demand}
            route={route}
            hub={hub!}
            color={color}
            day={day}
            onCreateRoute={handleCreateRoute}
            maxPlaneRange={maxPlaneRange}
          />
        ))
      )}

      {/* ══ ARRIVALS BOARD ══ */}
      {arrivals.length > 0 && (
        <>
          <View style={[s.sectionHeader, { marginTop: Spacing.md }]}>
            <View style={s.sectionTitleRow}>
              <Ionicons name="airplane-outline" size={13} color={Colors.dim} />
              <Text style={s.eyebrow}>ARRIVALS</Text>
            </View>
          </View>
          {arrivals.map((route) => (
            <ArrivalRow key={route.id} route={route} color={color} />
          ))}
        </>
      )}

      <View style={{ height: 50 }} />
    </BottomSheetScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerLeft: { flexDirection: "row", gap: Spacing.sm, flex: 1, minWidth: 0 },
  flag: { fontSize: 36, lineHeight: 44 },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  closeBtn: { padding: 4, marginTop: 2 },
  iataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  iata: {
    fontSize: 28,
    color: Colors.text,
    fontWeight: "700",
    letterSpacing: 1,
  },
  tierPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tierText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  paxNote: { fontSize: 9, color: Colors.dim },
  ownedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  ownedPillText: { fontSize: 9, fontWeight: "700" },
  name: { fontSize: 13, color: Colors.text, fontWeight: "500" },
  location: { fontSize: 10, color: Colors.dim, lineHeight: 15 },
  trustWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },
  trustTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  trustFill: { height: "100%", borderRadius: 2 },
  trustLabel: { fontSize: 9, color: Colors.dim, flexShrink: 0 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },

  buySection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  metaLbl: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bigMoney: { fontSize: 24, fontWeight: "700", letterSpacing: 0.3 },
  shortfall: { fontSize: 10, color: Colors.red, marginTop: 2 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(248,113,113,.08)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.25)",
    padding: Spacing.sm,
  },
  errorText: { fontSize: 11, color: Colors.red, flex: 1 },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH + 4,
  },
  buyText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  statVal: { fontSize: 22, fontWeight: "700", marginBottom: 2 },
  statLbl: { fontSize: 8, color: Colors.dim, letterSpacing: 0.8 },
  allServedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(74,222,128,.08)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,.22)",
    padding: Spacing.sm,
  },
  allServedText: { fontSize: 11, color: Colors.green, flex: 1 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { fontSize: 9, color: Colors.dim, letterSpacing: 2.5 },
  waitingBadge: {
    backgroundColor: Colors.red + "18",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.red + "44",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  waitingBadgeTxt: { fontSize: 9, color: Colors.red, fontWeight: "700" },

  emptyBoard: { padding: Spacing.xl, alignItems: "center" },
  emptyTxt: { fontSize: 12, color: Colors.dim },

  // Overcrowding banner
  crowdingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  crowdingBody: { flex: 1, gap: 4 },
  crowdingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  crowdingLabel: { fontSize: 13, fontWeight: "700" },
  crowdingCap: { fontSize: 10, color: Colors.dim },
  crowdingPax: { fontSize: 11, color: Colors.muted, lineHeight: 16 },
  crowdingConsequence: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  crowdingBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  crowdingBarFill: { height: "100%", borderRadius: 2 },
  sellHubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "44",
    backgroundColor: Colors.red + "0a",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: "flex-start",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sellHubTxt: { fontSize: 11, color: Colors.red, fontWeight: "600" },
  refreshDemandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.sky + "0a",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  refreshDemandBody: { flex: 1 },
  refreshDemandTxt: { fontSize: 12, color: Colors.sky, fontWeight: "600" },
  refreshDemandCost: { fontSize: 9, color: Colors.dim },
  refreshError: {
    fontSize: 10,
    color: Colors.red,
    paddingHorizontal: Spacing.lg,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
