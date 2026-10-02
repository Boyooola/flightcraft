/**
 * Route operations for active passenger markets.
 *
 * Market demand, rival carriage, scheduled seats, and carried passengers are
 * separate. This screen explains that flow without legacy popularity scores
 * or card-heavy dashboard UI.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useDeactivateRoute } from "@/hooks/useSupabaseWrite";
import { aiServesCorridor, type AIAirline } from "@/lib/AIAirline";
import { HUB_TIER_CONFIG, hubCrowdingLevel } from "@/lib/demands";
import { dailyFlights, fmtCash, normalizePriceStrategy } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type { Demand, OwnedHub, Route } from "@/store";
import {
  useAIAirlines,
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

type PriceStrategy = "low" | "standard" | "premium";

interface RouteStatus {
  label:
    | "Served"
    | "Operating"
    | "Capacity needed"
    | "Awaiting flight"
    | "Rival pressure";
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  priority: number;
  help: string;
}

interface RouteGroup {
  id: string;
  demand: Demand;
  routes: Route[];
  serviceLabel: string;
  planeLabel: string;
  marketPassengers: number;
  playerPassengerPool: number;
  carriedPassengers: number;
  waitingPassengers: number;
  rivalPassengers: number;
  servicePercent: number;
  scheduledSeats: number;
  capacityGap: number;
  totalReward: number;
  priceStrategy: PriceStrategy;
  status: RouteStatus;
  hubTrust: number;
  rivals: AIAirline[];
}

const PRICE_OPTIONS: {
  key: PriceStrategy;
  label: string;
}[] = [
  {
    key: "low",
    label: "Low fare",
  },
  {
    key: "standard",
    label: "Standard",
  },
  {
    key: "premium",
    label: "Premium",
  },
];

const PRICE_EXPLANATION: Record<PriceStrategy, string> = {
  low: "A lower fare can win more passengers, but each passenger earns less.",
  standard: "A balanced fare for most markets.",
  premium:
    "A higher fare earns more per passenger, but some travelers choose another airline.",
};

function passengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function playerPassengerPool(demand: Demand): number {
  const market = passengerCount(demand.base_pax_day);
  const carried = passengerCount(demand.delivered_pax_today);
  const rivalCarried = passengerCount(demand.ai_stolen_pax);

  // This is the live pool available to the player, not a claim that every
  // passenger has already chosen the airline. Keep already-carried passengers
  // in the pool if rival service is recorded later in the day.
  return Math.max(carried, market - rivalCarried);
}

function scheduledDailySeats(route: Route): number {
  const distance = Math.max(1, route.total_dist_nm ?? route.demand.dist_nm);
  const cycles = dailyFlights(
    distance,
    Math.max(1, route.plane.plane_model.speed_kts),
  );

  return passengerCount(route.plane.plane_model.pax_capacity) * cycles;
}

function buildRouteStatus(params: {
  playerPool: number;
  carried: number;
  waiting: number;
  capacityGap: number;
}): RouteStatus {
  if (params.playerPool <= 0) {
    return {
      label: "Rival pressure",
      color: Colors.red,
      icon: "trending-down-outline",
      priority: 2,
      help: "Rivals carried this market's available passengers. Review trust, fare, and route directness.",
    };
  }

  if (params.capacityGap > 0) {
    return {
      label: "Capacity needed",
      color: Colors.red,
      icon: "warning-outline",
      priority: 0,
      help: `${params.capacityGap.toLocaleString()} more daily seats are needed to cover the current passenger pool.`,
    };
  }

  if (params.waiting <= 0) {
    return {
      label: "Served",
      color: Colors.green,
      icon: "checkmark-circle-outline",
      priority: 4,
      help: "Every passenger currently available to your airline has been carried today.",
    };
  }

  if (params.carried <= 0) {
    return {
      label: "Awaiting flight",
      color: Colors.amber,
      icon: "time-outline",
      priority: 1,
      help: "The daily schedule has enough seats, but no passenger flight has completed yet today.",
    };
  }

  return {
    label: "Operating",
    color: Colors.green,
    icon: "airplane-outline",
    priority: 3,
    help: "Flights are moving passengers and the daily schedule has enough seats for the current pool.",
  };
}

function planeLabel(routes: Route[]): string {
  const aircraft = new Map<string, number>();
  routes.forEach((route) => {
    const name = route.plane.plane_model.nickname;
    aircraft.set(name, (aircraft.get(name) ?? 0) + 1);
  });

  return Array.from(aircraft.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(", ");
}

function serviceLabel(routes: Route[]): string {
  const labels: string[] = [];
  if (routes.some((route) => !route.via_iata)) labels.push("Direct");

  Array.from(
    new Set(
      routes
        .map((route) => route.via_iata)
        .filter((iata): iata is string => Boolean(iata)),
    ),
  ).forEach((iata) => labels.push(`Via ${iata}`));

  return labels.join(" + ") || "Scheduled service";
}

function OperationalRow({
  label,
  value,
  valueColor = Colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.operationalRow}>
      <Text style={styles.operationalLabel}>{label}</Text>
      <Text style={[styles.operationalValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

function RouteCompetition({ group }: { group: RouteGroup }) {
  if (group.rivals.length === 0) return null;

  const strongestRivalTrust = Math.round(group.rivals[0].trust);

  return (
    <View
      accessibilityLabel={`${group.rivals.length} rival ${group.rivals.length === 1 ? "airline" : "airlines"}. Your hub trust is ${Math.round(group.hubTrust)} percent. Strongest rival trust is ${strongestRivalTrust} percent.`}
      style={styles.competitionLine}
    >
      <Text style={styles.competitionLabel}>Rivals</Text>
      {group.rivals.slice(0, 2).map((airline) => (
        <View key={airline.id} style={styles.competitionIdentity}>
          <AirlineBrandMark
            accessibilityLabel=""
            logoId={airline.logoId}
            primary={airline.color}
            secondary={airline.secondaryColor}
            size={22}
            variant="leaderboard"
          />
          <Text style={styles.competitionCode}>{airline.code}</Text>
        </View>
      ))}
      {group.rivals.length > 2 ? (
        <Text style={styles.competitionMore}>+{group.rivals.length - 2}</Text>
      ) : null}
      <Text style={styles.competitionTrust}>
        Trust {Math.round(group.hubTrust)}% vs {strongestRivalTrust}%
      </Text>
    </View>
  );
}

function RouteGroupRow({
  group,
  deactivating,
  onAssignAircraft,
  onRemove,
  onPriceChange,
}: {
  group: RouteGroup;
  deactivating: boolean;
  onAssignAircraft: () => void;
  onRemove: (group: RouteGroup) => void;
  onPriceChange: (group: RouteGroup, strategy: PriceStrategy) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const weakestCondition = Math.min(
    ...group.routes.map((route) => route.plane.condition ?? 100),
  );
  const conditionWarning =
    weakestCondition <= 15
      ? `Critical aircraft condition: ${weakestCondition}%`
      : weakestCondition <= 40
        ? `Aircraft condition: ${weakestCondition}%`
        : null;

  return (
    <View style={[styles.routeRow, deactivating && styles.disabled]}>
      <TouchableOpacity
        accessibilityHint="Shows passenger flow and route controls"
        accessibilityLabel={`${group.demand.origin.iata} to ${group.demand.dest.iata}, ${group.status.label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.routeToggle}
        onPress={() => setExpanded((value) => !value)}
        activeOpacity={0.7}
      >
        <View style={styles.routeHeading}>
          <View style={styles.routeIdentity}>
            <View style={styles.routeCodes}>
              <Text style={styles.iata}>{group.demand.origin.iata}</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.muted} />
              <Text style={styles.iata}>{group.demand.dest.iata}</Text>
            </View>
            <Text style={styles.serviceLabel}>{group.serviceLabel}</Text>
          </View>

          <View style={styles.statusLine}>
            <Ionicons
              name={group.status.icon}
              size={14}
              color={group.status.color}
            />
            <Text style={[styles.statusText, { color: group.status.color }]}>
              {group.status.label}
            </Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={Colors.muted}
            />
          </View>
        </View>

        <Text style={styles.aircraftLine} numberOfLines={2}>
          {group.planeLabel} · {group.scheduledSeats.toLocaleString()} scheduled
          seats today
        </Text>

        <RouteCompetition group={group} />

        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Carried today</Text>
          <Text style={styles.progressValue}>
            {group.carriedPassengers.toLocaleString()} /{" "}
            {group.playerPassengerPool.toLocaleString()}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${group.servicePercent}%` as `${number}%`,
                backgroundColor: group.status.color,
              },
            ]}
          />
        </View>

        <Text style={styles.routeFacts}>
          {group.waitingPassengers.toLocaleString()} waiting ·{" "}
          {group.rivalPassengers.toLocaleString()} carried by rivals ·{" "}
          <Text
            style={{
              color:
                group.totalReward > 0
                  ? Colors.green
                  : group.totalReward < 0
                    ? Colors.red
                    : Colors.muted,
            }}
          >
            {group.totalReward > 0 ? "+" : ""}
            {group.totalReward === 0 ? "$0" : fmtCash(group.totalReward)} today
          </Text>
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.routeDetails}>
          <View style={styles.helpLine}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={group.status.color}
            />
            <Text style={styles.helpText}>{group.status.help}</Text>
          </View>

          {conditionWarning && (
            <View style={styles.helpLine}>
              <Ionicons
                name="construct-outline"
                size={16}
                color={weakestCondition <= 15 ? Colors.red : Colors.amber}
              />
              <Text style={styles.helpText}>{conditionWarning}</Text>
            </View>
          )}

          <View style={styles.dataTable}>
            <OperationalRow
              label="Total market demand"
              value={group.marketPassengers.toLocaleString()}
            />
            <OperationalRow
              label="Available to your airline"
              value={group.playerPassengerPool.toLocaleString()}
              valueColor={Colors.sky}
            />
            <OperationalRow
              label="Scheduled seats today"
              value={group.scheduledSeats.toLocaleString()}
            />
            <OperationalRow
              label="Carried by your airline"
              value={group.carriedPassengers.toLocaleString()}
              valueColor={Colors.green}
            />
            <OperationalRow
              label="Still waiting for you"
              value={group.waitingPassengers.toLocaleString()}
              valueColor={
                group.waitingPassengers > 0 ? Colors.amber : Colors.green
              }
            />
            {group.capacityGap > 0 ? (
              <OperationalRow
                label="Additional seats needed"
                value={group.capacityGap.toLocaleString()}
                valueColor={Colors.red}
              />
            ) : null}
            {group.rivalPassengers > 0 ? (
              <OperationalRow
                label="Carried by rivals"
                value={group.rivalPassengers.toLocaleString()}
              />
            ) : null}
            <OperationalRow
              label="Net today"
              value={
                group.totalReward === 0 ? "$0" : fmtCash(group.totalReward)
              }
              valueColor={
                group.totalReward > 0
                  ? Colors.green
                  : group.totalReward < 0
                    ? Colors.red
                    : Colors.muted
              }
            />
          </View>

          <View style={styles.pricingSection}>
            <Text style={styles.sectionTitle}>Fare strategy</Text>
            <View style={styles.priceOptions}>
              {PRICE_OPTIONS.map((option) => {
                const selected = option.key === group.priceStrategy;
                return (
                  <TouchableOpacity
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: deactivating }}
                    style={[
                      styles.priceOption,
                      selected && styles.priceOptionSelected,
                    ]}
                    onPress={() => onPriceChange(group, option.key)}
                    disabled={deactivating || selected}
                    activeOpacity={0.72}
                  >
                    <Text
                      style={[
                        styles.priceLabel,
                        selected && styles.priceLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.sectionHelp}>
              {PRICE_EXPLANATION[group.priceStrategy]}
            </Text>
          </View>

          <View style={styles.routeActions}>
            {group.capacityGap > 0 ? (
              <TouchableOpacity
                accessibilityLabel="Assign another aircraft from Fleet"
                accessibilityRole="button"
                style={styles.assignButton}
                onPress={onAssignAircraft}
                disabled={deactivating}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="airplane-outline"
                  size={17}
                  color={Colors.textOnColor}
                />
                <Text style={styles.assignButtonText}>Assign aircraft</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityLabel={`Close ${group.demand.origin.iata} to ${group.demand.dest.iata} route`}
              accessibilityRole="button"
              style={styles.removeButton}
              onPress={() => onRemove(group)}
              disabled={deactivating}
              activeOpacity={0.7}
            >
              <Text style={styles.removeText}>Close route</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {deactivating && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.sky} />
        </View>
      )}
    </View>
  );
}

function HubRow({
  hub,
  demands,
  routes,
  onPress,
}: {
  hub: OwnedHub;
  demands: Demand[];
  routes: Route[];
  onPress: () => void;
}) {
  const hubRoutes = routes.filter(
    (route) => route.active && route.hub_iata === hub.airport.iata,
  );
  const operatedDemandIds = new Set(hubRoutes.map((route) => route.demand.id));
  const operatedDemands = demands.filter((demand) =>
    operatedDemandIds.has(demand.id),
  );
  const available = operatedDemands.reduce(
    (total, demand) => total + playerPassengerPool(demand),
    0,
  );
  const carried = operatedDemands.reduce(
    (total, demand) => total + passengerCount(demand.delivered_pax_today),
    0,
  );
  const waiting = Math.max(0, available - carried);
  const service = percent(carried, available);
  const activeMarkets = operatedDemandIds.size;
  const routeLimit = HUB_TIER_CONFIG[hub.tier]?.routes ?? 0;
  const crowding = hubCrowdingLevel(
    hub.airport.iata,
    operatedDemands,
    hub.airport,
  );
  const isBusy = crowding?.level !== "normal";
  const trustColor =
    hub.trust >= 70
      ? Colors.green
      : hub.trust >= 40
        ? Colors.amber
        : Colors.red;

  return (
    <TouchableOpacity
      accessibilityLabel={`${hub.airport.iata} hub in ${hub.airport.city}, ${hub.trust}% trust`}
      accessibilityRole="button"
      style={styles.hubRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.hubHeading}>
        <View style={styles.hubIdentity}>
          <Text style={styles.iata}>{hub.airport.iata}</Text>
          <Text style={styles.hubCity} numberOfLines={1}>
            {hub.airport.city}
          </Text>
        </View>
        <View style={styles.hubTrust}>
          <Text style={[styles.hubTrustValue, { color: trustColor }]}>
            {Math.round(hub.trust)}%
          </Text>
          <Text style={styles.hubTrustLabel}>Trust</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
      </View>

      <View style={styles.hubMetrics}>
        <Text style={styles.hubMetric}>
          {activeMarkets} / {routeLimit} active markets
        </Text>
        <Text style={styles.inlineDivider}>·</Text>
        <Text
          style={[
            styles.hubMetric,
            { color: waiting > 0 ? Colors.amber : Colors.muted },
          ]}
        >
          {waiting.toLocaleString()} waiting
        </Text>
        {isBusy && (
          <>
            <Text style={styles.inlineDivider}>·</Text>
            <Text style={[styles.hubMetric, { color: Colors.amber }]}>
              Busy
            </Text>
          </>
        )}
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Carried today</Text>
        <Text style={styles.progressValue}>{service}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${service}%` as `${number}%`,
              backgroundColor: service >= 80 ? Colors.green : Colors.amber,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function RoutesSheet() {
  const routes = useRoutes();
  const hubs = useHubs();
  const aiAirlines = useAIAirlines();
  const routeEarnings = useRouteEarnings();
  const demands = useGameStore((state) => state.demands);
  const tabBarHeight = useTabBarHeight();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const startRouteCreation = useGameStore((state) => state.startRouteCreation);
  const haptics = useHaptics();
  const deactivateRoute = useDeactivateRoute();
  const gameAlert = useGameAlert();

  const [activeTab, setActiveTab] = useState<"routes" | "hubs">("routes");
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const activeRoutes = useMemo(
    () => routes.filter((route) => route.active),
    [routes],
  );

  const groupedRoutes = useMemo<RouteGroup[]>(() => {
    const routesByDemand = new Map<string, Route[]>();
    activeRoutes.forEach((route) => {
      const existing = routesByDemand.get(route.demand.id) ?? [];
      existing.push(route);
      routesByDemand.set(route.demand.id, existing);
    });

    return Array.from(routesByDemand.entries())
      .map(([demandId, marketRoutes]) => {
        const first = marketRoutes[0];
        const demand =
          demands.find((item) => item.id === demandId) ?? first.demand;
        const marketPassengers = passengerCount(demand.base_pax_day);
        const carriedPassengers = passengerCount(demand.delivered_pax_today);
        const rivalPassengers = passengerCount(demand.ai_stolen_pax);
        const playerPool = playerPassengerPool(demand);
        const waitingPassengers = Math.max(0, playerPool - carriedPassengers);
        const servicePercent = percent(carriedPassengers, playerPool);
        const scheduledSeats = marketRoutes.reduce(
          (total, route) => total + scheduledDailySeats(route),
          0,
        );
        const capacityGap = Math.max(0, playerPool - scheduledSeats);
        const status = buildRouteStatus({
          playerPool,
          carried: carriedPassengers,
          waiting: waitingPassengers,
          capacityGap,
        });
        const hubTrust =
          hubs.find((hub) => hub.airport.iata === demand.hub_iata)?.trust ?? 0;
        const rivals = aiAirlines
          .filter((airline) =>
            aiServesCorridor(airline, demand.origin.iata, demand.dest.iata),
          )
          .sort((first, second) => second.trust - first.trust);

        return {
          id: demandId,
          demand,
          routes: marketRoutes,
          serviceLabel: serviceLabel(marketRoutes),
          planeLabel: planeLabel(marketRoutes),
          marketPassengers,
          playerPassengerPool: playerPool,
          carriedPassengers,
          waitingPassengers,
          rivalPassengers,
          servicePercent,
          scheduledSeats,
          capacityGap,
          totalReward: marketRoutes.reduce(
            (total, route) => total + (routeEarnings[route.id] ?? 0),
            0,
          ),
          priceStrategy: normalizePriceStrategy(first.price_strategy),
          status,
          hubTrust,
          rivals,
        };
      })
      .sort((left, right) => {
        if (left.status.priority !== right.status.priority) {
          return left.status.priority - right.status.priority;
        }
        return left.demand.dest.iata.localeCompare(right.demand.dest.iata);
      });
  }, [activeRoutes, aiAirlines, demands, hubs, routeEarnings]);

  const totalAvailable = groupedRoutes.reduce(
    (total, group) => total + group.playerPassengerPool,
    0,
  );
  const totalCarried = groupedRoutes.reduce(
    (total, group) => total + group.carriedPassengers,
    0,
  );
  const totalWaiting = groupedRoutes.reduce(
    (total, group) => total + group.waitingPassengers,
    0,
  );
  const totalNet = groupedRoutes.reduce(
    (total, group) => total + group.totalReward,
    0,
  );
  const networkService = percent(totalCarried, totalAvailable);
  const capacityIssueCount = groupedRoutes.filter(
    (group) => group.status.label === "Capacity needed",
  ).length;

  const operatedDemandIds = useMemo(
    () => new Set(activeRoutes.map((route) => route.demand.id)),
    [activeRoutes],
  );
  const operatedDemands = useMemo(
    () => demands.filter((demand) => operatedDemandIds.has(demand.id)),
    [demands, operatedDemandIds],
  );
  const busyHubCount = hubs.filter((hub) => {
    const hubDemands = operatedDemands.filter(
      (demand) => demand.hub_iata === hub.airport.iata,
    );
    return (
      hubCrowdingLevel(hub.airport.iata, hubDemands, hub.airport)?.level !==
      "normal"
    );
  }).length;

  const handleCreateRoute = useCallback(() => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startRouteCreation(), 120);
  }, [closeSheet, haptics, startRouteCreation]);

  const handleAssignAircraft = useCallback(() => {
    haptics.tap();
    closeSheet();
    setTimeout(() => openSheet("fleet"), 120);
  }, [closeSheet, haptics, openSheet]);

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
              ? { ...route, price_strategy: strategy }
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
          title: "Fare not saved",
          message: "Unable to update the route. Try again.",
          buttons: [{ label: "OK", style: "cancel" }],
        });
        return;
      }

      haptics.success();
    },
    [gameAlert, haptics],
  );

  const handleRemove = useCallback(
    (group: RouteGroup) => {
      haptics.confirm();
      const routeLabel = `${group.demand.origin.iata} to ${group.demand.dest.iata}`;

      gameAlert.show({
        icon: "close-circle-outline",
        title: "Close route",
        message: `Close ${routeLabel}? ${group.routes.length} aircraft assignment${group.routes.length === 1 ? "" : "s"} will be removed.`,
        buttons: [
          { label: "Keep route", style: "cancel" },
          {
            label: "Close route",
            style: "destructive",
            onPress: async () => {
              setDeactivating(group.id);
              for (const route of group.routes) {
                const { error } = await deactivateRoute(route.id);
                if (error) {
                  setDeactivating(null);
                  haptics.error();
                  gameAlert.show({
                    title: "Route not closed",
                    message: "Unable to close the route. Try again.",
                    buttons: [{ label: "OK", style: "cancel" }],
                  });
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
    [deactivateRoute, gameAlert, haptics],
  );

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Routes</Text>
          <Text style={styles.subtitle}>
            {groupedRoutes.length} active market
            {groupedRoutes.length === 1 ? "" : "s"} · {activeRoutes.length}{" "}
            aircraft
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close route operations"
          accessibilityRole="button"
          style={styles.iconButton}
          onPress={() => {
            haptics.tap();
            closeSheet();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={21} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(["routes", "hubs"] as const).map((tab) => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.tabText, selected && styles.tabTextSelected]}
              >
                {tab === "routes" ? "Routes" : "Hubs"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === "routes" && (
        <>
          {activeRoutes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={28} color={Colors.sky} />
              <Text style={styles.emptyTitle}>Open your first route</Text>
              <Text style={styles.emptyText}>
                Buy an aircraft, choose a destination from one of your hubs,
                then assign the aircraft to that route.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.primaryButton}
                onPress={handleCreateRoute}
                activeOpacity={0.72}
              >
                <Text style={styles.primaryButtonText}>Open map</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.summary}>
                <View style={styles.summaryMetric}>
                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          networkService >= 80 ? Colors.green : Colors.amber,
                      },
                    ]}
                  >
                    {networkService}%
                  </Text>
                  <Text style={styles.summaryLabel}>Carried</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryMetric}>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: totalWaiting > 0 ? Colors.amber : Colors.green },
                    ]}
                  >
                    {totalWaiting.toLocaleString()}
                  </Text>
                  <Text style={styles.summaryLabel}>Waiting</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryMetric}>
                  <Text
                    style={[
                      styles.summaryValue,
                      {
                        color:
                          totalNet > 0
                            ? Colors.green
                            : totalNet < 0
                              ? Colors.red
                              : Colors.muted,
                      },
                    ]}
                  >
                    {totalNet > 0 ? "+" : ""}
                    {totalNet === 0 ? "$0" : fmtCash(totalNet)}
                  </Text>
                  <Text style={styles.summaryLabel}>Net today</Text>
                </View>
              </View>

              {capacityIssueCount > 0 && (
                <View style={styles.notice}>
                  <Ionicons
                    name="warning-outline"
                    size={17}
                    color={Colors.amber}
                  />
                  <Text style={styles.noticeText}>
                    Daily seats are short on {capacityIssueCount} market
                    {capacityIssueCount === 1 ? "" : "s"}. Assign another
                    aircraft to cover the gap.
                  </Text>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Active markets</Text>
              </View>
              <View style={styles.list}>
                {groupedRoutes.map((group) => (
                  <RouteGroupRow
                    key={group.id}
                    group={group}
                    deactivating={deactivating === group.id}
                    onAssignAircraft={handleAssignAircraft}
                    onRemove={handleRemove}
                    onPriceChange={handlePriceChange}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {activeTab === "hubs" && (
        <>
          {hubs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={28} color={Colors.sky} />
              <Text style={styles.emptyTitle}>Build your first hub</Text>
              <Text style={styles.emptyText}>
                Select an airport on the map, then choose Build hub.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {hubs.length} hub{hubs.length === 1 ? "" : "s"} ·{" "}
                  {busyHubCount} need attention
                </Text>
              </View>
              <View style={styles.list}>
                {hubs.map((hub) => (
                  <HubRow
                    key={hub.id}
                    hub={hub}
                    demands={demands}
                    routes={activeRoutes}
                    onPress={() => {
                      closeSheet();
                      setTimeout(() => openSheet("airport", hub.airport), 120);
                    }}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      <View style={styles.bottomSpace} />
      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingTop: Spacing.xs },
  header: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  tabs: {
    minHeight: 45,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabSelected: { borderBottomColor: Colors.sky },
  tabText: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  tabTextSelected: { color: Colors.sky },
  summary: {
    minHeight: 72,
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  summaryMetric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  summaryValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 15,
    fontWeight: Typography.weight.bold,
  },
  summaryLabel: { color: Colors.muted, fontSize: 10, marginTop: 3 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  noticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: 18,
  },
  sectionHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  sectionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  list: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  routeRow: {
    position: "relative",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  routeToggle: {
    minHeight: 142,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  routeHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  routeIdentity: { flex: 1, minWidth: 0 },
  routeCodes: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iata: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 17,
    fontWeight: Typography.weight.bold,
  },
  serviceLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    marginTop: 2,
  },
  statusLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusText: {
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
  },
  aircraftLine: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  competitionLine: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  competitionLabel: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginRight: Spacing.xxs,
  },
  competitionIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  competitionCode: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: Typography.weight.semibold,
  },
  competitionMore: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
  },
  competitionTrust: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
    lineHeight: 13,
    marginLeft: "auto",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    marginBottom: 6,
  },
  progressLabel: { flex: 1, color: Colors.muted, fontSize: 10 },
  progressValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.inset,
    overflow: "hidden",
  },
  progressFill: { height: 4 },
  routeFacts: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  routeDetails: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  helpLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  helpText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  dataTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  operationalRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  operationalLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
  operationalValue: {
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
    textAlign: "right",
  },
  pricingSection: { paddingTop: Spacing.lg },
  sectionHelp: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  priceOptions: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  priceOption: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  priceOptionSelected: { backgroundColor: Colors.sky },
  priceLabel: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  priceLabelSelected: { color: Colors.textOnColor },
  routeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  assignButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  assignButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  removeButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  removeText: {
    color: Colors.red,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  disabled: { opacity: 0.55 },
  hubRow: {
    minHeight: 130,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hubHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  hubIdentity: { flex: 1, minWidth: 0 },
  hubCity: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    marginTop: 2,
  },
  hubTrust: { alignItems: "flex-end" },
  hubTrustValue: {
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  hubTrustLabel: { color: Colors.muted, fontSize: 9 },
  hubMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    marginTop: Spacing.sm,
  },
  hubMetric: { color: Colors.muted, fontSize: Typography.size.caption },
  inlineDivider: { color: Colors.dim, fontSize: Typography.size.caption },
  emptyState: {
    alignItems: "flex-start",
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.md,
  },
  emptyText: {
    maxWidth: 330,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  primaryButton: {
    minWidth: 128,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  bottomSpace: { height: 36 },
});
