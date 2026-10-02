/**
 * Route planning and aircraft dispatch.
 *
 * One dispatch assigns one aircraft. This keeps persistence atomic and makes
 * route cost, range, availability, and failure feedback unambiguous.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { gameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useCreateCustomRoute, useCreateRoute } from "@/hooks/useSupabaseWrite";
import { aiServesCorridor, type AIAirline } from "@/lib/AIAirline";
import { haulClass, maxRoutesForTier, simulatePaxDay } from "@/lib/demands";
import {
  playerPassengerPoolForDemand,
  totalScheduledDailySeats,
  waitingPaxForDemand,
  type PassengerFlowDemand,
} from "@/lib/passengerFlow";
import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { calcRouteRevenue, dailyFlights, fmtCash } from "@/lib/revenue";
import { distNm } from "@/lib/routing";
import type { Airport, OwnedPlane } from "@/store";
import {
  useAIAirlines,
  useCash,
  useDemands,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRouteCreationWaypoints,
  useRoutes,
  useSelectedPlane,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const CREATION_FEE: Record<string, number> = {
  short: 50_000,
  medium: 150_000,
  long: 300_000,
};

interface AircraftOption {
  plane: OwnedPlane;
  canServe: boolean;
  reason: string;
  estimatedResult: number;
  dailyPassengers: number;
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
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

function DataRow({
  label,
  value,
  valueColor = Colors.text,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.dataValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

function InlineNotice({
  kind,
  title,
  message,
}: {
  kind: "warning" | "error" | "info";
  title: string;
  message: string;
}) {
  const color =
    kind === "error"
      ? Colors.red
      : kind === "warning"
        ? Colors.amber
        : Colors.skyDark;
  const icon =
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

function CompetitionSection({
  competitors,
  originIata,
  destinationIata,
}: {
  competitors: AIAirline[];
  originIata: string;
  destinationIata: string;
}) {
  if (competitors.length === 0) return null;

  return (
    <View style={styles.competitionSection}>
      <SectionHeader
        title="Competition"
        detail={`${competitors.length} ${competitors.length === 1 ? "airline" : "airlines"}`}
      />
      <View style={styles.competitionList}>
        {competitors.map((airline) => (
          <View
            accessibilityLabel={`${airline.name}, ${airline.code}, serves ${originIata} to ${destinationIata}, ${Math.round(airline.trust)} percent trust.`}
            key={airline.id}
            style={styles.competitionRow}
          >
            <AirlineBrandMark
              accessibilityLabel=""
              logoId={airline.logoId}
              primary={airline.color}
              secondary={airline.secondaryColor}
              size={34}
              variant="leaderboard"
            />
            <View style={styles.competitionIdentity}>
              <Text numberOfLines={1} style={styles.competitionName}>
                {airline.name}
              </Text>
              <Text style={styles.competitionCode}>
                {airline.code} · Serves this market
              </Text>
            </View>
            <View style={styles.competitionTrust}>
              <Text style={styles.competitionTrustValue}>
                {Math.round(airline.trust)}%
              </Text>
              <Text style={styles.competitionTrustLabel}>Trust</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.competitionHelp}>
        Passengers compare trust, fare, and route directness when choosing an
        airline.
      </Text>
    </View>
  );
}

function RoutePath({
  waypoints,
  onRemove,
}: {
  waypoints: Airport[];
  onRemove: (iata: string) => void;
}) {
  return (
    <View style={styles.pathTable}>
      {waypoints.map((airport, index) => {
        const isOrigin = index === 0;
        const isDestination = index === waypoints.length - 1;
        const label = isOrigin
          ? "Origin"
          : isDestination
            ? "Destination"
            : "Stop";

        return (
          <View key={`${airport.iata}-${index}`} style={styles.pathRow}>
            <Text style={styles.pathLabel}>{label}</Text>
            <View style={styles.pathAirport}>
              <Text style={styles.pathCode}>{airport.iata}</Text>
              <Text numberOfLines={1} style={styles.pathCity}>
                {[airport.city, airport.country].filter(Boolean).join(", ")}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={`Remove ${airport.iata} from route`}
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => onRemove(airport.iata)}
              style={styles.pathRemove}
            >
              <Ionicons name="close" size={18} color={Colors.muted} />
            </TouchableOpacity>
          </View>
        );
      })}

      {waypoints.length < 3 ? (
        <View style={styles.stopHint}>
          <Ionicons name="add-circle-outline" size={17} color={Colors.muted} />
          <Text style={styles.stopHintText}>
            Need more range? Tap one airport on the map to add a stop.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AircraftRow({
  option,
  selected,
  recommended,
  onSelect,
}: {
  option: AircraftOption;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const { plane, canServe, reason, estimatedResult, dailyPassengers } = option;
  const model = plane.plane_model;
  const resultColor =
    estimatedResult > 0
      ? Colors.green
      : estimatedResult < 0
        ? Colors.red
        : Colors.muted;

  return (
    <TouchableOpacity
      accessibilityHint={canServe ? "Select this aircraft" : reason}
      accessibilityLabel={`${model.nickname}, ${model.pax_capacity} seats, ${model.range_nm} nautical mile range${selected ? ", selected" : ""}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !canServe }}
      activeOpacity={0.7}
      disabled={!canServe}
      onPress={onSelect}
      style={[
        styles.aircraftRow,
        selected && styles.aircraftRowSelected,
        !canServe && styles.aircraftRowDisabled,
      ]}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? Colors.sky : Colors.muted}
      />
      <View style={styles.aircraftCopy}>
        <View style={styles.aircraftNameRow}>
          <Text numberOfLines={1} style={styles.aircraftName}>
            {model.nickname}
          </Text>
          {recommended && canServe ? (
            <Text style={styles.recommendedText}>Recommended</Text>
          ) : null}
        </View>
        <Text style={styles.aircraftSpecs}>
          {model.pax_capacity} seats · {model.range_nm.toLocaleString()} nm
          range
        </Text>
        {canServe ? (
          <Text style={styles.aircraftBoarding}>
            About {dailyPassengers.toLocaleString()} passengers per day
          </Text>
        ) : (
          <Text style={styles.aircraftUnavailable}>{reason}</Text>
        )}
      </View>
      {canServe ? (
        <View style={styles.aircraftResult}>
          <Text style={[styles.aircraftResultValue, { color: resultColor }]}>
            {estimatedResult > 0 ? "+" : ""}
            {fmtCash(estimatedResult)}
          </Text>
          <Text style={styles.aircraftResultLabel}>Est. daily</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function RoutePrompt({
  origin,
  onCancel,
}: {
  origin: Airport | null;
  onCancel: () => void;
}) {
  return (
    <View style={styles.promptRoot}>
      <View style={styles.promptHeader}>
        <View>
          <Text style={styles.promptTitle}>Create route</Text>
          <Text style={styles.promptSubtitle}>Choose the route on the map</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Cancel route creation"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={onCancel}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.promptSelection}>
        <View style={styles.promptStep}>
          <Ionicons
            name={origin ? "checkmark-circle" : "ellipse-outline"}
            size={19}
            color={origin ? Colors.green : Colors.muted}
          />
          <View style={styles.promptStepCopy}>
            <Text style={styles.promptStepLabel}>Origin hub</Text>
            <Text style={styles.promptStepValue}>
              {origin
                ? `${origin.iata} · ${origin.city}`
                : "Tap one of your hubs"}
            </Text>
          </View>
        </View>
        <View style={styles.promptStep}>
          <Ionicons name="ellipse-outline" size={19} color={Colors.muted} />
          <View style={styles.promptStepCopy}>
            <Text style={styles.promptStepLabel}>Destination</Text>
            <Text style={styles.promptStepValue}>
              {origin ? "Tap a destination airport" : "Select an origin first"}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.promptHelp}>
        Start at one of your hubs. After choosing a destination, you can add one
        stop if your aircraft needs it.
      </Text>
    </View>
  );
}

export default function CreateRouteSheet() {
  const waypoints = useRouteCreationWaypoints();
  const hubs = useHubs();
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const preferredPlane = useSelectedPlane();
  const demands = useDemands();
  const aiAirlines = useAIAirlines();
  const cash = useCash();
  const removeWaypoint = useGameStore((state) => state.removeWaypoint);
  const clearCreation = useGameStore((state) => state.clearRouteCreation);
  const openSheet = useGameStore((state) => state.openSheet);
  const gameDay = useGameStore((state) => state.airline?.day ?? 1);
  const haptics = useHaptics();
  const tabBarHeight = useTabBarHeight();
  const createCustomRoute = useCreateCustomRoute();
  const createExistingRoute = useCreateRoute();

  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(
    preferredPlane?.id ?? null,
  );
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creationInFlight = useRef(false);

  // Airports are selected as origin, destination, then optional stop. Display
  // and persist a three-airport route in operational order instead.
  const origin = waypoints[0] ?? null;
  const destination = waypoints[1] ?? null;
  const stop = waypoints[2] ?? null;
  const orderedWaypoints =
    origin && destination
      ? stop
        ? [origin, stop, destination]
        : [origin, destination]
      : waypoints;
  const originHub = origin
    ? hubs.find((hub) => hub.airport.iata === origin.iata)
    : undefined;
  const originNotOwned = Boolean(origin && !originHub);

  const legs =
    origin && destination && origin.iata !== destination.iata
      ? stop
        ? [distNm(origin, stop), distNm(stop, destination)]
        : [distNm(origin, destination)]
      : [0];
  const directDistance =
    origin && destination && origin.iata !== destination.iata
      ? distNm(origin, destination)
      : 0;
  const totalDistance = legs.reduce((total, leg) => total + leg, 0);
  const longestLeg = Math.max(...legs);
  const haul = haulClass(totalDistance);
  const openingFee = CREATION_FEE[haul] ?? 150_000;

  const estimatedDailyDemand = useMemo(() => {
    if (!origin || !destination || origin.iata === destination.iata) return 0;
    return simulatePaxDay(origin, destination, directDistance, 0, gameDay);
  }, [destination, directDistance, gameDay, origin]);

  const existingDemand = useMemo(() => {
    if (!origin || !destination) return null;
    return (
      demands.find(
        (demand) =>
          demand.hub_iata === origin.iata &&
          demand.origin.iata === origin.iata &&
          demand.dest.iata === destination.iata,
      ) ?? null
    );
  }, [demands, destination, origin]);

  const previewDemand = useMemo<PassengerFlowDemand>(
    () => ({
      id: existingDemand?.id ?? "preview-demand",
      hub_iata: origin?.iata ?? "",
      base_pax_day: existingDemand?.base_pax_day ?? estimatedDailyDemand,
      delivered_pax_today: existingDemand?.delivered_pax_today ?? 0,
      ai_stolen_pax: existingDemand?.ai_stolen_pax ?? 0,
      status: existingDemand?.status ?? "preview",
    }),
    [estimatedDailyDemand, existingDemand, origin?.iata],
  );
  const waitingNow = waitingPaxForDemand(previewDemand);
  const estimatedPlayerDemand = playerPassengerPoolForDemand(previewDemand);

  const activeDestinations = useMemo(
    () =>
      new Set(
        routes
          .filter((route) => route.active && route.hub_iata === origin?.iata)
          .map((route) => route.demand.dest.iata),
      ),
    [origin?.iata, routes],
  );
  const routeAlreadyActive = destination
    ? activeDestinations.has(destination.iata)
    : false;
  const existingActiveRoutes = useMemo(
    () =>
      origin && destination
        ? routes.filter(
            (route) =>
              route.active &&
              route.hub_iata === origin.iata &&
              route.demand.dest.iata === destination.iata,
          )
        : [],
    [destination, origin, routes],
  );
  const scheduledSeats = totalScheduledDailySeats(existingActiveRoutes);
  const dailySeatGap = Math.max(0, estimatedPlayerDemand - scheduledSeats);
  const capacityCovered = routeAlreadyActive && dailySeatGap <= 0;
  const routeCapacity = originHub ? maxRoutesForTier(originHub.tier) : 0;
  const routeSlotAvailable =
    routeAlreadyActive || activeDestinations.size < routeCapacity;
  const routeFee = existingDemand ? 0 : openingFee;
  const canAfford = cash >= routeFee;

  const competitors = useMemo(() => {
    if (!origin || !destination) return [];
    return aiAirlines
      .filter((rival) => aiServesCorridor(rival, origin.iata, destination.iata))
      .sort((first, second) => second.trust - first.trust);
  }, [aiAirlines, destination, origin]);

  const aircraftOptions = useMemo<AircraftOption[]>(() => {
    if (!origin || !destination) return [];

    const busyPlaneIds = new Set(
      routes.filter((route) => route.active).map((route) => route.plane.id),
    );
    const passengerMix = passengerMixFromDistance(totalDistance);

    return ownedPlanes
      .map((plane) => {
        const busy = Boolean(plane.route_id) || busyPlaneIds.has(plane.id);
        const outOfRange = plane.plane_model.range_nm < longestLeg;
        const canServe = !busy && !outOfRange;
        const reason = busy
          ? "Already assigned"
          : outOfRange
            ? `Needs ${Math.ceil(longestLeg).toLocaleString()} nm range`
            : "";
        const cycles = dailyFlights(totalDistance, plane.plane_model.speed_kts);
        const dailySeats = plane.plane_model.pax_capacity * cycles;
        const dailyPassengers = Math.min(dailySeatGap, dailySeats);
        let passengersRemaining = dailyPassengers;
        let estimatedResult = 0;

        if (canServe) {
          for (let cycle = 0; cycle < cycles; cycle += 1) {
            const boardedThisFlight = Math.min(
              plane.plane_model.pax_capacity,
              passengersRemaining,
            );
            estimatedResult += calcRouteRevenue({
              distNm: totalDistance,
              speedKts: plane.plane_model.speed_kts,
              trustPct: originHub?.trust ?? 0,
              boardedPax: boardedThisFlight,
              seatCapacity: plane.plane_model.pax_capacity,
              costPerSector: plane.plane_model.cost_per_sector ?? 500,
              fuelPerNm: plane.plane_model.fuel_per_nm ?? 2,
              priceStrategy: "standard",
              priceElasticity: existingDemand?.price_elasticity ?? 1,
              crowdMultiplier: 1,
              congestionMultiplier: 1,
              businessPct: passengerMix.businessPct,
              leisurePct: passengerMix.leisurePct,
            }).net;
            passengersRemaining = Math.max(
              0,
              passengersRemaining - boardedThisFlight,
            );
          }
        }

        return {
          plane,
          canServe,
          reason,
          estimatedResult,
          dailyPassengers,
        };
      })
      .sort((first, second) => {
        if (first.canServe !== second.canServe) return first.canServe ? -1 : 1;
        if (first.estimatedResult !== second.estimatedResult) {
          return second.estimatedResult - first.estimatedResult;
        }
        return second.dailyPassengers - first.dailyPassengers;
      });
  }, [
    destination,
    existingDemand?.price_elasticity,
    longestLeg,
    origin,
    originHub?.trust,
    ownedPlanes,
    dailySeatGap,
    routes,
    totalDistance,
  ]);

  const availableAircraft = aircraftOptions.filter((option) => option.canServe);
  const unavailableAircraft = aircraftOptions.filter(
    (option) => !option.canServe,
  );
  const recommended = availableAircraft[0] ?? null;
  const selectedOption =
    aircraftOptions.find((option) => option.plane.id === selectedPlaneId) ??
    null;
  const selectedUnavailable =
    selectedOption && !selectedOption.canServe ? selectedOption : null;
  const primaryAircraft = selectedUnavailable
    ? [selectedUnavailable, ...availableAircraft]
    : availableAircraft;
  const otherUnavailableAircraft = unavailableAircraft.filter(
    (option) => option.plane.id !== selectedUnavailable?.plane.id,
  );

  useEffect(() => {
    if (
      selectedPlaneId &&
      aircraftOptions.some((option) => option.plane.id === selectedPlaneId)
    ) {
      return;
    }
    const preferredOption = preferredPlane
      ? aircraftOptions.find((option) => option.plane.id === preferredPlane.id)
      : null;
    setSelectedPlaneId(
      preferredOption?.plane.id ?? recommended?.plane.id ?? null,
    );
  }, [aircraftOptions, preferredPlane, recommended?.plane.id, selectedPlaneId]);

  const handleRemoveWaypoint = (iata: string) => {
    setError(null);
    if (waypoints.length <= 1) {
      clearCreation();
      return;
    }
    removeWaypoint(iata);
  };

  const handleOpenFleet = () => {
    haptics.tap();
    openSheet("fleet");
  };

  const handleCreate = async () => {
    if (creationInFlight.current) return;

    if (!origin || !destination) {
      setError("Select an origin hub and destination on the map.");
      haptics.warning();
      return;
    }
    if (originNotOwned) {
      setError(`${origin.iata} is not one of your hubs.`);
      haptics.warning();
      return;
    }
    if (!routeSlotAvailable) {
      setError(
        `${origin.iata} is operating ${activeDestinations.size} of ${routeCapacity} route slots. Upgrade the hub or close a route first.`,
      );
      haptics.warning();
      return;
    }
    if (capacityCovered) {
      setError(
        "Existing aircraft already cover this market's daily passenger pool.",
      );
      haptics.warning();
      return;
    }
    if (!selectedOption || !selectedOption.canServe) {
      setError(
        "Select an available aircraft that can operate the longest leg.",
      );
      haptics.warning();
      return;
    }
    if (!canAfford) {
      setError(`You need ${fmtCash(routeFee - cash)} more to open this route.`);
      haptics.warning();
      return;
    }

    creationInFlight.current = true;
    setCreating(true);
    setError(null);
    haptics.confirm();

    try {
      const result = existingDemand
        ? await createExistingRoute(
            existingDemand,
            selectedOption.plane,
            stop?.iata ?? null,
            null,
            totalDistance,
          )
        : await createCustomRoute(
            origin,
            destination,
            stop,
            selectedOption.plane,
            previewDemand.base_pax_day,
            directDistance,
            haul,
            totalDistance,
          );

      if (result.error) {
        setError(friendlyCreationError(result.error));
        haptics.error();
        return;
      }

      if (existingDemand) {
        clearCreation();
      } else {
        gameSounds.play("routeCreate");
      }
      haptics.success();
    } catch {
      setError("Unable to open this route. Try again.");
      haptics.error();
    } finally {
      creationInFlight.current = false;
      setCreating(false);
    }
  };

  if (waypoints.length < 2) {
    return <RoutePrompt origin={origin} onCancel={clearCreation} />;
  }

  const haulLabel =
    haul === "short"
      ? "Short haul"
      : haul === "medium"
        ? "Medium haul"
        : "Long haul";
  const requirementsMet =
    !originNotOwned &&
    routeSlotAvailable &&
    !capacityCovered &&
    Boolean(selectedOption?.canServe) &&
    canAfford;
  const actionLabel = capacityCovered
    ? "Daily capacity already covered"
    : !routeSlotAvailable
      ? "Review hub route capacity"
      : availableAircraft.length === 0
        ? ownedPlanes.length === 0
          ? "Buy an aircraft in Fleet"
          : "No aircraft can operate this route"
        : !selectedOption
          ? "Select an aircraft"
          : !selectedOption.canServe
            ? selectedOption.reason
            : !canAfford
              ? `Need ${fmtCash(routeFee - cash)} more`
              : routeAlreadyActive
                ? "Assign aircraft"
                : existingDemand
                  ? "Open and assign"
                  : `Open route for ${fmtCash(routeFee)}`;

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
          <Text style={styles.title}>Review route</Text>
          <Text style={styles.subtitle}>
            Choose one aircraft to begin service
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Cancel route creation"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={clearCreation}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Route" />
        <RoutePath
          onRemove={handleRemoveWaypoint}
          waypoints={orderedWaypoints}
        />
      </View>

      {originNotOwned && origin ? (
        <View style={styles.noticeContainer}>
          <InlineNotice
            kind="warning"
            title="Select one of your hubs"
            message={`${origin.iata} is not owned. Remove it, then choose an airport you operate as the origin.`}
          />
        </View>
      ) : null}

      {!originNotOwned && origin && destination ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              title="Service summary"
              detail={routeAlreadyActive ? "Route operating" : haulLabel}
            />
            <View style={styles.dataTable}>
              <DataRow
                label="Route distance"
                value={`${Math.round(totalDistance).toLocaleString()} nm`}
              />
              {stop ? (
                <DataRow
                  label="Aircraft must fly"
                  value={`${Math.round(longestLeg).toLocaleString()} nm`}
                />
              ) : null}
              <DataRow
                label="Passengers per day"
                value={previewDemand.base_pax_day.toLocaleString()}
              />
              <DataRow
                label="Ready to travel"
                value={waitingNow.toLocaleString()}
                valueColor={waitingNow > 100 ? Colors.amber : Colors.text}
              />
              <DataRow
                label="Your hub trust"
                value={`${Math.round(originHub?.trust ?? 0)}%`}
              />
              <DataRow
                label={
                  routeAlreadyActive ? "Additional aircraft fee" : "Open route"
                }
                value={routeFee > 0 ? fmtCash(routeFee) : "No fee"}
                last
              />
            </View>
            {stop ? (
              <Text style={styles.helperText}>
                Range is checked against the longest leg. Passengers still
                travel from {origin.iata} to {destination.iata}.
              </Text>
            ) : null}
          </View>

          <CompetitionSection
            competitors={competitors}
            destinationIata={destination.iata}
            originIata={origin.iata}
          />

          {!routeSlotAvailable ? (
            <View style={styles.noticeContainer}>
              <InlineNotice
                kind="warning"
                title="Hub route capacity reached"
                message={`${origin.iata} is operating ${activeDestinations.size} of ${routeCapacity} route slots. Upgrade the hub or close another route first.`}
              />
            </View>
          ) : null}

          {capacityCovered ? (
            <View style={styles.noticeContainer}>
              <InlineNotice
                kind="info"
                title="Daily capacity covered"
                message={`Existing aircraft schedule ${scheduledSeats.toLocaleString()} seats for a passenger pool of ${estimatedPlayerDemand.toLocaleString()}. No additional aircraft is needed.`}
              />
            </View>
          ) : null}

          <View style={styles.aircraftSection}>
            <SectionHeader
              title="Aircraft"
              detail={`${availableAircraft.length} available`}
            />

            {ownedPlanes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No aircraft owned</Text>
                <Text style={styles.emptyText}>
                  Go to Fleet and buy an aircraft before opening this route.
                </Text>
                <TouchableOpacity
                  accessibilityLabel="Open fleet"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  onPress={handleOpenFleet}
                  style={styles.emptyAction}
                >
                  <Text style={styles.emptyActionText}>Open Fleet</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={Colors.skyDark}
                  />
                </TouchableOpacity>
              </View>
            ) : primaryAircraft.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No aircraft available</Text>
                <Text style={styles.emptyText}>
                  Every aircraft is assigned or lacks the range for this route.
                </Text>
                <TouchableOpacity
                  accessibilityLabel="Open fleet"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  onPress={handleOpenFleet}
                  style={styles.emptyAction}
                >
                  <Text style={styles.emptyActionText}>Open Fleet</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={Colors.skyDark}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <View accessibilityRole="radiogroup" style={styles.aircraftList}>
                {primaryAircraft.map((option) => (
                  <AircraftRow
                    key={option.plane.id}
                    onSelect={() => {
                      haptics.tap();
                      setSelectedPlaneId(option.plane.id);
                      setError(null);
                    }}
                    option={option}
                    recommended={
                      option.canServe &&
                      option.plane.id === recommended?.plane.id
                    }
                    selected={option.plane.id === selectedPlaneId}
                  />
                ))}
              </View>
            )}

            {otherUnavailableAircraft.length > 0 ? (
              <>
                <TouchableOpacity
                  accessibilityLabel={`${showUnavailable ? "Hide" : "Show"} unavailable aircraft`}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  onPress={() => setShowUnavailable((current) => !current)}
                  style={styles.unavailableToggle}
                >
                  <Text style={styles.unavailableToggleText}>
                    {showUnavailable ? "Hide" : "Show"} unavailable aircraft (
                    {otherUnavailableAircraft.length})
                  </Text>
                  <Ionicons
                    name={showUnavailable ? "chevron-up" : "chevron-down"}
                    size={17}
                    color={Colors.muted}
                  />
                </TouchableOpacity>

                {showUnavailable ? (
                  <View style={styles.aircraftList}>
                    {otherUnavailableAircraft.map((option) => (
                      <AircraftRow
                        key={option.plane.id}
                        onSelect={() => undefined}
                        option={option}
                        recommended={false}
                        selected={false}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>

          {error ? (
            <View style={styles.noticeContainer}>
              <InlineNotice
                kind="error"
                title="Unable to open route"
                message={error}
              />
            </View>
          ) : null}

          <View style={styles.confirmSection}>
            <TouchableOpacity
              accessibilityLabel={actionLabel}
              accessibilityRole="button"
              accessibilityState={{
                disabled: creating || !requirementsMet,
                busy: creating,
              }}
              activeOpacity={0.7}
              disabled={creating || !requirementsMet}
              onPress={handleCreate}
              style={[
                styles.confirmButton,
                !requirementsMet && styles.confirmButtonDisabled,
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color={Colors.textOnColor} />
              ) : (
                <>
                  <Ionicons
                    name="git-branch-outline"
                    size={18}
                    color={
                      requirementsMet ? Colors.textOnColor : Colors.skyDark
                    }
                  />
                  <Text
                    style={[
                      styles.confirmButtonText,
                      !requirementsMet && styles.confirmButtonTextDisabled,
                    ]}
                  >
                    {actionLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: {
    flex: 1,
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
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  section: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  sectionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  sectionDetail: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "right",
  },
  pathTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  pathRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pathLabel: {
    width: 72,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  pathAirport: {
    flex: 1,
    minWidth: 0,
  },
  pathCode: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: Typography.weight.bold,
  },
  pathCity: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  pathRemove: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  stopHint: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stopHintText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  dataTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  dataRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dataRowLast: {
    borderBottomWidth: 0,
  },
  dataLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  dataValue: {
    flex: 1,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
    textAlign: "right",
  },
  helperText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    paddingTop: Spacing.sm,
  },
  competitionSection: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  competitionList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  competitionRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  competitionIdentity: {
    flex: 1,
    minWidth: 0,
  },
  competitionName: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.semibold,
  },
  competitionCode: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  competitionTrust: {
    minWidth: 48,
    alignItems: "flex-end",
  },
  competitionTrustValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: Typography.weight.bold,
  },
  competitionTrustLabel: {
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
  },
  competitionHelp: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    paddingTop: Spacing.sm,
  },
  noticeContainer: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  notice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  noticeMessage: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  aircraftSection: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  aircraftList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  aircraftRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  aircraftRowSelected: {
    backgroundColor: Colors.skyDim,
  },
  aircraftRowDisabled: {
    opacity: 0.55,
  },
  aircraftCopy: {
    flex: 1,
    minWidth: 0,
  },
  aircraftNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aircraftName: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.semibold,
  },
  recommendedText: {
    color: Colors.skyDark,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: Typography.weight.semibold,
  },
  aircraftSpecs: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  aircraftBoarding: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  aircraftUnavailable: {
    color: Colors.red,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  aircraftResult: {
    minWidth: 72,
    alignItems: "flex-end",
  },
  aircraftResultValue: {
    fontFamily: Typography.mono,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: Typography.weight.bold,
  },
  aircraftResultLabel: {
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
  },
  unavailableToggle: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  unavailableToggleText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.semibold,
  },
  emptyText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xs,
  },
  emptyAction: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  emptyActionText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  confirmSection: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  confirmButton: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.inset,
  },
  confirmButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
    textAlign: "center",
  },
  confirmButtonTextDisabled: {
    color: Colors.muted,
  },
  promptRoot: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingBottom: Spacing.xl,
  },
  promptHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  promptTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  promptSubtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  promptSelection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  promptStep: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  promptStepCopy: {
    flex: 1,
  },
  promptStepLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  promptStepValue: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
  promptHelp: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
});
