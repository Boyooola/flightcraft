/**
 * components/sheets/CreateRouteSheet.tsx
 *
 * Player-initiated route creation — outside the demand system.
 *
 * Flow:
 *   1. Player taps ≥2 airports on map while in creation mode
 *   2. Sheet opens showing waypoints (origin → [via] → dest)
 *   3. Market analysis panel — estimated demand, confidence, break-even
 *   4. Plane selector — only eligible planes (range covers longest leg)
 *   5. Confirm — charges creation fee, generates synthetic demand, creates route
 *
 * Rules:
 *   - Origin MUST be an owned hub
 *   - Each leg ≤ selected plane's range
 *   - Costs $50K short / $150K medium / $300K long haul
 *   - Max 3 waypoints (origin + optional via + dest)
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useCreateCustomRoute } from "@/hooks/useSupabaseWrite";
import { haulClass, simulatePaxDay } from "@/lib/demands";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import { distNm, estimateRouteRevenue } from "@/lib/routing";
import type { Airport, OwnedPlane } from "@/store";
import {
  useAirline,
  useCash,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRouteCreationWaypoints,
  useRoutes,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// ROUTE VISUALISER
// Shows the waypoint chain with arrows and numbered stops
// ─────────────────────────────────────────────────────────────────

function RouteVisualiser({
  waypoints,
  color,
  onRemove,
}: {
  waypoints: Airport[];
  color: string;
  onRemove: (iata: string) => void;
}) {
  return (
    <View style={rv.wrap}>
      {waypoints.map((ap, i) => {
        const isFirst = i === 0;
        const isLast = i === waypoints.length - 1;
        const isVia = !isFirst && !isLast;
        const dotColor = isVia ? Colors.purple : color;
        const role = isFirst ? "Origin" : isVia ? "Stop" : "Dest";

        return (
          <View key={ap.iata} style={rv.row}>
            {/* Vertical connector line above (except first) */}
            {!isFirst && (
              <View
                style={[rv.connector, { backgroundColor: dotColor + "44" }]}
              />
            )}

            <View style={rv.stop}>
              {/* Dot */}
              <View style={[rv.dot, { backgroundColor: dotColor }]} />

              {/* Airport info */}
              <View style={rv.info}>
                <View style={rv.infoTop}>
                  <Text style={[rv.iata, { color: dotColor }]}>{ap.iata}</Text>
                  <View
                    style={[
                      rv.rolePill,
                      {
                        backgroundColor: dotColor + "18",
                        borderColor: dotColor + "44",
                      },
                    ]}
                  >
                    <Text style={[rv.roleTxt, { color: dotColor }]}>
                      {role}
                    </Text>
                  </View>
                </View>
                <Text style={rv.city} numberOfLines={1}>
                  {ap.city}
                  {ap.country ? `, ${ap.country}` : ""}
                </Text>
              </View>

              {/* Remove */}
              <TouchableOpacity
                onPress={() => onRemove(ap.iata)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={rv.removeBtn}
              >
                <Ionicons name="close-circle" size={18} color={Colors.dim} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const rv = StyleSheet.create({
  wrap: { gap: 0 },
  row: { position: "relative" },
  connector: { width: 2, height: Spacing.md, marginLeft: 11, marginBottom: -2 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 2 },
  info: { flex: 1, gap: 1 },
  infoTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  iata: { fontSize: 18, fontWeight: "700", letterSpacing: 0.5 },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  roleTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  city: { fontSize: 11, color: Colors.dim },
  removeBtn: { padding: 4 },
});

// ─────────────────────────────────────────────────────────────────
// MARKET ANALYSIS
// ─────────────────────────────────────────────────────────────────

function MarketAnalysis({
  origin,
  dest,
  totalDist,
  haul,
  paxDay,
  selectedPlane,
  trustPct,
}: {
  origin: Airport;
  dest: Airport;
  totalDist: number;
  haul: string;
  paxDay: number;
  selectedPlane: OwnedPlane | null;
  trustPct: number;
}) {
  // Confidence — use pax_annual_m from the DB field directly
  const originHasData = origin.pax_annual_m != null;
  const destHasData = dest.pax_annual_m != null;
  const confidence =
    originHasData && destHasData
      ? "High"
      : originHasData || destHasData
        ? "Medium"
        : "Low";
  const confColor =
    confidence === "High"
      ? Colors.green
      : confidence === "Medium"
        ? Colors.amber
        : Colors.red;

  const paxLow = Math.round(paxDay * 0.8);
  const paxHigh = Math.round(paxDay * 1.2);
  const strength =
    paxDay >= 400 ? "Strong" : paxDay >= 150 ? "Moderate" : "Thin";
  const strColor =
    paxDay >= 400 ? Colors.green : paxDay >= 150 ? Colors.amber : Colors.red;

  // Break-even in game-days based on selected plane
  let breakEven: number | null = null;
  let estDailyRev = 0;
  if (selectedPlane) {
    const fee = CREATION_FEE[haul] ?? 150_000;
    const res = estimateRouteRevenue(
      paxDay,
      {
        type: "direct",
        distNm: totalDist,
        maxLegNm: totalDist,
        dailyFlights: 0,
      },
      selectedPlane.plane_model.pax_capacity,
      selectedPlane.plane_model.speed_kts,
      trustPct,
      haul,
    );
    estDailyRev = res.dailyRev;
    breakEven = estDailyRev > 0 ? Math.ceil(fee / estDailyRev) : null;
  }

  return (
    <View style={an.card}>
      <Text style={an.title}>MARKET ANALYSIS</Text>

      {/* Stats grid */}
      <View style={an.grid}>
        <View style={an.gridBox}>
          <Text style={an.gridLbl}>DEMAND</Text>
          <Text style={[an.gridVal, { color: strColor }]}>
            {paxLow}–{paxHigh}
          </Text>
          <Text style={[an.gridSub, { color: strColor }]}>
            pax/day · {strength}
          </Text>
        </View>

        <View style={an.gridBox}>
          <Text style={an.gridLbl}>CONFIDENCE</Text>
          <Text style={[an.gridVal, { color: confColor }]}>{confidence}</Text>
          <Text style={an.gridSub}>
            {originHasData && destHasData
              ? "Both airports verified"
              : originHasData || destHasData
                ? "One airport verified"
                : "Estimated data"}
          </Text>
        </View>

        {selectedPlane && breakEven !== null && (
          <View style={an.gridBox}>
            <Text style={an.gridLbl}>BREAK-EVEN</Text>
            <Text style={[an.gridVal, { color: Colors.sky }]}>
              ~{breakEven}
            </Text>
            <Text style={an.gridSub}>game-days</Text>
          </View>
        )}
      </View>

      {/* Origin pax data */}
      {(origin.pax_annual_m != null || dest.pax_annual_m != null) && (
        <View style={an.dataRow}>
          {origin.pax_annual_m != null && (
            <View style={an.dataItem}>
              <Text style={an.dataIata}>{origin.iata}</Text>
              <Text style={an.dataPax}>{origin.pax_annual_m}M/yr</Text>
            </View>
          )}
          {dest.pax_annual_m != null && (
            <View style={an.dataItem}>
              <Text style={an.dataIata}>{dest.iata}</Text>
              <Text style={an.dataPax}>{dest.pax_annual_m}M/yr</Text>
            </View>
          )}
        </View>
      )}

      {/* Daily rev preview */}
      {selectedPlane && estDailyRev > 0 && (
        <View style={an.revRow}>
          <Text style={an.revLbl}>EST. DAILY REVENUE</Text>
          <Text style={[an.revVal, { color: Colors.green }]}>
            {fmtCash(estDailyRev)}
          </Text>
        </View>
      )}

      {/* Thin market warning */}
      {paxDay < 80 && (
        <View style={an.warn}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={Colors.amber}
          />
          <Text style={an.warnTxt}>
            Thin market — you&apos;d be opening a new corridor. Demand grows as
            hub trust increases.
          </Text>
        </View>
      )}
    </View>
  );
}

const an = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  title: { fontSize: 8, color: Colors.dim, letterSpacing: 2 },
  grid: { flexDirection: "row", gap: Spacing.sm },
  gridBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 2,
    alignItems: "center",
  },
  gridLbl: { fontSize: 7, color: Colors.dim, letterSpacing: 1.5 },
  gridVal: { fontSize: 18, fontWeight: "700" },
  gridSub: {
    fontSize: 8,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 12,
  },
  dataRow: { flexDirection: "row", gap: Spacing.sm },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dataIata: { fontSize: 11, color: Colors.sky, fontWeight: "700" },
  dataPax: { fontSize: 10, color: Colors.dim },
  revRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  revLbl: { fontSize: 9, color: Colors.dim, letterSpacing: 1.5 },
  revVal: { fontSize: 16, fontWeight: "700" },
  warn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.amber + "10",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "33",
    padding: Spacing.sm,
  },
  warnTxt: { fontSize: 11, color: Colors.amber, flex: 1, lineHeight: 16 },
});

