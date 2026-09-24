import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  useDeactivateRoute,
  useMaintenancePlane,
  useSellPlane,
} from "@/hooks/useSupabaseWrite";
import { fmtCash } from "@/lib/revenue";
import type { OwnedPlane, Route } from "@/store";
import { useGameStore, useRoutes, useSelectedPlaneGroup } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
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
  const color = airline?.color ?? Colors.sky;

  const planeRouteMap = useMemo(() => {
    const map = new Map<string, string>();
    routes
      .filter((route) => route.active)
      .forEach((route) => {
        const via = route.via_iata ? ` → ${route.via_iata}` : "";
        map.set(
          route.plane.id,
          `${route.demand.origin.iata}${via} → ${route.demand.dest.iata}`,
        );
      });
    return map;
  }, [routes]);

  const planeRoutes = useMemo(() => {
    const map = new Map<string, Route>();
    routes
      .filter((route) => route.active)
      .forEach((route) => map.set(route.plane.id, route));
    return map;
  }, [routes]);

  if (!group) return null;
  const { model, planes } = group;

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
        <View
          style={[
            m.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="airplane-outline" size={20} color={color} />
        </View>
        <View style={m.headerCopy}>
          <Text style={m.kicker}>FLEET DETAIL</Text>
          <Text style={m.title}>{model.nickname}</Text>
          <Text style={m.sub}>
            {planes.length} aircraft · {model.pax_capacity} seats ·{" "}
            {model.range_nm.toLocaleString()} nm range
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close aircraft management"
          accessibilityRole="button"
          onPress={dismiss}
          activeOpacity={0.7}
          style={m.closeButton}
        >
          <Ionicons name="close" size={21} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={m.contextCard}>
        <View style={m.contextItem}>
          <Text style={m.contextValue}>{model.pax_capacity}</Text>
          <Text style={m.contextLabel}>SEATS</Text>
        </View>
        <View style={m.contextDivider} />
        <View style={m.contextItem}>
          <Text style={m.contextValue}>{model.range_nm.toLocaleString()}</Text>
          <Text style={m.contextLabel}>NM RANGE</Text>
        </View>
        <View style={m.contextDivider} />
        <View style={m.contextItem}>
          <Text style={m.contextValue}>{fmtCash(model.price)}</Text>
          <Text style={m.contextLabel}>NEW PRICE</Text>
        </View>
      </View>

      <View style={m.sectionHeading}>
        <Text style={m.sectionKicker}>INDIVIDUAL AIRCRAFT</Text>
        <Text style={m.sectionHint}>Tap an action to update each plane</Text>
      </View>

      {planes.map((plane, index) => {
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
                <Text style={m.planeLabel}>AIRCRAFT {index + 1}</Text>
                <View
                  style={[
                    m.statusPill,
                    {
                      backgroundColor: isFlying
                        ? Palette.greenSoft
                        : Palette.orangeSoft,
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
                  accessibilityLabel={`Unassign aircraft ${index + 1} from ${routeLabel}`}
                  accessibilityRole="button"
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
                      accessibilityLabel={`Service aircraft ${index + 1} for ${fmtCash(maintCost)}`}
                      accessibilityRole="button"
                      style={m.maintBtn}
                      onPress={() => handleMaintain(plane)}
                      disabled={isBusy}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="construct-outline"
                        size={13}
                        color={Colors.textOnColor}
                      />
                      <Text style={m.maintTxt}>
                        {isBusy ? "..." : `Maintain · ${fmtCash(maintCost)}`}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      accessibilityLabel={`Assign aircraft ${index + 1} to a route`}
                      accessibilityRole="button"
                      style={m.assignBtn}
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
                        color={Colors.textOnColor}
                      />
                      <Text style={m.assignTxt}>Assign</Text>
                    </TouchableOpacity>
                  )}

                  {/* Sell — two-tap confirm */}
                  <TouchableOpacity
                    accessibilityLabel={
                      isSellConfirm
                        ? `Confirm sale of aircraft ${index + 1}`
                        : `Sell aircraft ${index + 1} for ${fmtCash(salePrice)}`
                    }
                    accessibilityRole="button"
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
  content: { paddingTop: Spacing.sm, backgroundColor: Colors.surface },
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  title: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: 0.4,
  },
  sub: { fontSize: 10, color: Colors.muted },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.inset,
  },
  contextCard: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  contextItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: 2,
  },
  contextValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: "700",
  },
  contextLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 7,
    letterSpacing: 0.5,
  },
  contextDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.border,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  sectionKicker: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  sectionHint: { color: Colors.muted, fontSize: 9 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  stripe: { width: 4, alignSelf: "stretch" },
  body: { flex: 1, padding: Spacing.md, gap: 5 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planeLabel: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusTxt: {
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  condRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  condTrack: {
    width: 55,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.inset,
    overflow: "hidden",
  },
  condFill: { height: "100%" as any, borderRadius: 2 },
  condPct: { fontFamily: Typography.mono, fontSize: 9, fontWeight: "700" },
  days: { fontSize: 9, color: Colors.muted },
  routeLabel: { fontSize: 11, color: Colors.muted },
  warnTxt: { fontSize: 9, color: Colors.amber, fontWeight: "600" },

  actions: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 5,
    padding: Spacing.sm,
    flexShrink: 0,
    minWidth: 124,
  },

  // Unassign
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red,
    backgroundColor: Palette.redSoft,
  },
  dangerTxt: { fontSize: 11, fontWeight: "700", color: Colors.red },

  // Maintain
  maintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber,
    backgroundColor: Colors.amber,
  },
  maintTxt: { fontSize: 10, fontWeight: "700", color: Colors.textOnColor },

  // Assign
  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  assignTxt: { fontSize: 11, fontWeight: "700", color: Colors.textOnColor },

  // Sell
  sellBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  sellConfirm: {
    borderColor: Colors.red,
    backgroundColor: Palette.redSoft,
  },
  sellTxt: { fontSize: 10, fontWeight: "700", color: Colors.muted },
});
