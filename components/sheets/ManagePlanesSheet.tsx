/**
 * components/sheets/ManagePlanesSheet.tsx
 *
 * Per-plane management sheet opened from FleetSheet → My Planes tab.
 * Shows all planes in a model group individually.
 *
 * Flying plane  → Unassign (+ condition warning if worn)
 * Idle + worn   → Maintain · $XK  +  Sell · $XK
 * Idle + healthy → Assign  +  Sell · $XK
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  useDeactivateRoute,
  useMaintenancePlane,
  useSellPlane,
} from "@/hooks/useSupabaseWrite";
import { fmtCash } from "@/lib/revenue";
import type { OwnedPlane, Route } from "@/store";
import {
  useGameStore,
  useRoutes,
  useSelectedPlaneGroup
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ManagePlanesSheet() {
  const tabBarH = useTabBarHeight();
  const deactivate = useDeactivateRoute();
  const maintain = useMaintenancePlane();
  const sellPlane = useSellPlane();

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  const openSheet = useGameStore((s) => s.openSheet);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const airline = useGameStore((s) => s.airline);
  const routes = useRoutes();
  const group = useSelectedPlaneGroup();
  const color = airline?.color ?? "#38bdf8";

  if (!group) return null;
  const { model, planes } = group;

  const planeRouteMap = new Map<string, string>();
  routes
    .filter((r) => r.active)
    .forEach((r) => {
      const via = r.via_iata ? ` → ${r.via_iata}` : "";
      planeRouteMap.set(
        r.plane.id,
        `${r.demand.origin.iata}${via} → ${r.demand.dest.iata}`,
      );
    });

  const planeRoutes = new Map<string, Route>();
  routes.filter((r) => r.active).forEach((r) => planeRoutes.set(r.plane.id, r));

  const onClose = closeSheet;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
        onPress={onClose}
      />
    ),
    [closeSheet],
  );

  const dismiss = () => {
    closeSheet();
  };

  const handleUnassign = async (plane: OwnedPlane) => {
    const route = planeRoutes.get(plane.id);
    if (!route) return;
    setBusy(plane.id);
    await deactivate(route.id);
    setBusy(null);
  };

  const handleMaintain = async (plane: OwnedPlane) => {
    setBusy(plane.id);
    await maintain(plane.id);
    setBusy(null);
  };

  const handleSell = async (plane: OwnedPlane) => {
    if (confirmSell !== plane.id) {
      setConfirmSell(plane.id);
      return;
    }
    setBusy(plane.id);
    setConfirmSell(null);
    console.log("plane", plane);
    const { error } = await sellPlane(plane.id);
    setBusy(null);
    if (!error) {
      // Close if last plane in group sold
      const remaining = planes.filter((p) => p.id !== plane.id);
      if (remaining.length === 0) dismiss();
    }
  };

  return (
    <BottomSheetScrollView
      contentContainerStyle={[
        m.content,
        { paddingBottom: tabBarH + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={m.header}>
        <View>
          <Text style={m.title}>{model.nickname}</Text>
          <Text style={m.sub}>
            {model.pax_capacity} seats · {model.range_nm.toLocaleString()}nm
            {" · "}
            {fmtCash(model.price)} new
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {planes.map((plane) => {
        const isFlying = planeRouteMap.has(plane.id);
        const routeLabel = planeRouteMap.get(plane.id) ?? null;
        const cond = plane.condition ?? 100;
        const daysActive = plane.days_active ?? 0;
        const condColor =
          cond <= 15 ? Colors.red : cond <= 40 ? Colors.amber : Colors.green;
        const isBusy = busy === plane.id;
        const isSellConfirm = confirmSell === plane.id;
        const needsMaint = cond <= 40;
        const maintCost = 5_000 + model.pax_capacity * 50;
        const condMul =
          cond >= 80 ? 1.0 : cond >= 40 ? 0.85 : cond >= 15 ? 0.65 : 0.45;
        const salePrice = Math.round(model.price * 0.4 * condMul);

        return (
          <View
            key={plane.id}
            style={[
              m.row,
              { borderColor: isFlying ? color + "33" : Colors.border },
            ]}
          >
            <View
              style={[
                m.stripe,
                { backgroundColor: isFlying ? color : Colors.dim },
              ]}
            />

            <View style={m.body}>
              {/* Top row: status + condition */}
              <View style={m.topRow}>
                <View
                  style={[
                    m.statusPill,
                    {
                      backgroundColor:
                        (isFlying ? Colors.green : Colors.amber) + "18",
                      borderColor:
                        (isFlying ? Colors.green : Colors.amber) + "44",
                    },
                  ]}
                >
                  <Text
                    style={[
                      m.statusTxt,
                      { color: isFlying ? Colors.green : Colors.amber },
                    ]}
                  >
                    {isFlying ? "Flying" : "Idle"}
                  </Text>
                </View>

                {/* <View style={m.condRow}>
                    <Ionicons
                      name="construct-outline"
                      size={9}
                      color={condColor}
                    />
                    <View style={m.condTrack}>
                      <View
                        style={[
                          m.condFill,
                          {
                            width: `${cond}%` as any,
                            backgroundColor: condColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[m.condPct, { color: condColor }]}>
                      {cond}%
                    </Text>
                    {daysActive > 0 && (
                      <Text style={m.days}>· {daysActive}d</Text>
                    )}
                  </View> */}
              </View>

              {/* Route or idle label */}
              <Text style={m.routeLabel} numberOfLines={1}>
                {routeLabel ?? "Not assigned to any route"}
              </Text>

              {/* Warn if worn and flying */}
              {isFlying && needsMaint && (
                <Text style={m.warnTxt}>
                  Worn — unassign to maintain ·{" "}
                  {Math.round((1 - (cond <= 15 ? 0.7 : 0.85)) * 100)}% revenue
                  penalty
                </Text>
              )}

              <View style={m.condRow}>
                <Ionicons name="construct-outline" size={9} color={condColor} />
                <View style={m.condTrack}>
                  <View
                    style={[
                      m.condFill,
                      {
                        width: `${cond}%` as any,
                        backgroundColor: condColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[m.condPct, { color: condColor }]}>{cond}%</Text>
                {daysActive > 0 && <Text style={m.days}>· {daysActive}d</Text>}
              </View>
            </View>

            {/* Actions */}
            <View style={m.actions}>
              {isFlying ? (
                /* Flying → Unassign only */
                <TouchableOpacity
                  style={m.dangerBtn}
                  onPress={() => handleUnassign(plane)}
                  disabled={isBusy}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isBusy ? "hourglass-outline" : "close-circle-outline"}
                    size={13}
                    color={Colors.red}
                  />
                  <Text style={m.dangerTxt}>{isBusy ? "..." : "Unassign"}</Text>
                </TouchableOpacity>
              ) : (
                /* Idle → Maintain (if worn) or Assign, + Sell */
                <>
                  {needsMaint ? (
                    <TouchableOpacity
                      style={m.maintBtn}
                      onPress={() => handleMaintain(plane)}
                      disabled={isBusy}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="construct-outline"
                        size={13}
                        color={Colors.amber}
                      />
                      <Text style={m.maintTxt}>
                        {isBusy ? "..." : `Maintain · ${fmtCash(maintCost)}`}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[m.assignBtn, { backgroundColor: color }]}
                      onPress={() => {
                        openSheet(
                          "assign-route",
                          undefined,
                          undefined,
                          undefined,
                          plane,
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="flash-outline"
                        size={13}
                        color={Colors.bg}
                      />
                      <Text style={m.assignTxt}>Assign</Text>
                    </TouchableOpacity>
                  )}

                  {/* Sell — two-tap confirm */}
                  <TouchableOpacity
                    style={[m.sellBtn, isSellConfirm && m.sellConfirm]}
                    onPress={() => handleSell(plane)}
                    disabled={isBusy}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={
                        isSellConfirm ? "alert-circle-outline" : "cash-outline"
                      }
                      size={13}
                      color={isSellConfirm ? Colors.red : Colors.dim}
                    />
                    <Text
                      style={[
                        m.sellTxt,
                        isSellConfirm && { color: Colors.red },
                      ]}
                    >
                      {isSellConfirm
                        ? "Confirm?"
                        : `Sell · ${fmtCash(salePrice)}`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );
      })}
    </BottomSheetScrollView>
  );
}

