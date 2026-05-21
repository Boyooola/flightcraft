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

const AIRPORT_TIER_COLORS: Record<string, string> = {
  "Mega Hub": Colors.sky,
  International: "#a78bfa",
  Regional: Colors.amber,
  Domestic: Colors.dim,
};

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

  // Sum earnings for all active routes from the routeEarnings map
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

  return (
    <View style={dep.row}>
      <View
        style={[
          dep.stripe,
          { backgroundColor: isServed ? color : Colors.red + "88" },
        ]}
      />

      <View style={dep.body}>
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
                          ? `${demand.base_pax_day.toLocaleString()} pax · ${ceiling.toLocaleString()} potential`
                          : "pax/day"}
                      </Text>
                    </>
                  );
                })()}
              </>
            )}
          </View>
        </View>

        {isServed ? (
          <>
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
            <Text style={dep.meta} numberOfLines={1}>
              {planeLabel}
              {firstRoute?.via_iata ? ` via ${firstRoute.via_iata}` : ""}
              {waitingPax > 0
                ? ` · ${waitingPax.toLocaleString()} waiting`
                : ""}
            </Text>
          </>
        ) : hub ? (
          <View style={dep.actionRow}>
            <TouchableOpacity
              style={[
                dep.createBtn,
                { borderColor: color + "55", backgroundColor: color + "10" },
              ]}
              onPress={() => onCreateRoute(demand)}
              activeOpacity={0.84}
            >
              <Ionicons name="git-branch-outline" size={12} color={color} />
              <Text style={[dep.createTxt, { color }]}>Create Route</Text>
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
  // Group player direct arrivals by origin
  const playerGrouped = useMemo(() => {
    const map = new Map<
      string,
      { iata: string; city: string; country: string; paxToday: number }
    >();
    playerArrivals.forEach((route) => {
      const demand =
        demands.find((d) => d.id === route.demand.id) ?? route.demand;
      const key = demand.origin.iata;
      const paxToday = demand.delivered_pax_today ?? 0;
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

  // Group connecting dropoffs by via origin
  const connectingGrouped = useMemo(() => {
    const map = new Map<
      string,
      { iata: string; city: string; country: string; dropoffPax: number }
    >();
    connectingRoutes.forEach((route) => {
      const demand =
        demands.find((d) => d.id === route.demand.id) ?? route.demand;
      const paxToday = demand.delivered_pax_today ?? 0;
      const ratio = route.via_pax_ratio ?? 0;
      const dropoff = Math.round(paxToday * ratio);
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

  const hasAny =
    playerGrouped.length > 0 ||
    connectingGrouped.length > 0 ||
    aiArrivals.length > 0;

  if (!hasAny) {
    return (
      <View style={arr.empty}>
        <Text style={arr.emptyTxt}>No flights arriving here yet</Text>
      </View>
    );
  }

  return (
    <>
      {/* Player direct arrivals */}
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

      {/* Connecting dropoffs */}
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

      {/* AI arrivals */}
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

// ─────────────────────────────────────────────────────────────────
// CONGESTION HELPER
// ─────────────────────────────────────────────────────────────────

function CongestionHelper({
  hubDemands,
  routes,
  ownedPlanes,
  color,
  onCreateRoute,
}: {
  hubDemands: Demand[];
  routes: Route[];
  ownedPlanes: ReturnType<typeof useOwnedPlanes>;
  color: string;
  onCreateRoute: (d: Demand) => void;
}) {
  const idlePlanes = ownedPlanes.filter((p) => !p.route_id);
  const unservedDemands = hubDemands.filter(
    (d) => !routes.some((r) => r.active && r.demand.id === d.id),
  );
  const undersizedDemands = hubDemands
    .filter((d) => routes.some((r) => r.active && r.demand.id === d.id))
    .map((d) => {
      const routesForDemand = routes.filter(
        (r) => r.active && r.demand.id === d.id,
      );
      const totalCap = routesForDemand.reduce(
        (sum, r) => sum + r.plane.plane_model.pax_capacity,
        0,
      );
      return { demand: d, gap: d.base_pax_day - totalCap };
    })
    .filter((x) => x.gap > 30);

  const suggestions: {
    icon: string;
    text: string;
    cta?: string;
    demand?: Demand;
  }[] = [];

  if (unservedDemands.length > 0 && idlePlanes.length > 0) {
    const d = unservedDemands[0];
    suggestions.push({
      icon: "airplane-outline",
      text: `${idlePlanes.length} idle plane${idlePlanes.length > 1 ? "s" : ""} — assign to ${d.dest.iata} (${d.base_pax_day} pax/day unserved)`,
      cta: "Assign now",
      demand: d,
    });
  } else if (unservedDemands.length > 0) {
    suggestions.push({
      icon: "cart-outline",
      text: `${unservedDemands.length} demand${unservedDemands.length > 1 ? "s" : ""} unserved — buy a plane and assign it`,
    });
  }

  if (undersizedDemands.length > 0) {
    const worst = undersizedDemands.sort((a, b) => b.gap - a.gap)[0];
    suggestions.push({
      icon: "people-outline",
      text: `${worst.demand.dest.iata} needs ${worst.gap} more seats/day — add a second plane`,
      cta: idlePlanes.length > 0 ? "Add plane" : undefined,
      demand: idlePlanes.length > 0 ? worst.demand : undefined,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      icon: "add-circle-outline",
      text: "All routes are running smoothly — upgrade this hub to unlock more destinations",
    });
  }

  return (
    <View style={ch.wrap}>
      <Text style={ch.heading}>WHAT TO DO</Text>
      {suggestions.map((s, i) => (
        <View key={i} style={ch.row}>
          <View style={[ch.iconWrap, { backgroundColor: color + "18" }]}>
            <Ionicons name={s.icon as any} size={13} color={color} />
          </View>
          <Text style={ch.text} numberOfLines={3}>
            {s.text}
          </Text>
          {s.cta && s.demand && (
            <TouchableOpacity
              style={[ch.cta, { borderColor: color + "55" }]}
              onPress={() => onCreateRoute(s.demand!)}
              activeOpacity={0.8}
            >
              <Text style={[ch.ctaTxt, { color }]}>{s.cta}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const ch = StyleSheet.create({
  wrap: { marginTop: Spacing.sm, gap: Spacing.xs ?? 6 },
  heading: {
    fontSize: 8,
    fontWeight: "900",
    color: Colors.dim,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: { flex: 1, fontSize: 11, color: Colors.muted, lineHeight: 15 },
  cta: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  ctaTxt: { fontSize: 10, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// TRUST BAR  (owned hubs only)
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
      {floor > 0 && <Text style={tb.floorLabel}>Floor {floor}%</Text>}
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
  floorLabel: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
    marginTop: -1,
  },
});

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function AirportSheet() {
  const airport = useSelectedAirport();
  const hubs = useHubs();
  // Read demands live from store — tracks delivered_pax_today updates from RouteLayer
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

  const hubDemands = useMemo(() => {
    return airport ? demands.filter((d) => d.hub_iata === airport.iata) : [];
  }, [airport, demands]);

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

  const departures = useMemo(() => {
    const base = isOwned ? hubDemands : (previewDemands as Demand[]);
    return base.map((demand, index) => ({
      demand,
      routes: routes.filter((r) => r.active && r.demand.id === demand.id),
      key: demand.id ?? `preview-${index}`,
    }));
  }, [isOwned, hubDemands, previewDemands, routes]);

  // Player direct arrivals — routes flying INTO this airport from elsewhere
  const playerArrivals = useMemo(() => {
    return routes.filter(
      (r) =>
        r.active &&
        r.demand.dest.iata === airport?.iata &&
        r.hub_iata !== airport?.iata,
    );
  }, [routes, airport?.iata]);

  // Connecting dropoffs — routes that stop via this airport
  const connectingRoutes = useMemo(() => {
    return routes.filter(
      (r) =>
        r.active && r.via_iata === airport?.iata && (r.via_pax_ratio ?? 0) > 0,
    );
  }, [routes, airport?.iata]);

  // AI arrivals — rival airlines flying into this airport
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
      const aiRoutes = buildAIRoutes(ai, airports);
      aiRoutes.forEach((r) => {
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

  // ── Presence gate ──────────────────────────────────────────────
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

  // ── Cash reserve gate ──────────────────────────────────────────
  const canAfford = isFirstHub
    ? cash >= cost
    : cash >= cost + CASH_RESERVE_AFTER_BUY;
  const canBuy = presenceReady && canAfford;

  // ── Upgrade state ─────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────

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
            {isOwned &&
              hub &&
              (editingNickname ? (
                <TextInput
                  style={s.nicknameInput}
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  onBlur={handleNicknameSave}
                  onSubmitEditing={handleNicknameSave}
                  placeholder="Name this hub…"
                  placeholderTextColor={Colors.dim}
                  maxLength={20}
                  autoFocus
                  returnKeyType="done"
                />
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

          {/* Presence progress — hidden for first hub */}
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
                    : `${paxRemaining.toLocaleString()} more passengers needed`}
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
                      ? `You need ${fmtCash(cost + CASH_RESERVE_AFTER_BUY)} to open this hub`
                      : `Open Hub · ${fmtCash(cost)}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── HUB PANEL (owned) ─────────────────────────────────── */}
      {isOwned && hub && (
        <View style={s.hubPanel}>
          {/* Trust bar */}
          <TrustBar
            trust={hub.trust}
            floor={hub.trust_floor ?? 0}
            color={color}
          />

          {/* Stat row */}
          <View style={s.statRow}>
            <View style={s.stat}>
              <Text style={s.statVal}>{tierCfg?.routes ?? "?"}</Text>
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

          {/* Upgrade block */}
          {!isMaxTier && (
            <View style={s.upgradeBlock}>
              <View style={s.upgradeRequirements}>
                {/* Trust requirement */}
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
                {/* Pax requirement */}
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
                {/* Cash requirement */}
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

      {/* ── CROWDING BANNER ───────────────────────────────────── */}
      {crowding &&
        crowding.level !== "normal" &&
        (() => {
          const cfg =
            {
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
            }[crowding.level] ?? null;
          if (!cfg) return null;
          return (
            <View
              style={[
                s.crowdingBanner,
                {
                  backgroundColor: cfg.bg,
                  borderColor: cfg.border,
                  borderLeftColor: cfg.color,
                  borderLeftWidth: 3,
                },
              ]}
            >
              <Ionicons name={cfg.icon} size={17} color={cfg.color} />
              <View style={{ flex: 1 }}>
                <View style={s.crowdingTop}>
                  <Text style={[s.crowdingTitle, { color: cfg.color }]}>
                    {cfg.label}
                  </Text>
                  <Text style={s.crowdingCap}>
                    {crowding.capacityPct}% capacity
                  </Text>
                </View>
                <Text style={s.crowdingText}>
                  {crowding.waitingPax.toLocaleString()} passengers waiting for
                  more routes.
                </Text>
                <Text style={[s.crowdingNote, { color: cfg.color }]}>
                  {cfg.note}
                </Text>
                {congestionPenaltyPct(crowding.level) > 0 && (
                  <Text style={[s.crowdingNote, { color: cfg.color }]}>
                    Efficiency penalty: −{congestionPenaltyPct(crowding.level)}%
                    on all rewards
                  </Text>
                )}
                <CongestionHelper
                  hubDemands={hubDemands}
                  routes={routes}
                  ownedPlanes={ownedPlanes}
                  color={cfg.color}
                  onCreateRoute={handleCreateRoute}
                />
              </View>
            </View>
          );
        })()}

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
          <Text style={s.emptyTxt}>No routes available here yet</Text>
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
      {playerArrivals.length > 0 ||
      connectingRoutes.length > 0 ||
      aiArrivals.length > 0 ? (
        <ArrivalsSummary
          playerArrivals={playerArrivals}
          connectingRoutes={connectingRoutes}
          aiArrivals={aiArrivals}
          demands={demands}
          color={color}
          dayProgress={dayProgress}
        />
      ) : (
        <View style={s.emptyBoard}>
          <Text style={s.emptyTxt}>No flights arriving here yet</Text>
        </View>
      )}

      {/* ── SELL ──────────────────────────────────────────────── */}
      {isOwned && hub && (
        <TouchableOpacity
          style={s.sellHubBtn}
          onPress={handleSell}
          disabled={selling}
          activeOpacity={0.85}
        >
          {selling ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="warning-outline" size={18} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={s.sellHubTitle}>Sell Hub</Text>
                <Text style={s.sellHubSub}>
                  Get {fmtCash(Math.round(hubPurchaseCost(airport) * 0.5))}{" "}
                  refund
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(255,255,255,0.7)"
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

  // Header
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
  nicknameInput: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dim,
    paddingVertical: 2,
    marginTop: 2,
    minWidth: 120,
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

  // Upgrade block
  upgradeBlock: { gap: Spacing.sm },
  upgradeRequirements: {
    flexDirection: "row",
    gap: Spacing.md,
    flexWrap: "wrap",
  },
  req: { flexDirection: "row", alignItems: "center", gap: 4 },
  reqTxt: { fontSize: 10, fontWeight: "700" },

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

  // Crowding
  crowdingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  crowdingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  crowdingTitle: { fontSize: 13, fontWeight: "900" },
  crowdingCap: { fontSize: 10, color: Colors.dim, fontWeight: "800" },
  crowdingText: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  crowdingNote: { fontSize: 10, fontWeight: "800", marginTop: 3 },

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
  emptyBoard: { padding: Spacing.xl, alignItems: "center" },
  emptyTxt: { fontSize: 12, color: Colors.dim, fontWeight: "700" },

  // Sell
  sellHubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.red,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    shadowColor: Colors.red,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sellHubTitle: { fontSize: 14, fontWeight: "900", color: "#fff" },
  sellHubSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
  },
});

const dep = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
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
  empty: { padding: Spacing.xl, alignItems: "center" },
  emptyTxt: { fontSize: 12, color: Colors.dim, fontWeight: "700" },
});
