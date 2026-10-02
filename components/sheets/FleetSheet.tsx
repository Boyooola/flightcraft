/**
 * Fleet ownership, maintenance, and aircraft purchasing.
 *
 * Purchases are deliberately one aircraft at a time. This keeps persistence
 * atomic and makes the next action clear: assign the aircraft to a route.
 */

import {
  AirlineBrandMark,
  type AirlineLogoId,
} from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useBuyPlane, useMaintenancePlane } from "@/hooks/useSupabaseWrite";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { dailyFlights, fmtCash } from "@/lib/revenue";
import type { Demand, OwnedPlane, PlaneModel, Route } from "@/store";
import {
  useAirline,
  useCash,
  useDemands,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  usePlanes,
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

const FAMILY_LABEL: Record<string, string> = {
  embraer: "Embraer",
  bombardier: "Bombardier",
  boeing: "Boeing",
  airbus: "Airbus",
};

interface OwnedPlaneGroupData {
  model: PlaneModel;
  planes: OwnedPlane[];
}

interface FleetBrand {
  name: string;
  code: string;
  logoId: AirlineLogoId;
  primaryColor: string;
  secondaryColor: string;
}

function passengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function playerPassengerPool(demand: Demand): number {
  const market = passengerCount(demand.base_pax_day);
  const carried = passengerCount(demand.delivered_pax_today);
  const rivalCarried = passengerCount(demand.ai_stolen_pax);

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

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function InlineNotice({
  kind,
  title,
  message,
}: {
  kind: "error" | "warning" | "info";
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
        ? "construct-outline"
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

function FleetSummary({
  active,
  idle,
  maintenance,
}: {
  active: number;
  idle: number;
  maintenance: number;
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{active}</Text>
        <Text style={styles.summaryLabel}>Flying</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text
          style={[
            styles.summaryValue,
            { color: idle > 0 ? Colors.amber : Colors.text },
          ]}
        >
          {idle}
        </Text>
        <Text style={styles.summaryLabel}>Idle</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text
          style={[
            styles.summaryValue,
            { color: maintenance > 0 ? Colors.red : Colors.text },
          ]}
        >
          {maintenance}
        </Text>
        <Text style={styles.summaryLabel}>Need service</Text>
      </View>
    </View>
  );
}

function OwnedPlaneGroup({
  group,
  brand,
  planeRouteMap,
  onPress,
}: {
  group: OwnedPlaneGroupData;
  brand: FleetBrand;
  planeRouteMap: Map<string, string>;
  onPress: () => void;
}) {
  const total = group.planes.length;
  const flying = group.planes.filter(
    (plane) => Boolean(plane.route_id) || planeRouteMap.has(plane.id),
  ).length;
  const idle = total - flying;
  const lowestCondition = Math.min(
    ...group.planes.map((plane) => plane.condition ?? 100),
  );
  const conditionColor =
    lowestCondition <= 15
      ? Colors.red
      : lowestCondition <= 40
        ? Colors.amber
        : Colors.muted;

  return (
    <TouchableOpacity
      accessibilityHint="Opens individual aircraft management"
      accessibilityLabel={`${group.model.nickname} in ${brand.name} livery, ${total} owned, ${flying} flying, ${idle} idle`}
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.ownedRow}
    >
      <AirlineBrandMark
        accessibilityLabel=""
        logoId={brand.logoId}
        primary={brand.primaryColor}
        secondary={brand.secondaryColor}
        size={40}
        variant="tail"
      />
      <View style={styles.ownedCopy}>
        <View style={styles.ownedTitleRow}>
          <Text numberOfLines={1} style={styles.ownedName}>
            {group.model.nickname}
          </Text>
          <Text style={styles.ownedCount}>×{total}</Text>
        </View>
        <Text style={styles.ownedSpecs}>
          {group.model.pax_capacity.toLocaleString()} seats ·{" "}
          {group.model.range_nm.toLocaleString()} nm range
        </Text>
        <Text style={styles.ownedStatus}>
          {brand.code} · {flying} flying · {idle} idle ·{" "}
          <Text style={{ color: conditionColor }}>
            lowest condition {Math.round(lowestCondition)}%
          </Text>
        </Text>
      </View>
      <Text style={styles.manageText}>Manage</Text>
      <Ionicons name="chevron-forward" size={17} color={Colors.muted} />
    </TouchableOpacity>
  );
}

function MaintenanceRow({
  plane,
  brand,
  routeLabel,
  loading,
  onMaintain,
}: {
  plane: OwnedPlane;
  brand: FleetBrand;
  routeLabel: string | null;
  loading: boolean;
  onMaintain: () => void;
}) {
  const condition = Math.round(plane.condition ?? 100);
  const conditionColor = condition <= 15 ? Colors.red : Colors.amber;
  const maintenanceCost = 5_000 + plane.plane_model.pax_capacity * 50;

  return (
    <View style={styles.maintenanceRow}>
      <AirlineBrandMark
        accessibilityLabel={`${brand.name} aircraft livery`}
        logoId={brand.logoId}
        primary={brand.primaryColor}
        secondary={brand.secondaryColor}
        size={32}
        variant="tail"
      />
      <View style={styles.maintenanceCopy}>
        <Text style={styles.maintenanceName}>{plane.plane_model.nickname}</Text>
        <Text style={styles.maintenanceRoute}>
          {routeLabel ?? "Idle aircraft"}
        </Text>
        <View style={styles.conditionRow}>
          <View style={styles.conditionTrack}>
            <View
              style={[
                styles.conditionFill,
                {
                  width: `${condition}%` as `${number}%`,
                  backgroundColor: conditionColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.conditionValue, { color: conditionColor }]}>
            {condition}%
          </Text>
        </View>
      </View>
      <TouchableOpacity
        accessibilityLabel={`Service ${plane.plane_model.nickname} for ${fmtCash(maintenanceCost)}`}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: loading }}
        activeOpacity={0.7}
        disabled={loading}
        onPress={onMaintain}
        style={styles.maintenanceButton}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.skyDark} />
        ) : (
          <>
            <Text style={styles.maintenanceButtonText}>Service</Text>
            <Text style={styles.maintenanceCost}>
              {fmtCash(maintenanceCost)}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function PlaneStoreRow({
  model,
  demandScore,
  cash,
}: {
  model: PlaneModel;
  demandScore: number;
  cash: number;
}) {
  const buyPlane = useBuyPlane();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const [buying, setBuying] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedByRoutes =
    model.unlock_demands > 0 && demandScore < model.unlock_demands;
  const lockedByCash = model.unlock_cash > 0 && cash < model.unlock_cash;
  const locked = lockedByRoutes || lockedByCash;
  const canAfford = cash >= model.price;
  const canBuy = !locked && canAfford && !buying;
  const routesNeeded = Math.max(0, model.unlock_demands - demandScore);
  const lockReason = lockedByRoutes
    ? `Open ${routesNeeded} more route${routesNeeded === 1 ? "" : "s"}`
    : lockedByCash
      ? `Reach ${fmtCash(model.unlock_cash)} cash`
      : null;

  const handleBuy = async () => {
    if (!canBuy) return;
    haptics.confirm();
    setBuying(true);
    setPurchased(false);
    setError(null);

    try {
      const result = await buyPlane(model);
      if (result.error) {
        setError(result.error);
        haptics.error();
        sounds.error();
        return;
      }
      setPurchased(true);
      haptics.success();
      sounds.planeBuy();
      setTimeout(() => setPurchased(false), 1600);
    } catch {
      setError("Unable to buy this aircraft. Try again.");
      haptics.error();
      sounds.error();
    } finally {
      setBuying(false);
    }
  };

  return (
    <View style={[styles.storeRow, locked && styles.storeRowLocked]}>
      <View style={styles.storeTop}>
        <View style={styles.storeIdentity}>
          <Text style={styles.storeFamily}>
            {FAMILY_LABEL[model.family] ?? model.family}
          </Text>
          <Text numberOfLines={1} style={styles.storeName}>
            {model.nickname}
          </Text>
          <Text style={styles.storeSpecs}>
            {model.pax_capacity.toLocaleString()} seats ·{" "}
            {model.range_nm.toLocaleString()} nm range
          </Text>
        </View>
        <View style={styles.storePriceBlock}>
          <Text
            style={[
              styles.storePrice,
              { color: canAfford && !locked ? Colors.text : Colors.red },
            ]}
          >
            {fmtCash(model.price)}
          </Text>
          <Text style={styles.storePriceLabel}>Purchase price</Text>
        </View>
      </View>

      {locked ? (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.muted} />
          <Text style={styles.lockText}>{lockReason}</Text>
        </View>
      ) : (
        <View style={styles.purchaseRow}>
          <Text style={styles.purchaseHelp}>
            {purchased
              ? "Aircraft purchased. Assign it from My fleet."
              : canAfford
                ? "Adds one idle aircraft to your fleet."
                : `You need ${fmtCash(model.price - cash)} more.`}
          </Text>
          <TouchableOpacity
            accessibilityLabel={`Buy one ${model.nickname} for ${fmtCash(model.price)}`}
            accessibilityRole="button"
            accessibilityState={{
              busy: buying,
              disabled: !canBuy || purchased,
            }}
            activeOpacity={0.7}
            disabled={!canBuy || purchased}
            onPress={handleBuy}
            style={[
              styles.buyButton,
              (!canBuy || purchased) && styles.buyButtonDisabled,
            ]}
          >
            {buying ? (
              <ActivityIndicator size="small" color={Colors.textOnColor} />
            ) : (
              <Text
                style={[
                  styles.buyButtonText,
                  (!canBuy || purchased) && styles.buyButtonTextDisabled,
                ]}
              >
                {purchased ? "Purchased" : "Buy aircraft"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <View style={styles.rowError} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={16} color={Colors.red} />
          <Text style={styles.rowErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function FleetSheet() {
  const [activeTab, setActiveTab] = useState<"fleet" | "buy">("fleet");
  const [maintainingPlaneId, setMaintainingPlaneId] = useState<string | null>(
    null,
  );
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  const ownedPlanes = useOwnedPlanes();
  const planeModels = usePlanes();
  const routes = useRoutes();
  const demands = useDemands();
  const hubs = useHubs();
  const airline = useAirline();
  const cash = useCash();
  const openSheet = useGameStore((state) => state.openSheet);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const startRouteCreation = useGameStore((state) => state.startRouteCreation);
  const tabBarHeight = useTabBarHeight();
  const haptics = useHaptics();
  const maintenancePlane = useMaintenancePlane();
  const demandScore = airline?.demand_score ?? 0;
  const defaultPalette = getAirlinePalette("aviation-blue");
  const fleetBrand: FleetBrand = {
    name: airline?.name ?? "Your airline",
    code: airline?.airline_code ?? "AIR",
    logoId: airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID,
    primaryColor: airline?.color ?? defaultPalette.primary,
    secondaryColor: airline?.secondary_color ?? defaultPalette.secondary,
  };

  const planeRouteMap = useMemo(() => {
    const map = new Map<string, string>();
    routes
      .filter((route) => route.active)
      .forEach((route) => {
        const stop = route.via_iata ? ` to ${route.via_iata} to` : " to";
        map.set(
          route.plane.id,
          `${route.demand.origin.iata}${stop} ${route.demand.dest.iata}`,
        );
      });
    return map;
  }, [routes]);

  const idlePlanes = useMemo(
    () =>
      ownedPlanes.filter(
        (plane) => !plane.route_id && !planeRouteMap.has(plane.id),
      ),
    [ownedPlanes, planeRouteMap],
  );
  const activePlaneCount = ownedPlanes.length - idlePlanes.length;
  const wornPlanes = useMemo(
    () =>
      ownedPlanes
        .filter((plane) => (plane.condition ?? 100) <= 40)
        .sort(
          (first, second) =>
            (first.condition ?? 100) - (second.condition ?? 100),
        ),
    [ownedPlanes],
  );
  const fleetDemandAdvice = useMemo(() => {
    const capacityByDemand = new Map<string, number>();
    const activeDemandIds = new Set<string>();

    routes
      .filter((route) => route.active)
      .forEach((route) => {
        activeDemandIds.add(route.demand.id);
        capacityByDemand.set(
          route.demand.id,
          (capacityByDemand.get(route.demand.id) ?? 0) +
            scheduledDailySeats(route),
        );
      });

    let seatGap = 0;
    let marketsShort = 0;
    let unservedMarkets = 0;

    demands.forEach((demand) => {
      if (!activeDemandIds.has(demand.id)) {
        unservedMarkets += 1;
        return;
      }

      const gap = Math.max(
        0,
        playerPassengerPool(demand) - (capacityByDemand.get(demand.id) ?? 0),
      );
      if (gap > 0) {
        seatGap += gap;
        marketsShort += 1;
      }
    });

    return { marketsShort, seatGap, unservedMarkets };
  }, [demands, routes]);

  const assignmentTitle =
    hubs.length === 0
      ? "Build a hub first"
      : fleetDemandAdvice.seatGap > 0
        ? "Capacity needed"
        : "Idle aircraft available";
  const assignmentMessage =
    hubs.length === 0
      ? "Open the map and build a hub before assigning this aircraft."
      : fleetDemandAdvice.seatGap > 0
        ? `${fleetDemandAdvice.seatGap.toLocaleString()} more daily seats are needed across ${fleetDemandAdvice.marketsShort} market${fleetDemandAdvice.marketsShort === 1 ? "" : "s"}.`
        : fleetDemandAdvice.unservedMarkets > 0
          ? `${fleetDemandAdvice.unservedMarkets} route opportunit${fleetDemandAdvice.unservedMarkets === 1 ? "y is" : "ies are"} not yet served.`
          : "Current routes have enough daily seats. Open another route when ready.";

  const ownedGroups = useMemo(() => {
    const groups = new Map<string, OwnedPlaneGroupData>();
    ownedPlanes.forEach((plane) => {
      const current = groups.get(plane.plane_model.id);
      if (current) {
        current.planes.push(plane);
      } else {
        groups.set(plane.plane_model.id, {
          model: plane.plane_model,
          planes: [plane],
        });
      }
    });

    return Array.from(groups.values()).sort((first, second) =>
      first.model.nickname.localeCompare(second.model.nickname),
    );
  }, [ownedPlanes]);

  const sortedModels = useMemo(
    () =>
      [...planeModels].sort((first, second) => {
        const firstLocked =
          first.unlock_demands > demandScore || first.unlock_cash > cash;
        const secondLocked =
          second.unlock_demands > demandScore || second.unlock_cash > cash;
        if (firstLocked !== secondLocked) return firstLocked ? 1 : -1;
        if (first.price !== second.price) return first.price - second.price;
        return first.nickname.localeCompare(second.nickname);
      }),
    [cash, demandScore, planeModels],
  );

  const handleAssign = useCallback(() => {
    haptics.confirm();
    closeSheet();
    if (hubs.length > 0) {
      setTimeout(() => startRouteCreation(), 120);
    }
  }, [closeSheet, haptics, hubs.length, startRouteCreation]);

  const handleMaintain = useCallback(
    async (plane: OwnedPlane) => {
      if (maintainingPlaneId) return;
      haptics.confirm();
      setMaintainingPlaneId(plane.id);
      setMaintenanceError(null);

      try {
        const result = await maintenancePlane(plane.id);
        if (result.error) {
          setMaintenanceError(result.error);
          haptics.error();
          return;
        }
        haptics.success();
      } catch {
        setMaintenanceError("Unable to service this aircraft. Try again.");
        haptics.error();
      } finally {
        setMaintainingPlaneId(null);
      }
    },
    [haptics, maintainingPlaneId, maintenancePlane],
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
          <Text style={styles.title}>Fleet</Text>
          <Text style={styles.subtitle}>
            {ownedPlanes.length} aircraft · {activePlaneCount} flying ·{" "}
            {idlePlanes.length} idle
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close fleet"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {(["fleet", "buy"] as const).map((tab) => {
          const selected = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              activeOpacity={0.7}
              onPress={() => {
                haptics.tap();
                setActiveTab(tab);
              }}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text
                style={[styles.tabText, selected && styles.tabTextSelected]}
              >
                {tab === "fleet" ? "My fleet" : "Buy aircraft"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === "fleet" ? (
        <>
          <FleetSummary
            active={activePlaneCount}
            idle={idlePlanes.length}
            maintenance={wornPlanes.length}
          />

          {ownedPlanes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No aircraft owned</Text>
              <Text style={styles.emptyText}>
                Buy one aircraft, then assign it to a route from one of your
                hubs.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.7}
                onPress={() => setActiveTab("buy")}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Buy an aircraft</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {idlePlanes.length > 0 ? (
                <View style={styles.actionSection}>
                  <TouchableOpacity
                    accessibilityHint={
                      hubs.length === 0
                        ? "Returns to the map so you can build a hub"
                        : "Starts route planning"
                    }
                    accessibilityLabel={
                      hubs.length === 0
                        ? "Open the map to build a hub"
                        : `Plan a route for ${idlePlanes.length} idle aircraft`
                    }
                    accessibilityRole="button"
                    activeOpacity={0.7}
                    onPress={handleAssign}
                    style={styles.assignAction}
                  >
                    <View style={styles.assignCopy}>
                      <Text style={styles.assignTitle}>{assignmentTitle}</Text>
                      <Text style={styles.assignMessage}>
                        {assignmentMessage}
                      </Text>
                    </View>
                    <Text style={styles.assignLink}>
                      {hubs.length === 0 ? "Open map" : "Plan route"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={Colors.skyDark}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}

              {maintenanceError ? (
                <View style={styles.noticeContainer}>
                  <InlineNotice
                    kind="error"
                    title="Aircraft not serviced"
                    message={maintenanceError}
                  />
                </View>
              ) : null}

              {wornPlanes.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader
                    title="Maintenance"
                    detail={`${wornPlanes.length} need service`}
                  />
                  <View style={styles.flatList}>
                    {wornPlanes.map((plane) => (
                      <MaintenanceRow
                        key={plane.id}
                        brand={fleetBrand}
                        loading={maintainingPlaneId === plane.id}
                        onMaintain={() => handleMaintain(plane)}
                        plane={plane}
                        routeLabel={planeRouteMap.get(plane.id) ?? null}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <SectionHeader
                  title="Owned aircraft"
                  detail={`${ownedGroups.length} model${ownedGroups.length === 1 ? "" : "s"}`}
                />
                <View style={styles.flatList}>
                  {ownedGroups.map((group) => (
                    <OwnedPlaneGroup
                      key={group.model.id}
                      brand={fleetBrand}
                      group={group}
                      onPress={() => {
                        closeSheet();
                        setTimeout(
                          () =>
                            openSheet(
                              "manage-planes",
                              undefined,
                              undefined,
                              group,
                            ),
                          120,
                        );
                      }}
                      planeRouteMap={planeRouteMap}
                    />
                  ))}
                </View>
              </View>
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.purchaseSummary}>
            <View>
              <Text style={styles.purchaseSummaryLabel}>Available cash</Text>
              <Text style={styles.purchaseSummaryValue}>{fmtCash(cash)}</Text>
            </View>
            <View style={styles.purchaseSummaryRight}>
              <Text style={styles.purchaseSummaryLabel}>Routes opened</Text>
              <Text style={styles.purchaseSummaryValue}>{demandScore}</Text>
            </View>
          </View>

          <View style={styles.storeIntro}>
            <Text style={styles.storeIntroTitle}>Choose one aircraft</Text>
            <Text style={styles.storeIntroText}>
              Range must cover the longest route leg. Seats, speed, and route
              distance determine daily capacity.
            </Text>
          </View>

          <View style={styles.storeList}>
            {sortedModels.map((model) => (
              <PlaneStoreRow
                key={model.id}
                cash={cash}
                demandScore={demandScore}
                model={model}
              />
            ))}
          </View>
        </>
      )}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { backgroundColor: Colors.surface },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
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
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  tabs: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
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
  tabTextSelected: { color: Colors.skyDark },
  summary: {
    minHeight: 68,
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.border,
  },
  summaryValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  summaryLabel: { color: Colors.muted, fontSize: 10, lineHeight: 14 },
  actionSection: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  assignAction: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  assignCopy: { flex: 1 },
  assignTitle: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  assignMessage: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  assignLink: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  section: { marginHorizontal: Spacing.lg, paddingTop: Spacing.xl },
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
  },
  flatList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  ownedRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  ownedCopy: { flex: 1, minWidth: 0 },
  ownedTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.sm,
  },
  ownedName: {
    flexShrink: 1,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: Typography.weight.semibold,
  },
  ownedCount: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  ownedSpecs: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  ownedStatus: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  manageText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  maintenanceRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  maintenanceCopy: { flex: 1, minWidth: 0 },
  maintenanceName: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  maintenanceRoute: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  conditionTrack: {
    flex: 1,
    height: 3,
    overflow: "hidden",
    backgroundColor: Colors.inset,
  },
  conditionFill: { height: 3 },
  conditionValue: {
    minWidth: 34,
    fontFamily: Typography.mono,
    fontSize: 10,
    textAlign: "right",
  },
  maintenanceButton: {
    minWidth: 82,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  maintenanceButtonText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  maintenanceCost: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
    marginTop: 2,
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
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  noticeCopy: { flex: 1 },
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
  emptyState: {
    alignItems: "flex-start",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  emptyText: {
    maxWidth: 330,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  purchaseSummary: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  purchaseSummaryRight: { alignItems: "flex-end" },
  purchaseSummaryLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  purchaseSummaryValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  storeIntro: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  storeIntroTitle: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  storeIntroText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xs,
  },
  storeList: {
    marginHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  storeRow: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  storeRowLocked: { opacity: 0.62 },
  storeTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  storeIdentity: { flex: 1, minWidth: 0 },
  storeFamily: { color: Colors.muted, fontSize: 10, lineHeight: 14 },
  storeName: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: Typography.weight.semibold,
  },
  storeSpecs: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  storePriceBlock: { alignItems: "flex-end", flexShrink: 0 },
  storePrice: {
    fontFamily: Typography.mono,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: Typography.weight.bold,
  },
  storePriceLabel: { color: Colors.muted, fontSize: 9, lineHeight: 13 },
  lockRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  lockText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  purchaseRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  purchaseHelp: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
  buyButton: {
    minWidth: 112,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  buyButtonDisabled: { backgroundColor: Colors.inset },
  buyButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  buyButtonTextDisabled: { color: Colors.muted },
  rowError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  rowErrorText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.caption,
    lineHeight: 17,
  },
});
