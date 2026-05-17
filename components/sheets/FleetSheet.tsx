/**
 * components/sheets/FleetSheet.tsx
 *
 * Worldwide Rush-style fleet sheet.
 *
 * Focus:
 *   - idle planes are action prompts
 *   - planes are "flow power"
 *   - buying aircraft increases passenger-moving capacity
 *   - catalogue feels like upgrades, not an accounting screen
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

const OwnedPlaneGroup = React.memo(function OwnedPlaneGroup({
  group,
  planeRouteMap,
  onAssign,
}: {
  group: { model: PlaneModel; planes: OwnedPlane[] };
  planeRouteMap: Map<string, string>;
  onAssign: () => void;
  day: number;
}) {
  const fc = FAMILY_COLOR[group.model.family] ?? Colors.sky;

  const total = group.planes.length;
  const active = group.planes.filter((p) => planeRouteMap.has(p.id)).length;
  const idle = total - active;
  return (
    <View style={g.row}>
      <View style={[g.stripe, { backgroundColor: fc }]} />

      <View style={g.body}>
        <View style={g.top}>
          <Text style={g.name}>{group.model.nickname}</Text>

          <Text style={g.count}>×{total}</Text>
        </View>

        <Text style={g.meta}>
          {active} flying · {idle} idle
        </Text>

        <Text style={g.specs}>
          {group.model.pax_capacity} pax ·{" "}
          {group.model.range_nm.toLocaleString()}nm
        </Text>
      </View>

      <View style={g.actions}>
        {idle > 0 && (
          <TouchableOpacity
            style={[g.assignBtn, { backgroundColor: fc }]}
            onPress={onAssign}
          >
            <Ionicons name="flash-outline" size={13} color={Colors.bg} />
            <Text style={g.assignTxt}>Assign</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

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

  const lockReason = lockedByDemands
    ? `Open ${model.unlock_demands - demandScore} more route${model.unlock_demands - demandScore !== 1 ? "s" : ""} to unlock`
    : lockedByCash
      ? `${fmtCash(model.unlock_cash)} cash needed`
      : "";

  // Max qty = how many the player can afford, capped at 20
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
    <View style={[pc.cardCompact, locked && pc.locked]}>
      <View
        style={[pc.stripe, { backgroundColor: locked ? Colors.dim : fc }]}
      />

      <View style={pc.compactMain}>
        <View style={pc.compactTop}>
          <View style={pc.compactInfo}>
            <Text style={[pc.family, { color: locked ? Colors.dim : fc }]}>
              {FAMILY_LABEL[model.family] ?? model.family}
            </Text>

            <Text style={pc.name} numberOfLines={1}>
              {model.nickname}
            </Text>

            <Text style={pc.compactSpecs} numberOfLines={1}>
              {model.pax_capacity} pax · {model.range_nm.toLocaleString()}nm ·{" "}
              {model.speed_kts}kts
            </Text>
          </View>

          <View style={pc.compactPrice}>
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
          <View style={pc.lockRowCompact}>
            <Ionicons name="lock-closed" size={11} color={Colors.dim} />
            <Text style={pc.lockTxt}>{lockReason}</Text>
          </View>
        ) : (
          <View style={pc.buyRowCompact}>
            <QuantitySelector
              value={qty}
              min={1}
              max={maxAffordable}
              onChange={setQty}
              color={fc}
            />

            <Text
              style={[
                pc.totalCompact,
                { color: canAfford ? Colors.green : Colors.red },
              ]}
              numberOfLines={1}
            >
              {fmtCash(totalCost)}
            </Text>

            <TouchableOpacity
              style={[
                pc.buyBtnCompact,
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
                  <Text style={pc.buyTxt}>Added</Text>
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

        {error && <Text style={pc.error}>{error}</Text>}
      </View>
    </View>
  );
}

export default function FleetSheet() {
  const [activeTab, setActiveTab] = useState<"planes" | "store">("planes");
  const ownedPlanes = useOwnedPlanes();
  const planes = usePlanes();
  const routes = useRoutes();
  const demands = useDemands();
  const airline = useAirline();
  const cash = useCash();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const tabBarH = useTabBarHeight();
  const haptics = useHaptics();

  const color = airline?.color ?? Colors.sky;
  const demandScore = airline?.demand_score ?? 0;
  const day = airline?.day ?? 0;

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
  const waitingPax = pendingDemands.reduce((sum, d) => {
    return sum + Math.max(0, d.base_pax_day - (d.delivered_pax_today ?? 0));
  }, 0);

  const totalCapacity = ownedPlanes.reduce(
    (sum, p) => sum + p.plane_model.pax_capacity,
    0,
  );

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
    const map = new Map<
      string,
      {
        model: PlaneModel;
        planes: OwnedPlane[];
      }
    >();

    ownedPlanes.forEach((p) => {
      const key = p.plane_model.id;

      if (!map.has(key)) {
        map.set(key, {
          model: p.plane_model,
          planes: [],
        });
      }

      map.get(key)!.planes.push(p);
    });

    return Array.from(map.values());
  }, [ownedPlanes]);

  const maintenancePlane = useMaintenancePlane();
  const handleMaintain = useCallback(
    (planeId: string) => {
      maintenancePlane(planeId);
    },
    [maintenancePlane],
  );

  const handleAssign = useCallback(() => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startCreation(), 120);
  }, [haptics, closeSheet, startCreation]);

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
        <View style={s.hdrL}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <View>
            <Text style={s.title}>Fleet</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Segmented control */}
      <View style={s.segWrap}>
        <TouchableOpacity
          style={[
            s.seg,
            activeTab === "planes" && {
              backgroundColor: color + "18",
              borderColor: color + "55",
            },
          ]}
          onPress={() => setActiveTab("planes")}
          activeOpacity={0.8}
        >
          <Text style={[s.segTxt, activeTab === "planes" && { color }]}>
            My Planes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.seg,
            activeTab === "store" && {
              backgroundColor: color + "18",
              borderColor: color + "55",
            },
          ]}
          onPress={() => setActiveTab("store")}
          activeOpacity={0.8}
        >
          <Text style={[s.segTxt, activeTab === "store" && { color }]}>
            Store
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.rushStats}>
        <View style={s.rushStat}>
          <Text style={[s.rushVal, { color }]}>{ownedPlanes.length}</Text>
          <Text style={s.rushLbl}>Planes</Text>
        </View>
        <View style={s.rushStat}>
          <Text
            style={[
              s.rushVal,
              { color: idlePlanes.length > 0 ? Colors.amber : Colors.green },
            ]}
          >
            {idlePlanes.length}
          </Text>
          <Text style={s.rushLbl}>Idle</Text>
        </View>
        <View style={s.rushStat}>
          <Text style={[s.rushVal, { color: Colors.green }]}>
            {totalCapacity}
          </Text>
          <Text style={s.rushLbl}>Total seats</Text>
        </View>
        <View style={s.rushStat}>
          <Text
            style={[
              s.rushVal,
              { color: waitingPax > 0 ? Colors.amber : Colors.green },
            ]}
          >
            {waitingPax.toLocaleString()}
          </Text>
          <Text style={s.rushLbl}>Waiting</Text>
        </View>
      </View>

      {/* ── My Planes Tab ── */}
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
              {/* Assign banner */}
              {idlePlanes.length > 0 && pendingDemands.length > 0 && (
                <TouchableOpacity
                  style={[s.actionBanner, { borderColor: color + "44" }]}
                  onPress={handleAssign}
                >
                  <Ionicons name="airplane-outline" size={17} color={color} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.actionTitle}>
                      {idlePlanes.length} idle plane
                      {idlePlanes.length !== 1 ? "s" : ""} ready to assign
                    </Text>
                    <Text style={s.actionSub}>Tap to open route creation.</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.dim}
                  />
                </TouchableOpacity>
              )}

              {/* ── Needs Attention section ── */}
              {(() => {
                const worn = ownedPlanes.filter(
                  (p) => (p.condition ?? 100) <= 40,
                );
                if (worn.length === 0) return null;
                return (
                  <>
                    <Text style={s.eyebrow}>NEEDS ATTENTION</Text>
                    <View style={s.section}>
                      {worn.map((plane) => {
                        const cond = plane.condition ?? 100;
                        const condColor =
                          cond <= 15 ? Colors.red : Colors.amber;
                        const maintCost =
                          5_000 + plane.plane_model.pax_capacity * 50;
                        const fc =
                          FAMILY_COLOR[plane.plane_model.family] ?? Colors.sky;
                        return (
                          <View key={plane.id} style={m.row}>
                            <View
                              style={[m.stripe, { backgroundColor: condColor }]}
                            />
                            <View style={m.body}>
                              <Text style={m.name} numberOfLines={1}>
                                {plane.plane_model.nickname}
                              </Text>
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
                                <Text style={[m.pct, { color: condColor }]}>
                                  {cond}%
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              style={m.btn}
                              onPress={() => handleMaintain(plane.id)}
                            >
                              <Ionicons
                                name="construct-outline"
                                size={13}
                                color={Colors.amber}
                              />
                              <Text style={m.btnTxt}>
                                ${Math.round(maintCost / 1000)}K
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </>
                );
              })()}

              {/* ── Fleet grouped by model ── */}
              <Text style={s.eyebrow}>YOUR FLEET</Text>
              <View style={s.section}>
                {groupedOwned.map((group) => (
                  <OwnedPlaneGroup
                    key={group.model.id}
                    group={group}
                    planeRouteMap={planeRouteMap}
                    onAssign={handleAssign}
                    day={day}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* ── Store Tab ── */}
      {activeTab === "store" && (
        <>
          <Text style={s.eyebrow}>ADD AIRCRAFT</Text>
          <Text style={s.eyebrowSub}>
            {fmtCash(cash)} available · serve more routes to unlock larger
            aircraft
          </Text>

          {grouped.map(({ family, label, color: fc, planes: familyPlanes }) => (
            <View key={family} style={s.section}>
              <View style={s.familyHeader}>
                <View style={[s.familyDot, { backgroundColor: fc }]} />
                <Text style={[s.familyLabel, { color: fc }]}>{label}</Text>
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
          ))}
        </>
      )}
    </BottomSheetScrollView>
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
  body: { flex: 1, padding: Spacing.md, gap: 5 },
  name: { fontSize: 12, fontWeight: "700", color: Colors.text },
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

const pr = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 4 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusTxt: { fontSize: 9, fontWeight: "700" },
  meta: { fontSize: 11, color: Colors.muted },
  condRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  condTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  condFill: { height: "100%" as any, borderRadius: 2 },
  condPct: { fontSize: 9, fontWeight: "700", minWidth: 24 },
  days: { fontSize: 9, color: Colors.dim },
  actions: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 5,
    padding: Spacing.sm,
    flexShrink: 0,
  },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  assignTxt: { fontSize: 11, fontWeight: "700", color: Colors.bg },
  maintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "55",
    backgroundColor: Colors.amber + "12",
  },
  maintTxt: { fontSize: 11, fontWeight: "700", color: Colors.amber },
});

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
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: { fontSize: 13, fontWeight: "700", color: Colors.text, flex: 1 },
  count: { fontSize: 13, fontWeight: "900", color: Colors.muted },
  meta: { fontSize: 11, color: Colors.muted },
  specs: { fontSize: 10, color: Colors.dim },
  condRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  condTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  condFill: {
    height: "100%" as any,
    borderRadius: 2,
  },
  condPct: {
    fontSize: 8,
    fontWeight: "700",
    minWidth: 24,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: Spacing.sm,
  },
  maintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "55",
    backgroundColor: Colors.amber + "12",
  },
  maintTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.amber,
  },
  wearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  wearTxt: {
    fontSize: 8,
    fontWeight: "700",
  },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: Radius.md,
  },
  assignTxt: { fontSize: 11, fontWeight: "700", color: Colors.bg },
});

