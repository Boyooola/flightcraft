import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  useBuyHub,
  useRefreshDemands,
  useSellHub,
} from "@/hooks/useSupabaseWrite";
import { buildAIRoutes } from "@/lib/AIAirline";
import {
  airportClassification,
  generateDemands,
  hubCrowdingLevel,
  hubPurchaseCost,
} from "@/lib/demands";
import { congestionPenaltyPct } from "@/lib/hubCongestion";
import { waitingPaxForDemand } from "@/lib/passengerFlow";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import type { Airport, Demand, OwnedHub, Route } from "@/store";
import {
  useAIAirlines,
  useAirline,
  useCash,
  useDayProgress,
  useDemands,
  useGameStore,
  useHubs,
  useOwnedPlanes,
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
  TouchableOpacity,
  View,
} from "react-native";
import CountryFlag from "react-native-country-flag";

const TIER_COLORS: Record<string, string> = {
  "Mega Hub": Colors.sky,
  International: "#a78bfa",
  Regional: Colors.amber,
  Domestic: Colors.dim,
};

const TRUST_BUY_THRESHOLD = 40;

function usePreviewDemands(airport: Airport | null, allAirports: Airport[]) {
  return useMemo(() => {
    if (!airport) return [];
    return generateDemands(airport, allAirports, 3, [], 0, true);
  }, [airport?.iata]);
}

function MarketShareBar({
  playerShare,
  airlineColor,
  aiShares,
  isOwned,
}: {
  playerShare: number;
  airlineColor: string;
  aiShares: {
    id: string;
    name: string;
    share: number;
    offset: number;
    color: string;
  }[];
  isOwned: boolean;
}) {
  return (
    <View style={share.wrap}>
      <View style={share.track}>
        <View
          style={[
            share.playerFill,
            {
              width: `${Math.max(0, Math.min(100, playerShare))}%`,
              backgroundColor: airlineColor,
              borderRightWidth: aiShares.length > 0 ? 1 : 0,
            },
          ]}
        />

        {aiShares.map((ai, index) => (
          <View
            key={ai.id}
            style={[
              share.aiSegment,
              {
                left: `${ai.offset}%`,
                width: `${ai.share}%`,
                backgroundColor: ai.color,
                borderLeftWidth: index === 0 ? 0 : 1,
              },
            ]}
          >
            {ai.share > 6 && (
              <Ionicons
                name="airplane"
                size={8}
                color="#fff"
                style={{ opacity: 0.9 }}
              />
            )}
          </View>
        ))}
      </View>

      <Text style={share.label} numberOfLines={1}>
        {playerShare}% market share
        {!isOwned && playerShare < TRUST_BUY_THRESHOLD
          ? ` · need ${TRUST_BUY_THRESHOLD}% to buy`
          : ""}
        {aiShares.length > 0
          ? ` · ${aiShares.length} rival${aiShares.length !== 1 ? "s" : ""}`
          : ""}
      </Text>
    </View>
  );
}

