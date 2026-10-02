/**
 * Airport and hub operations.
 *
 * An unopened airport presents one clear decision: build a hub. An owned hub
 * presents operating status, route opportunities, expansion, and disposal.
 * Locked actions always explain their blocker when pressed.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
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
import { aiServesCorridor, type AIAirline } from "@/lib/AIAirline";
import {
  CASH_RESERVE_AFTER_BUY,
  HUB_TIER_CONFIG,
  hubPurchaseCost,
  presenceThreshold,
  refillDemandSlots,
} from "@/lib/demands";
import { dailyFlights, fmtCash } from "@/lib/revenue";
import type { Airport, Demand, OwnedPlane, Route } from "@/store";
import {
  useAIAirlines,
  useAirportPresence,
  useCash,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CountryFlag from "react-native-country-flag";

const AIRPORT_COVER_RED = "#B43A35";
const AIRPORT_COVER_LIGHT = "#FFF4EF";

function passengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function playerPassengerPool(demand: Demand): number {
  const market = passengerCount(demand.base_pax_day);
  const carried = passengerCount(demand.delivered_pax_today);
  const rivalCarried = passengerCount(demand.ai_stolen_pax);

  // This is the live pool still available to the player, not a claim that
  // every passenger has already chosen the airline.
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

function usePreviewDemands(
  airport: Airport | null,
  airports: Airport[],
  ownedPlanes: OwnedPlane[],
  gameDay: number,
): Demand[] {
  return useMemo(() => {
    if (!airport) return [];

    return refillDemandSlots(airport, airports, [], {
      hubLevel: 1,
      gameDay,
      ownedPlanes,
    }).map((demand, index) => ({
      ...demand,
      id: `preview:${airport.iata}:${demand.dest.iata}:${index}`,
      airline_id: "preview",
    }));
  }, [airport, airports, gameDay, ownedPlanes]);
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function DataRow({
  label,
  value,
  valueColor = Colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.dataValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

interface AirportRivalPresence {
  airline: AIAirline;
  ownsHub: boolean;
  serviceCount: number;
}

function RivalPresenceList({ rivals }: { rivals: AirportRivalPresence[] }) {
  if (rivals.length === 0) return null;

  return (
    <View style={styles.rivalPresenceList}>
      {rivals.map(({ airline, ownsHub, serviceCount }) => (
        <View
          accessibilityLabel={`${airline.name}, ${airline.code}. ${ownsHub ? "Operates a hub here. " : ""}${serviceCount} active ${serviceCount === 1 ? "service" : "services"}.`}
          key={airline.id}
          style={styles.rivalPresenceRow}
        >
          <AirlineBrandMark
            accessibilityLabel=""
            logoId={airline.logoId}
            primary={airline.color}
            secondary={airline.secondaryColor}
            size={30}
            variant="leaderboard"
          />
          <View style={styles.rivalPresenceCopy}>
            <Text numberOfLines={1} style={styles.rivalPresenceName}>
              {airline.name}
            </Text>
            <Text numberOfLines={1} style={styles.rivalPresenceMeta}>
              {airline.code}
              {ownsHub ? " · Hub" : ""} · {serviceCount}{" "}
              {serviceCount === 1 ? "service" : "services"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function RequirementRow({
  met,
  label,
  value,
}: {
  met: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons
        name={met ? "checkmark-circle" : "ellipse-outline"}
        size={17}
        color={met ? Colors.green : Colors.muted}
      />
      <Text style={styles.requirementLabel}>{label}</Text>
      <Text
        style={[
          styles.requirementValue,
          { color: met ? Colors.green : Colors.muted },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function InlineNotice({
  message,
  level = "info",
}: {
  message: string;
  level?: "info" | "warning" | "error";
}) {
  const color =
    level === "error"
      ? Colors.red
      : level === "warning"
        ? Colors.amber
        : Colors.sky;
  return (
    <View
      accessibilityRole={level === "error" ? "alert" : undefined}
      style={styles.notice}
    >
      <Ionicons
        name={
          level === "info" ? "information-circle-outline" : "warning-outline"
        }
        size={17}
        color={color}
      />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

function CoverMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.coverMetric}>
      <Text numberOfLines={1} style={styles.coverMetricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.coverMetricLabel}>
        {label}
      </Text>
    </View>
  );
}

function AirportCover({
  airport,
  isOwned,
  tier,
  trust,
  activeMarkets,
  routeLimit,
  scheduledSeats,
  opportunities,
  previewDailyMarket,
  cost,
  onClose,
}: {
  airport: Airport;
  isOwned: boolean;
  tier: number;
  trust: number;
  activeMarkets: number;
  routeLimit: number;
  scheduledSeats: number;
  opportunities: number;
  previewDailyMarket: number;
  cost: number;
  onClose: () => void;
}) {
  return (
    <View style={styles.coverBlock}>
      <View
        accessible
        accessibilityLabel={`${airport.city || airport.name} airport cover artwork`}
        accessibilityRole="image"
        style={styles.coverArtwork}
      >
        <View style={styles.coverGridVerticalOne} />
        <View style={styles.coverGridVerticalTwo} />
        <View style={styles.coverGridHorizontalOne} />
        <View style={styles.coverGridHorizontalTwo} />

        <Ionicons
          name="globe-outline"
          size={142}
          color="rgba(255,244,239,0.18)"
          style={styles.coverGlobe}
        />
        <View style={styles.flightPath} />
        <View style={styles.flightPathDotStart} />
        <View style={styles.flightPathDotEnd} />
        <Ionicons
          name="airplane"
          size={54}
          color={AIRPORT_COVER_LIGHT}
          style={styles.coverPlane}
        />

        <View style={styles.coverTopline}>
          <View style={styles.coverCountry}>
            <CountryFlag isoCode={airport.country} size={18} />
            <Text style={styles.coverCountryText} numberOfLines={1}>
              {airport.city || airport.country}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close airport details"
            accessibilityRole="button"
            style={styles.coverCloseButton}
            onPress={onClose}
            activeOpacity={0.78}
          >
            <Ionicons name="close" size={22} color={Colors.textOnColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.coverCaption}>
          <View style={styles.coverStatusLine}>
            <Ionicons
              name={isOwned ? "business" : "location"}
              size={13}
              color={AIRPORT_COVER_LIGHT}
            />
            <Text style={styles.coverCaptionLabel}>
              {isOwned ? `Owned hub · Tier ${tier}` : "Available airport"}
            </Text>
          </View>
          <Text style={styles.airportCode}>{airport.iata}</Text>
          <Text numberOfLines={1} style={styles.airportName}>
            {airport.name}
          </Text>
        </View>
      </View>

      <View style={styles.coverMetrics}>
        {isOwned ? (
          <>
            <CoverMetric label="Trust" value={`${trust}%`} />
            <View style={styles.coverMetricDivider} />
            <CoverMetric
              label="Active routes"
              value={`${activeMarkets} / ${routeLimit}`}
            />
            <View style={styles.coverMetricDivider} />
            <CoverMetric
              label="Seats today"
              value={scheduledSeats.toLocaleString()}
            />
          </>
        ) : (
          <>
            <CoverMetric
              label="Daily market"
              value={previewDailyMarket.toLocaleString()}
            />
            <View style={styles.coverMetricDivider} />
            <CoverMetric label="Routes" value={`${opportunities}`} />
            <View style={styles.coverMetricDivider} />
            <CoverMetric label="Hub cost" value={fmtCash(cost)} />
          </>
        )}
      </View>
    </View>
  );
}

function RouteOpportunityRow({
  demand,
  activeRoutes,
  owned,
  idlePlanes,
  rivals,
  onOpenRoute,
  onViewFleet,
  onManageRoutes,
}: {
  demand: Demand;
  activeRoutes: Route[];
  owned: boolean;
  idlePlanes: OwnedPlane[];
  rivals: AIAirline[];
  onOpenRoute: (demand: Demand) => void;
  onViewFleet: () => void;
  onManageRoutes: () => void;
}) {
  const isActive = activeRoutes.length > 0;
  const capableIdlePlanes = idlePlanes.filter(
    (plane) => plane.plane_model.range_nm >= demand.dist_nm,
  );
  const market = passengerCount(demand.base_pax_day);
  const carried = passengerCount(demand.delivered_pax_today);
  const playerPool = playerPassengerPool(demand);
  const waiting = Math.max(0, playerPool - carried);
  const scheduledSeats = activeRoutes.reduce(
    (total, route) => total + scheduledDailySeats(route),
    0,
  );
  const capacityGap = Math.max(0, playerPool - scheduledSeats);
  let readiness = "Hub required";
  let readinessColor: string = Colors.muted;
  if (owned && isActive) {
    readiness =
      capacityGap > 0
        ? `${capacityGap.toLocaleString()} seats short`
        : `${scheduledSeats.toLocaleString()} daily seats`;
    readinessColor = capacityGap > 0 ? Colors.amber : Colors.green;
  } else if (owned && capableIdlePlanes.length > 0) {
    readiness = `${capableIdlePlanes.length} aircraft ready`;
    readinessColor = Colors.green;
  } else if (owned && idlePlanes.length > 0) {
    readiness = "Stopover required";
    readinessColor = Colors.amber;
  } else if (owned) {
    readiness = "Aircraft required";
    readinessColor = Colors.amber;
  }

  return (
    <View style={styles.routeRow}>
      <View style={styles.routeHeading}>
        <CountryFlag isoCode={demand.dest.country} size={16} />
        <View style={styles.routeIdentity}>
          <View style={styles.routeCodeLine}>
            <Text style={styles.routeCode}>{demand.dest.iata}</Text>
            <Text style={styles.routeDistance}>
              {Math.round(demand.dist_nm).toLocaleString()} nm
            </Text>
          </View>
          <Text style={styles.routeCity} numberOfLines={1}>
            {demand.dest.city || demand.dest.name}
          </Text>
        </View>
      </View>

      <View style={styles.routeData}>
        <View style={styles.routeMetric}>
          <Text style={styles.routeMetricValue}>{market.toLocaleString()}</Text>
          <Text style={styles.routeMetricLabel}>Daily market</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.routeMetric}>
          <Text style={[styles.routeMetricValue, { color: readinessColor }]}>
            {readiness}
          </Text>
          <Text style={styles.routeMetricLabel}>Readiness</Text>
        </View>
      </View>

      <View style={styles.routeContext}>
        {rivals.length === 0 ? (
          <Text style={styles.routeContextText}>No rival service</Text>
        ) : (
          <View
            accessibilityLabel={`Rival service by ${rivals.map((rival) => rival.name).join(", ")}`}
            style={styles.routeRivals}
          >
            <Text style={styles.routeContextText}>Rival service</Text>
            {rivals.slice(0, 2).map((rival) => (
              <View key={rival.id} style={styles.routeRivalIdentity}>
                <AirlineBrandMark
                  accessibilityLabel=""
                  logoId={rival.logoId}
                  primary={rival.color}
                  secondary={rival.secondaryColor}
                  size={22}
                  variant="leaderboard"
                />
                <Text style={styles.routeRivalCode}>{rival.code}</Text>
              </View>
            ))}
            {rivals.length > 2 ? (
              <Text style={styles.routeContextText}>+{rivals.length - 2}</Text>
            ) : null}
          </View>
        )}
        {isActive ? (
          <Text style={styles.routeContextText}>
            {carried.toLocaleString()} carried · {waiting.toLocaleString()}{" "}
            waiting
          </Text>
        ) : null}
      </View>

      {owned ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={isActive ? styles.secondaryAction : styles.primaryAction}
          onPress={
            isActive
              ? onManageRoutes
              : idlePlanes.length > 0
                ? () => onOpenRoute(demand)
                : onViewFleet
          }
          activeOpacity={0.7}
        >
          <Text
            style={
              isActive ? styles.secondaryActionText : styles.primaryActionText
            }
          >
            {isActive
              ? "Manage route"
              : idlePlanes.length === 0
                ? "View fleet"
                : capableIdlePlanes.length > 0
                  ? "Open route"
                  : "Plan with a stop"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={isActive ? Colors.skyDark : Colors.textOnColor}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function AirportSheet() {
  const airport = useSelectedAirport();
  const airports = useGameStore((state) => state.airports);
  const demands = useGameStore((state) => state.demands);
  const day = useGameStore((state) => state.airline?.day ?? 1);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const hubs = useHubs();
  const routes = useRoutes();
  const cash = useCash();
  const ownedPlanes = useOwnedPlanes();
  const aiAirlines = useAIAirlines();
  const passengerPresence = useAirportPresence(airport?.iata);
  const tabBarHeight = useTabBarHeight();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const gameAlert = useGameAlert();
  const buyHub = useBuyHub();
  const sellHub = useSellHub();
  const upgradeHub = useUpgradeHub();
  const updateHubNickname = useUpdateHubNickname();

  const [buying, setBuying] = useState(false);
  const [selling, setSelling] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  const previewDemands = usePreviewDemands(airport, airports, ownedPlanes, day);
  const hub = airport
    ? hubs.find((item) => item.airport.iata === airport.iata)
    : undefined;
  const isOwned = Boolean(hub);
  const hubDemands = useMemo(
    () =>
      airport
        ? demands.filter((demand) => demand.hub_iata === airport.iata)
        : [],
    [airport, demands],
  );
  const activeHubRoutes = useMemo(
    () =>
      airport
        ? routes.filter(
            (route) => route.active && route.hub_iata === airport.iata,
          )
        : [],
    [airport, routes],
  );
  const activeDemandIds = useMemo(
    () => new Set(activeHubRoutes.map((route) => route.demand.id)),
    [activeHubRoutes],
  );
  const operatedDemands = useMemo(
    () => hubDemands.filter((demand) => activeDemandIds.has(demand.id)),
    [activeDemandIds, hubDemands],
  );
  const activePlaneIds = useMemo(
    () =>
      new Set(
        routes.filter((route) => route.active).map((route) => route.plane.id),
      ),
    [routes],
  );
  const idlePlanes = useMemo(
    () => ownedPlanes.filter((plane) => !activePlaneIds.has(plane.id)),
    [activePlaneIds, ownedPlanes],
  );

  if (!airport) return null;

  const opportunities = isOwned ? hubDemands : previewDemands;
  const activeMarkets = activeDemandIds.size;
  const tier = hub?.tier ?? 1;
  const tierConfig = HUB_TIER_CONFIG[tier];
  const nextTierConfig = HUB_TIER_CONFIG[tier + 1];
  const routeLimit = tierConfig?.routes ?? 0;
  const trust = Math.round(hub?.trust ?? 0);
  const hubPassengers = passengerCount(hub?.hub_pax);
  const waitingPassengers = operatedDemands.reduce((total, demand) => {
    const playerPool = playerPassengerPool(demand);
    return (
      total +
      Math.max(0, playerPool - passengerCount(demand.delivered_pax_today))
    );
  }, 0);
  const scheduledSeats = activeHubRoutes.reduce(
    (total, route) => total + scheduledDailySeats(route),
    0,
  );
  const capacityByDemand = new Map<string, number>();
  activeHubRoutes.forEach((route) => {
    capacityByDemand.set(
      route.demand.id,
      (capacityByDemand.get(route.demand.id) ?? 0) + scheduledDailySeats(route),
    );
  });
  const capacityGap = operatedDemands.reduce(
    (total, demand) =>
      total +
      Math.max(
        0,
        playerPassengerPool(demand) - (capacityByDemand.get(demand.id) ?? 0),
      ),
    0,
  );
  const underCapacityMarketCount = operatedDemands.filter(
    (demand) =>
      playerPassengerPool(demand) > (capacityByDemand.get(demand.id) ?? 0),
  ).length;

  const rivalPresence: AirportRivalPresence[] = aiAirlines.flatMap(
    (airline) => {
      const ownsHub = airline.hubIatas.includes(airport.iata);
      const serviceCount = airline.routes.filter(
        (route) =>
          route.originIata === airport.iata || route.destIata === airport.iata,
      ).length;

      return ownsHub || serviceCount > 0
        ? [{ airline, ownsHub, serviceCount }]
        : [];
    },
  );
  const rivalHubCount = rivalPresence.filter((rival) => rival.ownsHub).length;
  const rivalServiceCount = rivalPresence.reduce(
    (total, rival) => total + rival.serviceCount,
    0,
  );

  const cost = hubPurchaseCost(airport);
  const isFirstHub = hubs.length === 0;
  const requiredCash = isFirstHub ? cost : cost + CASH_RESERVE_AFTER_BUY;
  const canAfford = cash >= requiredCash;
  const presenceGoal = presenceThreshold(airport, rivalHubCount);
  const presenceReady = isFirstHub || passengerPresence >= presenceGoal;
  const presenceRemaining = Math.max(0, presenceGoal - passengerPresence);
  const canBuild = presenceReady && canAfford;
  const previewDailyMarket = opportunities.reduce(
    (total, demand) => total + passengerCount(demand.base_pax_day),
    0,
  );

  const isMaximumTier = tier >= 6;
  const trustGoal = tierConfig?.upgradeTrust ?? 100;
  const passengerGoal = tierConfig?.upgradePax ?? 999_999;
  const upgradeCost = HUB_UPGRADE_COSTS[tier] ?? 999_999;
  const trustReady = trust >= trustGoal;
  const passengersReady = hubPassengers >= passengerGoal;
  const upgradeCashReady = cash >= upgradeCost;
  const upgradeReady =
    isOwned &&
    !isMaximumTier &&
    trustReady &&
    passengersReady &&
    upgradeCashReady;

  const explainBuildBlocker = () => {
    if (!presenceReady) {
      gameAlert.show({
        icon: "people-outline",
        title: "More passenger presence needed",
        message: `Carry ${presenceRemaining.toLocaleString()} more passengers into ${airport.iata}. This proves your airline can support a hub here.`,
        buttons: [{ label: "Understood", style: "cancel" }],
      });
      return;
    }

    gameAlert.show({
      icon: "cash-outline",
      title: "More cash needed",
      message: isFirstHub
        ? `You need ${fmtCash(cost - cash)} more to build this hub.`
        : `You need ${fmtCash(requiredCash - cash)} more. The total includes the ${fmtCash(CASH_RESERVE_AFTER_BUY)} operating reserve.`,
      buttons: [{ label: "Understood", style: "cancel" }],
    });
  };

  const handleBuildHub = async () => {
    if (buying) return;
    haptics.confirm();
    setOperationError(null);

    if (!canBuild) {
      haptics.error();
      explainBuildBlocker();
      return;
    }

    setBuying(true);
    try {
      const { error } = await buyHub(airport);
      if (error) {
        setOperationError(error);
        haptics.error();
        return;
      }
      haptics.success();
      sounds.hubBuy();
    } catch {
      setOperationError("Unable to build this hub. Try again.");
      haptics.error();
    } finally {
      setBuying(false);
    }
  };

  const handleUpgrade = () => {
    if (!hub || !nextTierConfig || upgrading) return;

    if (!upgradeReady) {
      const missing = [
        !trustReady ? `${trustGoal - trust}% more trust` : null,
        !passengersReady
          ? `${Math.max(0, passengerGoal - hubPassengers).toLocaleString()} more passengers handled`
          : null,
        !upgradeCashReady ? `${fmtCash(upgradeCost - cash)} more cash` : null,
      ].filter((item): item is string => Boolean(item));

      gameAlert.show({
        icon: "information-circle-outline",
        title: "Upgrade requirements",
        message: missing.join("\n"),
        buttons: [{ label: "Understood", style: "cancel" }],
      });
      return;
    }

    gameAlert.show({
      icon: "arrow-up-circle-outline",
      title: `Upgrade to tier ${tier + 1}`,
      message: `Upgrade ${airport.iata} for ${fmtCash(upgradeCost)}? Active market capacity increases from ${tierConfig.routes} to ${nextTierConfig.routes}.`,
      buttons: [
        { label: "Cancel", style: "cancel" },
        {
          label: `Upgrade for ${fmtCash(upgradeCost)}`,
          style: "default",
          onPress: async () => {
            setUpgrading(true);
            setOperationError(null);
            const { error } = await upgradeHub(hub.id);
            setUpgrading(false);
            if (error) {
              setOperationError(error);
              haptics.error();
              return;
            }
            haptics.success();
          },
        },
      ],
    });
  };

  const handleSell = () => {
    if (!hub || selling) return;
    const refund = Math.round(cost * 0.5);
    gameAlert.show({
      icon: "storefront-outline",
      title: `Sell ${airport.iata} hub`,
      message: `You will receive ${fmtCash(refund)}. ${activeHubRoutes.length} active route${activeHubRoutes.length === 1 ? "" : "s"} will close and their aircraft will be released.`,
      buttons: [
        { label: "Keep hub", style: "cancel" },
        {
          label: "Sell hub",
          style: "destructive",
          onPress: async () => {
            setSelling(true);
            setOperationError(null);
            const { error } = await sellHub(hub.id);
            setSelling(false);
            if (error) {
              setOperationError(error);
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

  const saveNickname = async () => {
    if (!hub) return;
    setEditingNickname(false);
    setOperationError(null);
    const { error } = await updateHubNickname(hub.id, nicknameInput);
    if (error) {
      setOperationError(error);
      haptics.error();
    }
  };

  const handleOpenRoute = (demand: Demand) => {
    haptics.tap();
    closeSheet();
    useGameStore.getState().startRouteCreation([demand.origin, demand.dest]);
  };

  const openAnotherSheet = (sheet: "fleet" | "routes") => {
    haptics.tap();
    closeSheet();
    setTimeout(() => openSheet(sheet), 120);
  };

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <AirportCover
        airport={airport}
        isOwned={isOwned}
        tier={tier}
        trust={trust}
        activeMarkets={activeMarkets}
        routeLimit={routeLimit}
        scheduledSeats={scheduledSeats}
        opportunities={opportunities.length}
        previewDailyMarket={previewDailyMarket}
        cost={cost}
        onClose={() => {
          haptics.tap();
          closeSheet();
        }}
      />

      {!isOwned ? (
        <View style={styles.section}>
          <SectionHeader title="Establish hub" />
          <Text style={styles.introText}>
            Open this airport as a base, unlock its passenger markets, and
            assign aircraft to new routes.
          </Text>

          <View style={styles.requirements}>
            {!isFirstHub ? (
              <RequirementRow
                met={presenceReady}
                label="Passenger presence"
                value={`${passengerPresence.toLocaleString()} / ${presenceGoal.toLocaleString()}`}
              />
            ) : null}
            <RequirementRow
              met={cash >= cost}
              label="Hub purchase"
              value={fmtCash(cost)}
            />
            {!isFirstHub ? (
              <RequirementRow
                met={canAfford}
                label="Cash remaining after purchase"
                value={`${fmtCash(Math.max(0, cash - cost))} / ${fmtCash(CASH_RESERVE_AFTER_BUY)}`}
              />
            ) : null}
          </View>

          <TouchableOpacity
            accessibilityLabel={
              canBuild
                ? `Build ${airport.iata} hub for ${fmtCash(cost)}`
                : "Review hub requirements"
            }
            accessibilityRole="button"
            accessibilityState={{ busy: buying }}
            style={[
              styles.primaryButton,
              !canBuild && styles.blockedPrimaryButton,
            ]}
            onPress={handleBuildHub}
            disabled={buying}
            activeOpacity={0.7}
          >
            {buying ? (
              <ActivityIndicator size="small" color={Colors.textOnColor} />
            ) : (
              <>
                <Text
                  style={[
                    styles.primaryButtonText,
                    !canBuild && styles.blockedPrimaryButtonText,
                  ]}
                >
                  {canBuild
                    ? `Build hub for ${fmtCash(cost)}`
                    : "Review build requirements"}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={canBuild ? Colors.textOnColor : Colors.skyDark}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title="Hub operations" detail={`Tier ${tier}`} />

            {editingNickname ? (
              <View style={styles.nicknameEditor}>
                <TextInput
                  accessibilityLabel="Hub nickname"
                  maxLength={20}
                  onChangeText={setNicknameInput}
                  onSubmitEditing={saveNickname}
                  placeholder="Hub nickname"
                  placeholderTextColor={Colors.dim}
                  returnKeyType="done"
                  style={styles.nicknameInput}
                  value={nicknameInput}
                />
                <TouchableOpacity
                  accessibilityLabel="Save hub nickname"
                  accessibilityRole="button"
                  style={styles.nicknameSave}
                  onPress={saveNickname}
                  activeOpacity={0.7}
                >
                  <Text style={styles.nicknameSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                accessibilityLabel="Edit hub nickname"
                accessibilityRole="button"
                style={styles.nicknameButton}
                onPress={() => {
                  setNicknameInput(hub?.nickname ?? "");
                  setEditingNickname(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.nicknameText}>
                  {hub?.nickname || "Add hub nickname"}
                </Text>
                <Ionicons
                  name="pencil-outline"
                  size={16}
                  color={Colors.muted}
                />
              </TouchableOpacity>
            )}

            <View style={styles.dataTable}>
              <DataRow
                label="Waiting today"
                value={waitingPassengers.toLocaleString()}
                valueColor={Colors.text}
              />
              <DataRow
                label="Rival activity"
                value={
                  rivalPresence.length === 0
                    ? "None"
                    : `${rivalPresence.length} ${rivalPresence.length === 1 ? "airline" : "airlines"} · ${rivalServiceCount} ${rivalServiceCount === 1 ? "service" : "services"}`
                }
              />
            </View>
            <RivalPresenceList rivals={rivalPresence} />
          </View>

          {capacityGap > 0 ? (
            <View style={styles.sectionCompact}>
              <InlineNotice
                level="warning"
                message={`Daily schedules are short by ${capacityGap.toLocaleString()} seats across ${underCapacityMarketCount} market${underCapacityMarketCount === 1 ? "" : "s"}. Assign another aircraft or use a larger aircraft.`}
              />
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader
              title="Hub expansion"
              detail={isMaximumTier ? "Maximum tier" : `Tier ${tier + 1}`}
            />
            {isMaximumTier ? (
              <Text style={styles.introText}>
                This hub has reached its maximum operating tier.
              </Text>
            ) : (
              <>
                <View style={styles.requirements}>
                  <RequirementRow
                    met={trustReady}
                    label="Trust"
                    value={`${trust}% / ${trustGoal}%`}
                  />
                  <RequirementRow
                    met={passengersReady}
                    label="Passengers handled"
                    value={`${hubPassengers.toLocaleString()} / ${passengerGoal.toLocaleString()}`}
                  />
                  <RequirementRow
                    met={upgradeCashReady}
                    label="Upgrade cost"
                    value={fmtCash(upgradeCost)}
                  />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ busy: upgrading }}
                  style={styles.secondaryButton}
                  onPress={handleUpgrade}
                  disabled={upgrading}
                  activeOpacity={0.7}
                >
                  {upgrading ? (
                    <ActivityIndicator size="small" color={Colors.skyDark} />
                  ) : (
                    <>
                      <Text style={styles.secondaryButtonText}>
                        {upgradeReady
                          ? `Upgrade hub for ${fmtCash(upgradeCost)}`
                          : "Review upgrade requirements"}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={Colors.skyDark}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}

      {operationError ? (
        <View style={styles.sectionCompact}>
          <InlineNotice level="error" message={operationError} />
        </View>
      ) : null}

      <View style={styles.routesSection}>
        <View style={styles.routesSectionHeader}>
          <SectionHeader
            title={isOwned ? "Route opportunities" : "Routes unlocked with hub"}
            detail={`${opportunities.length}`}
          />
        </View>
        <Text style={styles.sectionDescription}>
          {isOwned
            ? "Select a market and assign an aircraft. Opportunities stay open until replaced."
            : "These markets unlock when the hub opens."}
        </Text>

        {opportunities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No reachable destinations</Text>
            <Text style={styles.emptyText}>
              Purchase an aircraft with more range to unlock destinations from
              this airport.
            </Text>
          </View>
        ) : (
          <View style={styles.routeList}>
            {opportunities.map((demand) => {
              const demandRoutes = activeHubRoutes.filter(
                (route) => route.demand.id === demand.id,
              );
              const rivals = aiAirlines.filter((rival) =>
                aiServesCorridor(rival, demand.origin.iata, demand.dest.iata),
              );

              return (
                <RouteOpportunityRow
                  key={demand.id}
                  demand={demand}
                  activeRoutes={demandRoutes}
                  idlePlanes={idlePlanes}
                  owned={isOwned}
                  rivals={rivals}
                  onOpenRoute={handleOpenRoute}
                  onViewFleet={() => openAnotherSheet("fleet")}
                  onManageRoutes={() => openAnotherSheet("routes")}
                />
              );
            })}
          </View>
        )}
      </View>

      {isOwned && hub ? (
        <View style={styles.dangerSection}>
          <TouchableOpacity
            accessibilityLabel={`Sell ${airport.iata} hub`}
            accessibilityRole="button"
            accessibilityState={{ busy: selling }}
            style={styles.sellButton}
            onPress={handleSell}
            disabled={selling}
            activeOpacity={0.7}
          >
            {selling ? (
              <ActivityIndicator size="small" color={Colors.red} />
            ) : (
              <>
                <View style={styles.sellCopy}>
                  <Text style={styles.sellTitle}>Sell hub</Text>
                  <Text style={styles.sellDetail}>
                    {fmtCash(Math.round(cost * 0.5))} refund. Active routes will
                    close.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={Colors.red} />
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl },
  coverBlock: {
    backgroundColor: Colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
    ...Shadow.floating,
  },
  coverArtwork: {
    height: 168,
    overflow: "hidden",
    backgroundColor: AIRPORT_COVER_RED,
  },
  coverGridVerticalOne: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "24%",
    width: 1,
    backgroundColor: "rgba(255,244,239,0.10)",
  },
  coverGridVerticalTwo: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: "22%",
    width: 1,
    backgroundColor: "rgba(255,244,239,0.10)",
  },
  coverGridHorizontalOne: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,244,239,0.10)",
  },
  coverGridHorizontalTwo: {
    position: "absolute",
    top: 112,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,244,239,0.10)",
  },
  coverGlobe: {
    position: "absolute",
    right: -18,
    top: 31,
  },
  flightPath: {
    position: "absolute",
    width: 188,
    height: 2,
    right: 61,
    top: 87,
    backgroundColor: "rgba(255,244,239,0.48)",
    transform: [{ rotate: "-12deg" }],
  },
  flightPathDotStart: {
    position: "absolute",
    right: 244,
    top: 103,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: AIRPORT_COVER_LIGHT,
  },
  flightPathDotEnd: {
    position: "absolute",
    right: 57,
    top: 63,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: AIRPORT_COVER_LIGHT,
  },
  coverPlane: {
    position: "absolute",
    right: "31%",
    top: 54,
    transform: [{ rotate: "-12deg" }],
  },
  coverTopline: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.lg,
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coverCountry: {
    maxWidth: "70%",
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(17,24,32,0.30)",
    borderRadius: Radius.md,
  },
  coverCountryText: {
    flexShrink: 1,
    color: Colors.textOnColor,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.bold,
  },
  coverCloseButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,24,32,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    borderRadius: Radius.md,
  },
  coverCaption: {
    position: "absolute",
    left: Spacing.lg,
    right: 82,
    bottom: Spacing.md,
  },
  coverStatusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  coverCaptionLabel: {
    color: AIRPORT_COVER_LIGHT,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
  },
  airportCode: {
    color: Colors.textOnColor,
    fontFamily: Typography.mono,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xxs,
  },
  airportName: {
    color: Colors.textOnColor,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.semibold,
  },
  coverMetrics: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.panel,
  },
  coverMetric: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  coverMetricDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.sm,
    backgroundColor: Colors.border,
  },
  coverMetricValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  coverMetricLabel: {
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: Spacing.xxs,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionCompact: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#FFF7EC",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#D8BE98",
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
    fontSize: 15,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  sectionDetail: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    textAlign: "right",
  },
  introText: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: 19,
    paddingBottom: Spacing.md,
  },
  dataTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  dataRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dataLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
  },
  dataValue: {
    flex: 1,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    textAlign: "right",
  },
  rivalPresenceList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rivalPresenceRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  rivalPresenceCopy: {
    flex: 1,
    minWidth: 0,
  },
  rivalPresenceName: {
    color: Colors.text,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
  },
  rivalPresenceMeta: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 15,
  },
  requirements: {
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  requirementRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  requirementLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.caption,
  },
  requirementValue: {
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
    textAlign: "right",
  },
  notice: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  noticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    textAlign: "center",
  },
  blockedPrimaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
  },
  blockedPrimaryButtonText: { color: Colors.skyDark },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  secondaryButtonText: {
    flex: 1,
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  nicknameButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  nicknameText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
  },
  nicknameEditor: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  nicknameInput: {
    flex: 1,
    minHeight: MIN_TOUCH,
    color: Colors.text,
    fontSize: Typography.size.body,
    paddingVertical: 0,
  },
  nicknameSave: {
    minWidth: 60,
    minHeight: MIN_TOUCH,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  nicknameSaveText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  routesSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderColor: Colors.borderSection,
  },
  routesSectionHeader: {
    marginHorizontal: Spacing.lg,
  },
  sectionDescription: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  routeList: {
    marginHorizontal: Spacing.md,
    overflow: "hidden",
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  routeHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  routeIdentity: { flex: 1, minWidth: 0 },
  routeCodeLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  routeCode: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 16,
    fontWeight: Typography.weight.bold,
  },
  routeDistance: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
  },
  routeCity: { color: Colors.muted, fontSize: 10, marginTop: 2 },
  routeData: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  routeMetric: { flex: 1, justifyContent: "center" },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  routeMetricValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.bold,
  },
  routeMetricLabel: { color: Colors.muted, fontSize: 9, marginTop: 2 },
  routeContext: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  routeContextText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 16,
  },
  routeRivals: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  routeRivalIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  routeRivalCode: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.semibold,
  },
  primaryAction: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  primaryActionText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  secondaryAction: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.md,
  },
  secondaryActionText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  emptyState: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: Typography.weight.semibold,
  },
  emptyText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xs,
  },
  dangerSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sellButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sellCopy: { flex: 1 },
  sellTitle: {
    color: Colors.red,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  sellDetail: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
});
