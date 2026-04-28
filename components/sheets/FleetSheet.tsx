/**
 * components/sheets/FleetSheet.tsx
 *
 * Two sections:
 *   OWNED FLEET — planes you own, which routes they're on
 *   CATALOGUE   — planes to buy, locked/unlocked by demand_score
 *
 * Quantity selector on buy button — +/- picker, buy up to 5 at once.
 * Validates cash for full quantity before purchase.
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
        style={[qs.btn, value <= min && qs.btnDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name="remove"
          size={14}
          color={value <= min ? Colors.dim : color}
        />
      </TouchableOpacity>
      <Text style={[qs.val, { color }]}>{value}</Text>
      <TouchableOpacity
        style={[qs.btn, value >= max && qs.btnDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
  btnDisabled: { opacity: 0.35 },
  val: { fontSize: 14, fontWeight: "700", minWidth: 22, textAlign: "center" },
});

// ─────────────────────────────────────────────────────────────────
// OWNED PLANE ROW
// ─────────────────────────────────────────────────────────────────

function OwnedPlaneRow({
  plane,
  route,
  onAssign,
}: {
  plane: OwnedPlane;
  route: string | null;
  onAssign?: () => void;
}) {
  const fc = FAMILY_COLOR[plane.plane_model.family] ?? Colors.dim;
  return (
    <View style={op.row}>
      <View style={[op.stripe, { backgroundColor: fc }]} />
      <View style={op.body}>
        <Text style={op.name}>{plane.plane_model.nickname}</Text>
        <Text
          style={[op.status, { color: route ? Colors.green : Colors.amber }]}
        >
          {route ?? "Idle — not assigned to a route"}
        </Text>
      </View>
      <View style={op.rightCol}>
        <View style={[op.badge, { backgroundColor: fc + "18" }]}>
          <Text style={[op.badgeTxt, { color: fc }]}>
            {plane.plane_model.pax_capacity} pax
          </Text>
        </View>
        {onAssign && (
          <TouchableOpacity
            style={[op.assignBtn, { borderColor: fc + "55" }]}
            onPress={onAssign}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={11} color={fc} />
            <Text style={[op.assignTxt, { color: fc }]}>Assign</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const op = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 3 },
  name: { fontSize: 13, color: Colors.text, fontWeight: "700" },
  status: { fontSize: 10 },
  badge: {
    marginRight: Spacing.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeTxt: { fontSize: 10, fontWeight: "700" },
  rightCol: { alignItems: "flex-end", gap: 4, marginRight: Spacing.md },
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  assignTxt: { fontSize: 9, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// PLANE CARD — catalogue
// ─────────────────────────────────────────────────────────────────

function PlaneCard({
  model,
  demandScore,
  cash,
  color,
}: {
  model: PlaneModel;
  demandScore: number;
  cash: number;
  color: string;
}) {
  const buyPlane = useBuyPlane();
  const haptics = useHaptics();
  const sounds = useGameSounds();
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fc = FAMILY_COLOR[model.family] ?? Colors.dim;
  const lockedByDemands =
    model.unlock_demands > 0 && demandScore < model.unlock_demands;
  const lockedByCash = model.unlock_cash > 0 && cash < model.unlock_cash;
  const locked = lockedByDemands || lockedByCash;

  // What's blocking unlock
  const lockReason = lockedByDemands
    ? `Serve ${model.unlock_demands - demandScore} more route${model.unlock_demands - demandScore !== 1 ? "s" : ""} to unlock`
    : lockedByCash
      ? `Need ${fmtCash(model.unlock_cash)} cash to unlock`
      : "";
  const totalCost = model.price * qty;
  const canAfford = cash >= totalCost;
  const canBuy = !locked && canAfford && !buying;

  const handleBuy = async () => {
    haptics.confirm();
    setBuying(true);
    setError(null);

    // Buy qty planes sequentially
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
    } else {
      setBought(true);
      haptics.success();
      sounds.planeBuy();
      setTimeout(() => setBought(false), 2000);
    }
  };

  return (
    <View style={[pc.card, locked && { opacity: 0.5 }]}>
      {/* Stripe */}
      <View
        style={[pc.stripe, { backgroundColor: locked ? Colors.dim : fc }]}
      />

      <View style={pc.body}>
        {/* Header */}
        <View style={pc.hdr}>
          <View style={pc.hdrL}>
            <Text style={[pc.family, { color: locked ? Colors.dim : fc }]}>
              {FAMILY_LABEL[model.family] ?? model.family}
            </Text>
            <Text style={pc.name}>{model.nickname}</Text>
          </View>
          <Text
            style={[
              pc.price,
              {
                color: locked
                  ? Colors.dim
                  : canAfford
                    ? Colors.green
                    : Colors.red,
              },
            ]}
          >
            {fmtCash(model.price)}
          </Text>
        </View>

        {/* Specs */}
        <View style={pc.specs}>
          {[
            { icon: "people-outline", val: `${model.pax_capacity} pax` },
            {
              icon: "navigate-outline",
              val: `${model.range_nm.toLocaleString()}nm`,
            },
            { icon: "speedometer-outline", val: `${model.speed_kts}kts` },
          ].map(({ icon, val }) => (
            <View key={icon} style={pc.spec}>
              <Ionicons name={icon as any} size={10} color={Colors.dim} />
              <Text style={pc.specTxt}>{val}</Text>
            </View>
          ))}
        </View>

        {/* Lock reason */}
        {locked && lockReason ? (
          <View style={pc.lockRow}>
            <Ionicons name="lock-closed" size={10} color={Colors.dim} />
            <Text style={pc.lockTxt}>{lockReason}</Text>
          </View>
        ) : null}

        {/* Buy row */}
        {!locked && (
          <View style={pc.buyRow}>
            {/* Quantity selector */}
            <QuantitySelector
              value={qty}
              min={1}
              max={5}
              onChange={setQty}
              color={fc}
            />

            {qty > 1 && (
              <Text
                style={[
                  pc.totalCost,
                  { color: canAfford ? Colors.green : Colors.red },
                ]}
              >
                {fmtCash(totalCost)} total
              </Text>
            )}

            {/* Buy button */}
            <TouchableOpacity
              style={[
                pc.buyBtn,
                { backgroundColor: canBuy ? fc : "rgba(255,255,255,.05)" },
                !canBuy && { opacity: 0.5 },
              ]}
              onPress={handleBuy}
              disabled={!canBuy}
              activeOpacity={0.85}
            >
              {buying ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : bought ? (
                <>
                  <Ionicons name="checkmark" size={14} color={Colors.bg} />
                  <Text style={pc.buyTxt}>Bought!</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="cart-outline"
                    size={14}
                    color={canBuy ? Colors.bg : Colors.dim}
                  />
                  <Text
                    style={[
                      pc.buyTxt,
                      { color: canBuy ? Colors.bg : Colors.dim },
                    ]}
                  >
                    Buy{qty > 1 ? ` ×${qty}` : ""}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Error */}
        {error && <Text style={pc.errorTxt}>{error}</Text>}
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
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  hdr: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  hdrL: { flex: 1, gap: 2 },
  family: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  name: { fontSize: 14, color: Colors.text, fontWeight: "700" },
  price: { fontSize: 16, fontWeight: "700", flexShrink: 0 },
  specs: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  spec: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  specTxt: { fontSize: 10, color: Colors.dim },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  lockTxt: { fontSize: 10, color: Colors.dim },
  buyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  totalCost: { fontSize: 11, fontWeight: "600" },
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
  buyTxt: { fontSize: 12, fontWeight: "700" },
  errorTxt: { fontSize: 10, color: Colors.red },
});

// ─────────────────────────────────────────────────────────────────
// FLEET SHEET
// ─────────────────────────────────────────────────────────────────

export default function FleetSheet() {
  const ownedPlanes = useOwnedPlanes();
  const planes = usePlanes();
  const routes = useRoutes();
  const airline = useAirline();
  const cash = useCash();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

  const startCreation = useGameStore((s) => s.startRouteCreation);
  const haptics = useHaptics();
  const color = airline?.color ?? Colors.sky;
  const demandScore = airline?.demand_score ?? 0;

  // Map planes to their route description
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

  // Group catalogue by family
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

  const idleCount = ownedPlanes.filter((p) => !planeRouteMap.has(p.id)).length;

  const handleAssign = () => {
    haptics.confirm();
    closeSheet();
    // Short delay so sheet closes before map activates
    setTimeout(() => startCreation(), 150);
  };

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="airplane" size={20} color={color} />
          <Text style={s.title}>Fleet</Text>
          {ownedPlanes.length > 0 && (
            <View
              style={[
                s.countBadge,
                { backgroundColor: color + "18", borderColor: color + "44" },
              ]}
            >
              <Text style={[s.countTxt, { color }]}>{ownedPlanes.length}</Text>
            </View>
          )}
          {idleCount > 0 && (
            <View
              style={[
                s.countBadge,
                {
                  backgroundColor: Colors.amber + "18",
                  borderColor: Colors.amber + "44",
                },
              ]}
            >
              <Text style={[s.countTxt, { color: Colors.amber }]}>
                {idleCount} idle
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Owned fleet */}
      {ownedPlanes.length > 0 && (
        <>
          <Text style={s.eyebrow}>YOUR FLEET</Text>
          <View style={s.section}>
            {ownedPlanes.map((plane) => (
              <OwnedPlaneRow
                key={plane.id}
                plane={plane}
                route={planeRouteMap.get(plane.id) ?? null}
                onAssign={
                  !planeRouteMap.has(plane.id) ? handleAssign : undefined
                }
              />
            ))}
          </View>
          <View style={s.divider} />
        </>
      )}

      {/* Catalogue */}
      <Text style={s.eyebrow}>CATALOGUE</Text>
      <Text style={s.eyebrowSub}>
        {fmtCash(cash)} available · tap +/− to select quantity
      </Text>

      {grouped.map(({ family, label, color: fc, planes: fplanes }) => (
        <View key={family} style={s.section}>
          <View style={s.familyHeader}>
            <View style={[s.familyDot, { backgroundColor: fc }]} />
            <Text style={[s.familyLabel, { color: fc }]}>{label}</Text>
          </View>
          {fplanes.map((model) => (
            <PlaneCard
              key={model.id}
              model={model}
              demandScore={demandScore}
              cash={cash}
              color={color}
            />
          ))}
        </View>
      ))}
    </BottomSheetScrollView>
  );
}

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
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },
  countBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countTxt: { fontSize: 9, fontWeight: "700" },

  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 2,
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
  familyDot: { width: 8, height: 8, borderRadius: 4 },
  familyLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
});
