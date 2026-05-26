import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  HUB_UPGRADE_COSTS,
  useBuyHub,
  useSellHub,
  useUpdateHubNickname,
  useUpgradeHub,
} from "@/hooks/useSupabaseWrite";
import { buildAIRoutes } from "@/lib/AIAirline";
import {
  CASH_RESERVE_AFTER_BUY,
  HUB_TIER_CONFIG,
  generateDemands,
  hubCrowdingLevel,
  hubPurchaseCost,
  maxRoutesForTier,
  presenceThreshold,
} from "@/lib/demands";
import { congestionPenaltyPct } from "@/lib/hubCongestion";
import { waitingPaxForDemand } from "@/lib/passengerFlow";
import { fmtCash } from "@/lib/revenue";
import { getSeasonForRoute } from "@/lib/seasons";
import type { Airport, Demand, OwnedHub, Route } from "@/store";
import {
  useAIAirlines,
  useAirline,
  useAirportPresence,
  useCash,
  useDayProgress,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRouteEarnings,
  useRoutes,
  useSelectedAirport,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CountryFlag from "react-native-country-flag";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const CROWDING_CFG = {
  busy: {
    color: Colors.amber,
    bg: Colors.amber + "10",
    border: Colors.amber + "33",
    icon: "alert-circle-outline" as const,
    label: "Getting Busy",
    note: "Trust growth slowed",
  },
  overcrowded: {
    color: Colors.orange,
    bg: Colors.orange + "10",
    border: Colors.orange + "33",
    icon: "warning-outline" as const,
    label: "Overcrowded",
    note: "Trust −1/day · Revenue −10%",
  },
  crisis: {
    color: Colors.red,
    bg: Colors.red + "10",
    border: Colors.red + "33",
    icon: "skull-outline" as const,
    label: "Capacity Crisis",
    note: "Trust −3/day · Revenue −20%",
  },
} as const;

// ─────────────────────────────────────────────────────────────────
// PREVIEW DEMANDS (unowned airports)
// ─────────────────────────────────────────────────────────────────

function usePreviewDemands(airport: Airport | null, allAirports: Airport[]) {
  return useMemo(() => {
    if (!airport) return [];
    return generateDemands(
      airport,
      allAirports,
      maxRoutesForTier(1),
      [],
      0,
      true,
    );
  }, [airport?.iata]);
}

// ─────────────────────────────────────────────────────────────────
// TRUST BAR
// ─────────────────────────────────────────────────────────────────

function TrustBar({
  trust,
  floor,
  color,
}: {
  trust: number;
  floor: number;
  color: string;
}) {
  const pct = Math.round(trust);
  const trustColor =
    pct >= 70 ? Colors.green : pct >= 45 ? Colors.amber : Colors.red;

  return (
    <View style={tb.wrap}>
      <View style={tb.labelRow}>
        <Text style={tb.label}>TRUST</Text>
        <Text style={[tb.value, { color: trustColor }]}>{pct}%</Text>
      </View>
      <View style={tb.track}>
        <View
          style={[tb.fill, { width: `${pct}%`, backgroundColor: trustColor }]}
        />
        {floor > 0 && <View style={[tb.floorMark, { left: `${floor}%` }]} />}
      </View>
      <View style={tb.floorRow}>
        {floor > 0 && <Text style={tb.floorLabel}>Floor {floor}%</Text>}
        <Text style={[tb.floorLabel, { marginLeft: "auto" }]}>100%</Text>
      </View>
    </View>
  );
}

const tb = StyleSheet.create({
  wrap: { gap: 4 },
  labelRow: { flexDirection: "row", justifyContent: "space-between" },
  label: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  value: { fontSize: 10, fontWeight: "900" },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "visible",
    position: "relative",
  },
  fill: { height: "100%", borderRadius: Radius.full },
  floorMark: {
    position: "absolute",
    top: -2,
    width: 1.5,
    height: 10,
    backgroundColor: Colors.dim,
    opacity: 0.6,
  },
  floorRow: { flexDirection: "row" },
  floorLabel: { fontSize: 8, color: Colors.dim, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// CONGESTION BANNER — compact, max 2 suggestions, no unbounded growth
// ─────────────────────────────────────────────────────────────────

function CongestionBanner({
  crowding,
  hubDemands,
  routes,
  ownedPlanes,
  color,
  onCreateRoute,
}: {
  crowding: NonNullable<ReturnType<typeof hubCrowdingLevel>>;
  hubDemands: Demand[];
  routes: Route[];
  ownedPlanes: ReturnType<typeof useOwnedPlanes>;
  color: string;
  onCreateRoute: (d: Demand) => void;
}) {
  if (crowding.level === "normal") return null;
  const cfg = CROWDING_CFG[crowding.level];
  if (!cfg) return null;

  // Build max 2 suggestions
  const idlePlanes = ownedPlanes.filter((p) => !p.route_id);
  const unserved = hubDemands.filter(
    (d) => !routes.some((r) => r.active && r.demand.id === d.id),
  );
  const undersized = hubDemands
    .filter((d) => routes.some((r) => r.active && r.demand.id === d.id))
    .map((d) => {
      const cap = routes
        .filter((r) => r.active && r.demand.id === d.id)
        .reduce((sum, r) => sum + r.plane.plane_model.pax_capacity, 0);
      return { demand: d, gap: d.base_pax_day - cap };
    })
    .filter((x) => x.gap > 30);

  const suggestions: {
    icon: string;
    text: string;
    cta?: string;
    demand?: Demand;
  }[] = [];

  if (unserved.length > 0 && idlePlanes.length > 0) {
    const d = unserved[0];
    suggestions.push({
      icon: "airplane-outline",
      text: `${idlePlanes.length} idle plane${idlePlanes.length > 1 ? "s" : ""} — assign to ${d.dest.iata}`,
      cta: "Assign",
      demand: d,
    });
  } else if (unserved.length > 0) {
    suggestions.push({
      icon: "cart-outline",
      text: `${unserved.length} route${unserved.length > 1 ? "s" : ""} unserved — buy a plane`,
    });
  }

  if (undersized.length > 0 && suggestions.length < 2) {
    const worst = undersized.sort((a, b) => b.gap - a.gap)[0];
    suggestions.push({
      icon: "people-outline",
      text: `${worst.demand.dest.iata} needs ${worst.gap} more seats/day`,
      cta: idlePlanes.length > 0 ? "Add plane" : undefined,
      demand: idlePlanes.length > 0 ? worst.demand : undefined,
    });
  }

  const penaltyPct = congestionPenaltyPct(crowding.level);

  return (
    <View
      style={[
        cb.wrap,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          borderLeftColor: cfg.color,
        },
      ]}
    >
      {/* Top row: icon + title + capacity */}
      <View style={cb.topRow}>
        <Ionicons name={cfg.icon} size={15} color={cfg.color} />
        <Text style={[cb.title, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={cb.cap}>{crowding.capacityPct}% capacity</Text>
      </View>

      {/* Penalties as chips — compact, no multi-line block */}
      <View style={cb.chips}>
        {cfg.note.split(" · ").map((chip) => (
          <View
            key={chip}
            style={[cb.chip, { backgroundColor: cfg.color + "18" }]}
          >
            <Text style={[cb.chipTxt, { color: cfg.color }]}>{chip}</Text>
          </View>
        ))}
        {penaltyPct > 0 && (
          <View style={[cb.chip, { backgroundColor: cfg.color + "18" }]}>
            <Text style={[cb.chipTxt, { color: cfg.color }]}>
              Efficiency −{penaltyPct}%
            </Text>
          </View>
        )}
      </View>

      {/* Waiting pax */}
      <Text style={cb.waiting}>
        {crowding.waitingPax.toLocaleString()} passengers waiting for more
        routes
      </Text>

      {/* Suggestions — capped at 2, compact */}
      {suggestions.length > 0 && (
        <View style={cb.suggestions}>
          <Text style={cb.sugHeading}>WHAT TO DO</Text>
          {suggestions.map((sug, i) => (
            <View key={i} style={cb.sugRow}>
              <View style={[cb.sugIcon, { backgroundColor: cfg.color + "18" }]}>
                <Ionicons name={sug.icon as any} size={11} color={cfg.color} />
              </View>
              <Text style={cb.sugText} numberOfLines={2}>
                {sug.text}
              </Text>
              {sug.cta && sug.demand && (
                <TouchableOpacity
                  style={[cb.sugCta, { borderColor: cfg.color + "55" }]}
                  onPress={() => onCreateRoute(sug.demand!)}
                  activeOpacity={0.8}
                >
                  <Text style={[cb.sugCtaTxt, { color: cfg.color }]}>
                    {sug.cta}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const cb = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: Spacing.md,
    gap: 7,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 13, fontWeight: "900", flex: 1 },
  cap: { fontSize: 10, color: Colors.dim, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  chipTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  waiting: { fontSize: 11, color: Colors.muted, lineHeight: 15 },
  suggestions: { gap: 5, marginTop: 2 },
  sugHeading: {
    fontSize: 8,
    fontWeight: "900",
    color: Colors.dim,
    letterSpacing: 1.5,
  },
  sugRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sugIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sugText: { flex: 1, fontSize: 10, color: Colors.muted, lineHeight: 14 },
  sugCta: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  sugCtaTxt: { fontSize: 9, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// DEPARTURE ROW
// ─────────────────────────────────────────────────────────────────

function DepartureRow({
  demand,
  routes,
  hub,
  color,
  dayProgress,
  onCreateRoute,
  maxPlaneRange,
  day,
  routeEarnings,
}: {
  demand: Demand;
  routes: Route[];
  hub: OwnedHub | undefined;
  color: string;
  dayProgress: number;
  onCreateRoute: (d: Demand) => void;
  maxPlaneRange: number;
  day: number;
  routeEarnings: Record<string, number>;
}) {
  const activeRoutes = routes.filter(
    (r) => r.active && r.demand.id === demand.id,
  );
  const isServed = activeRoutes.length > 0;
  const firstRoute = activeRoutes[0] ?? null;
  const noPlaneInRange = !isServed && demand.dist_nm > maxPlaneRange;

  const paxToday = demand.delivered_pax_today ?? 0;
  const waitingPax = waitingPaxForDemand(demand, dayProgress);
  const fillPct =
    demand.base_pax_day > 0
      ? Math.min(100, Math.round((paxToday / demand.base_pax_day) * 100))
      : 0;

  const barColor =
    fillPct >= 80 ? Colors.green : fillPct > 0 ? Colors.amber : Colors.red;

  const revenue = activeRoutes.reduce(
    (sum, r) => sum + (routeEarnings[r.id] ?? 0),
    0,
  );

  const planeLabel =
    activeRoutes.length > 1
      ? `${activeRoutes.length} aircraft`
      : firstRoute?.plane.plane_model.nickname;

  const season = getSeasonForRoute(
    day,
    demand.dest?.country,
    demand.dest?.continent,
  );

  // Urgency: overloaded first, then active, then unserved ready, then out of range
  const isOverloaded = isServed && waitingPax > 100;

  return (
    <View style={[dep.row, isOverloaded && dep.rowUrgent]}>
      <View
        style={[
          dep.stripe,
          { backgroundColor: isServed ? color : Colors.red + "88" },
        ]}
      />
      <View style={dep.body}>
        {/* Line 1: destination + pax or status */}
        <View style={dep.top}>
          <View style={dep.dest}>
            <CountryFlag isoCode={demand.dest.country} size={17} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={dep.iata}>{demand.dest.iata}</Text>
                {season && (
                  <View
                    style={[
                      dep.seasonBadge,
                      { backgroundColor: season.color + "18" },
                    ]}
                  >
                    <Ionicons
                      name={season.icon as any}
                      size={8}
                      color={season.color}
                    />
                    <Text style={[dep.seasonTxt, { color: season.color }]}>
                      {season.pctLabel}
                    </Text>
                  </View>
                )}
                {/* Overloaded pill inline — eye catches it immediately */}
                {isOverloaded && (
                  <View style={dep.overloadedPill}>
                    <Text style={dep.overloadedTxt}>OVERLOADED</Text>
                  </View>
                )}
              </View>
              <Text style={dep.city} numberOfLines={1}>
                {demand.dest.city || demand.dest.name}
              </Text>
            </View>
          </View>

          <View style={dep.right}>
            {isServed ? (
              <>
                <Text
                  style={[
                    dep.pax,
                    { color: paxToday > 0 ? Colors.green : Colors.dim },
                  ]}
                >
                  {paxToday.toLocaleString()}
                </Text>
                <Text style={dep.small}>
                  /{demand.base_pax_day.toLocaleString()} pax
                </Text>
              </>
            ) : (
              <>
                {(() => {
                  const ceiling = demand.pax_ceiling ?? demand.base_pax_day;
                  const ratio = ceiling > 0 ? demand.base_pax_day / ceiling : 1;
                  const label = !hub
                    ? "~" + demand.base_pax_day.toLocaleString()
                    : ratio >= 0.7
                      ? "READY"
                      : ratio >= 0.3
                        ? "LOSING INTEREST"
                        : "ALMOST GONE";
                  const labelColor = !hub
                    ? Colors.dim
                    : ratio >= 0.7
                      ? Colors.amber
                      : ratio >= 0.3
                        ? Colors.orange
                        : Colors.red;
                  return (
                    <>
                      <Text style={[dep.waiting, { color: labelColor }]}>
                        {label}
                      </Text>
                      <Text style={dep.small}>
                        {hub
                          ? `${demand.base_pax_day.toLocaleString()} · ${ceiling.toLocaleString()} potential`
                          : "pax/day"}
                      </Text>
                    </>
                  );
                })()}
              </>
            )}
          </View>
        </View>

        {/* Line 2: progress bar + revenue */}
        {isServed && (
          <View style={dep.progressRow}>
            <View style={dep.track}>
              <View
                style={[
                  dep.fill,
                  { width: `${fillPct}%`, backgroundColor: barColor },
                ]}
              />
            </View>
            <Text style={[dep.percent, { color: barColor }]}>{fillPct}%</Text>
            <Text
              style={[
                dep.revenue,
                {
                  color:
                    revenue === 0
                      ? Colors.dim
                      : revenue > 0
                        ? Colors.green
                        : Colors.red,
                },
              ]}
            >
              {revenue === 0 ? "—" : fmtCash(revenue)}
            </Text>
          </View>
        )}

        {/* Line 3: meta or action */}
        {isServed ? (
          <Text style={dep.meta} numberOfLines={1}>
            {planeLabel}
            {firstRoute?.via_iata ? ` via ${firstRoute.via_iata}` : ""}
            {waitingPax > 0 ? ` · ${waitingPax.toLocaleString()} waiting` : ""}
          </Text>
        ) : hub ? (
          <View style={dep.actionRow}>
            <TouchableOpacity
              style={[
                dep.createBtn,
                { borderColor: color + "55", backgroundColor: color + "10" },
              ]}
              onPress={() => onCreateRoute(demand)}
              activeOpacity={0.84}
              disabled={noPlaneInRange}
            >
              <Ionicons
                name="git-branch-outline"
                size={12}
                color={noPlaneInRange ? Colors.dim : color}
              />
              <Text
                style={[
                  dep.createTxt,
                  { color: noPlaneInRange ? Colors.dim : color },
                ]}
              >
                {noPlaneInRange ? "Out of range" : "Create Route"}
              </Text>
            </TouchableOpacity>
            {noPlaneInRange && (
              <Text style={dep.rangeHint} numberOfLines={1}>
                Try a stop · {demand.dist_nm.toLocaleString()}nm
              </Text>
            )}
          </View>
        ) : null}
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
  // Overloaded rows get a very subtle tint so they stand out in the list
  rowUrgent: { backgroundColor: Colors.red + "06" },
  stripe: { width: 3, alignSelf: "stretch" },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 7,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  dest: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  iata: {
    fontSize: 15,
    color: Colors.sky,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  city: { fontSize: 10, color: Colors.dim, marginTop: 1 },
  right: { alignItems: "flex-end", minWidth: 76 },
  pax: { fontSize: 15, fontWeight: "900" },
  small: { fontSize: 9, color: Colors.dim, marginTop: 1 },
  waiting: {
    fontSize: 9,
    color: Colors.red,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  overloadedPill: {
    backgroundColor: Colors.red + "20",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  overloadedTxt: {
    fontSize: 7,
    color: Colors.red,
    fontWeight: "900",
    letterSpacing: 1,
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: Radius.full },
  percent: {
    minWidth: 32,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "900",
  },
  revenue: {
    minWidth: 58,
    textAlign: "right",
    fontSize: 10,
    color: Colors.green,
    fontWeight: "900",
  },
  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  seasonTxt: { fontSize: 8, fontWeight: "800" },
  meta: { fontSize: 10, color: Colors.dim, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  createTxt: { fontSize: 11, fontWeight: "900" },
  rangeHint: { flex: 1, fontSize: 9, color: Colors.purple, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// ARRIVALS SUMMARY
// ─────────────────────────────────────────────────────────────────

function ArrivalsSummary({
  playerArrivals,
  connectingRoutes,
  aiArrivals,
  demands,
  color,
  dayProgress,
}: {
  playerArrivals: Route[];
  connectingRoutes: Route[];
  aiArrivals: {
    iata: string;
    city: string;
    country: string;
    airlineName: string;
    aiColor: string;
  }[];
  demands: Demand[];
  color: string;
  dayProgress: number;
}) {
  const playerGrouped = useMemo(() => {
    const map = new Map<
      string,
      { iata: string; city: string; country: string; paxToday: number }
    >();
    playerArrivals.forEach((route) => {
      const demand =
        demands.find((d) => d.id === route.demand.id) ?? route.demand;
      const key = demand.origin.iata;
      const fullPax = demand.delivered_pax_today ?? 0;

      // For connecting routes, some passengers already got off at the via stop.
      // Only count the through-passengers who actually arrive at this airport.
      // via_pax_ratio is the fraction that deboard at the stopover, so the
      // remainder (1 - via_pax_ratio) continues to the final destination.
      const paxToday =
        route.via_iata && (route.via_pax_ratio ?? 0) > 0
          ? Math.round(fullPax * (1 - route.via_pax_ratio!))
          : fullPax;

      if (paxToday <= 0) return;

      if (map.has(key)) {
        map.get(key)!.paxToday += paxToday;
      } else {
        map.set(key, {
          iata: demand.origin.iata,
          city: demand.origin.city,
          country: demand.origin.country,
          paxToday,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.paxToday - a.paxToday);
  }, [playerArrivals, demands]);

  const connectingGrouped = useMemo(() => {
    const map = new Map<
      string,
      { iata: string; city: string; country: string; dropoffPax: number }
    >();
    connectingRoutes.forEach((route) => {
      const demand =
        demands.find((d) => d.id === route.demand.id) ?? route.demand;
      const paxToday = demand.delivered_pax_today ?? 0;
      const dropoff = Math.round(paxToday * (route.via_pax_ratio ?? 0));
      if (dropoff <= 0) return;
      const key = demand.origin.iata;
      if (map.has(key)) {
        map.get(key)!.dropoffPax += dropoff;
      } else {
        map.set(key, {
          iata: demand.origin.iata,
          city: demand.origin.city,
          country: demand.origin.country,
          dropoffPax: dropoff,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.dropoffPax - a.dropoffPax);
  }, [connectingRoutes, demands]);

  // Total pax arrived today for section header badge
  const totalArrived =
    playerGrouped.reduce((s, g) => s + g.paxToday, 0) +
    connectingGrouped.reduce((s, g) => s + g.dropoffPax, 0);

  const hasAny =
    playerGrouped.length > 0 ||
    connectingGrouped.length > 0 ||
    aiArrivals.length > 0;

  if (!hasAny) {
    return (
      <View style={arr.empty}>
        <Ionicons
          name="airplane-outline"
          size={22}
          color={Colors.dim}
          style={{ marginBottom: 6 }}
        />
        <Text style={arr.emptyTxt}>No flights arriving here yet</Text>
        <Text style={arr.emptySub}>
          Arrivals appear once inbound routes are active
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* Arrived-today total — gives the section meaning */}
      {totalArrived > 0 && (
        <View style={arr.totalRow}>
          <Text style={arr.totalTxt}>
            {totalArrived.toLocaleString()} pax arrived today
          </Text>
        </View>
      )}

      {playerGrouped.map((g) => (
        <View key={`player-${g.iata}`} style={arr.row}>
          <View style={[arr.dot, { backgroundColor: color }]} />
          <View style={arr.info}>
            <CountryFlag isoCode={g.country} size={13} />
            <Text style={arr.origin} numberOfLines={1}>
              {g.iata} · {g.city}
            </Text>
          </View>
          <Text style={arr.pax}>{g.paxToday.toLocaleString()} arrived</Text>
        </View>
      ))}

      {connectingGrouped.map((g) => (
        <View key={`via-${g.iata}`} style={arr.row}>
          <View style={[arr.dot, { backgroundColor: color, opacity: 0.5 }]} />
          <View style={arr.info}>
            <CountryFlag isoCode={g.country} size={13} />
            <Text style={arr.origin} numberOfLines={1}>
              {g.iata} · {g.city}
            </Text>
            <View style={arr.badge}>
              <Text style={arr.badgeTxt}>stopover</Text>
            </View>
          </View>
          <Text style={arr.pax}>
            {g.dropoffPax.toLocaleString()} dropped off
          </Text>
        </View>
      ))}

      {aiArrivals.map((g) => (
        <View key={`ai-${g.iata}-${g.airlineName}`} style={arr.row}>
          <View
            style={[arr.dot, { backgroundColor: g.aiColor, opacity: 0.6 }]}
          />
          <View style={arr.info}>
            <CountryFlag isoCode={g.country} size={13} />
            <Text style={arr.origin} numberOfLines={1}>
              {g.iata} · {g.city}
            </Text>
            <View style={[arr.badge, { backgroundColor: g.aiColor + "18" }]}>
              <Text style={[arr.badgeTxt, { color: g.aiColor }]}>
                {g.airlineName}
              </Text>
            </View>
          </View>
          <Text style={[arr.pax, { color: Colors.dim }]}>rival</Text>
        </View>
      ))}
    </>
  );
}

const arr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs ?? 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  info: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  origin: { fontSize: 12, color: Colors.text, fontWeight: "600" },
  pax: { fontSize: 11, color: Colors.muted, fontWeight: "600", flexShrink: 0 },
  badge: {
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeTxt: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  totalRow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs ?? 4,
    paddingVertical: Spacing.xs ?? 4,
  },
  totalTxt: { fontSize: 11, color: Colors.muted, fontWeight: "700" },
  empty: { padding: Spacing.xl, alignItems: "center", gap: 2 },
  emptyTxt: { fontSize: 13, color: Colors.dim, fontWeight: "700" },
  emptySub: {
    fontSize: 11,
    color: Colors.dim,
    opacity: 0.6,
    marginTop: 3,
    textAlign: "center",
  },
});

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function AirportSheet() {
  const airport = useSelectedAirport();
  const hubs = useHubs();
  const demands = useGameStore((s) => s.demands);
  const routes = useRoutes();
  const dayProgress = useDayProgress();
  const airline = useAirline();
  const cash = useCash();
  const airports = useGameStore((s) => s.airports);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const day = useGameStore((s) => s.airline?.day ?? 1);
  const ownedPlanes = useOwnedPlanes();
  const aiAirlines = useAIAirlines();
  const routeEarnings = useRouteEarnings();

  const tabBarH = useTabBarHeight();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const buyHub = useBuyHub();
  const sellHub = useSellHub();
  const upgradeHub = useUpgradeHub();
  const updateHubNickname = useUpdateHubNickname();
  const gameAlert = useGameAlert();

  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  const previewDemands = usePreviewDemands(airport, airports);
  const color = airline?.color ?? Colors.sky;

  const hub = airport
    ? hubs.find((h) => h.airport.iata === airport.iata)
    : undefined;
  const isOwned = !!hub;

  const hubDemands = useMemo(
    () => (airport ? demands.filter((d) => d.hub_iata === airport.iata) : []),
    [airport, demands],
  );

  const maxPlaneRange =
    ownedPlanes.length > 0
      ? ownedPlanes.reduce((max, p) => Math.max(max, p.plane_model.range_nm), 0)
      : 0;

  const crowding = isOwned
    ? hubCrowdingLevel(airport!.iata, demands, airport!)
    : null;

  const outboundWaiting = isOwned
    ? hubDemands.reduce(
        (sum, d) => sum + waitingPaxForDemand(d, dayProgress),
        0,
      )
    : 0;

  // Sort departures: overloaded first → active → unserved → out of range
  const departures = useMemo(() => {
    const base = isOwned ? hubDemands : (previewDemands as Demand[]);
    const withRoutes = base.map((demand, index) => ({
      demand,
      routes: routes.filter((r) => r.active && r.demand.id === demand.id),
      key: demand.id ?? `preview-${index}`,
    }));
    return withRoutes.sort((a, b) => {
      const urgency = (item: typeof a) => {
        const served = item.routes.length > 0;
        if (!served) return demand_out_of_range(item.demand) ? 3 : 2;
        const waiting = waitingPaxForDemand(item.demand, dayProgress);
        return waiting > 100 ? 0 : 1;
      };
      return urgency(a) - urgency(b);
    });
  }, [isOwned, hubDemands, previewDemands, routes, dayProgress]);

  function demand_out_of_range(d: Demand) {
    return d.dist_nm > maxPlaneRange;
  }

  // Used-slots count for stat row
  const usedSlots = hubDemands.filter((d) =>
    routes.some((r) => r.active && r.demand.id === d.id),
  ).length;
  const totalSlots =
    (hub?.tier != null ? HUB_TIER_CONFIG[hub.tier]?.routes : undefined) ?? "?";

  const playerArrivals = useMemo(
    () =>
      routes.filter(
        (r) =>
          r.active &&
          r.demand.dest.iata === airport?.iata &&
          r.hub_iata !== airport?.iata,
      ),
    [routes, airport?.iata],
  );

  const connectingRoutes = useMemo(
    () =>
      routes.filter(
        (r) =>
          r.active &&
          r.via_iata === airport?.iata &&
          (r.via_pax_ratio ?? 0) > 0,
      ),
    [routes, airport?.iata],
  );

  const aiArrivals = useMemo(() => {
    if (!airport) return [];
    const seen = new Set<string>();
    const result: {
      iata: string;
      city: string;
      country: string;
      airlineName: string;
      aiColor: string;
    }[] = [];
    aiAirlines.forEach((ai) => {
      buildAIRoutes(ai, airports).forEach((r) => {
        if (r.dest.iata !== airport.iata) return;
        const key = `${r.origin.iata}-${ai.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({
          iata: r.origin.iata,
          city: r.origin.city,
          country: r.origin.country,
          airlineName: ai.name,
          aiColor: ai.color,
        });
      });
    });
    return result;
  }, [aiAirlines, airports, airport?.iata]);

  if (!airport) return null;

  const cost = hubPurchaseCost(airport);
  const isFirstHub = hubs.length === 0;
  const aiHubCount = aiAirlines.filter((ai) =>
    ai.hubIatas.includes(airport.iata),
  ).length;
  const paxNeeded = presenceThreshold(airport, aiHubCount);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const paxDelivered = useAirportPresence(airport.iata);
  const presenceReady = isFirstHub || paxDelivered >= paxNeeded;
  const paxRemaining = Math.max(0, paxNeeded - paxDelivered);
  const presencePct = isFirstHub
    ? 1
    : paxNeeded > 0
      ? Math.min(1, paxDelivered / paxNeeded)
      : 1;

  const canAfford = isFirstHub
    ? cash >= cost
    : cash >= cost + CASH_RESERVE_AFTER_BUY;
  const canBuy = presenceReady && canAfford;

  const tierNum = (hub?.tier ?? 1) as number;
  const tierCfg = HUB_TIER_CONFIG[tierNum];
  const nextTierCfg = HUB_TIER_CONFIG[tierNum + 1];
  const isMaxTier = tierNum >= 6;
  const trustPct = Math.round(hub?.trust ?? 0);
  const hubPax = hub?.hub_pax ?? 0;
  const trustNeeded = tierCfg?.upgradeTrust ?? 100;
  const paxNeededForUpgrade = tierCfg?.upgradePax ?? 999_999;
  const upgradeCost = HUB_UPGRADE_COSTS[tierNum] ?? 999_999;
  const trustReady = trustPct >= trustNeeded;
  const paxReady = hubPax >= paxNeededForUpgrade;
  const cashReady = cash >= upgradeCost;
  const upgradeReady =
    isOwned && !isMaxTier && trustReady && paxReady && cashReady;

  const handleBuy = async () => {
    haptics.confirm();
    setBuying(true);
    setBuyError(null);
    const { error } = await buyHub(airport, previewDemands as any);
    setBuying(false);
    if (error) {
      setBuyError(error);
      haptics.error();
      return;
    }
    haptics.success();
    sounds.hubBuy();
  };

  const handleUpgrade = () => {
    if (!hub) return;
    gameAlert.show({
      icon: "arrow-up-circle-outline",
      title: `Upgrade to Tier ${tierNum + 1}`,
      message:
        `Upgrade ${hub.airport.iata} to Tier ${tierNum + 1} for ${fmtCash(upgradeCost)}?\n\n` +
        `• Route slots: ${tierCfg?.routes} → ${nextTierCfg?.routes ?? "?"}\n` +
        `• Trust floor rises to ${nextTierCfg?.trustFloor ?? 0}%\n` +
        `• Days-owned counter resets to 0`,
      buttons: [
        { label: "Cancel", style: "cancel" },
        {
          label: `Upgrade · ${fmtCash(upgradeCost)}`,
          style: "default",
          onPress: async () => {
            haptics.confirm();
            setUpgrading(true);
            setUpgradeError(null);
            const { error } = await upgradeHub(hub.id);
            setUpgrading(false);
            if (error) {
              setUpgradeError(error);
              haptics.error();
            } else {
              haptics.success();
            }
          },
        },
      ],
    });
  };

  const handleSell = () => {
    if (!hub) return;
    const hubRouteCount = routes.filter(
      (r) => r.hub_iata === airport.iata && r.active,
    ).length;
    const refund = Math.round(hubPurchaseCost(airport) * 0.5);
    gameAlert.show({
      icon: "storefront-outline",
      title: "Sell Hub",
      message:
        `Sell ${airport.iata} hub for ${fmtCash(refund)}?` +
        (hubRouteCount > 0
          ? `\n\nThis deactivates ${hubRouteCount} route${hubRouteCount !== 1 ? "s" : ""} and frees ${hubRouteCount} plane${hubRouteCount !== 1 ? "s" : ""}.`
          : "") +
        "\n\nYou'll receive 50% of the purchase price.",
      buttons: [
        { label: "Cancel", style: "cancel" },
        {
          label: "Sell Hub",
          style: "destructive",
          onPress: async () => {
            setSelling(true);
            const { error } = await sellHub(hub.id);
            setSelling(false);
            if (error) {
              gameAlert.show({
                title: "Error",
                message: error,
                buttons: [{ label: "OK", style: "cancel" }],
              });
              haptics.error();
              return;
            }
            haptics.success();
            sounds.hubSell();
            closeSheet();
          },
        },
      ],
    });
  };

  const handleNicknameEdit = () => {
    setNicknameInput(hub?.nickname ?? "");
    setEditingNickname(true);
  };

  const handleNicknameSave = async () => {
    if (!hub) return;
    setEditingNickname(false);
    await updateHubNickname(hub.id, nicknameInput);
  };

  const handleCreateRoute = (demand: Demand) => {
    haptics.tap();
    closeSheet();
    useGameStore.getState().startRouteCreation([demand.origin, demand.dest]);
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <CountryFlag isoCode={airport.country} size={28} />
          <View style={s.headerText}>
            <View style={s.iataRow}>
              <Text style={s.iata}>{airport.iata}</Text>
              {isOwned && (
                <View
                  style={[
                    s.pill,
                    {
                      backgroundColor: color + "18",
                      borderColor: color + "44",
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={9} color={color} />
                  <Text style={[s.pillText, { color }]}>Tier {tierNum}</Text>
                </View>
              )}
            </View>
            <Text style={s.name} numberOfLines={1}>
              {airport.name}
            </Text>

            {/* Nickname — only shown when owned */}
            {isOwned &&
              hub &&
              (editingNickname ? (
                <View style={s.nicknameEditRow}>
                  <TextInput
                    style={s.nicknameInput}
                    value={nicknameInput}
                    onChangeText={setNicknameInput}
                    onBlur={handleNicknameSave}
                    onSubmitEditing={handleNicknameSave}
                    placeholder="Name this hub…"
                    placeholderTextColor={Colors.dim}
                    maxLength={20}
                    returnKeyType="done"
                    // Note: autoFocus removed — fights with bottom sheet keyboard
                    // avoidance. User taps the pencil to trigger, focus is implicit.
                  />
                  <TouchableOpacity
                    onPress={handleNicknameSave}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="checkmark" size={14} color={color} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleNicknameEdit}
                  activeOpacity={0.7}
                  style={s.nicknameRow}
                >
                  <Ionicons
                    name="pencil-outline"
                    size={10}
                    color={Colors.dim}
                  />
                  <Text style={s.nicknameTxt} numberOfLines={1}>
                    {hub.nickname ?? "Add nickname"}
                  </Text>
                </TouchableOpacity>
              ))}

            <Text style={s.location} numberOfLines={1}>
              {[airport.city, airport.country, airport.continent]
                .filter(Boolean)
                .join(" · ")}
            </Text>
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

      {/* ── CROWDING BANNER — hoisted to top so it's the first thing seen ── */}
      {crowding && crowding.level !== "normal" && (
        <CongestionBanner
          crowding={crowding}
          hubDemands={hubDemands}
          routes={routes}
          ownedPlanes={ownedPlanes}
          color={color}
          onCreateRoute={handleCreateRoute}
        />
      )}

      {/* ── BUY SECTION (unowned) ──────────────────────────────── */}
      {!isOwned && (
        <View style={s.buySection}>
          <View style={s.buyTop}>
            <View>
              <Text style={s.metaLbl}>COST TO BUY</Text>
              <Text
                style={[
                  s.bigMoney,
                  { color: canAfford ? Colors.green : Colors.red },
                ]}
              >
                {fmtCash(cost)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.metaLbl}>YOU HAVE</Text>
              <Text style={[s.bigMoney, { color: Colors.text }]}>
                {fmtCash(cash)}
              </Text>
            </View>
          </View>

          {/* Presence bar — with 0% and goal labels for context */}
          {!isFirstHub && (
            <View style={s.presenceBlock}>
              <View style={s.presenceLabelRow}>
                <Text style={s.presenceLabel}>PRESENCE</Text>
                <Text
                  style={[
                    s.presenceValue,
                    { color: presenceReady ? Colors.green : Colors.dim },
                  ]}
                >
                  {presenceReady
                    ? "Ready to open! ✓"
                    : `${paxDelivered.toLocaleString()} / ${paxNeeded.toLocaleString()} pax`}
                  {aiHubCount > 0 && !presenceReady
                    ? ` · ${aiHubCount} rival${aiHubCount > 1 ? "s" : ""} here`
                    : ""}
                </Text>
              </View>
              <View style={s.presenceTrack}>
                <View
                  style={[
                    s.presenceFill,
                    {
                      width: `${presencePct * 100}%`,
                      backgroundColor: presenceReady ? Colors.green : color,
                    },
                  ]}
                />
              </View>
              {/* Floor / goal labels */}
              <View style={s.presenceFloorRow}>
                <Text style={s.presenceFloorLbl}>0</Text>
                <Text style={s.presenceFloorLbl}>
                  Goal: {paxNeeded.toLocaleString()} pax
                </Text>
              </View>
            </View>
          )}

          {buyError && (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={13} color={Colors.red} />
              <Text style={s.errorText}>{buyError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              s.buyBtn,
              { backgroundColor: canBuy ? color : "rgba(255,255,255,.06)" },
              (!canBuy || buying) && { opacity: 0.5 },
            ]}
            onPress={handleBuy}
            disabled={buying || !canBuy}
            activeOpacity={0.86}
          >
            {buying ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <>
                <Ionicons
                  name={
                    presenceReady ? "add-circle-outline" : "airplane-outline"
                  }
                  size={18}
                  color={canBuy ? Colors.bg : Colors.dim}
                />
                <Text
                  style={[
                    s.buyText,
                    { color: canBuy ? Colors.bg : Colors.dim },
                  ]}
                >
                  {!presenceReady
                    ? `Fly ${paxRemaining.toLocaleString()} more passengers here first`
                    : !canAfford
                      ? `Need ${fmtCash(cost + CASH_RESERVE_AFTER_BUY)} to open`
                      : `Open Hub · ${fmtCash(cost)}`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Unowned departure preview — conversion moment */}
          {previewDemands.length > 0 && (
            <View style={s.previewNote}>
              <Ionicons
                name="lock-closed-outline"
                size={11}
                color={Colors.dim}
              />
              <Text style={s.previewNoteTxt}>
                Buy this hub to unlock {previewDemands.length} route
                {previewDemands.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── HUB PANEL (owned) ─────────────────────────────────── */}
      {isOwned && hub && (
        <View style={s.hubPanel}>
          <TrustBar
            trust={hub.trust}
            floor={hub.trust_floor ?? 0}
            color={color}
          />

          {/* Stat row — route slots shown as used/total */}
          <View style={s.statRow}>
            <View style={s.stat}>
              <Text style={s.statVal}>
                <Text style={{ color }}>{usedSlots}</Text>
                <Text style={{ color: Colors.dim, fontSize: 12 }}>
                  {" "}
                  / {totalSlots}
                </Text>
              </Text>
              <Text style={s.statLbl}>Route slots</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text style={s.statVal}>
                {hubPax >= 1000
                  ? `${(hubPax / 1000).toFixed(1)}k`
                  : hubPax.toLocaleString()}
              </Text>
              <Text style={s.statLbl}>Passengers</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text
                style={[
                  s.statVal,
                  {
                    color:
                      crowding?.level === "crisis"
                        ? Colors.red
                        : crowding?.level === "overcrowded"
                          ? Colors.orange
                          : Colors.text,
                  },
                ]}
              >
                {crowding?.capacityPct ?? 0}%
              </Text>
              <Text style={s.statLbl}>Capacity</Text>
            </View>
          </View>

          {/* Upgrade block — requirements as vertical list, never wraps awkwardly */}
          {!isMaxTier && (
            <View style={s.upgradeBlock}>
              <View style={s.upgradeRequirements}>
                <View style={s.req}>
                  <Ionicons
                    name={trustReady ? "checkmark-circle" : "ellipse-outline"}
                    size={13}
                    color={trustReady ? Colors.green : Colors.dim}
                  />
                  <Text
                    style={[
                      s.reqTxt,
                      { color: trustReady ? Colors.green : Colors.dim },
                    ]}
                  >
                    {trustReady
                      ? `${trustNeeded}% trust ✓`
                      : `${trustPct}% trust — need ${trustNeeded}%`}
                  </Text>
                </View>
                <View style={s.req}>
                  <Ionicons
                    name={paxReady ? "checkmark-circle" : "people-outline"}
                    size={13}
                    color={paxReady ? Colors.green : Colors.dim}
                  />
                  <Text
                    style={[
                      s.reqTxt,
                      { color: paxReady ? Colors.green : Colors.dim },
                    ]}
                  >
                    {paxReady
                      ? `${(paxNeededForUpgrade / 1000).toFixed(0)}k passengers ✓`
                      : `${((paxNeededForUpgrade - hubPax) / 1000).toFixed(1)}k more passengers needed`}
                  </Text>
                </View>
                <View style={s.req}>
                  <Ionicons
                    name={cashReady ? "checkmark-circle" : "ellipse-outline"}
                    size={13}
                    color={cashReady ? Colors.green : Colors.dim}
                  />
                  <Text
                    style={[
                      s.reqTxt,
                      { color: cashReady ? Colors.green : Colors.dim },
                    ]}
                  >
                    {cashReady
                      ? `${fmtCash(upgradeCost)} ✓`
                      : `${fmtCash(upgradeCost)} needed`}
                  </Text>
                </View>
              </View>

              {upgradeError && (
                <View style={s.errorBox}>
                  <Ionicons
                    name="warning-outline"
                    size={13}
                    color={Colors.red}
                  />
                  <Text style={s.errorText}>{upgradeError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  s.upgradeBtn,
                  {
                    borderColor: upgradeReady ? color + "66" : Colors.border,
                    backgroundColor: upgradeReady
                      ? color + "14"
                      : "transparent",
                  },
                  (!upgradeReady || upgrading) && { opacity: 0.45 },
                ]}
                onPress={handleUpgrade}
                disabled={!upgradeReady || upgrading}
                activeOpacity={0.84}
              >
                {upgrading ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <>
                    <Ionicons
                      name="arrow-up-circle-outline"
                      size={16}
                      color={upgradeReady ? color : Colors.dim}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.upgradeTxt,
                          { color: upgradeReady ? color : Colors.dim },
                        ]}
                      >
                        Upgrade to Tier {tierNum + 1}
                      </Text>
                      {nextTierCfg && (
                        <Text style={s.upgradeDetail}>
                          Unlocks {nextTierCfg.routes} routes · trust stays
                          above {nextTierCfg.trustFloor}%
                        </Text>
                      )}
                    </View>
                    {upgradeReady && (
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={color + "88"}
                      />
                    )}
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isMaxTier && (
            <View style={s.maxBadge}>
              <Ionicons name="star" size={11} color={color} />
              <Text style={[s.maxTxt, { color }]}>Maximum tier reached</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.divider} />

      {/* ── DEPARTURES ────────────────────────────────────────── */}
      <View style={s.sectionHeader}>
        <View style={s.sectionTitleRow}>
          <Ionicons name="airplane-outline" size={13} color={color} />
          <Text style={s.eyebrow}>DEPARTURES</Text>
        </View>
        {isOwned && outboundWaiting > 0 && (
          <View style={s.waitingBadge}>
            <Text style={s.waitingBadgeTxt}>
              {outboundWaiting.toLocaleString()} waiting
            </Text>
          </View>
        )}
      </View>

      {departures.length === 0 ? (
        <View style={s.emptyBoard}>
          <Ionicons
            name="map-outline"
            size={22}
            color={Colors.dim}
            style={{ marginBottom: 6 }}
          />
          <Text style={s.emptyTxt}>No routes available here yet</Text>
          {!isOwned && (
            <Text style={s.emptySub}>
              Buy this hub to unlock routes · {fmtCash(cost)}
            </Text>
          )}
        </View>
      ) : (
        departures.map(({ demand, routes: demandRoutes, key }) => (
          <DepartureRow
            key={key}
            demand={demand}
            routes={demandRoutes}
            hub={hub}
            color={color}
            dayProgress={dayProgress}
            onCreateRoute={handleCreateRoute}
            maxPlaneRange={maxPlaneRange}
            day={day}
            routeEarnings={routeEarnings}
          />
        ))
      )}

      {/* ── ARRIVALS ──────────────────────────────────────────── */}
      <View style={[s.sectionHeader, { marginTop: Spacing.md }]}>
        <View style={s.sectionTitleRow}>
          <Ionicons name="download-outline" size={13} color={Colors.dim} />
          <Text style={s.eyebrow}>ARRIVALS</Text>
        </View>
      </View>
      <ArrivalsSummary
        playerArrivals={playerArrivals}
        connectingRoutes={connectingRoutes}
        aiArrivals={aiArrivals}
        demands={demands}
        color={color}
        dayProgress={dayProgress}
      />

      {/* ── SELL — quiet, text-style, bottom of sheet ─────────── */}
      {isOwned && hub && (
        <TouchableOpacity
          style={s.sellHubBtn}
          onPress={handleSell}
          disabled={selling}
          activeOpacity={0.7}
        >
          {selling ? (
            <ActivityIndicator size="small" color={Colors.red} />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Text style={s.sellHubTitle}>Sell Hub</Text>
                <Text style={s.sellHubSub}>
                  {fmtCash(Math.round(hubPurchaseCost(airport) * 0.5))} refund ·
                  deactivates routes
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={Colors.red + "66"}
              />
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
      <GameAlert ref={gameAlert.ref} />
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
  headerText: { flex: 1, minWidth: 0 },
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
    fontWeight: "900",
    letterSpacing: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  name: { fontSize: 13, color: Colors.text, fontWeight: "700", marginTop: 2 },
  location: { fontSize: 10, color: Colors.dim, lineHeight: 15, marginTop: 1 },

  nicknameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  nicknameTxt: {
    fontSize: 11,
    color: Colors.dim,
    fontWeight: "700",
    fontStyle: "italic",
  },
  // Edit row with explicit confirm button — avoids autoFocus keyboard fight
  nicknameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dim,
    paddingBottom: 2,
  },
  nicknameInput: {
    flex: 1,
    fontSize: 11,
    color: Colors.text,
    fontWeight: "700",
    paddingVertical: 0,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },

  // Buy section
  buySection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  buyTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  metaLbl: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.5,
    marginBottom: 4,
    fontWeight: "900",
  },
  bigMoney: { fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.red + "0a",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    padding: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: 11, color: Colors.red, fontWeight: "700" },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH + 4,
  },
  buyText: { fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },

  presenceBlock: { gap: 5 },
  presenceLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  presenceLabel: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  presenceValue: { fontSize: 10, fontWeight: "800" },
  presenceTrack: {
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  presenceFill: { height: "100%", borderRadius: Radius.full },
  presenceFloorRow: { flexDirection: "row", justifyContent: "space-between" },
  presenceFloorLbl: { fontSize: 8, color: Colors.dim, fontWeight: "700" },

  // Unlock preview note on unowned airports
  previewNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
  },
  previewNoteTxt: { fontSize: 11, color: Colors.dim, fontWeight: "700" },

  // Hub panel
  hubPanel: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16, fontWeight: "900", color: Colors.text },
  statLbl: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: Colors.border,
  },

  // Upgrade — requirements as vertical column, never wraps
  upgradeBlock: { gap: Spacing.sm },
  upgradeRequirements: { flexDirection: "column", gap: 6 },
  req: { flexDirection: "row", alignItems: "center", gap: 6 },
  reqTxt: { fontSize: 11, fontWeight: "700", flex: 1 },

  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  upgradeTxt: { fontSize: 13, fontWeight: "900" },
  upgradeDetail: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
    marginTop: 1,
  },

  maxBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.05)",
  },
  maxTxt: { fontSize: 10, fontWeight: "800" },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
  },
  waitingBadge: {
    backgroundColor: Colors.red + "18",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.red + "44",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  waitingBadgeTxt: { fontSize: 9, color: Colors.red, fontWeight: "900" },

  emptyBoard: { padding: Spacing.xl, alignItems: "center", gap: 2 },
  emptyTxt: { fontSize: 13, color: Colors.dim, fontWeight: "700" },
  emptySub: {
    fontSize: 11,
    color: Colors.dim,
    opacity: 0.6,
    marginTop: 4,
    textAlign: "center",
  },

  // Sell — quiet text-style, no solid fill, no shadow
  sellHubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "08",
  },
  sellHubTitle: { fontSize: 13, fontWeight: "700", color: Colors.red },
  sellHubSub: {
    fontSize: 10,
    color: Colors.red,
    opacity: 0.6,
    fontWeight: "600",
    marginTop: 1,
  },
});
