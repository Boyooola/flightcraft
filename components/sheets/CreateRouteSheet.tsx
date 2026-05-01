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
import { useMemo, useState } from "react";
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
    Math.round((moved / Math.max(1, demand.pax_day)) * 100),
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

      <View style={rush.stats}>
        <View style={rush.statBox}>
          <Text style={[rush.statValue, { color: waitingColor }]}>
            {waiting.toLocaleString()}
          </Text>
          <Text style={rush.statLabel}>Waiting now</Text>
        </View>
        <View style={rush.statBox}>
          <Text style={[rush.statValue, { color: Colors.sky }]}>
            {spawned.toLocaleString()}
          </Text>
          <Text style={rush.statLabel}>Appeared</Text>
        </View>
        <View style={rush.statBox}>
          <Text style={[rush.statValue, { color: Colors.green }]}>
            {moved.toLocaleString()}
          </Text>
          <Text style={rush.statLabel}>Moved</Text>
        </View>
      </View>

      <View style={rush.progressRow}>
        <View style={rush.track}>
          <View
            style={[
              rush.fill,
              { width: `${progress}%` as any, backgroundColor: color },
            ]}
          />
        </View>
        <Text style={[rush.progressText, { color }]}>{progress}%</Text>
      </View>

      <View style={rush.noteRow}>
        <Ionicons
          name={existingDemand ? "flash-outline" : "sparkles-outline"}
          size={13}
          color={waiting > 0 ? Colors.amber : Colors.dim}
        />
        <Text style={rush.note}>
          {existingDemand
            ? waiting > 0
              ? "This route can clear real travelers immediately."
              : "Travelers will keep appearing as the day progresses."
            : `Estimated ${demand.pax_day.toLocaleString()} travelers/day · ${totalDist.toLocaleString()}nm corridor.`}
        </Text>
      </View>
    </View>
  );
}

