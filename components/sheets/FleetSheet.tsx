/**
 * components/sheets/FleetSheet.tsx
 *
 * Rebuilt with the following fixes:
 *   1. Stat bar is tab-aware — fleet stats on My Planes, cash/unlock on Store
 *   2. Dead `day` prop removed from OwnedPlaneGroup
 *   3. Idle assign banner styled as urgent (airline color bg tint + border)
 *   4. Commented-out Assign button removed
 *   5. Dead `pr` StyleSheet removed
 *   6. Needs Attention IIFE extracted into named component <WornPlanesSection>
 *   7. Worn plane rows show active route label
 *   8. OwnedPlaneGroup shows condition badge when any plane in group is worn
 *   9. Store lock reason states exact route count needed
 *  10. Buy errors use prominent errorBox, not tiny fine print
 *  11. Family headers show available/locked model count
 *  12. Stat bar has hairline dividers between cells
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useBuyPlane, useMaintenancePlane } from "@/hooks/useSupabaseWrite";
import { fmtCash } from "@/lib/revenue";
import type { OwnedPlane, PlaneModel } from "@/store";
import {
  useAirline,
  useCash,
  useDemands,
  useGameStore,
  useOwnedPlanes,
  usePlanes,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useCallback, useMemo, useState } from "react";
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

const FAMILY_COLOR: Record<string, string> = {
  embraer: Colors.green,
  bombardier: Colors.sky,
  boeing: Colors.amber,
  airbus: Colors.orange,
};

const FAMILY_LABEL: Record<string, string> = {
  embraer: "Embraer",
  bombardier: "Bombardier",
  boeing: "Boeing",
  airbus: "Airbus",
};

// ─────────────────────────────────────────────────────────────────
// QUANTITY SELECTOR
// ─────────────────────────────────────────────────────────────────

function QuantitySelector({
  value,
  min,
  max,
  onChange,
  color,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  color: string;
}) {
  return (
    <View style={qs.wrap}>
      <TouchableOpacity
        style={[qs.btn, value <= min && qs.disabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
      >
        <Ionicons
          name="remove"
          size={14}
          color={value <= min ? Colors.dim : color}
        />
      </TouchableOpacity>
      <Text style={[qs.val, { color }]}>{value}</Text>
      <TouchableOpacity
        style={[qs.btn, value >= max && qs.disabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
      >
        <Ionicons
          name="add"
          size={14}
          color={value >= max ? Colors.dim : color}
        />
      </TouchableOpacity>
    </View>
  );
}

const qs = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  val: { fontSize: 14, fontWeight: "900", minWidth: 22, textAlign: "center" },
});

// ─────────────────────────────────────────────────────────────────
// OWNED PLANE GROUP ROW
// — dead `day` prop removed
// — condition badge shown when any plane in group is worn
// ─────────────────────────────────────────────────────────────────

const OwnedPlaneGroup = React.memo(function OwnedPlaneGroup({
  group,
  planeRouteMap,
  onAssign,
  onTap,
  onClose,
}: {
  group: { model: PlaneModel; planes: OwnedPlane[] };
  planeRouteMap: Map<string, string>;
  onAssign: () => void;
  onTap: () => void;
  onClose: () => void;
}) {
  const fc = FAMILY_COLOR[group.model.family] ?? Colors.sky;
  const total = group.planes.length;
  const active = group.planes.filter((p) => planeRouteMap.has(p.id)).length;
  const idle = total - active;

  // Worst condition across the group — show badge if any plane is worn
  const minCond = Math.min(...group.planes.map((p) => p.condition ?? 100));
  const condBadge =
    minCond <= 15
      ? { color: Colors.red, label: `🔧 ${minCond}%` }
      : minCond <= 40
        ? { color: Colors.amber, label: `🔧 ${minCond}%` }
        : null;

  return (
    <View style={g.row}>
      <View style={[g.stripe, { backgroundColor: fc }]} />
      <View style={g.body}>
        <View style={g.top}>
          <Text style={g.name} numberOfLines={1}>
            {group.model.nickname}
            <Text style={g.count}> ×{total}</Text>
          </Text>
          {condBadge && (
            <Text style={[g.condBadge, { color: condBadge.color }]}>
              {condBadge.label}
            </Text>
          )}
        </View>
        <Text style={g.meta}>
          {active} flying
          {idle > 0 ? ` · ` : ""}
          {idle > 0 && <Text style={{ color: Colors.amber }}>{idle} idle</Text>}
        </Text>
        <Text style={g.specs}>
          {group.model.pax_capacity} pax ·{" "}
          {group.model.range_nm.toLocaleString()}nm
        </Text>
      </View>
      <View style={g.actions}>
        <TouchableOpacity
          style={g.manageBtn}
          onPress={() => {
            onClose();
            setTimeout(onTap, 1000);
          }}
          activeOpacity={0.8}
        >
          <Text style={g.manageTxt}>Manage</Text>
          <Ionicons name="chevron-forward" size={11} color={Colors.dim} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const g = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.text },
  count: { fontSize: 13, fontWeight: "900", color: Colors.muted },
  condBadge: { fontSize: 10, fontWeight: "900", flexShrink: 0 },
  meta: { fontSize: 11, color: Colors.muted },
  specs: { fontSize: 10, color: Colors.dim },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: Spacing.sm,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
  },
  manageTxt: { fontSize: 10, fontWeight: "700", color: Colors.dim },
});

// ─────────────────────────────────────────────────────────────────
// WORN PLANES SECTION
// — extracted from IIFE into named component
// — now shows active route label per plane
// ─────────────────────────────────────────────────────────────────

function WornPlanesSection({
  ownedPlanes,
  planeRouteMap,
  onMaintain,
}: {
  ownedPlanes: OwnedPlane[];
  planeRouteMap: Map<string, string>;
  onMaintain: (id: string) => void;
}) {
  const worn = ownedPlanes.filter((p) => (p.condition ?? 100) <= 40);
  if (worn.length === 0) return null;

  return (
    <>
      <Text style={s.eyebrow}>NEEDS ATTENTION</Text>
      <View style={s.section}>
        {worn.map((plane) => {
          const cond = plane.condition ?? 100;
          const condColor = cond <= 15 ? Colors.red : Colors.amber;
          const maintCost = 5_000 + plane.plane_model.pax_capacity * 50;
          const routeLabel = planeRouteMap.get(plane.id) ?? null;

          return (
            <View key={plane.id} style={m.row}>
              <View style={[m.stripe, { backgroundColor: condColor }]} />
              <View style={m.body}>
                <View style={m.nameRow}>
                  <Text style={m.name} numberOfLines={1}>
                    {plane.plane_model.nickname}
                  </Text>
                  {/* Route context — critical if plane is flying worn */}
                  {routeLabel ? (
                    <View
                      style={[
                        m.routePill,
                        {
                          backgroundColor: condColor + "18",
                          borderColor: condColor + "44",
                        },
                      ]}
                    >
                      <Ionicons name="airplane" size={8} color={condColor} />
                      <Text
                        style={[m.routeTxt, { color: condColor }]}
                        numberOfLines={1}
                      >
                        {routeLabel}
                      </Text>
                    </View>
                  ) : (
                    <View style={m.idlePill}>
                      <Text style={m.idleTxt}>IDLE</Text>
                    </View>
                  )}
                </View>
                <View style={m.barRow}>
                  <View style={m.track}>
                    <View
                      style={[
                        m.fill,
                        {
                          width: `${cond}%` as any,
                          backgroundColor: condColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[m.pct, { color: condColor }]}>{cond}%</Text>
                </View>
              </View>
              <TouchableOpacity
                style={m.btn}
                onPress={() => onMaintain(plane.id)}
              >
                <Ionicons
                  name="construct-outline"
                  size={13}
                  color={Colors.amber}
                />
                <Text style={m.btnTxt}>${Math.round(maintCost / 1000)}K</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </>
  );
}