// ─────────────────────────────────────────────────────────────────
// PLANE ROW
// ─────────────────────────────────────────────────────────────────

function PlaneRow({
  plane,
  canServe,
  busy,
  selected,
  reason,
  dailyRev,
  fillPct,
  color,
  onSelect,
}: {
  plane: OwnedPlane;
  canServe: boolean;
  busy: boolean;
  selected: boolean;
  reason: string;
  dailyRev: number;
  fillPct: number;
  color: string;
  onSelect: () => void;
}) {
  const fc = FAMILY_COLOR[plane.plane_model.family] ?? Colors.dim;
  const fillColor =
    fillPct >= 80 ? Colors.green : fillPct >= 40 ? Colors.amber : Colors.red;

  return (
    <TouchableOpacity
      style={[
        pr.row,
        selected && {
          borderColor: color + "66",
          backgroundColor: color + "0e",
        },
        !canServe && { opacity: 0.4 },
      ]}
      onPress={canServe ? onSelect : undefined}
      disabled={!canServe}
      activeOpacity={0.8}
    >
      <View
        style={[pr.stripe, { backgroundColor: canServe ? fc : Colors.dim }]}
      />
      <View style={pr.body}>
        <View style={pr.top}>
          <Text style={[pr.name, !canServe && { color: Colors.dim }]}>
            {plane.plane_model.nickname}
          </Text>
          {selected && (
            <Ionicons name="checkmark-circle" size={16} color={color} />
          )}
          {!canServe && (
            <View style={pr.reasonPill}>
              <Text style={pr.reasonTxt}>{reason}</Text>
            </View>
          )}
        </View>

        <View style={pr.specs}>
          <Text style={pr.spec}>{plane.plane_model.pax_capacity} pax</Text>
          <Text style={pr.specSep}>·</Text>
          <Text style={pr.spec}>
            {plane.plane_model.range_nm.toLocaleString()} nm range
          </Text>
        </View>

        {canServe && dailyRev > 0 && (
          <View style={pr.preview}>
            <Text style={[pr.rev, { color: Colors.green }]}>
              {fmtCash(dailyRev)}/day
            </Text>
            <View style={pr.fillWrap}>
              <View style={pr.fillTrack}>
                <View
                  style={[
                    pr.fillBar,
                    { width: `${fillPct}%` as any, backgroundColor: fillColor },
                  ]}
                />
              </View>
              <Text style={[pr.fillPct, { color: fillColor }]}>{fillPct}%</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const pr = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.xs },
  top: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  name: { fontSize: 14, color: Colors.text, fontWeight: "700", flex: 1 },
  reasonPill: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reasonTxt: { fontSize: 9, color: Colors.dim },
  specs: { flexDirection: "row", alignItems: "center", gap: 5 },
  spec: { fontSize: 11, color: Colors.dim },
  specSep: { fontSize: 11, color: Colors.dim + "66" },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginTop: 2,
  },
  rev: { fontSize: 13, fontWeight: "700" },
  fillWrap: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  fillTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  fillBar: { height: "100%", borderRadius: 2 },
  fillPct: { fontSize: 9, fontWeight: "700", minWidth: 28, textAlign: "right" },
});