function PlaneRow({
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

  const revenue = canServe
    ? calcRouteRevenue({
        distNm: totalDist,
        speedKts: model.speed_kts,
        trustPct,
        deliveredPax: previewBoard,
        paxDay,
        costPerSector: model.cost_per_sector ?? 500,
        fuelPerNm: model.fuel_per_nm ?? 2,
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

        {canServe && (
          <>
            <View style={planeStyles.flowRow}>
              <View style={planeStyles.flowBox}>
                <Text
                  style={[
                    planeStyles.flowValue,
                    { color: waitingNow > 0 ? Colors.amber : Colors.dim },
                  ]}
                >
                  {boardedNow.toLocaleString()}
                </Text>
                <Text style={planeStyles.flowLabel}>board now</Text>
              </View>
              <View style={planeStyles.flowBox}>
                <Text style={[planeStyles.flowValue, { color: capColor }]}>
                  {capacityPct}%
                </Text>
                <Text style={planeStyles.flowLabel}>slot power</Text>
              </View>
              <View style={planeStyles.flowBox}>
                <Text style={[planeStyles.flowValue, { color: Colors.green }]}>
                  {fmtCash(revenue)}
                </Text>
                <Text style={planeStyles.flowLabel}>first reward</Text>
              </View>
            </View>

            <View style={planeStyles.barRow}>
              <View style={planeStyles.track}>
                <View
                  style={[
                    planeStyles.fill,
                    {
                      width: `${capacityPct}%` as any,
                      backgroundColor: capColor,
                    },
                  ]}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

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
  const haptics = useHaptics();
  const tabBarH = useTabBarHeight();
  const createCustom = useCreateCustomRoute();

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  }, [origin?.iata, dest?.iata, totalDist]);

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
  }, [demands, origin?.iata, dest?.iata]);

  const previewDemand: PassengerFlowDemand = useMemo(
    () => ({
      id: existingDemand?.id ?? "preview-demand",
      hub_iata: origin?.iata ?? "",
      pax_day: existingDemand?.pax_day ?? paxDay,
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
          Math.max(boardedNow, Math.ceil(previewDemand.pax_day * 0.35)),
          plane.plane_model.pax_capacity,
        );

        const revenue = canServe
          ? calcRouteRevenue({
              distNm: totalDist,
              speedKts: plane.plane_model.speed_kts,
              trustPct: originHub?.trust ?? 0,
              deliveredPax: previewBoard,
              paxDay: previewDemand.pax_day,
              costPerSector: plane.plane_model.cost_per_sector ?? 500,
              fuelPerNm: plane.plane_model.fuel_per_nm ?? 2,
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
    ownedPlanes,
    routes,
    origin?.iata,
    dest?.iata,
    maxLeg,
    waitingNow,
    previewDemand.pax_day,
    totalDist,
    originHub?.trust,
  ]);

  const eligibleCount = classified.filter((item) => item.canServe).length;
  const selectedPlane =
    classified.find((item) => item.plane.id === selectedId)?.plane ?? null;

  const handleRemoveWaypoint = (iata: string) => {
    const remaining = waypoints.filter((airport) => airport.iata !== iata);
    if (remaining.length < 1) clearCreation();
    else removeWaypoint(iata);
  };

  const handleCreate = async () => {
    if (!origin || !dest || !selectedPlane || !canAfford) return;

    haptics.confirm();
    setCreating(true);
    setError(null);

    const { error: err } = await createCustom(
      origin,
      dest,
      via,
      selectedPlane,
      previewDemand.pax_day,
      via ? legs[0] : totalDist,
      haul,
      totalDist,
    );

    setCreating(false);

    if (err) {
      setError(err);
      haptics.error();
      return;
    }

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
        <Text style={s.successTitle}>Route Live</Text>
        <Text style={[s.successRoute, { color }]}>
          {origin?.iata}
          {via ? ` → ${via.iata}` : ""} → {dest?.iata}
        </Text>
        <Text style={s.successSub}>
          Your plane will board waiting travelers as they appear and turn them
          into cash flow.
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
      </View>

      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>DISTANCE</Text>
          <Text style={s.summaryValue}>{totalDist.toLocaleString()}nm</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>HAUL</Text>
          <Text style={[s.summaryValue, { color: haulColor }]}>
            {haul.toUpperCase()}
          </Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>IDLE PLANES</Text>
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

          <View style={s.divider} />

          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.eyebrow}>PICK FLOW POWER</Text>
              <Text
                style={[
                  s.eligible,
                  { color: eligibleCount > 0 ? Colors.green : Colors.red },
                ]}
              >
                {eligibleCount} ready
              </Text>
            </View>

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
              classified.map(({ plane, canServe, reason }) => (
                <PlaneRow
                  key={plane.id}
                  plane={plane}
                  canServe={canServe}
                  selected={selectedId === plane.id}
                  reason={reason}
                  waitingNow={waitingNow}
                  paxDay={previewDemand.pax_day}
                  totalDist={totalDist}
                  trustPct={originHub?.trust ?? 0}
                  color={color}
                  onSelect={() => {
                    haptics.tap();
                    setSelectedId((current) =>
                      current === plane.id ? null : plane.id,
                    );
                  }}
                />
              ))
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
                    selectedPlane && canAfford
                      ? color
                      : "rgba(255,255,255,.055)",
                },
                (!selectedPlane || !canAfford || creating) && { opacity: 0.5 },
              ]}
              onPress={handleCreate}
              disabled={!selectedPlane || !canAfford || creating}
              activeOpacity={0.86}
            >
              {creating ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="flash-outline"
                    size={17}
                    color={selectedPlane && canAfford ? Colors.bg : Colors.dim}
                  />
                  <Text
                    style={[
                      s.confirmText,
                      {
                        color:
                          selectedPlane && canAfford ? Colors.bg : Colors.dim,
                      },
                    ]}
                  >
                    {!selectedPlane
                      ? "Select an idle plane"
                      : !canAfford
                        ? `Need ${fmtCash(fee - cash)} more`
                        : existingDemand
                          ? `Clear This Slot · ${fmtCash(fee)}`
                          : `Open Market Route · ${fmtCash(fee)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {!canAfford && (
              <Text style={s.shortfall}>
                {fmtCash(cash)} cash · {fmtCash(fee)} needed
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
  statBox: {
    flex: 1,
    alignItems: "center",
    borderRadius: Radius.lg,
    backgroundColor: "rgba(255,255,255,.035)",
    paddingVertical: Spacing.sm,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "800",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "right",
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
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
  flowRow: {
    flexDirection: "row",
    gap: Spacing.sm,
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
  barRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
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
});
