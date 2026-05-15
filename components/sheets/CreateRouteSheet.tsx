/**
 * components/sheets/CreateRouteSheet.tsx
 *
 * WorldWide Rush-style route creation sheet.
 *
 * Focus:
 *   - clear live traveler queues
 *   - show waiting pax first
 *   - select the best idle plane for flow
 *   - keep economics secondary
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useCreateCustomRoute } from "@/hooks/useSupabaseWrite";
import { haulClass, simulatePaxDay } from "@/lib/demands";
import {
  spawnedPaxForDay,
  waitingPaxForDemand,
  type PassengerFlowDemand,
} from "@/lib/passengerFlow";
import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import { distNm } from "@/lib/routing";
import type { Airport, Demand, OwnedPlane } from "@/store";
import {
  useAirline,
  useCash,
  useDayProgress,
  useDemands,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRouteCreationWaypoints,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useEffect, useMemo, useState } from "react";
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

const FAMILY_COLOR: Record<string, string> = {
  embraer: Colors.green,
  bombardier: Colors.sky,
  boeing: Colors.amber,
  airbus: Colors.orange,
};

function RouteChain({
  waypoints,
  color,
  onRemove,
}: {
  waypoints: Airport[];
  color: string;
  onRemove: (iata: string) => void;
}) {
  return (
    <View style={chain.wrap}>
      {waypoints.map((airport, index) => {
        const first = index === 0;
        const last = index === waypoints.length - 1;
        const via = !first && !last;
        const accent = via ? Colors.purple : color;
        const label = first ? "ORIGIN" : via ? "STOP" : "DEST";

        return (
          <View key={`${airport.iata}-${index}`} style={chain.itemWrap}>
            {index > 0 && (
              <View
                style={[chain.connector, { backgroundColor: color + "44" }]}
              />
            )}

            <View style={[chain.item, { borderColor: accent + "33" }]}>
              <View style={[chain.dot, { backgroundColor: accent }]} />

              <View style={chain.body}>
                <View style={chain.topRow}>
                  <Text style={[chain.iata, { color: accent }]}>
                    {airport.iata}
                  </Text>
                  <View
                    style={[chain.badge, { backgroundColor: accent + "16" }]}
                  >
                    <Text style={[chain.badgeText, { color: accent }]}>
                      {label}
                    </Text>
                  </View>
                </View>
                <Text style={chain.city} numberOfLines={1}>
                  {airport.city}
                  {airport.country ? `, ${airport.country}` : ""}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => onRemove(airport.iata)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.dim} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {waypoints.length < 3 && (
        <View style={chain.hint}>
          <Ionicons name="add-circle-outline" size={13} color={Colors.dim} />
          <Text style={chain.hintText}>
            {waypoints.length === 1
              ? "Tap a destination airport on the map"
              : "Optional: tap one airport to add a stop"}
          </Text>
        </View>
      )}
    </View>
  );
}

function DemandRushCard({
  origin,
  dest,
  existingDemand,
  previewDemand,
  dayProgress,
  color,
  totalDist,
  fee,
  canAfford,
}: {
  origin: Airport;
  dest: Airport;
  existingDemand: Demand | null;
  previewDemand: PassengerFlowDemand;
  dayProgress: number;
  color: string;
  totalDist: number;
  fee: number;
  canAfford: boolean;
}) {
  const demand = existingDemand ?? previewDemand;
  const spawned = spawnedPaxForDay(demand, dayProgress);
  const waiting = waitingPaxForDemand(demand, dayProgress);
  const moved = demand.delivered_pax_today ?? 0;
  const progress = Math.min(
    100,
    Math.round((moved / Math.max(1, demand.base_pax_day)) * 100),
  );
  const source = existingDemand ? "LIVE DEMAND" : "NEW MARKET";
  const waitingColor = waiting > 0 ? Colors.amber : Colors.dim;

  return (
    <View
      style={[
        rush.card,
        { borderColor: waiting > 0 ? Colors.amber + "44" : color + "33" },
      ]}
    >
      <View style={rush.header}>
        <View style={[rush.icon, { backgroundColor: color + "18" }]}>
          <Ionicons name="people-outline" size={18} color={color} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[rush.label, { color }]}>{source}</Text>
          <Text style={rush.route} numberOfLines={1}>
            {origin.iata} → {dest.iata}
          </Text>
        </View>

        <View
          style={[
            rush.fee,
            {
              borderColor: canAfford ? Colors.green + "44" : Colors.red + "44",
            },
          ]}
        >
          <Text
            style={[
              rush.feeValue,
              { color: canAfford ? Colors.green : Colors.red },
            ]}
          >
            {fmtCash(fee)}
          </Text>
          <Text style={rush.feeLabel}>open</Text>
        </View>
      </View>

      {/* One-line summary — waiting pax + daily estimate */}
      <View style={rush.summaryRow}>
        {waiting > 0 ? (
          <>
            <Ionicons name="people-outline" size={12} color={Colors.amber} />
            <Text style={[rush.summaryTxt, { color: Colors.amber }]}>
              {waiting.toLocaleString()} waiting now
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="sparkles-outline" size={12} color={Colors.dim} />
            <Text style={rush.summaryTxt}>
              ~{demand.base_pax_day.toLocaleString()} travelers/day ·{" "}
              {totalDist.toLocaleString()}nm
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const PlaneRow = React.memo(function PlaneRow({
  plane,
  canServe,
  selected,
  reason,
  waitingNow,
  paxDay,
  totalDist,
  trustPct,
  color,
  onSelect,
}: {
  plane: OwnedPlane;
  canServe: boolean;
  selected: boolean;
  reason: string;
  waitingNow: number;
  paxDay: number;
  totalDist: number;
  trustPct: number;
  color: string;
  onSelect: () => void;
}) {
  const model = plane.plane_model;
  const familyColor = FAMILY_COLOR[model.family] ?? Colors.sky;
  const boardedNow = Math.min(waitingNow, model.pax_capacity);
  const previewBoard = Math.min(
    Math.max(boardedNow, Math.ceil(paxDay * 0.35)),
    model.pax_capacity,
  );

  const passMix = passengerMixFromDistance(totalDist);
  const revenue = canServe
    ? calcRouteRevenue({
        distNm: totalDist,
        speedKts: model.speed_kts,
        trustPct,
        deliveredPax: previewBoard,
        paxDay,
        costPerSector: model.cost_per_sector ?? 500,
        fuelPerNm: model.fuel_per_nm ?? 2,
        businessPct: passMix.businessPct,
        leisurePct: passMix.leisurePct,
      }).net
    : 0;

  const capacityPct = Math.min(
    100,
    Math.round((model.pax_capacity / Math.max(1, paxDay)) * 100),
  );
  const capColor =
    capacityPct >= 80
      ? Colors.green
      : capacityPct >= 40
        ? Colors.amber
        : Colors.red;

  return (
    <TouchableOpacity
      style={[
        planeStyles.row,
        selected && {
          borderColor: color + "66",
          backgroundColor: color + "0d",
        },
        !canServe && { opacity: 0.45 },
      ]}
      onPress={canServe ? onSelect : undefined}
      disabled={!canServe}
      activeOpacity={0.84}
    >
      <View
        style={[
          planeStyles.stripe,
          { backgroundColor: canServe ? familyColor : Colors.dim },
        ]}
      />

      <View style={planeStyles.body}>
        <View style={planeStyles.top}>
          <Text
            style={[planeStyles.name, !canServe && { color: Colors.dim }]}
            numberOfLines={1}
          >
            {model.nickname}
          </Text>

          {selected && (
            <Ionicons name="checkmark-circle" size={17} color={color} />
          )}

          {!canServe && (
            <View style={planeStyles.lockPill}>
              <Text style={planeStyles.lockText}>{reason}</Text>
            </View>
          )}
        </View>

        <Text style={planeStyles.specs}>
          {model.pax_capacity} seats · {model.range_nm.toLocaleString()}nm range
          · {model.speed_kts}kts
        </Text>

        {canServe && revenue > 0 && (
          <Text style={planeStyles.rewardLine}>
            Est. {fmtCash(revenue)} first reward
            {waitingNow > 0
              ? ` · ${Math.min(waitingNow, model.pax_capacity)} board now`
              : ""}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

export default function CreateRouteSheet() {
  const waypoints = useRouteCreationWaypoints();
  const hubs = useHubs();
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const demands = useDemands();
  const dayProgress = useDayProgress();
  const airline = useAirline();
  const cash = useCash();
  const removeWaypoint = useGameStore((s) => s.removeWaypoint);
  const clearCreation = useGameStore((s) => s.clearRouteCreation);
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const haptics = useHaptics();
  const tabBarH = useTabBarHeight();
  const createCustom = useCreateCustomRoute();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const color = airline?.color ?? Colors.sky;
  const origin = waypoints[0] ?? null;
  const dest = waypoints[waypoints.length - 1] ?? null;
  const via = waypoints.length === 3 ? waypoints[1] : null;

  const legs =
    origin && dest && origin.iata !== dest.iata
      ? via
        ? [distNm(origin, via), distNm(via, dest)]
        : [distNm(origin, dest)]
      : [0];

  const totalDist = legs.reduce((sum, leg) => sum + leg, 0);

  const maxLeg = Math.max(...legs);
  const haul = haulClass(totalDist);
  const fee = CREATION_FEE[haul] ?? 150_000;
  const canAfford = cash >= fee;

  const originHub = origin
    ? hubs.find((hub) => hub.airport.iata === origin.iata)
    : undefined;
  const originNotOwned = !!origin && !originHub;

  const paxDay = useMemo(() => {
    if (!origin || !dest || origin.iata === dest.iata) return 0;
    return simulatePaxDay(origin, dest, totalDist);
  }, [origin, dest, totalDist]);

  const existingDemand = useMemo(() => {
    if (!origin || !dest) return null;
    return (
      demands.find(
        (d) =>
          d.hub_iata === origin.iata &&
          d.origin.iata === origin.iata &&
          d.dest.iata === dest.iata &&
          d.status !== "served",
      ) ?? null
    );
  }, [origin, dest, demands]);

  const previewDemand: PassengerFlowDemand = useMemo(
    () => ({
      id: existingDemand?.id ?? "preview-demand",
      hub_iata: origin?.iata ?? "",
      base_pax_day: existingDemand?.base_pax_day ?? paxDay,
      delivered_pax_today: existingDemand?.delivered_pax_today ?? 0,
      status: existingDemand?.status ?? "preview",
    }),
    [existingDemand, origin?.iata, paxDay],
  );

  const waitingNow = waitingPaxForDemand(previewDemand, dayProgress);

  const classified = useMemo(() => {
    if (!origin || !dest) return [];

    const busyIds = new Set(
      routes.filter((route) => route.active).map((route) => route.plane.id),
    );

    return ownedPlanes
      .map((plane) => {
        const busy = busyIds.has(plane.id);
        const outOfRange = plane.plane_model.range_nm < maxLeg;
        const canServe = !busy && !outOfRange;
        const reason = busy
          ? "Busy"
          : outOfRange
            ? `Need ${maxLeg.toLocaleString()}nm`
            : "";

        const boardedNow = Math.min(waitingNow, plane.plane_model.pax_capacity);
        const previewBoard = Math.min(
          Math.max(boardedNow, Math.ceil(previewDemand.base_pax_day * 0.35)),
          plane.plane_model.pax_capacity,
        );

        const cMix = passengerMixFromDistance(totalDist);
        // Skip revenue calc for incompatible planes — saves CPU on large fleets
        const revenue = canServe
          ? calcRouteRevenue({
              distNm: totalDist,
              speedKts: plane.plane_model.speed_kts,
              trustPct: originHub?.trust ?? 0,
              deliveredPax: previewBoard,
              paxDay: previewDemand.base_pax_day,
              costPerSector: plane.plane_model.cost_per_sector ?? 500,
              fuelPerNm: plane.plane_model.fuel_per_nm ?? 2,
              businessPct: cMix.businessPct,
              leisurePct: cMix.leisurePct,
            }).net
          : 0;

        return { plane, canServe, reason, revenue, boardedNow };
      })
      .sort((a, b) => {
        if (a.canServe !== b.canServe) return a.canServe ? -1 : 1;
        if (a.boardedNow !== b.boardedNow) return b.boardedNow - a.boardedNow;
        return b.revenue - a.revenue;
      });
  }, [
    origin,
    dest,
    routes,
    ownedPlanes,
    maxLeg,
    waitingNow,
    previewDemand.base_pax_day,
    totalDist,
    originHub?.trust,
  ]);

  const [showIncompatible, setShowIncompatible] = useState(false);
  const eligibleCount = classified.filter((item) => item.canServe).length;
  const incompatibleCount = classified.filter((item) => !item.canServe).length;
  const selectedItems = classified.filter((item) =>
    selectedIds.includes(item.plane.id),
  );
  const selectedPlanes = selectedItems.map((item) => item.plane);
  const selectedCount = selectedPlanes.length;
  const selectedCapacity = selectedPlanes.reduce(
    (sum, plane) => sum + plane.plane_model.pax_capacity,
    0,
  );
  const selectedReward = selectedItems.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const totalFee = fee * Math.max(1, selectedCount);
  const canAffordSelected = cash >= totalFee;

  const recommended = classified.find((item) => item.canServe) ?? null;

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) =>
        classified.some((item) => item.canServe && item.plane.id === id),
      ),
    );
  }, [classified]);

  useEffect(() => {
    if (selectedIds.length === 0 && recommended?.plane.id) {
      setSelectedIds([recommended.plane.id]);
    }
  }, [recommended?.plane.id, selectedIds.length]);

  const togglePlane = (planeId: string) => {
    setSelectedIds((current) =>
      current.includes(planeId)
        ? current.filter((id) => id !== planeId)
        : [...current, planeId],
    );
  };

  const handleRemoveWaypoint = (iata: string) => {
    const remaining = waypoints.filter((airport) => airport.iata !== iata);
    if (remaining.length < 1) clearCreation();
    else removeWaypoint(iata);
  };

  const handleSwapStopDestination = () => {
    if (waypoints.length !== 3) return;

    const [originAirport, stopAirport, destinationAirport] = waypoints;

    haptics.tap();
    setSelectedIds([]);
    setError(null);
    startCreation([originAirport, destinationAirport, stopAirport]);
  };

  const handleCreate = async () => {
    if (!origin || !dest || selectedPlanes.length === 0 || !canAffordSelected)
      return;

    haptics.confirm();
    setCreating(true);
    setError(null);

    for (const plane of selectedPlanes) {
      const { error: err } = await createCustom(
        origin,
        dest,
        via,
        plane,
        previewDemand.base_pax_day,
        via ? legs[0] : totalDist,
        haul,
        totalDist,
      );

      if (err) {
        setCreating(false);
        setError(err);
        haptics.error();
        return;
      }
    }

    setCreating(false);
    haptics.success();
    setDone(true);

    try {
      const { airline: currentAirline } = useGameStore.getState();
      if (currentAirline) {
        const { supabase } = await import("@/lib/supabase");
        await supabase
          .from("airlines")
          .update({
            cash: currentAirline.cash,
            demand_score: currentAirline.demand_score,
          })
          .eq("id", currentAirline.id);
      }
    } catch {}
  };

  const haulColor =
    haul === "short"
      ? Colors.green
      : haul === "medium"
        ? Colors.amber
        : Colors.purple;

  if (waypoints.length < 2) {
    const hasOrigin = waypoints.length === 1;

    return (
      <View style={s.prompt}>
        {hasOrigin ? (
          <View style={s.buildingRoute}>
            <View style={s.buildingChip}>
              <Ionicons name="radio-button-on" size={12} color={color} />
              <Text style={[s.buildingIata, { color }]}>
                {waypoints[0].iata}
              </Text>
              <Text style={s.buildingCity}>{waypoints[0].city}</Text>
            </View>
            <View style={s.buildingArrow}>
              <View
                style={[s.buildingLine, { backgroundColor: color + "44" }]}
              />
              <Ionicons name="ellipse-outline" size={14} color={Colors.dim} />
            </View>
            <View style={[s.buildingChip, s.buildingChipEmpty]}>
              <Ionicons name="people-outline" size={12} color={Colors.dim} />
              <Text style={s.buildingEmptyText}>Pick destination</Text>
            </View>
          </View>
        ) : (
          <View style={[s.promptIcon, { backgroundColor: color + "18" }]}>
            <Ionicons name="flash-outline" size={34} color={color} />
          </View>
        )}

        <Text style={s.promptTitle}>
          {hasOrigin ? "Pick a destination" : "Build a flow route"}
        </Text>
        <Text style={s.promptSub}>
          {hasOrigin
            ? "Tap an airport to send travelers there."
            : "Tap one of your hubs on the map to start a new route."}
        </Text>

        {!hasOrigin && (
          <View style={s.promptTips}>
            <View style={s.tipRow}>
              <Ionicons name="people-outline" size={14} color={color} />
              <Text style={s.tipText}>
                Routes move waiting travelers from the origin.
              </Text>
            </View>
            <View style={s.tipRow}>
              <Ionicons name="cash-outline" size={14} color={color} />
              <Text style={s.tipText}>
                Bigger queues mean stronger first rewards.
              </Text>
            </View>
            <View style={s.tipRow}>
              <Ionicons name="git-branch-outline" size={14} color={color} />
              <Text style={s.tipText}>
                Add one stop if your plane needs a connection.
              </Text>
            </View>
          </View>
        )}

        {hasOrigin && (
          <TouchableOpacity style={s.cancelPrompt} onPress={clearCreation}>
            <Text style={s.cancelPromptText}>Cancel route</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (done) {
    return (
      <View style={s.success}>
        <View style={[s.successIcon, { backgroundColor: color + "18" }]}>
          <Ionicons name="flash-outline" size={38} color={color} />
        </View>
        <Text style={s.successTitle}>✈ Route Open!</Text>
        <Text style={[s.successRoute, { color }]}>
          {origin?.iata}
          {via ? ` → ${via.iata}` : ""} → {dest?.iata}
        </Text>
        <Text style={s.successSub}>
          Your plane is heading out now. Watch it move on the map and check back
          for your first earnings.
        </Text>
      </View>
    );
  }

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <View>
            <Text style={s.title}>Build Route</Text>
            <Text style={s.subtitle}>Move waiting travelers</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={clearCreation}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View style={s.section}>
        <RouteChain
          waypoints={waypoints}
          color={color}
          onRemove={(iata) => {
            haptics.tap();
            handleRemoveWaypoint(iata);
          }}
        />

        {waypoints.length === 3 && (
          <TouchableOpacity
            style={s.swapBtn}
            onPress={handleSwapStopDestination}
            activeOpacity={0.84}
          >
            <Ionicons
              name="swap-vertical-outline"
              size={16}
              color={Colors.purple}
            />
            <Text style={s.swapText}>Swap stop & destination</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Distance</Text>
          <Text style={s.summaryValue}>{totalDist.toLocaleString()}nm</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Type</Text>
          <Text style={[s.summaryValue, { color: haulColor }]}>
            {haul === "short"
              ? "Short hop"
              : haul === "medium"
                ? "Mid-range"
                : "Long haul"}
          </Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Available</Text>
          <Text
            style={[
              s.summaryValue,
              { color: eligibleCount > 0 ? Colors.green : Colors.red },
            ]}
          >
            {eligibleCount}
          </Text>
        </View>
      </View>

      {originNotOwned && origin && (
        <View style={s.warningBox}>
          <Ionicons name="alert-circle" size={15} color={Colors.amber} />
          <View style={{ flex: 1 }}>
            <Text style={s.warningTitle}>Start from your hub</Text>
            <Text style={s.warningText}>
              {origin.iata} is not owned. Remove it above, then tap one of your
              hubs.
            </Text>
          </View>
        </View>
      )}

      {!originNotOwned && origin && dest && (
        <>
          <View style={s.section}>
            <DemandRushCard
              origin={origin}
              dest={dest}
              existingDemand={existingDemand}
              previewDemand={previewDemand}
              dayProgress={dayProgress}
              color={color}
              totalDist={totalDist}
              fee={fee}
              canAfford={canAfford}
            />
          </View>

          {/* O&D Info — connecting routes only */}
          {via && legs.length === 2 && origin && dest && (
            <View style={s.odBox}>
              <View style={s.odHeader}>
                <Ionicons
                  name="git-branch-outline"
                  size={13}
                  color={Colors.sky}
                />
                <Text style={s.odTitle}>Connecting Route</Text>
              </View>
              <View style={s.odLegs}>
                <View style={s.odLeg}>
                  <Text style={s.odLegIata}>
                    {origin.iata} → {via.iata}
                  </Text>
                  <Text style={s.odLegDist}>
                    {Math.round(legs[0]).toLocaleString()}nm
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={12} color={Colors.dim} />
                <View style={s.odLeg}>
                  <Text style={s.odLegIata}>
                    {via.iata} → {dest.iata}
                  </Text>
                  <Text style={s.odLegDist}>
                    {Math.round(legs[1]).toLocaleString()}nm
                  </Text>
                </View>
              </View>
              <Text style={s.odHint}>
                ✈ Passengers continuing to {dest?.iata} pay more — booking the
                full journey
              </Text>
              {paxDay > 0 && paxDay < 20 && (
                <View style={s.odWarn}>
                  <Ionicons
                    name="information-circle-outline"
                    size={11}
                    color={Colors.amber}
                  />
                  <Text style={s.odWarnTxt}>
                    Not many travellers are heading this way yet. Consider a
                    busier corridor for your first connecting route.
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={s.divider} />

          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.eyebrow}>SELECT PLANE</Text>
              {eligibleCount > 0 && (
                <Text style={[s.eligible, { color: Colors.green }]}>
                  {eligibleCount} available
                </Text>
              )}
            </View>

            {selectedCount > 0 && (
              <View style={[s.selectedSummary, { borderColor: color + "44" }]}>
                <View style={s.selectedSummaryTop}>
                  <Text style={s.selectedSummaryTitle}>
                    {selectedCount} plane{selectedCount !== 1 ? "s" : ""}{" "}
                    selected
                  </Text>
                  <Text style={[s.selectedSummaryValue, { color }]}>
                    {selectedCapacity.toLocaleString()} seats
                  </Text>
                </View>
                <Text style={s.selectedSummarySub}>
                  Est. first reward {fmtCash(selectedReward)} · Setup cost{" "}
                  {fmtCash(totalFee)}
                </Text>
              </View>
            )}

            {ownedPlanes.length === 0 ? (
              <View style={s.emptyPlanes}>
                <Ionicons
                  name="airplane-outline"
                  size={34}
                  color={Colors.dim}
                />
                <Text style={s.emptyTitle}>No planes yet</Text>
                <Text style={s.emptySub}>
                  Buy a starter plane from Fleet first.
                </Text>
              </View>
            ) : (
              <>
                {/* Available planes only — shown by default */}
                {classified
                  .filter((item) => item.canServe)
                  .map(({ plane, canServe, reason }) => (
                    <PlaneRow
                      key={plane.id}
                      plane={plane}
                      canServe={canServe}
                      selected={selectedIds.includes(plane.id)}
                      reason={reason}
                      waitingNow={waitingNow}
                      paxDay={previewDemand.base_pax_day}
                      totalDist={totalDist}
                      trustPct={originHub?.trust ?? 0}
                      color={color}
                      onSelect={() => {
                        haptics.tap();
                        togglePlane(plane.id);
                      }}
                    />
                  ))}

                {/* Show/hide incompatible planes */}
                {incompatibleCount > 0 && (
                  <TouchableOpacity
                    style={s.incompatibleToggle}
                    onPress={() => setShowIncompatible((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showIncompatible ? "chevron-up" : "chevron-down"}
                      size={12}
                      color={Colors.dim}
                    />
                    <Text style={s.incompatibleToggleTxt}>
                      {showIncompatible ? "Hide" : "Show"} {incompatibleCount}{" "}
                      incompatible plane{incompatibleCount !== 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Incompatible planes — collapsed by default */}
                {showIncompatible &&
                  classified
                    .filter((item) => !item.canServe)
                    .map(({ plane, canServe, reason }) => (
                      <PlaneRow
                        key={plane.id}
                        plane={plane}
                        canServe={canServe}
                        selected={selectedIds.includes(plane.id)}
                        reason={reason}
                        waitingNow={waitingNow}
                        paxDay={previewDemand.base_pax_day}
                        totalDist={totalDist}
                        trustPct={originHub?.trust ?? 0}
                        color={color}
                        onSelect={() => {
                          haptics.tap();
                          togglePlane(plane.id);
                        }}
                      />
                    ))}
              </>
            )}
          </View>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={13} color={Colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.section}>
            <TouchableOpacity
              style={[
                s.confirm,
                {
                  backgroundColor:
                    selectedCount > 0 && canAffordSelected
                      ? color
                      : "rgba(255,255,255,.055)",
                },
                (selectedCount === 0 || !canAffordSelected || creating) && {
                  opacity: 0.5,
                },
              ]}
              onPress={handleCreate}
              disabled={selectedCount === 0 || !canAffordSelected || creating}
              activeOpacity={0.86}
            >
              {creating ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="flash-outline"
                    size={17}
                    color={
                      selectedCount > 0 && canAffordSelected
                        ? Colors.bg
                        : Colors.dim
                    }
                  />
                  <Text
                    style={[
                      s.confirmText,
                      {
                        color:
                          selectedCount > 0 && canAffordSelected
                            ? Colors.bg
                            : Colors.dim,
                      },
                    ]}
                  >
                    {selectedCount === 0
                      ? "Select one or more idle planes"
                      : !canAffordSelected
                        ? `Need ${fmtCash(totalFee - cash)} more`
                        : existingDemand
                          ? `Assign ${selectedCount} Plane${selectedCount !== 1 ? "s" : ""} · ${fmtCash(totalFee)}`
                          : `Open Route with ${selectedCount} Plane${selectedCount !== 1 ? "s" : ""} · ${fmtCash(totalFee)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {!canAffordSelected && selectedCount > 0 && (
              <Text style={s.shortfall}>
                {fmtCash(cash)} cash · {fmtCash(totalFee)} needed
              </Text>
            )}
          </View>
        </>
      )}
    </BottomSheetScrollView>
  );
}

const chain = StyleSheet.create({
  wrap: {
    gap: Spacing.xs,
  },
  itemWrap: {
    position: "relative",
  },
  connector: {
    width: 2,
    height: 10,
    marginLeft: 15,
    marginBottom: -2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.025)",
    padding: Spacing.sm,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 999,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iata: {
    fontSize: 17,
    fontWeight: "900",
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  city: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: Spacing.xs,
  },
  hintText: {
    fontSize: 10,
    color: Colors.dim,
  },
});

const rush = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: "900",
  },
  route: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
    marginTop: 1,
  },
  fee: {
    alignItems: "flex-end",
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  feeValue: {
    fontSize: 12,
    fontWeight: "900",
  },
  feeLabel: {
    fontSize: 8,
    color: Colors.dim,
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "right",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  summaryTxt: {
    fontSize: 11,
    color: Colors.dim,
    flex: 1,
    lineHeight: 15,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  mixTxt: { fontSize: 10, fontWeight: "700" },
  note: {
    flex: 1,
    fontSize: 10,
    color: Colors.dim,
    lineHeight: 15,
  },
});

const planeStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.025)",
    marginBottom: Spacing.sm,
  },
  stripe: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: "900",
  },
  rewardLine: {
    fontSize: 11,
    color: Colors.green,
    marginTop: 3,
  },
  lockPill: {
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,.06)",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lockText: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "800",
  },
  specs: {
    fontSize: 10,
    color: Colors.dim,
  },
  flowBox: {
    flex: 1,
    alignItems: "center",
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,.035)",
    paddingVertical: Spacing.sm,
  },
  flowValue: {
    fontSize: 13,
    fontWeight: "900",
  },
  flowLabel: {
    fontSize: 8,
    color: Colors.dim,
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  prompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  promptIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  promptTitle: {
    fontSize: 21,
    color: Colors.text,
    fontWeight: "900",
    textAlign: "center",
  },
  promptSub: {
    fontSize: 13,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 20,
  },
  promptTips: {
    alignSelf: "stretch",
    gap: 9,
    marginTop: Spacing.sm,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  tipText: {
    fontSize: 12,
    color: Colors.muted,
    flex: 1,
  },
  buildingRoute: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  buildingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.06)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  buildingChipEmpty: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  buildingIata: {
    fontSize: 16,
    fontWeight: "900",
  },
  buildingCity: {
    fontSize: 11,
    color: Colors.muted,
  },
  buildingEmptyText: {
    fontSize: 12,
    color: Colors.dim,
    fontWeight: "800",
  },
  buildingArrow: {
    flexDirection: "row",
    alignItems: "center",
    width: "60%",
    justifyContent: "center",
  },
  buildingLine: {
    flex: 1,
    height: 1,
  },
  cancelPrompt: {
    marginTop: Spacing.sm,
  },
  cancelPromptText: {
    fontSize: 12,
    color: Colors.red,
    fontWeight: "800",
  },
  success: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 23,
    color: Colors.text,
    fontWeight: "900",
  },
  successRoute: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },
  successSub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
  },
  eligible: {
    fontSize: 10,
    fontWeight: "900",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  summaryBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.035)",
    overflow: "hidden",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  summaryLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.3,
    fontWeight: "900",
  },
  summaryValue: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: "900",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.amber + "44",
    backgroundColor: Colors.amber + "08",
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
  },
  warningTitle: {
    fontSize: 12,
    color: Colors.amber,
    fontWeight: "900",
  },
  warningText: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  incompatibleToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    justifyContent: "center",
  },
  incompatibleToggleTxt: {
    fontSize: 11,
    color: Colors.dim,
    fontWeight: "500",
  },
  odBox: {
    backgroundColor: "rgba(56,189,248,0.06)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.2)",
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  odHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  odTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
  },
  odLegs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  odLeg: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  odLegIata: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.text,
  },
  odLegDist: {
    fontSize: 10,
    color: Colors.muted,
  },
  odHint: {
    fontSize: 10,
    color: Colors.sky,
    opacity: 0.8,
  },
  odWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 6,
    padding: 6,
  },
  odWarnTxt: {
    fontSize: 10,
    color: Colors.amber,
    flex: 1,
    lineHeight: 14,
  },
  emptyPlanes: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
  },
  emptySub: {
    fontSize: 12,
    color: Colors.dim,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "08",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: Colors.red,
    lineHeight: 16,
  },
  confirm: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "900",
  },
  shortfall: {
    fontSize: 10,
    color: Colors.red,
    textAlign: "center",
    marginTop: 4,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,

    paddingVertical: 10,
    paddingHorizontal: 12,

    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.purple + "33",

    backgroundColor: Colors.purple + "10",

    marginTop: Spacing.xs,
  },

  swapText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.purple,
  },

  selectedSummary: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.025)",
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  selectedSummaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  selectedSummaryTitle: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "900",
  },
  selectedSummaryValue: {
    fontSize: 11,
    fontWeight: "900",
  },
  selectedSummarySub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 3,
    fontWeight: "700",
  },

  recommendedTitle: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "900",
  },

  recommendedSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 2,
    fontWeight: "700",
  },
});