function HubCapacityCard({
  crowding,
  waiting,
  activeRoutes,
  color,
}: {
  crowding: ReturnType<typeof hubCrowdingLevel> | null;
  waiting: number;
  activeRoutes: number;
  color: string;
}) {
  const capacityPct = Math.min(100, Math.max(0, crowding?.capacityPct ?? 0));
  const capColor =
    crowding?.level === "crisis"
      ? Colors.red
      : crowding?.level === "overcrowded"
        ? Colors.orange
        : crowding?.level === "busy"
          ? Colors.amber
          : color;

  return (
    <View style={[cap.card, { borderColor: capColor + "33" }]}>
      <View style={cap.top}>
        <View style={cap.titleRow}>
          <Ionicons name="speedometer-outline" size={14} color={capColor} />
          <Text style={cap.title}>Hub Capacity</Text>
        </View>
        <Text style={[cap.percent, { color: capColor }]}>{capacityPct}%</Text>
      </View>

      <View style={cap.track}>
        <View
          style={[
            cap.fill,
            {
              width: `${capacityPct}%`,
              backgroundColor: capColor,
            },
          ]}
        />
      </View>

      <Text style={cap.sub} numberOfLines={1}>
        {waiting.toLocaleString()} waiting · {activeRoutes} active route
        {activeRoutes !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

function DepartureRow({
  demand,
  routes,
  hub,
  color,
  dayProgress,
  onCreateRoute,
  maxPlaneRange,
}: {
  demand: Demand;
  routes: Route[];
  hub: OwnedHub | undefined;
  color: string;
  dayProgress: number;
  onCreateRoute: (d: Demand) => void;
  maxPlaneRange: number;
}) {
  const activeRoutes = routes.filter(
    (route) => route.active && route.demand.id === demand.id,
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

  const revenue = (() => {
    if (!firstRoute || !hub) return 0;

    return activeRoutes.reduce((sum, route) => {
      const p = route.plane.plane_model;
      const dist = route.total_dist_nm ?? route.demand.dist_nm;
      return (
        sum +
        calcRouteRevenue({
          distNm: dist,
          speedKts: p.speed_kts,
          trustPct: hub.trust,
          deliveredPax: demand.delivered_pax_today ?? 0,
          paxDay: demand.base_pax_day ?? 0,
          costPerSector: p.cost_per_sector ?? 500,
          fuelPerNm: p.fuel_per_nm ?? 2.0,
          businessPct: demand.business_pct ?? 0.25,
          leisurePct: demand.leisure_pct ?? 0.75,
        }).net
      );
    }, 0);
  })();

  const planeLabel =
    activeRoutes.length > 1
      ? `${activeRoutes.length} aircraft`
      : firstRoute?.plane.plane_model.nickname;

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
              <Text style={dep.iata}>{demand.dest.iata}</Text>
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
                <Text style={[dep.waiting, !hub && { color: Colors.dim }]}>
                  {hub ? "WAITING" : "~" + demand.base_pax_day.toLocaleString()}
                </Text>
                <Text style={dep.small}>
                  {hub ? waitingPax.toLocaleString() + " pax" : "pax/day"}
                </Text>
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
                    {
                      width: `${fillPct}%`,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>
              <Text style={[dep.percent, { color: barColor }]}>{fillPct}%</Text>
              {revenue > 0 && (
                <Text style={dep.revenue}>{fmtCash(revenue)}</Text>
              )}
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

function ArrivalsSummary({
  arrivals,
  demands,
  color,
}: {
  arrivals: Route[];
  demands: Demand[];
  color: string;
}) {
  // Group by origin city — combine pax from multiple planes on same route
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        iata: string;
        city: string;
        country: string;
        paxToday: number;
        routeCount: number;
      }
    >();
    arrivals.forEach((route) => {
      const demand =
        demands.find((d) => d.id === route.demand.id) ?? route.demand;
      const key = demand.origin.iata;
      const paxToday = demand.delivered_pax_today ?? 0;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.paxToday += paxToday;
        existing.routeCount += 1;
      } else {
        map.set(key, {
          iata: demand.origin.iata,
          city: demand.origin.city,
          country: demand.origin.country,
          paxToday,
          routeCount: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.paxToday - a.paxToday);
  }, [arrivals, demands]);

  const totalPax = grouped.reduce((s, g) => s + g.paxToday, 0);

  return (
    <>
      {grouped.map((g) => (
        <View key={g.iata} style={arr.row}>
          <View style={[arr.dot, { backgroundColor: color }]} />
          <View style={arr.info}>
            <Text style={arr.origin} numberOfLines={1}>
              <CountryFlag isoCode={g.country} size={16} /> {g.iata} · {g.city}
            </Text>
          </View>
          <Text style={arr.pax}>{g.paxToday.toLocaleString()} arrived</Text>
        </View>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// CONGESTION HELPER
// Analyses the situation and gives specific actionable suggestions.
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

  // Demands with NO active route at all
  const unservedDemands = hubDemands.filter(
    (d) => !routes.some((r) => r.active && r.demand.id === d.id),
  );

  // Demands with a route but capacity < pax_day (single plane can't keep up)
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
      return { demand: d, totalCap, gap: d.base_pax_day - totalCap };
    })
    .filter((x) => x.gap > 30); // meaningfully undersized

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
      text: `${unservedDemands.length} demand${unservedDemands.length > 1 ? "s" : ""} have no plane — buy a plane and assign it`,
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
    // All demands served and sized — hub itself is just saturated
    suggestions.push({
      icon: "add-circle-outline",
      text: "All demands are served — buy a larger hub tier to increase capacity",
    });
  }

  return (
    <View style={ch.wrap}>
      <Text style={ch.heading}>What to do</Text>
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
    fontSize: 9,
    fontWeight: "900",
    color: Colors.dim,
    letterSpacing: 0.6,
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

export default function AirportSheet() {
  const airport = useSelectedAirport();
  const hubs = useHubs();
  const demands = useDemands();
  const routes = useRoutes();
  const dayProgress = useDayProgress();
  const airline = useAirline();
  const cash = useCash();
  const airports = useGameStore((state) => state.airports);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const ownedPlanes = useOwnedPlanes();
  const aiAirlines = useAIAirlines();

  const tabBarH = useTabBarHeight();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const buyHub = useBuyHub();
  const sellHub = useSellHub();
  const refreshDemands = useRefreshDemands();
  const gameAlert = useGameAlert();

  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);

  const previewDemands = usePreviewDemands(airport, airports);

  const color = airline?.color ?? Colors.sky;

  const hub = airport
    ? hubs.find((ownedHub) => ownedHub.airport.iata === airport.iata)
    : undefined;

  const isOwned = !!hub;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hubDemands = airport
    ? demands.filter((demand) => demand.hub_iata === airport.iata)
    : [];

  const activeHubRoutes = airport
    ? routes.filter((route) => route.active && route.hub_iata === airport.iata)
    : [];

  const maxPlaneRange =
    ownedPlanes.length > 0
      ? ownedPlanes.reduce((max, p) => Math.max(max, p.plane_model.range_nm), 0)
      : 0;

  const aiCompetitors =
    airport != null
      ? aiAirlines.filter((ai) => ai.hubIatas.includes(airport.iata))
      : [];

  const playerPax =
    airport == null
      ? 0
      : routes
          .filter(
            (route) =>
              route.active &&
              (route.demand.origin.iata === airport.iata ||
                route.demand.dest.iata === airport.iata ||
                route.hub_iata === airport.iata),
          )
          .reduce((sum, route) => {
            const liveDemand =
              demands.find((demand) => demand.id === route.demand.id) ??
              route.demand;
            return sum + (liveDemand.base_pax_day ?? 0);
          }, 0);

  const aiPax = aiCompetitors.reduce((sum, ai) => {
    const routesAtHub = Math.max(
      1,
      Math.floor(ai.routeCount / Math.max(1, ai.hubIatas.length)),
    );
    return sum + routesAtHub * 150;
  }, 0);

  const airportTrust =
    playerPax + aiPax > 0
      ? Math.round((playerPax / (playerPax + aiPax)) * 100)
      : isOwned
        ? Math.round(hub?.trust ?? 0)
        : 0;

  const aiShares = useMemo(() => {
    if (!airport) return [];

    const competitors = aiAirlines
      .map((ai) => {
        const aiRoutes = buildAIRoutes(ai, airports);

        const hubPresence = ai.hubIatas.includes(airport.iata);

        const routePresence = aiRoutes.filter(
          (route) =>
            route.origin.iata === airport.iata ||
            route.dest.iata === airport.iata,
        ).length;

        const presenceScore = (hubPresence ? 3 : 0) + routePresence;

        return {
          id: ai.id,
          name: ai.name,
          color: ai.color ?? Colors.dim,
          trust: ai.trust,
          presenceScore,
        };
      })
      .filter((ai) => ai.presenceScore > 0);

    const remaining = Math.max(0, 100 - airportTrust);

    const totalWeight = competitors.reduce(
      (sum, ai) => sum + ai.trust * ai.presenceScore,
      0,
    );

    let offset = airportTrust;

    return competitors.map((ai) => {
      const share =
        totalWeight > 0
          ? Math.round((remaining * ai.trust * ai.presenceScore) / totalWeight)
          : 0;

      const result = {
        id: ai.id,
        name: ai.name,
        share,
        offset,
        color: ai.color,
      };

      offset += share;
      return result;
    });
  }, [airport, airportTrust, aiAirlines, airports]);

  if (!airport) return null;

  const classification = airportClassification(airport);
  const tierColor = TIER_COLORS[classification.label] ?? Colors.dim;
  const cost = hubPurchaseCost(airport);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const day = useGameStore((s) => s.airline?.day ?? 1);
  const trustLocked =
    day >= 3 &&
    aiCompetitors.length > 0 &&
    !isOwned &&
    airportTrust < TRUST_BUY_THRESHOLD;
  const canAfford = cash >= cost && !trustLocked;

  const crowding = isOwned
    ? hubCrowdingLevel(airport.iata, demands, airport)
    : null;
  const outboundWaiting = isOwned
    ? hubDemands.reduce(
        (sum, demand) => sum + waitingPaxForDemand(demand, dayProgress),
        0,
      )
    : 0;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const departures = useMemo(() => {
    const base = isOwned ? hubDemands : (previewDemands as Demand[]);
    return base.map((demand, index) => {
      const demandRoutes = routes.filter(
        (route) => route.active && route.demand.id === demand.id,
      );

      return {
        demand,
        routes: demandRoutes,
        key: demand.id ?? `preview-${index}`,
      };
    });
  }, [isOwned, hubDemands, previewDemands, routes]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const arrivals = useMemo(() => {
    return routes.filter(
      (route) =>
        route.active &&
        route.demand.dest.iata === airport.iata &&
        route.hub_iata !== airport.iata,
    );
  }, [routes, airport.iata]);

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
      return;
    }

    haptics.success();
  };

  const handleSell = () => {
    if (!hub) return;

    const hubRouteCount = routes.filter(
      (route) => route.hub_iata === airport.iata && route.active,
    ).length;
    const refund = Math.round(hubPurchaseCost(airport) * 0.5);

    gameAlert.show({
      icon: "storefront-outline",
      title: "Sell Hub",
      message:
        `Sell ${airport.iata} hub for ${fmtCash(refund)}?` +
        (hubRouteCount > 0
          ? `\n\nThis deactivates ${hubRouteCount} route${
              hubRouteCount !== 1 ? "s" : ""
            } and frees ${hubRouteCount} plane${
              hubRouteCount !== 1 ? "s" : ""
            }.`
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

  const handleCreateRoute = (demand: Demand) => {
    haptics.tap();
    closeSheet();
    useGameStore.getState().startRouteCreation([demand.origin, demand.dest]);
  };

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <CountryFlag isoCode={airport.country} size={28} />

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
                  <Ionicons name="checkmark-circle" size={10} color={color} />
                  <Text style={[s.ownedPillText, { color }]}>Your hub</Text>
                </View>
              )}
            </View>

            <Text style={s.name} numberOfLines={1}>
              {airport.name}
            </Text>

            <Text style={s.location} numberOfLines={1}>
              {[airport.city, airport.country, airport.continent]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            <MarketShareBar
              playerShare={airportTrust}
              airlineColor={color}
              aiShares={aiShares}
              isOwned={isOwned}
            />
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

      {!isOwned && (
        <View style={s.buySection}>
          <View style={s.buyTop}>
            <View>
              <Text style={s.metaLbl}>Cost to buy</Text>
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
              <Text style={s.metaLbl}>You have</Text>
              <Text style={[s.bigMoney, { color: Colors.text }]}>
                {fmtCash(cash)}
              </Text>
            </View>
          </View>

          {trustLocked && (
            <View style={s.lockBox}>
              <Ionicons
                name="lock-closed-outline"
                size={13}
                color={Colors.amber}
              />
              <Text style={s.lockText}>
                Rivals have a strong foothold here. Serve nearby routes to build
                presence and unlock this airport.
              </Text>
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
              { backgroundColor: canAfford ? color : "rgba(255,255,255,.06)" },
              (!canAfford || buying) && { opacity: 0.5 },
            ]}
            onPress={handleBuy}
            disabled={buying || !canAfford}
            activeOpacity={0.86}
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
                    ? `Open Hub · ${fmtCash(cost)}`
                    : trustLocked
                      ? "Build presence first"
                      : "Not enough cash"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

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
                note: "Trust growth paused",
              },
              overcrowded: {
                color: Colors.orange,
                bg: Colors.orange + "10",
                border: Colors.orange + "33",
                icon: "warning-outline" as const,
                label: "Overcrowded",
                note: "Trust −0.3/day · Revenue −10%",
              },
              crisis: {
                color: Colors.red,
                bg: Colors.red + "10",
                border: Colors.red + "33",
                icon: "skull-outline" as const,
                label: "Capacity Crisis",
                note: "Trust −0.8/day · Revenue −20%",
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
                    Efficiency penalty: -{congestionPenaltyPct(crowding.level)}%
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
          />
        ))
      )}

      {arrivals.length > 0 && (
        <>
          <View style={[s.sectionHeader, { marginTop: Spacing.md }]}>
            <View style={s.sectionTitleRow}>
              <Ionicons name="download-outline" size={13} color={Colors.dim} />
              <Text style={s.eyebrow}>ARRIVALS</Text>
            </View>
          </View>

          <ArrivalsSummary
            arrivals={arrivals}
            demands={demands}
            color={color}
          />
        </>
      )}

      {isOwned && hub && (
        <TouchableOpacity
          style={s.sellHubPrimary}
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

const share = StyleSheet.create({
  wrap: {
    gap: 5,
    marginTop: 6,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  playerFill: {
    height: "100%",
    borderRightColor: "rgba(0,0,0,0.25)",
  },
  aiSegment: {
    position: "absolute",
    top: 0,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftColor: "rgba(0,0,0,0.25)",
  },
  label: {
    fontSize: 9,
    color: Colors.dim,
    fontWeight: "700",
  },
});

const cap = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.025)",
    padding: Spacing.md,
    gap: 8,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "900",
  },
  percent: {
    fontSize: 13,
    fontWeight: "900",
  },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  sub: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
});

const dep = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stripe: {
    width: 3,
    alignSelf: "stretch",
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 7,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
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
  city: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
    minWidth: 76,
  },
  pax: {
    fontSize: 15,
    fontWeight: "900",
  },
  small: {
    fontSize: 9,
    color: Colors.dim,
    marginTop: 1,
  },
  waiting: {
    fontSize: 9,
    color: Colors.red,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.full,
  },
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
  meta: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  createTxt: {
    fontSize: 11,
    fontWeight: "900",
  },
  rangeHint: {
    flex: 1,
    fontSize: 9,
    color: Colors.purple,
    fontWeight: "700",
  },
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  origin: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "600",
  },
  pax: {
    fontSize: 11,
    color: Colors.muted,
    fontWeight: "600",
    flexShrink: 0,
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    padding: 4,
    marginTop: 2,
  },
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
  tierPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  ownedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  ownedPillText: {
    fontSize: 9,
    fontWeight: "900",
  },
  name: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "700",
    marginTop: 2,
  },
  location: {
    fontSize: 10,
    color: Colors.dim,
    lineHeight: 15,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
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
  bigMoney: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  lockBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.amber + "0a",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "44",
    padding: Spacing.sm,
  },
  lockText: {
    flex: 1,
    fontSize: 11,
    color: Colors.amber,
    fontWeight: "700",
    lineHeight: 15,
  },
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
  errorText: {
    flex: 1,
    fontSize: 11,
    color: Colors.red,
    fontWeight: "700",
  },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH + 4,
  },
  buyText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  ownedSummary: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.025)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: "flex-start",
  },
  refreshTxt: {
    fontSize: 11,
    fontWeight: "900",
  },
  refreshCost: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
  refreshError: {
    fontSize: 10,
    color: Colors.red,
    fontWeight: "700",
  },
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
  crowdingTitle: {
    fontSize: 13,
    fontWeight: "900",
  },
  crowdingCap: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "800",
  },
  crowdingText: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  crowdingNote: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
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
  waitingBadgeTxt: {
    fontSize: 9,
    color: Colors.red,
    fontWeight: "900",
  },
  emptyBoard: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyTxt: {
    fontSize: 12,
    color: Colors.dim,
    fontWeight: "700",
  },
  advanced: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  advancedLabel: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
  },
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
  },
  sellHubTxt: {
    fontSize: 11,
    color: Colors.red,
    fontWeight: "800",
  },
  sellHubPrimary: {
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

  sellHubTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },

  sellHubSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
  },
});
