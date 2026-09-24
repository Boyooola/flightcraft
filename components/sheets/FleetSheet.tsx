import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
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
  embraer: Colors.embraer,
  bombardier: Colors.bombardier,
  boeing: Colors.boeing,
  airbus: Colors.airbus,
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
        accessibilityLabel="Decrease quantity"
        accessibilityRole="button"
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
        accessibilityLabel="Increase quantity"
        accessibilityRole="button"
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
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  val: {
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 24,
    textAlign: "center",
  },
});

// ─────────────────────────────────────────────────────────────────
// OWNED PLANE GROUP ROW
// — dead `day` prop removed
// — condition badge shown when any plane in group is worn
// ─────────────────────────────────────────────────────────────────

const OwnedPlaneGroup = React.memo(function OwnedPlaneGroup({
  group,
  planeRouteMap,
  onTap,
  onClose,
}: {
  group: { model: PlaneModel; planes: OwnedPlane[] };
  planeRouteMap: Map<string, string>;
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
      ? { color: Colors.red, label: `LOW ${minCond}%` }
      : minCond <= 40
        ? { color: Colors.amber, label: `SERVICE ${minCond}%` }
        : null;

  return (
    <TouchableOpacity
      accessibilityHint="Opens aircraft management for this model"
      accessibilityLabel={`${group.model.nickname}, ${total} aircraft, ${active} flying, ${idle} idle`}
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={() => {
        onClose();
        setTimeout(onTap, 120);
      }}
      style={g.row}
    >
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
      <View style={g.manageBtn}>
        <Text style={g.manageTxt}>Manage</Text>
        <Ionicons name="chevron-forward" size={15} color={Colors.sky} />
      </View>
    </TouchableOpacity>
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
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text },
  count: {
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
    color: Colors.muted,
  },
  condBadge: {
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    flexShrink: 0,
  },
  meta: { fontSize: 11, color: Colors.muted },
  specs: { fontSize: 10, color: Colors.muted },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.sm,
    minHeight: MIN_TOUCH,
    marginRight: Spacing.md,
  },
  manageTxt: { fontSize: 10, fontWeight: "700", color: Colors.sky },
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
                accessibilityLabel={`Service ${plane.plane_model.nickname} for ${fmtCash(maintCost)}`}
                accessibilityRole="button"
                style={m.btn}
                onPress={() => onMaintain(plane.id)}
              >
                <Ionicons
                  name="construct-outline"
                  size={13}
                  color={Colors.textOnColor}
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
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Colors.panel,
    ...Shadow.card,
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
  routeTxt: { fontFamily: Typography.mono, fontSize: 8, fontWeight: "700" },
  idlePill: {
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  idleTxt: {
    fontSize: 8,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.inset,
    overflow: "hidden",
  },
  fill: { height: "100%" as any, borderRadius: 2 },
  pct: {
    fontFamily: Typography.mono,
    fontSize: 9,
    fontWeight: "700",
    minWidth: 24,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: Spacing.md,
    paddingHorizontal: Spacing.sm,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber,
    backgroundColor: Colors.amber,
  },
  btnTxt: {
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textOnColor,
  },
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
              accessibilityLabel={`Buy ${qty} ${model.nickname} aircraft for ${fmtCash(totalCost)}`}
              accessibilityRole="button"
              style={[
                pc.buyBtn,
                { backgroundColor: canBuy ? Colors.sky : Colors.dim },
                !canBuy && { opacity: 0.5 },
              ]}
              onPress={handleBuy}
              disabled={!canBuy}
              activeOpacity={0.84}
            >
              {buying ? (
                <ActivityIndicator size="small" color={Colors.textOnColor} />
              ) : bought ? (
                <>
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color={Colors.textOnColor}
                  />
                  <Text style={pc.buyTxt}>Added</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="add-circle-outline"
                    size={13}
                    color={Colors.textOnColor}
                  />
                  <Text style={[pc.buyTxt, { color: Colors.textOnColor }]}>
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
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  locked: {
    backgroundColor: Colors.bg,
    shadowOpacity: 0,
    elevation: 0,
  },
  stripe: { width: 4 },
  main: { flex: 1, padding: Spacing.md, gap: 8 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  info: { flex: 1, gap: 2 },
  family: {
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  name: { fontSize: 15, fontWeight: "700", color: Colors.text },
  specs: { fontSize: 10, color: Colors.muted },
  priceBlock: { alignItems: "flex-end", gap: 2 },
  price: { fontFamily: Typography.mono, fontSize: 15, fontWeight: "700" },
  priceSub: { fontSize: 8, color: Colors.muted },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockTxt: { fontSize: 10, color: Colors.muted, flex: 1 },
  buyRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  total: {
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
  },
  buyTxt: { fontSize: 11, fontWeight: "700", color: Colors.textOnColor },
  // Prominent error box — same pattern as AirportSheet
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Palette.redSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red,
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

  const waitingPax = useMemo(
    () =>
      demands
        .filter((d) => d.status === "pending")
        .reduce(
          (sum, d) =>
            sum + Math.max(0, d.base_pax_day - (d.delivered_pax_today ?? 0)),
          0,
        ),
    [demands],
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
        <View
          style={[
            s.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="airplane-outline" size={21} color={color} />
        </View>
        <View style={s.headerCopy}>
          <Text style={s.kicker}>AIRCRAFT CONTROL</Text>
          <Text style={s.title}>Fleet Operations</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {ownedPlanes.length} aircraft · {activePlanes} flying ·{" "}
            {idlePlanes.length} idle
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close fleet operations"
          accessibilityRole="button"
          onPress={closeSheet}
          style={s.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Segmented control ── */}
      <View style={s.segWrap}>
        {(["planes", "store"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            style={[s.seg, activeTab === tab && s.segActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={
                tab === "planes" ? "airplane-outline" : "storefront-outline"
              }
              size={15}
              color={activeTab === tab ? Colors.textOnColor : Colors.muted}
            />
            <Text style={[s.segTxt, activeTab === tab && s.segTxtActive]}>
              {tab === "planes" ? "My Fleet" : "Buy Aircraft"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Stat bar — tab-aware ── */}
      {activeTab === "planes" ? (
        // My Planes: fleet health stats
        <View style={s.statBar}>
          <View style={s.stat}>
            <Text style={s.statVal}>{activePlanes}</Text>
            <Text style={s.statLbl}>FLYING</Text>
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
            <Text style={s.statLbl}>IDLE</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: Colors.green }]}>
              {totalCapacity.toLocaleString()}
            </Text>
            <Text style={s.statLbl}>SEATS</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text
              style={[
                s.statVal,
                { color: wornCount > 0 ? Colors.red : Colors.text },
              ]}
            >
              {wornCount}
            </Text>
            <Text style={s.statLbl}>SERVICE</Text>
          </View>
        </View>
      ) : (
        // Store: cash + unlock progress
        <View style={s.statBar}>
          <View style={[s.stat, { flex: 1.4 }]}>
            <Text style={[s.statVal, { color: Colors.green }]}>
              {fmtCash(cash)}
            </Text>
            <Text style={s.statLbl}>AVAILABLE FUNDS</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: Colors.skyDark }]}>
              {demandScore}
            </Text>
            <Text style={s.statLbl}>ROUTES OPEN</Text>
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
                accessibilityRole="button"
                style={s.emptyBtn}
                onPress={() => setActiveTab("store")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="storefront-outline"
                  size={16}
                  color={Colors.textOnColor}
                />
                <Text style={s.emptyBtnTxt}>Browse aircraft</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Idle assign banner — urgent styling ── */}
              {idlePlanes.length > 0 && waitingPax > 0 && (
                <TouchableOpacity
                  accessibilityHint="Starts route creation"
                  accessibilityLabel={`Assign ${idlePlanes.length} idle aircraft. ${waitingPax} passengers are waiting.`}
                  accessibilityRole="button"
                  style={s.assignBanner}
                  onPress={handleAssign}
                  activeOpacity={0.84}
                >
                  <View style={s.assignIconWrap}>
                    <Ionicons
                      name="navigate-outline"
                      size={18}
                      color={Colors.textOnColor}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.assignTitle}>Put idle aircraft to work</Text>
                    <Text style={s.assignSub}>
                      {waitingPax.toLocaleString()} passengers waiting — tap to
                      assign
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.sky}
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
              <Text style={s.eyebrow}>OWNED AIRCRAFT</Text>
              <View style={s.section}>
                {groupedOwned.map((group) => (
                  <OwnedPlaneGroup
                    key={group.model.id}
                    group={group}
                    planeRouteMap={planeRouteMap}
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
          <Text style={s.eyebrow}>AIRCRAFT MARKET</Text>
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
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingTop: Spacing.sm },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerMark: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: 0.4,
    color: Colors.text,
  },
  subtitle: { fontSize: 11, color: Colors.muted },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.full,
    backgroundColor: Colors.inset,
    alignItems: "center",
    justifyContent: "center",
  },

  segWrap: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.inset,
  },
  seg: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
  },
  segActive: { backgroundColor: Colors.sky, ...Shadow.card },
  segTxt: { fontSize: 12, fontWeight: "700", color: Colors.muted },
  segTxtActive: { color: Colors.textOnColor },

  // Stat bar — with hairline dividers
  statBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    overflow: "hidden",
    ...Shadow.card,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  statVal: {
    fontFamily: Typography.mono,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  statLbl: {
    fontSize: 8,
    color: Colors.muted,
    fontFamily: Typography.mono,
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
    borderColor: Colors.borderHi,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  assignIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.sky,
  },
  assignTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  assignSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },

  eyebrow: {
    fontSize: 9,
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    letterSpacing: 2.5,
    fontWeight: "700",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  eyebrowSub: {
    fontSize: 11,
    color: Colors.muted,
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
  familyLabel: { fontSize: 12, fontWeight: "700" },
  familyCount: {
    fontSize: 10,
    color: Colors.muted,
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
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.sky,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  emptyBtnTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textOnColor,
  },
});
