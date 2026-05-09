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
import { useBuyPlane } from "@/hooks/useSupabaseWrite";
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
import { useMemo, useState } from "react";
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

function OwnedPlaneRow({
  plane,
  route,
  onAssign,
}: {
  plane: OwnedPlane;
  route: string | null;
  onAssign?: () => void;
}) {
  const fc = FAMILY_COLOR[plane.plane_model.family] ?? Colors.sky;
  const idle = !route;

  return (
    <View style={[op.row, idle && { borderColor: Colors.amber + "55" }]}>
      <View
        style={[op.stripe, { backgroundColor: idle ? Colors.amber : fc }]}
      />

      <View style={op.body}>
        <View style={op.top}>
          <Text style={op.name}>{plane.plane_model.nickname}</Text>
          <View
            style={[
              op.statePill,
              {
                backgroundColor: idle
                  ? Colors.amber + "18"
                  : Colors.green + "18",
              },
            ]}
          >
            <Text
              style={[
                op.stateTxt,
                { color: idle ? Colors.amber : Colors.green },
              ]}
            >
              {idle ? "IDLE" : "MOVING"}
            </Text>
          </View>
        </View>

        <Text style={[op.route, { color: idle ? Colors.amber : Colors.muted }]}>
          {route ?? "Ready to clear a demand slot"}
        </Text>

        <View style={op.specs}>
          <Text style={op.spec}>{plane.plane_model.pax_capacity} pax</Text>
          <Text style={op.spec}>
            {plane.plane_model.range_nm.toLocaleString()}nm
          </Text>
          <Text style={op.spec}>{plane.plane_model.speed_kts}kts</Text>
        </View>
      </View>

      {idle && onAssign && (
        <TouchableOpacity
          style={[op.assignBtn, { backgroundColor: fc }]}
          onPress={onAssign}
        >
          <Ionicons name="flash-outline" size={13} color={Colors.bg} />
          <Text style={op.assignTxt}>Assign</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function OwnedPlaneGroup({
  group,
  planeRouteMap,
  onAssign,
}: {
  group: { model: PlaneModel; planes: OwnedPlane[] };
  planeRouteMap: Map<string, string>;
  onAssign: () => void;
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
  );
}

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
    ? `${model.unlock_demands - demandScore} slots needed`
    : lockedByCash
      ? `${fmtCash(model.unlock_cash)} cash needed`
      : "";

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
              max={5}
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

  const handleAssign = () => {
    haptics.confirm();
    closeSheet();
    setTimeout(() => startCreation(), 120);
  };

  if (ownedPlanes.length === 0)
    return (
      <BottomSheetScrollView contentContainerStyle={[es.wrap]}>
        <View style={es.empty}>
          <Ionicons name="airplane-outline" size={48} color={Colors.dim} />
          <Text style={es.emptyTitle}>No planes yet</Text>
          <Text style={es.emptySub}>
            Buy your first aircraft to start moving passengers and earning
            revenue.
          </Text>
        </View>
      </BottomSheetScrollView>
    );

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
            <Text style={s.title}>Fleet Rush</Text>
            <Text style={s.subtitle}>Move passengers faster</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
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
          <Text style={s.rushLbl}>Seat Flow</Text>
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

      {idlePlanes.length > 0 && pendingDemands.length > 0 && (
        <TouchableOpacity
          style={[s.actionBanner, { borderColor: color + "44" }]}
          onPress={handleAssign}
        >
          <Ionicons name="airplane-outline" size={17} color={color} />
          <View style={{ flex: 1 }}>
            <Text style={s.actionTitle}>Idle planes can clear demand</Text>
            <Text style={s.actionSub}>
              Assign a plane to start moving waiting passengers.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.dim} />
        </TouchableOpacity>
      )}
      {/* 
      <View style={[s.topAction, { borderColor: color + "44" }]}>
        <Ionicons name="add-circle-outline" size={17} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={s.topActionTitle}>Buy Aircraft</Text>
          <Text style={s.topActionSub}>
            Purchase more planes without scrolling past your fleet.
          </Text>
        </View>
      </View> */}

      <Text style={s.eyebrow}>BUY MORE FLOW</Text>
      <Text style={s.eyebrowSub}>
        {fmtCash(cash)} cash · clear demand slots to unlock better planes
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

      {ownedPlanes.length > 0 && (
        <>
          <View style={s.divider} />

          <Text style={s.eyebrow}>ACTIVE FLEET</Text>
          <View style={s.section}>
            {groupedOwned.map((group) => (
              <OwnedPlaneGroup
                key={group.model.id}
                group={group}
                planeRouteMap={planeRouteMap}
                onAssign={handleAssign}
              />
            ))}
          </View>
        </>
      )}
    </BottomSheetScrollView>
  );
}

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

  body: {
    flex: 1,
    padding: Spacing.md,
    gap: 4,
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  name: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "800",
  },

  count: {
    fontSize: 12,
    fontWeight: "900",
    color: Colors.dim,
  },

  meta: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "600",
  },

  specs: {
    fontSize: 9,
    color: Colors.dim,
  },

  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: Spacing.md,
  },

  assignTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: Colors.bg,
  },
});

