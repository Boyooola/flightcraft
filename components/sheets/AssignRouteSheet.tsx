/**
 * Aircraft-first route assignment.
 *
 * This screen answers one question: where should the selected aircraft fly?
 * Routes are ranked by whether the aircraft can serve them and by estimated
 * departure result. Out-of-range routes continue into the one-stop planner while
 * preserving the selected aircraft.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useCreateRoute } from "@/hooks/useSupabaseWrite";
import { aiServesCorridor, type AIAirline } from "@/lib/AIAirline";
import { maxRoutesForTier } from "@/lib/demands";
import {
  playerPassengerPoolForDemand,
  totalScheduledDailySeats,
  waitingPaxForDemand,
} from "@/lib/passengerFlow";
import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import type { Demand, OwnedHub, Route } from "@/store";
import {
  useAIAirlines,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
  useSelectedPlane,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type IconName = keyof typeof Ionicons.glyphMap;

interface RouteOption {
  demand: Demand;
  hub: OwnedHub;
  hasActiveRoute: boolean;
  scheduledSeats: number;
  waitingPassengers: number;
  estimatedResult: number;
  inRange: boolean;
  capacityCovered: boolean;
  routeSlotAvailable: boolean;
  activeRouteCount: number;
  routeLimit: number;
  seatGap: number;
  rivals: AIAirline[];
}

interface RouteAction {
  label: string;
  icon: IconName;
  secondary: boolean;
  disabled: boolean;
  onPress: () => void;
}

function safeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function friendlyCreationError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already assigned") ||
    normalized.includes("cannot operate") ||
    normalized.includes("unable to calculate")
  ) {
    return message.endsWith(".") ? message : `${message}.`;
  }

  return "Unable to open the route. Check your connection and try again.";
}

function InlineNotice({
  title,
  message,
  kind = "info",
}: {
  title: string;
  message: string;
  kind?: "info" | "warning" | "error";
}) {
  const color =
    kind === "error"
      ? Colors.red
      : kind === "warning"
        ? Colors.amber
        : Colors.skyDark;
  const icon: IconName =
    kind === "error"
      ? "warning-outline"
      : kind === "warning"
        ? "alert-circle-outline"
        : "information-circle-outline";

  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : "text"}
      style={styles.notice}
    >
      <Ionicons name={icon} size={18} color={color} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color }]}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

function AircraftMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.aircraftMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function routeStatus(option: RouteOption): {
  icon: IconName;
  text: string;
  color: string;
} {
  if (!option.routeSlotAvailable) {
    return {
      icon: "alert-circle-outline",
      text: `Hub route limit reached (${option.activeRouteCount}/${option.routeLimit})`,
      color: Colors.amber,
    };
  }

  if (option.capacityCovered) {
    return {
      icon: "checkmark-circle-outline",
      text: "Existing aircraft cover this demand",
      color: Colors.green,
    };
  }

  if (option.estimatedResult < 0) {
    return {
      icon: "warning-outline",
      text: "Estimated to operate at a loss",
      color: Colors.red,
    };
  }

  if (option.hasActiveRoute) {
    return {
      icon: "add-circle-outline",
      text: `${option.seatGap.toLocaleString()} more daily seats needed`,
      color: Colors.skyDark,
    };
  }

  return {
    icon: "checkmark-circle-outline",
    text: "Aircraft can serve this route directly",
    color: Colors.green,
  };
}

function RouteCompetition({ option }: { option: RouteOption }) {
  if (option.rivals.length === 0) return null;

  const strongestRivalTrust = Math.round(option.rivals[0].trust);

  return (
    <View
      accessibilityLabel={`${option.rivals.length} rival ${option.rivals.length === 1 ? "airline" : "airlines"}. Your hub trust is ${Math.round(option.hub.trust)} percent. Strongest rival trust is ${strongestRivalTrust} percent.`}
      style={styles.competitionLine}
    >
      <Text style={styles.competitionLabel}>Rivals</Text>
      {option.rivals.slice(0, 2).map((airline) => (
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
      {option.rivals.length > 2 ? (
        <Text style={styles.competitionMore}>+{option.rivals.length - 2}</Text>
      ) : null}
      <Text style={styles.competitionTrust}>
        Trust {Math.round(option.hub.trust)}% vs {strongestRivalTrust}%
      </Text>
    </View>
  );
}

function RouteRow({
  option,
  planeRange,
  loading,
  interactionLocked,
  onAssign,
  onPlanStop,
  onViewRoutes,
}: {
  option: RouteOption;
  planeRange: number;
  loading: boolean;
  interactionLocked: boolean;
  onAssign: (demand: Demand) => void;
  onPlanStop: (demand: Demand) => void;
  onViewRoutes: () => void;
}) {
  const { demand } = option;
  const status = !option.inRange
    ? {
        icon: "git-branch-outline" as IconName,
        text: `Direct route exceeds this aircraft's range by ${Math.max(
          0,
          Math.ceil(demand.dist_nm - planeRange),
        ).toLocaleString()} nm`,
        color: Colors.amber,
      }
    : routeStatus(option);

  let action: RouteAction | null = null;
  if (!option.inRange) {
    action = {
      label: "Plan one stop",
      icon: "git-branch-outline",
      secondary: true,
      disabled: interactionLocked,
      onPress: () => onPlanStop(demand),
    };
  } else if (!option.routeSlotAvailable) {
    action = {
      label: "View routes",
      icon: "list-outline",
      secondary: true,
      disabled: interactionLocked,
      onPress: onViewRoutes,
    };
  } else if (!option.capacityCovered) {
    action = {
      label: option.hasActiveRoute ? "Add aircraft" : "Open route",
      icon: option.hasActiveRoute ? "add" : "arrow-forward",
      secondary: false,
      disabled: interactionLocked,
      onPress: () => onAssign(demand),
    };
  }

  const resultColor =
    option.estimatedResult > 0
      ? Colors.green
      : option.estimatedResult < 0
        ? Colors.red
        : Colors.muted;

  return (
    <View style={styles.routeRow}>
      <View style={styles.routeTopLine}>
        <View style={styles.routeIdentity}>
          <View style={styles.routeCodes}>
            <Text style={styles.routeCode}>{demand.origin.iata}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.muted} />
            <Text style={styles.routeCode}>{demand.dest.iata}</Text>
          </View>
          <Text numberOfLines={1} style={styles.destinationName}>
            {demand.dest.city || demand.dest.name}
          </Text>
        </View>

        <View style={styles.routeResult}>
          <Text
            style={[
              styles.routeResultValue,
              {
                color:
                  option.inRange && !option.capacityCovered
                    ? resultColor
                    : Colors.muted,
              },
            ]}
          >
            {!option.inRange
              ? "One stop"
              : option.capacityCovered
                ? "Covered"
                : `${option.estimatedResult > 0 ? "+" : ""}${fmtCash(
                    option.estimatedResult,
                  )}`}
          </Text>
          <Text style={styles.routeResultLabel}>
            {option.inRange && !option.capacityCovered
              ? "Est. next flight"
              : "Route status"}
          </Text>
        </View>
      </View>

      <Text style={styles.routeFacts}>
        {Math.round(demand.dist_nm).toLocaleString()} nm ·{" "}
        {safeCount(demand.base_pax_day).toLocaleString()} daily ·{" "}
        {option.waitingPassengers.toLocaleString()} waiting ·{" "}
        {option.seatGap.toLocaleString()} seats needed
      </Text>

      <View style={styles.statusLine}>
        <Ionicons name={status.icon} size={16} color={status.color} />
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.text}
        </Text>
      </View>

      <RouteCompetition option={option} />

      {action ? (
        <TouchableOpacity
          accessibilityLabel={`${action.label} ${demand.origin.iata} to ${demand.dest.iata}`}
          accessibilityRole="button"
          accessibilityState={{ busy: loading, disabled: action.disabled }}
          activeOpacity={0.72}
          disabled={action.disabled}
          onPress={action.onPress}
          style={[
            styles.routeAction,
            action.secondary && styles.secondaryAction,
            action.disabled && styles.actionDisabled,
          ]}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color={Colors.textOnColor} />
              <Text style={styles.routeActionText}>Assigning aircraft</Text>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.routeActionText,
                  action.secondary && styles.secondaryActionText,
                ]}
              >
                {action.label}
              </Text>
              <Ionicons
                name={action.icon}
                size={16}
                color={action.secondary ? Colors.skyDark : Colors.textOnColor}
              />
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function optionPriority(option: RouteOption): number {
  if (option.inRange && option.routeSlotAvailable && !option.capacityCovered) {
    return 0;
  }
  if (!option.inRange) return 1;
  if (!option.routeSlotAvailable) return 2;
  return 3;
}

export default function AssignRouteSheet() {
  const tabBarHeight = useTabBarHeight();
  const createRoute = useCreateRoute();
  const haptics = useHaptics();
  const plane = useSelectedPlane();
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const aiAirlines = useAIAirlines();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const startRouteCreation = useGameStore((state) => state.startRouteCreation);
  const assignmentInFlight = useRef(false);
  const [creatingDemandId, setCreatingDemandId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planeBusy = useMemo(() => {
    if (!plane) return false;
    return (
      Boolean(plane.route_id) ||
      routes.some((route) => route.active && route.plane.id === plane.id)
    );
  }, [plane, routes]);

  const options = useMemo<RouteOption[]>(() => {
    if (!plane) return [];

    const hubByIata = new Map(hubs.map((hub) => [hub.airport.iata, hub]));
    const routesByDemand = new Map<string, Route[]>();
    const activeDemandIdsByHub = new Map<string, Set<string>>();

    routes
      .filter((route) => route.active)
      .forEach((route) => {
        const demandRoutes = routesByDemand.get(route.demand.id) ?? [];
        demandRoutes.push(route);
        routesByDemand.set(route.demand.id, demandRoutes);

        const hubDemandIds =
          activeDemandIdsByHub.get(route.hub_iata) ?? new Set<string>();
        hubDemandIds.add(route.demand.id);
        activeDemandIdsByHub.set(route.hub_iata, hubDemandIds);
      });

    return demands
      .map((demand): RouteOption | null => {
        const hub = hubByIata.get(demand.hub_iata);
        if (!hub) return null;

        const activeRoutes = routesByDemand.get(demand.id) ?? [];
        const scheduledSeats = totalScheduledDailySeats(activeRoutes);
        const availableDailyDemand = playerPassengerPoolForDemand(demand);
        const unassignedPassengers = Math.max(
          0,
          availableDailyDemand - scheduledSeats,
        );
        const estimatedBoarding = Math.min(
          plane.plane_model.pax_capacity,
          unassignedPassengers,
        );
        const passengerMix = passengerMixFromDistance(demand.dist_nm);
        const estimatedResult = calcRouteRevenue({
          distNm: demand.dist_nm,
          speedKts: plane.plane_model.speed_kts,
          trustPct: hub.trust,
          boardedPax: estimatedBoarding,
          seatCapacity: plane.plane_model.pax_capacity,
          costPerSector: plane.plane_model.cost_per_sector ?? 500,
          fuelPerNm: plane.plane_model.fuel_per_nm ?? 2,
          crowdMultiplier: 1,
          priceStrategy: "standard",
          priceElasticity: demand.price_elasticity ?? 1,
          congestionMultiplier: 1,
          businessPct: passengerMix.businessPct,
          leisurePct: passengerMix.leisurePct,
        }).net;
        const activeRouteCount =
          activeDemandIdsByHub.get(demand.hub_iata)?.size ?? 0;
        const routeLimit = maxRoutesForTier(hub.tier);
        const hasActiveRoute = activeRoutes.length > 0;
        const routeSlotAvailable =
          hasActiveRoute || activeRouteCount < routeLimit;
        const capacityCovered =
          hasActiveRoute && scheduledSeats >= availableDailyDemand;
        const rivals = aiAirlines
          .filter((rival) =>
            aiServesCorridor(rival, demand.origin.iata, demand.dest.iata),
          )
          .sort((first, second) => second.trust - first.trust);

        return {
          demand,
          hub,
          hasActiveRoute,
          scheduledSeats,
          waitingPassengers: waitingPaxForDemand(demand),
          estimatedResult,
          inRange: plane.plane_model.range_nm >= demand.dist_nm,
          capacityCovered,
          routeSlotAvailable,
          activeRouteCount,
          routeLimit,
          seatGap: unassignedPassengers,
          rivals,
        };
      })
      .filter((option): option is RouteOption => option !== null)
      .sort((first, second) => {
        const priorityDifference =
          optionPriority(first) - optionPriority(second);
        if (priorityDifference !== 0) return priorityDifference;
        if (first.estimatedResult !== second.estimatedResult) {
          return second.estimatedResult - first.estimatedResult;
        }
        if (first.waitingPassengers !== second.waitingPassengers) {
          return second.waitingPassengers - first.waitingPassengers;
        }
        return first.demand.dest.iata.localeCompare(second.demand.dest.iata);
      });
  }, [aiAirlines, demands, hubs, plane, routes]);

  const dismiss = useCallback(() => {
    haptics.tap();
    closeSheet();
  }, [closeSheet, haptics]);

  const openAfterClose = useCallback(
    (sheet: "fleet" | "routes") => {
      haptics.tap();
      closeSheet();
      setTimeout(() => openSheet(sheet), 120);
    },
    [closeSheet, haptics, openSheet],
  );

  const viewRoutes = useCallback(
    () => openAfterClose("routes"),
    [openAfterClose],
  );

  const openFleet = useCallback(
    () => openAfterClose("fleet"),
    [openAfterClose],
  );

  const planStop = useCallback(
    (demand: Demand) => {
      haptics.tap();
      // startRouteCreation closes the sheet without clearing selectedPlane.
      // Calling closeSheet first would lose the aircraft the player chose.
      startRouteCreation([demand.origin, demand.dest]);
    },
    [haptics, startRouteCreation],
  );

  const handleAssign = useCallback(
    async (demand: Demand) => {
      if (!plane || assignmentInFlight.current) return;

      if (planeBusy) {
        setError(
          `${plane.plane_model.nickname} is already assigned. Choose an idle aircraft from Fleet.`,
        );
        haptics.warning();
        return;
      }

      const option = options.find((item) => item.demand.id === demand.id);
      if (!option) {
        setError("This route opportunity is no longer available.");
        haptics.error();
        return;
      }
      if (!option.inRange) {
        planStop(demand);
        return;
      }
      if (!option.routeSlotAvailable) {
        setError(
          `${option.hub.airport.iata} has reached its route limit. Upgrade the hub or close a route first.`,
        );
        haptics.warning();
        return;
      }
      if (option.capacityCovered) {
        setError("Existing aircraft already cover this market's daily demand.");
        haptics.warning();
        return;
      }

      assignmentInFlight.current = true;
      setCreatingDemandId(demand.id);
      setError(null);
      haptics.confirm();

      try {
        const result = await createRoute(demand, plane);
        if (result.error) {
          setError(friendlyCreationError(result.error));
          haptics.error();
          return;
        }

        haptics.success();
        closeSheet();
      } catch {
        setError(
          "Unable to open the route. Check your connection and try again.",
        );
        haptics.error();
      } finally {
        assignmentInFlight.current = false;
        setCreatingDemandId(null);
      }
    },
    [closeSheet, createRoute, haptics, options, planStop, plane, planeBusy],
  );

  if (!plane) {
    return (
      <View style={[styles.missingState, { paddingBottom: tabBarHeight }]}>
        <Ionicons name="airplane-outline" size={24} color={Colors.skyDark} />
        <Text style={styles.missingTitle}>Choose an aircraft first</Text>
        <Text style={styles.missingText}>
          Open Fleet, select an idle aircraft, then choose Assign route.
        </Text>
        <TouchableOpacity
          accessibilityLabel="Open fleet"
          accessibilityRole="button"
          activeOpacity={0.72}
          onPress={openFleet}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Open Fleet</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.textOnColor} />
        </TouchableOpacity>
      </View>
    );
  }

  const readyOptions = options.filter(
    (option) =>
      option.inRange && option.routeSlotAvailable && !option.capacityCovered,
  ).length;
  const stopOptions = options.filter((option) => !option.inRange).length;

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
          <Text style={styles.title}>Dispatch aircraft</Text>
          <Text style={styles.subtitle}>
            Choose one route for this aircraft
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close aircraft dispatch"
          accessibilityRole="button"
          activeOpacity={0.72}
          onPress={dismiss}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.aircraftSection}>
        <View style={styles.aircraftTitleRow}>
          <View style={styles.aircraftIdentity}>
            <Ionicons
              name="airplane-outline"
              size={19}
              color={Colors.skyDark}
            />
            <Text numberOfLines={1} style={styles.aircraftName}>
              {plane.plane_model.nickname}
            </Text>
          </View>
          <Text
            style={[
              styles.aircraftAvailability,
              planeBusy && styles.aircraftUnavailable,
            ]}
          >
            {planeBusy ? "Assigned" : "Ready"}
          </Text>
        </View>
        <View style={styles.aircraftMetrics}>
          <AircraftMetric
            label="Seats"
            value={plane.plane_model.pax_capacity.toLocaleString()}
          />
          <AircraftMetric
            label="Direct range"
            value={`${plane.plane_model.range_nm.toLocaleString()} nm`}
          />
        </View>
      </View>

      {planeBusy ? (
        <View style={styles.stateSection}>
          <InlineNotice
            kind="warning"
            title="Aircraft already assigned"
            message="Review its current route before moving it to another service."
          />
          <TouchableOpacity
            accessibilityLabel="View active routes"
            accessibilityRole="button"
            activeOpacity={0.72}
            onPress={viewRoutes}
            style={styles.secondaryWideButton}
          >
            <Text style={styles.secondaryWideButtonText}>View routes</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.skyDark} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.helpSection}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={Colors.skyDark}
            />
            <Text style={styles.helpText}>
              Daily is total market demand. Waiting is the passenger pool still
              available to your airline after rival preference and today&apos;s
              completed service.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorSection}>
              <InlineNotice
                kind="error"
                title="Aircraft not assigned"
                message={error}
              />
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Route opportunities</Text>
            <Text style={styles.sectionCount}>
              {readyOptions} ready · {stopOptions} need one stop
            </Text>
          </View>

          {options.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No route opportunities</Text>
              <Text style={styles.emptyText}>
                {hubs.length === 0
                  ? "Build your first hub to receive passenger demand."
                  : "New opportunities are generated at the start of the next game day."}
              </Text>
            </View>
          ) : (
            <View style={styles.routeList}>
              {options.map((option) => (
                <RouteRow
                  key={option.demand.id}
                  interactionLocked={creatingDemandId !== null}
                  loading={creatingDemandId === option.demand.id}
                  onAssign={handleAssign}
                  onPlanStop={planStop}
                  onViewRoutes={viewRoutes}
                  option={option}
                  planeRange={plane.plane_model.range_nm}
                />
              ))}
            </View>
          )}
        </>
      )}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
  },
  content: {
    backgroundColor: Colors.surface,
  },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSection,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
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
    marginTop: Spacing.xxs,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  aircraftSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSection,
  },
  aircraftTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  aircraftIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aircraftName: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  aircraftAvailability: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  aircraftUnavailable: {
    color: Colors.amber,
  },
  aircraftMetrics: {
    flexDirection: "row",
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  aircraftMetric: {
    flex: 1,
    minWidth: 0,
    paddingTop: Spacing.sm,
  },
  metricLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  metricValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xxs,
  },
  helpSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.skyDim,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  helpText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  stateSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  errorSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  noticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  noticeTitle: {
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  noticeMessage: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  sectionHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSection,
  },
  sectionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  sectionCount: {
    flexShrink: 0,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "right",
  },
  routeList: {
    paddingHorizontal: Spacing.lg,
  },
  routeRow: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSection,
  },
  routeTopLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  routeIdentity: {
    flex: 1,
    minWidth: 0,
  },
  routeCodes: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  routeCode: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  destinationName: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  routeResult: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  routeResultValue: {
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  routeResultLabel: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  routeFacts: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 15,
    marginTop: Spacing.sm,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
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
  routeAction: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  routeActionText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  secondaryAction: {
    borderWidth: 1,
    borderColor: Colors.borderSection,
    backgroundColor: Colors.surface,
  },
  secondaryActionText: {
    color: Colors.skyDark,
  },
  actionDisabled: {
    opacity: 0.52,
  },
  secondaryWideButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  secondaryWideButtonText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  emptyState: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  emptyText: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
    marginTop: Spacing.xs,
  },
  missingState: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    backgroundColor: Colors.surface,
  },
  missingTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.md,
  },
  missingText: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    marginTop: Spacing.sm,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
});