const pc = StyleSheet.create({
  cardCompact: {
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
  compactMain: { flex: 1, padding: Spacing.md, gap: 8 },
  compactTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  compactInfo: { flex: 1, gap: 2 },
  family: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  name: { fontSize: 14, fontWeight: "900", color: Colors.text },
  compactSpecs: { fontSize: 11, color: Colors.dim },
  compactPrice: { alignItems: "flex-end", gap: 2 },
  price: { fontSize: 16, fontWeight: "900" },
  priceSub: { fontSize: 9, color: Colors.dim },
  lockRowCompact: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockTxt: { fontSize: 11, color: Colors.dim, flex: 1 },
  buyRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  totalCompact: { fontSize: 13, fontWeight: "700", flex: 1 },
  buyBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  buyTxt: { fontSize: 12, fontWeight: "700", color: Colors.bg },
  error: { fontSize: 10, color: Colors.red },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: Spacing.sm },

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
  segTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dim,
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
  emptyBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  hdrL: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: { fontSize: 20, color: Colors.text, fontWeight: "900" },
  subtitle: { fontSize: 10, color: Colors.dim, marginTop: 1 },

  rushStats: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    overflow: "hidden",
  },
  rushStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  rushVal: { fontSize: 18, fontWeight: "900" },
  rushLbl: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  actionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  actionTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  actionSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },

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

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
    marginHorizontal: Spacing.lg,
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
});