const m = StyleSheet.create({
  sheetBg: { backgroundColor: "#0d1526" },
  handle: { backgroundColor: "rgba(255,255,255,0.35)", width: 40, height: 4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 16, fontWeight: "900", color: Colors.text },
  sub: { fontSize: 11, color: Colors.dim, marginTop: 2 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 5 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusTxt: { fontSize: 9, fontWeight: "700" },
  condRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  condTrack: {
    width: 55,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  condFill: { height: "100%" as any, borderRadius: 2 },
  condPct: { fontSize: 9, fontWeight: "700" },
  days: { fontSize: 9, color: Colors.dim },
  routeLabel: { fontSize: 11, color: Colors.muted },
  warnTxt: { fontSize: 9, color: Colors.amber, fontWeight: "600" },

  actions: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 5,
    padding: Spacing.sm,
    flexShrink: 0,
    minWidth: 110,
  },

  // Unassign
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "08",
  },
  dangerTxt: { fontSize: 11, fontWeight: "700", color: Colors.red },

  // Maintain
  maintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber + "44",
    backgroundColor: Colors.amber + "10",
  },
  maintTxt: { fontSize: 11, fontWeight: "700", color: Colors.amber },

  // Assign
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  assignTxt: { fontSize: 11, fontWeight: "700", color: Colors.bg },

  // Sell
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
  },
  sellConfirm: {
    borderColor: Colors.red + "44",
    backgroundColor: Colors.red + "08",
  },
  sellTxt: { fontSize: 11, fontWeight: "700", color: Colors.dim },
});