const m = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.amber + "44",
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Colors.amber + "08",
  },
  stripe: { width: 4, alignSelf: "stretch", backgroundColor: Colors.amber },
  body: { flex: 1, padding: Spacing.md, gap: 6 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  name: { fontSize: 12, fontWeight: "700", color: Colors.text },
  routePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  routeTxt: { fontSize: 8, fontWeight: "800" },
  idlePill: {
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  idleTxt: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  fill: { height: "100%" as any, borderRadius: 2 },
  pct: { fontSize: 9, fontWeight: "700", minWidth: 24 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "55",
    backgroundColor: Colors.amber + "12",
  },
  btnTxt: { fontSize: 11, fontWeight: "700", color: Colors.amber },
});

// ─────────────────────────────────────────────────────────────────
// PLANE CARD (Store)
// — lock reason states exact route count needed
// — buy errors use prominent errorBox
// ─────────────────────────────────────────────────────────────────

function PlaneCard({
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

  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fc = FAMILY_COLOR[model.family] ?? Colors.sky;

  const lockedByDemands =
    model.unlock_demands > 0 && demandScore < model.unlock_demands;
  const lockedByCash = model.unlock_cash > 0 && cash < model.unlock_cash;
  const locked = lockedByDemands || lockedByCash;

  // Exact routes needed — more useful than a generic message
  const routesNeeded = model.unlock_demands - demandScore;
  const lockReason = lockedByDemands
    ? `Open ${routesNeeded} more route${routesNeeded !== 1 ? "s" : ""} to unlock`
    : lockedByCash
      ? `Need ${fmtCash(model.unlock_cash - cash)} more`
      : "";

  const maxAffordable =
    model.price > 0
      ? Math.max(1, Math.min(20, Math.floor(cash / model.price)))
      : 20;
  const totalCost = model.price * qty;
  const canAfford = cash >= totalCost;
  const canBuy = !locked && canAfford && !buying;

  const handleBuy = async () => {
    haptics.confirm();
    setBuying(true);
    setError(null);
    let lastError: string | null = null;
    for (let i = 0; i < qty; i++) {
      const { error: err } = await buyPlane(model);
      if (err) {
        lastError = err;
        break;
      }
    }
    setBuying(false);
    if (lastError) {
      setError(lastError);
      haptics.error();
      sounds.error();
      return;
    }
    setBought(true);
    haptics.success();
    sounds.planeBuy();
    setTimeout(() => setBought(false), 1200);
  };

  return (
    <View style={[pc.card, locked && pc.locked]}>
      <View
        style={[pc.stripe, { backgroundColor: locked ? Colors.dim : fc }]}
      />

      <View style={pc.main}>
        <View style={pc.top}>
          <View style={pc.info}>
            <Text style={[pc.family, { color: locked ? Colors.dim : fc }]}>
              {FAMILY_LABEL[model.family] ?? model.family}
            </Text>
            <Text style={pc.name} numberOfLines={1}>
              {model.nickname}
            </Text>
            <Text style={pc.specs} numberOfLines={1}>
              {model.pax_capacity} pax · {model.range_nm.toLocaleString()}nm ·{" "}
              {model.speed_kts}kts
            </Text>
          </View>
          <View style={pc.priceBlock}>
            <Text
              style={[
                pc.price,
                { color: canAfford && !locked ? Colors.green : Colors.red },
              ]}
            >
              {fmtCash(model.price)}
            </Text>
            <Text style={pc.priceSub}>each</Text>
          </View>
        </View>

        {locked ? (
          <View style={pc.lockRow}>
            <Ionicons name="lock-closed" size={11} color={Colors.dim} />
            <Text style={pc.lockTxt}>{lockReason}</Text>
          </View>
        ) : (
          <View style={pc.buyRow}>
            <QuantitySelector
              value={qty}
              min={1}
              max={maxAffordable}
              onChange={setQty}
              color={fc}
            />
            <Text
              style={[
                pc.total,
                { color: canAfford ? Colors.green : Colors.red },
              ]}
              numberOfLines={1}
            >
              {fmtCash(totalCost)}
            </Text>
            <TouchableOpacity
              style={[
                pc.buyBtn,
                { backgroundColor: canBuy ? fc : "rgba(255,255,255,.06)" },
                !canBuy && { opacity: 0.5 },
              ]}
              onPress={handleBuy}
              disabled={!canBuy}
              activeOpacity={0.84}
            >
              {buying ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : bought ? (
                <>
                  <Ionicons name="checkmark" size={13} color={Colors.bg} />
                  <Text style={[pc.buyTxt, { color: Colors.bg }]}>Added</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="add-circle-outline"
                    size={13}
                    color={canBuy ? Colors.bg : Colors.dim}
                  />
                  <Text
                    style={[
                      pc.buyTxt,
                      { color: canBuy ? Colors.bg : Colors.dim },
                    ]}
                  >
                    Add ×{qty}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Prominent error — not fine print */}
        {error && (
          <View style={pc.errorBox}>
            <Ionicons name="warning-outline" size={12} color={Colors.red} />
            <Text style={pc.errorTxt}>{error}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  locked: { opacity: 0.6 },
  stripe: { width: 4 },
  main: { flex: 1, padding: Spacing.md, gap: 8 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  info: { flex: 1, gap: 2 },
  family: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  name: { fontSize: 14, fontWeight: "900", color: Colors.text },
  specs: { fontSize: 11, color: Colors.dim },
  priceBlock: { alignItems: "flex-end", gap: 2 },
  price: { fontSize: 16, fontWeight: "900" },
  priceSub: { fontSize: 9, color: Colors.dim },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockTxt: { fontSize: 11, color: Colors.dim, flex: 1 },
  buyRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  total: { fontSize: 13, fontWeight: "700", flex: 1 },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  buyTxt: { fontSize: 12, fontWeight: "700" },
  // Prominent error box — same pattern as AirportSheet
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
  errorTxt: { flex: 1, fontSize: 11, color: Colors.red, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function FleetSheet() {
  const [activeTab, setActiveTab] = useState<"planes" | "store">("planes");

  const ownedPlanes = useOwnedPlanes();
  const planes = usePlanes();
  const routes = useRoutes();
  const demands = useDemands();
  const airline = useAirline();
  const cash = useCash();
  const openSheet = useGameStore((s) => s.openSheet);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const tabBarH = useTabBarHeight();
  const haptics = useHaptics();

  const color = airline?.color ?? Colors.sky;
  const demandScore = airline?.demand_score ?? 0;

  // ── Derived data ───────────────────────────────────────────────

  const planeRouteMap = useMemo(() => {
    const map = new Map<string, string>();
    routes
      .filter((r) => r.active)
      .forEach((r) => {
        const via = r.via_iata ? ` → ${r.via_iata}` : "";
        map.set(
          r.plane.id,
          `${r.demand.origin.iata}${via} → ${r.demand.dest.iata}`,
        );
      });
    return map;
  }, [routes]);

  const idlePlanes = ownedPlanes.filter((p) => !planeRouteMap.has(p.id));
  const activePlanes = ownedPlanes.length - idlePlanes.length;

  const pendingDemands = demands.filter((d) => d.status === "pending");
  const waitingPax = pendingDemands.reduce(
    (sum, d) =>
      sum + Math.max(0, d.base_pax_day - (d.delivered_pax_today ?? 0)),
    0,
  );
  const totalCapacity = ownedPlanes.reduce(
    (sum, p) => sum + p.plane_model.pax_capacity,
    0,
  );
  const wornCount = ownedPlanes.filter(
    (p) => (p.condition ?? 100) <= 40,
  ).length;

  // Store tab: how many models are unlocked vs locked per family
  const grouped = useMemo(() => {
    const families = ["embraer", "bombardier", "boeing", "airbus"];
    return families
      .map((fam) => ({
        family: fam,
        label: FAMILY_LABEL[fam],
        color: FAMILY_COLOR[fam],
        planes: planes.filter((p) => p.family === fam),
      }))
      .filter((g) => g.planes.length > 0);
  }, [planes]);

  const groupedOwned = useMemo(() => {
    const map = new Map<string, { model: PlaneModel; planes: OwnedPlane[] }>();
    ownedPlanes.forEach((p) => {
      const key = p.plane_model.id;
      if (!map.has(key)) map.set(key, { model: p.plane_model, planes: [] });
      map.get(key)!.planes.push(p);
    });
    return Array.from(map.values());
  }, [ownedPlanes]);

  const maintenancePlane = useMaintenancePlane();
  const handleMaintain = useCallback(
    (id: string) => maintenancePlane(id),
    [maintenancePlane],
  );
  const handleAssign = useCallback(() => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startCreation(), 120);
  }, [haptics, closeSheet, startCreation]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <Text style={s.title}>Fleet</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* ── Segmented control ── */}
      <View style={s.segWrap}>
        {(["planes", "store"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              s.seg,
              activeTab === tab && {
                backgroundColor: color + "18",
                borderColor: color + "55",
              },
            ]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[s.segTxt, activeTab === tab && { color }]}>
              {tab === "planes" ? "My Planes" : "Store"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Stat bar — tab-aware ── */}
      {activeTab === "planes" ? (
        // My Planes: fleet health stats
        <View style={s.statBar}>
          <View style={s.stat}>
            <Text style={[s.statVal, { color }]}>{ownedPlanes.length}</Text>
            <Text style={s.statLbl}>Planes</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text
              style={[
                s.statVal,
                { color: idlePlanes.length > 0 ? Colors.amber : Colors.green },
              ]}
            >
              {idlePlanes.length}
            </Text>
            <Text style={s.statLbl}>Idle</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: Colors.green }]}>
              {totalCapacity.toLocaleString()}
            </Text>
            <Text style={s.statLbl}>Total seats</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text
              style={[
                s.statVal,
                { color: waitingPax > 0 ? Colors.amber : Colors.dim },
              ]}
            >
              {waitingPax.toLocaleString()}
            </Text>
            <Text style={s.statLbl}>Waiting</Text>
          </View>
        </View>
      ) : (
        // Store: cash + unlock progress
        <View style={s.statBar}>
          <View style={[s.stat, { flex: 1.4 }]}>
            <Text style={[s.statVal, { color: Colors.green }]}>
              {fmtCash(cash)}
            </Text>
            <Text style={s.statLbl}>Available</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color }]}>{demandScore}</Text>
            <Text style={s.statLbl}>Routes open</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text
              style={[
                s.statVal,
                { color: wornCount > 0 ? Colors.amber : Colors.dim },
              ]}
            >
              {wornCount}
            </Text>
            <Text style={s.statLbl}>Need repair</Text>
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════
          MY PLANES TAB
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "planes" && (
        <>
          {ownedPlanes.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="airplane-outline" size={48} color={Colors.dim} />
              <Text style={s.emptyTitle}>No planes yet</Text>
              <Text style={s.emptySub}>
                Go to the Store tab to buy your first aircraft.
              </Text>
              <TouchableOpacity
                style={[s.emptyBtn, { borderColor: color + "55" }]}
                onPress={() => setActiveTab("store")}
                activeOpacity={0.8}
              >
                <Ionicons name="storefront-outline" size={15} color={color} />
                <Text style={[s.emptyBtnTxt, { color }]}>Open Store</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Idle assign banner — urgent styling ── */}
              {idlePlanes.length > 0 && pendingDemands.length > 0 && (
                <TouchableOpacity
                  style={[
                    s.assignBanner,
                    {
                      borderColor: color + "55",
                      backgroundColor: color + "0e",
                    },
                  ]}
                  onPress={handleAssign}
                  activeOpacity={0.84}
                >
                  <View
                    style={[
                      s.assignIconWrap,
                      { backgroundColor: color + "20" },
                    ]}
                  >
                    <Ionicons name="airplane-outline" size={17} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.assignTitle, { color }]}>
                      {idlePlanes.length} plane
                      {idlePlanes.length !== 1 ? "s" : ""} sitting idle
                    </Text>
                    <Text style={s.assignSub}>
                      {waitingPax.toLocaleString()} passengers waiting — tap to
                      assign
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={color + "88"}
                  />
                </TouchableOpacity>
              )}

              {/* ── Worn planes — named component, shows route context ── */}
              <WornPlanesSection
                ownedPlanes={ownedPlanes}
                planeRouteMap={planeRouteMap}
                onMaintain={handleMaintain}
              />

              {/* ── Fleet grouped by model ── */}
              <Text style={s.eyebrow}>YOUR FLEET</Text>
              <View style={s.section}>
                {groupedOwned.map((group) => (
                  <OwnedPlaneGroup
                    key={group.model.id}
                    group={group}
                    planeRouteMap={planeRouteMap}
                    onAssign={handleAssign}
                    onTap={() =>
                      openSheet("manage-planes", undefined, undefined, group)
                    }
                    onClose={closeSheet}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          STORE TAB
          — family headers show available/locked count
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "store" && (
        <>
          <Text style={s.eyebrow}>ADD AIRCRAFT</Text>
          <Text style={s.eyebrowSub}>
            Serve more routes to unlock larger aircraft
          </Text>

          {grouped.map(({ family, label, color: fc, planes: familyPlanes }) => {
            const unlockedCount = familyPlanes.filter(
              (p) =>
                !(p.unlock_demands > 0 && demandScore < p.unlock_demands) &&
                !(p.unlock_cash > 0 && cash < p.unlock_cash),
            ).length;
            const lockedCount = familyPlanes.length - unlockedCount;

            return (
              <View key={family} style={s.section}>
                {/* Family header with count context */}
                <View style={s.familyHeader}>
                  <View style={[s.familyDot, { backgroundColor: fc }]} />
                  <Text style={[s.familyLabel, { color: fc }]}>{label}</Text>
                  <Text style={s.familyCount}>
                    {unlockedCount} available
                    {lockedCount > 0 ? ` · ${lockedCount} locked` : ""}
                  </Text>
                </View>

                {familyPlanes.map((model) => (
                  <PlaneCard
                    key={model.id}
                    model={model}
                    demandScore={demandScore}
                    cash={cash}
                  />
                ))}
              </View>
            );
          })}
        </>
      )}

      <View style={{ height: 36 }} />
    </BottomSheetScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: Spacing.sm },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "900" },

  segWrap: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs ?? 4,
  },
  seg: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  segTxt: { fontSize: 12, fontWeight: "700", color: Colors.dim },

  // Stat bar — with hairline dividers
  statBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  statVal: { fontSize: 18, fontWeight: "900" },
  statLbl: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    alignSelf: "stretch",
  },

  // Idle assign banner — urgent, airline color
  assignBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  assignIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  assignTitle: { fontSize: 13, fontWeight: "900" },
  assignSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },

  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs ?? 4,
  },
  eyebrowSub: {
    fontSize: 11,
    color: Colors.dim,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  section: { paddingHorizontal: Spacing.lg },

  familyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: Spacing.sm,
  },
  familyDot: { width: 8, height: 8, borderRadius: 4 },
  familyLabel: { fontSize: 11, fontWeight: "700" },
  familyCount: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "600",
    marginLeft: "auto",
  },

  emptyState: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl ?? 40,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySub: {
    fontSize: 13,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  emptyBtnTxt: { fontSize: 13, fontWeight: "700" },
});