const qs = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 2 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disabled: { opacity: 0.35 },
  val: {
    fontSize: 14,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
});

const op = StyleSheet.create({
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
  body: { flex: 1, padding: Spacing.md, gap: 5 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 13, color: Colors.text, fontWeight: "800", flex: 1 },
  statePill: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stateTxt: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  route: { fontSize: 10, fontWeight: "600" },
  specs: { flexDirection: "row", gap: 6 },
  spec: {
    fontSize: 9,
    color: Colors.dim,
    backgroundColor: "rgba(255,255,255,.05)",
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: Spacing.md,
  },
  assignTxt: { fontSize: 11, fontWeight: "900", color: Colors.bg },
});

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
  locked: { opacity: 0.55 },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  family: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  name: { fontSize: 14, color: Colors.text, fontWeight: "800" },
  role: { fontSize: 10, color: Colors.dim, marginTop: 2 },
  priceBox: { alignItems: "flex-end" },
  price: { fontSize: 16, fontWeight: "900" },
  priceSub: { fontSize: 8, color: Colors.dim },
  flowBox: {
    flexDirection: "row",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  flowItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  flowVal: { fontSize: 13, fontWeight: "900" },
  flowLbl: { fontSize: 8, color: Colors.dim, marginTop: 1 },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockTxt: { fontSize: 10, color: Colors.dim, flex: 1 },
  buyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  total: { fontSize: 12, fontWeight: "800" },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 36,
    marginLeft: "auto",
  },
  buyTxt: { fontSize: 12, fontWeight: "900" },
  error: { fontSize: 10, color: Colors.red },
  cardCompact: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },

  compactMain: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 7,
  },

  compactTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },

  compactInfo: {
    flex: 1,
    minWidth: 0,
  },

  compactSpecs: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
    marginTop: 1,
  },

  compactPrice: {
    alignItems: "flex-end",
    flexShrink: 0,
  },

  buyRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  totalCompact: {
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
  },

  buyBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 78,
  },

  lockRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,.04)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },
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
  subtitle: { fontSize: 10, color: Colors.dim },
  rushStats: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.025)",
  },
  rushStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  rushVal: { fontSize: 16, fontWeight: "900" },
  rushLbl: { fontSize: 8, color: Colors.dim, marginTop: 2 },
  actionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
  },
  actionTitle: { fontSize: 13, color: Colors.text, fontWeight: "800" },
  actionSub: { fontSize: 10, color: Colors.dim, marginTop: 2 },
  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 12,
    fontWeight: "900",
  },
  eyebrowSub: {
    fontSize: 10,
    color: Colors.dim,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  familyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  familyDot: { width: 8, height: 8, borderRadius: 999 },
  familyLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  topAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,

    paddingVertical: 12,
    paddingHorizontal: 12,

    borderRadius: Radius.lg,
    borderWidth: 1,

    backgroundColor: "rgba(255,255,255,0.02)",

    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  topActionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Colors.text,
  },

  topActionSub: {
    fontSize: 11,
    color: Colors.dim,
    marginTop: 2,
    fontWeight: "600",
  },
});

const es = StyleSheet.create({
  wrap: { flex: 1, padding: Spacing.lg },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