// ─────────────────────────────────────────────────────────────────
// CREATE ROUTE SHEET
// ─────────────────────────────────────────────────────────────────

export default function CreateRouteSheet() {
  const creationWaypoints = useRouteCreationWaypoints();
  const hubs = useHubs();
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const airline = useAirline();
  const cash = useCash();
  const removeWp = useGameStore((s) => s.removeWaypoint);
  const clearCreation = useGameStore((s) => s.clearRouteCreation);
  const haptics = useHaptics();
  const tabBarH = useTabBarHeight();
  const createCustom = useCreateCustomRoute();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const color = airline?.color ?? Colors.sky;

  const waypoints = creationWaypoints;

  // ── handleRemoveWaypoint — defined after waypoints ────────────
  const handleRemoveWaypoint = (iata: string) => {
    const remaining = waypoints.filter((w) => w.iata !== iata);
    if (remaining.length < 1) {
      clearCreation();
    } else {
      removeWp(iata);
    }
  };

  // ── Derive route geometry (safe defaults when < 2 waypoints) ──
  const origin = waypoints[0] ?? null;
  const dest = waypoints[waypoints.length - 1] ?? null;
  const via = waypoints.length === 3 ? waypoints[1] : null;
  const legs =
    origin && dest && origin !== dest
      ? via
        ? [distNm(origin, via), distNm(via, dest)]
        : [distNm(origin, dest)]
      : [0];
  const totalDist = legs.reduce((a, b) => a + b, 0);
  const maxLeg = Math.max(...legs);
  const haul = haulClass(totalDist);

  const originHub = origin
    ? hubs.find((h) => h.airport.iata === origin.iata)
    : undefined;
  const originNotOwned = !!origin && !originHub;
  const paxDay = useMemo(() => {
    if (!origin || !dest || origin.iata === dest.iata) return 0;
    return simulatePaxDay(origin, dest, totalDist);
  }, [origin?.iata, dest?.iata, totalDist]);
  const fee = CREATION_FEE[haul] ?? 150_000;
  const canAfford = cash >= fee;

  const classified = useMemo(() => {
    if (!origin || !dest) return [];
    const busyIds = new Set(
      routes.filter((r) => r.active).map((r) => r.plane.id),
    );
    return ownedPlanes
      .map((plane) => {
        const busy = busyIds.has(plane.id);
        const canServe = !busy && plane.plane_model.range_nm >= maxLeg;
        const reason = busy
          ? "On another route"
          : !canServe
            ? `${plane.plane_model.range_nm.toLocaleString()}nm range, need ${maxLeg.toLocaleString()}nm`
            : "";

        let dailyRev = 0;
        let fillPct = 0;
        if (canServe) {
          const p = plane.plane_model;
          const res = calcRouteRevenue({
            distNm: totalDist,
            speedKts: p.speed_kts,
            trustPct: originHub?.trust ?? 0,
            deliveredPax: Math.min(paxDay, p.pax_capacity),
            paxDay,
            costPerSector: p.cost_per_sector ?? 500,
            fuelPerNm: p.fuel_per_nm ?? 2.0,
          });
          dailyRev = res.net;
          fillPct = Math.round(
            (Math.min(paxDay, p.pax_capacity) / Math.max(1, paxDay)) * 100,
          );
        }
        return { plane, busy, canServe, reason, dailyRev, fillPct };
      })
      .sort((a, b) => {
        if (a.canServe !== b.canServe) return a.canServe ? -1 : 1;
        return b.dailyRev - a.dailyRev;
      });
  }, [ownedPlanes, routes, maxLeg, paxDay, totalDist, originHub?.trust]);

  const eligibleCount = classified.filter((c) => c.canServe).length;
  const selectedPlane =
    classified.find((c) => c.plane.id === selectedId)?.plane ?? null;

  // ── Early returns AFTER all hooks ─────────────────────────────

  // Prompt state — not enough waypoints yet
  if (waypoints.length < 2) {
    const hasOrigin = waypoints.length === 1;
    return (
      <View style={s.prompt}>
        {/* Live route being built */}
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
              <Ionicons name="locate-outline" size={12} color={Colors.dim} />
              <Text style={s.buildingEmptyTxt}>Tap destination</Text>
            </View>
          </View>
        ) : (
          <View style={[s.promptIcon, { backgroundColor: color + "18" }]}>
            <Ionicons name="airplane-outline" size={32} color={color} />
          </View>
        )}

        <Text style={s.promptTitle}>
          {hasOrigin ? "Now pick a destination" : "Plot your flight path"}
        </Text>
        <Text style={s.promptSub}>
          {hasOrigin
            ? "Tap any airport on the map to set your destination."
            : "Tap your hub on the map to start building a route."}
        </Text>

        {!hasOrigin && (
          <View style={s.promptTips}>
            <View style={s.tipRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={color}
              />
              <Text style={s.tipTxt}>Start from one of your owned hubs</Text>
            </View>
            <View style={s.tipRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={color}
              />
              <Text style={s.tipTxt}>Add a mid-stop for connecting routes</Text>
            </View>
            <View style={s.tipRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={color}
              />
              <Text style={s.tipTxt}>
                Longer routes earn more per passenger
              </Text>
            </View>
          </View>
        )}

        {hasOrigin && (
          <TouchableOpacity style={s.cancelWp} onPress={() => clearCreation()}>
            <Text style={s.cancelWpTxt}>✕ Cancel route</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Success ──────────────────────────────────────────────────
  if (done) {
    return (
      <View style={s.success}>
        <View style={[s.successIcon, { backgroundColor: color + "18" }]}>
          <Ionicons name="airplane" size={36} color={color} />
        </View>
        <Text style={s.successTitle}>Route is Live! ✈</Text>
        <Text style={[s.successRoute, { color }]}>
          {origin?.iata}
          {via ? ` → ${via.iata}` : ""} → {dest?.iata}
        </Text>
        <Text style={s.successSub}>
          Your plane is airborne. Revenue ticks in{"\n"}as each flight
          completes.
        </Text>
      </View>
    );
  }

  // ── Main route sheet ─────────────────────────────────────────

  const handleCreate = async () => {
    if (!selectedPlane || !canAfford) return;
    haptics.confirm();
    setCreating(true);
    setError(null);
    const { error: err } = await createCustom(
      origin,
      dest,
      via,
      selectedPlane,
      paxDay,
      via ? legs[0] : totalDist,
      haul,
      totalDist,
    );
    setCreating(false);
    if (err) {
      setError(err);
      haptics.error();
    } else {
      haptics.success();
      setDone(true);
      // Auto-save — persist cash + day immediately after route creation fee charged
      try {
        const { airline: a } = useGameStore.getState();
        if (a) {
          const { supabase } = await import("@/lib/supabase");
          await supabase
            .from("airlines")
            .update({
              cash: a.cash,
              demand_score: a.demand_score,
            })
            .eq("id", a.id);
        }
      } catch {}
    }
  };

  const haulColor =
    haul === "short"
      ? Colors.green
      : haul === "medium"
        ? Colors.amber
        : Colors.purple;

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: tabBarH }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <MaterialCommunityIcons
            name="airplane-takeoff"
            size={20}
            color={color}
          />
          <Text style={s.title}>New Route</Text>
        </View>
        <TouchableOpacity
          onPress={clearCreation}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Route visualiser */}
      <View style={s.section}>
        <RouteVisualiser
          waypoints={waypoints}
          color={color}
          onRemove={(iata) => {
            haptics.tap();
            handleRemoveWaypoint(iata);
          }}
        />

        {/* Tap hint for adding via */}
        {waypoints.length === 2 && (
          <TouchableOpacity
            style={s.addVia}
            activeOpacity={0.7}
            onPress={() => {}}
          >
            <MaterialCommunityIcons
              name="plus-circle-outline"
              size={14}
              color={Colors.dim}
            />
            <Text style={s.addViaTxt}>
              Tap another airport on the map to add a connecting stop
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Route summary bar */}
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLbl}>DISTANCE</Text>
          <Text style={s.summaryVal}>{totalDist.toLocaleString()} nm</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLbl}>HAUL</Text>
          <Text style={[s.summaryVal, { color: haulColor }]}>
            {haul.charAt(0).toUpperCase() + haul.slice(1)}
          </Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryLbl}>OPENING FEE</Text>
          <Text
            style={[
              s.summaryVal,
              { color: canAfford ? Colors.green : Colors.red },
            ]}
          >
            {fmtCash(fee)}
          </Text>
        </View>
        {via && (
          <>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>LEGS</Text>
              <Text style={s.summaryVal}>
                {legs[0].toLocaleString()} + {legs[1].toLocaleString()}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Origin not owned — prominent inline warning */}
      {originNotOwned && (
        <View style={s.validationBanner}>
          <Ionicons name="alert-circle" size={15} color={Colors.amber} />
          <View style={s.validationBody}>
            <Text style={[s.validationTitle, { color: Colors.amber }]}>
              Wrong starting airport
            </Text>
            <Text style={s.validationSub}>
              {origin.iata} isn&apos;t your hub. Tap ✕ on it above, then tap one
              of your owned hubs to start the route.
            </Text>
          </View>
        </View>
      )}

      {!originNotOwned && (
        <>
          <View style={s.divider} />

          {/* Market analysis */}
          <View style={s.section}>
            <MarketAnalysis
              origin={origin}
              dest={dest}
              totalDist={totalDist}
              haul={haul}
              paxDay={paxDay}
              selectedPlane={selectedPlane}
              trustPct={originHub?.trust ?? 0}
            />
          </View>

          <View style={s.divider} />

          {/* Plane selector */}
          <View style={s.section}>
            <View style={s.sectionHdr}>
              <Text style={s.eyebrow}>SELECT PLANE</Text>
              <Text
                style={[
                  s.eligibleNote,
                  { color: eligibleCount > 0 ? Colors.green : Colors.red },
                ]}
              >
                {eligibleCount} eligible
              </Text>
            </View>

            {ownedPlanes.length === 0 ? (
              <View style={s.noPlanes}>
                <Ionicons
                  name="airplane-outline"
                  size={32}
                  color={Colors.dim}
                />
                <Text style={s.noPlanesT}>No planes in fleet</Text>
                <Text style={s.noPlanesS}>
                  Buy one from the Fleet tab first
                </Text>
              </View>
            ) : (
              classified.map(
                ({ plane, canServe, busy, reason, dailyRev, fillPct }) => (
                  <PlaneRow
                    key={plane.id}
                    plane={plane}
                    canServe={canServe}
                    busy={busy}
                    selected={selectedId === plane.id}
                    reason={reason}
                    dailyRev={dailyRev}
                    fillPct={fillPct}
                    color={color}
                    onSelect={() => {
                      haptics.tap();
                      setSelectedId((prev) =>
                        prev === plane.id ? null : plane.id,
                      );
                    }}
                  />
                ),
              )
            )}
          </View>

          {/* Error */}
          {error && (
            <View
              style={[s.alert, s.alertRed, { marginHorizontal: Spacing.lg }]}
            >
              <Ionicons name="warning-outline" size={13} color={Colors.red} />
              <Text style={s.alertRedTxt}>{error}</Text>
            </View>
          )}

          {/* Confirm */}
          <View style={s.section}>
            <TouchableOpacity
              style={[
                s.confirmBtn,
                {
                  backgroundColor:
                    selectedPlane && canAfford
                      ? color
                      : "rgba(255,255,255,.05)",
                },
                (!selectedPlane || !canAfford || creating) && { opacity: 0.5 },
              ]}
              onPress={handleCreate}
              disabled={!selectedPlane || !canAfford || creating}
              activeOpacity={0.85}
            >
              {creating ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="airplane"
                    size={17}
                    color={selectedPlane && canAfford ? Colors.bg : Colors.dim}
                  />
                  <Text
                    style={[
                      s.confirmTxt,
                      {
                        color:
                          selectedPlane && canAfford ? Colors.bg : Colors.dim,
                      },
                    ]}
                  >
                    {!selectedPlane
                      ? "Select a plane above"
                      : !canAfford
                        ? `Need ${fmtCash(fee - cash)} more`
                        : `Open Route — ${fmtCash(fee)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {!canAfford && (
              <Text style={s.shortfall}>
                {fmtCash(cash)} available · {fmtCash(fee)} needed
              </Text>
            )}
          </View>
        </>
      )}
    </BottomSheetScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

  // Prompt (< 2 waypoints)
  prompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  promptIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  promptTitle: { fontSize: 20, color: Colors.text, fontWeight: "700" },
  promptSub: {
    fontSize: 13,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 20,
  },

  // Route building state
  buildingRoute: {
    alignItems: "center",
    gap: 8,
    width: "100%",
    paddingHorizontal: Spacing.md,
  },
  buildingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buildingChipEmpty: { borderStyle: "dashed", backgroundColor: "transparent" },
  buildingIata: { fontSize: 16, fontWeight: "700" },
  buildingCity: { fontSize: 11, color: Colors.muted },
  buildingEmptyTxt: { fontSize: 12, color: Colors.dim },
  buildingArrow: {
    flexDirection: "row",
    alignItems: "center",
    width: "60%",
    justifyContent: "center",
  },
  buildingLine: { flex: 1, height: 1 },

  // Prompt tips
  promptTips: { alignSelf: "stretch", gap: 8, marginTop: Spacing.sm },
  tipRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  tipTxt: { fontSize: 12, color: Colors.muted },

  // Cancel button
  cancelWp: { marginTop: Spacing.sm },
  cancelWpTxt: { fontSize: 12, color: Colors.red, fontWeight: "600" },

  // Success
  successRoute: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: -Spacing.sm,
  },
  promptSteps: { gap: Spacing.sm, width: "100%" },
  promptStep: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepN: { fontSize: 12, fontWeight: "700" },
  stepLbl: { fontSize: 13, color: Colors.muted },

  // Success
  success: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 22, color: Colors.text, fontWeight: "700" },
  successSub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },

  // Layout
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 9, color: Colors.dim, letterSpacing: 2.5 },
  eligibleNote: { fontSize: 10, fontWeight: "600" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },

  // Via hint
  addVia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  addViaTxt: { fontSize: 11, color: Colors.dim, flex: 1, lineHeight: 16 },

  // Summary bar
  summaryBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
  summaryLbl: { fontSize: 7, color: Colors.dim, letterSpacing: 1.5 },
  summaryVal: { fontSize: 11, color: Colors.text, fontWeight: "700" },

  // Alerts
  validationBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(251,191,36,.06)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "44",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  validationBody: { flex: 1, gap: 3 },
  validationTitle: { fontSize: 12, fontWeight: "700" },
  validationSub: { fontSize: 11, color: Colors.muted, lineHeight: 16 },
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  alertRed: {
    backgroundColor: "rgba(248,113,113,.08)",
    borderColor: "rgba(248,113,113,.3)",
  },
  alertRedTxt: { fontSize: 11, color: Colors.red, flex: 1, lineHeight: 16 },

  // No planes
  noPlanes: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noPlanesT: { fontSize: 15, color: Colors.text, fontWeight: "700" },
  noPlanesS: { fontSize: 12, color: Colors.dim },

  // Confirm
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH + 4,
  },
  confirmTxt: { fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
  shortfall: {
    fontSize: 10,
    color: Colors.red,
    textAlign: "center",
    marginTop: 4,
  },
});
