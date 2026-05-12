/**
 * components/sheets/SwapPlaneSheet.tsx
 *
 * Bottom sheet for swapping the plane on an active route.
 * Shows idle compatible planes sorted by capacity fit.
 * Opened from RoutesSheet when player taps "Swap" on a route row.
 */

import { Colors, Spacing } from "@/constants/theme";
import { useSwapPlane } from "@/hooks/useSwapPlane";
import { computeAircraftUtilization } from "@/lib/revenue";
import { useOwnedPlanes, useRoutes } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface SwapRouteGroup {
  routeId: string;
  currentPlaneId: string;
  total_dist_nm: number;
  demand: {
    origin: { iata: string };
    dest: { iata: string };
    base_pax_day: number;
  };
  routes: { plane: { id: string } }[];
}

interface Props {
  group: SwapRouteGroup;
  onClose: () => void;
}

export default function SwapPlaneSheet({ group, onClose }: Props) {
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const { swapPlane, swapping } = useSwapPlane();
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ["50%", "75%"], []);

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
    [onClose],
  );

  const dist = group.total_dist_nm;
  const busyIds = new Set(
    routes.filter((r) => r.active).map((r) => r.plane.id),
  );

  const candidates = ownedPlanes
    .filter((p) => {
      const isCurrentPlane = group.routes.some((r) => r.plane.id === p.id);
      const isIdle = !busyIds.has(p.id) || isCurrentPlane;
      const inRange = p.plane_model.range_nm >= dist;
      return isIdle && inRange && !isCurrentPlane;
    })
    .map((p) => {
      const cap = p.plane_model.pax_capacity;
      const fit = Math.min(
        100,
        Math.round((cap / Math.max(1, group.demand.base_pax_day)) * 100),
      );
      const util = computeAircraftUtilization({
        distNm: dist,
        speedKts: p.plane_model.speed_kts,
      });
      return { plane: p, cap, fit, utilLabel: util.label };
    })
    .sort((a, b) => Math.abs(100 - a.fit) - Math.abs(100 - b.fit));

  const handleSwap = async (newPlaneId: string) => {
    const ok = await swapPlane(group.routeId, group.currentPlaneId, newPlaneId);
    console.log("Swap result:", ok);
    if (ok) {
      sheetRef.current?.close();
      onClose();
    }
  };

  const dismiss = () => {
    sheetRef.current?.close();
    onClose();
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={s.sheetBg}
      handleIndicatorStyle={s.handle}
      style={{ zIndex: 300 }}
      containerStyle={{ zIndex: 300 }}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Swap Plane</Text>
          <Text style={s.sub}>
            {group.demand.origin.iata} → {group.demand.dest.iata}
            {" · "}
            {dist.toLocaleString()}nm
            {" · "}
            {group.demand.base_pax_day} pax/day
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {candidates.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="airplane-outline" size={36} color={Colors.dim} />
            <Text style={s.emptyTxt}>No compatible planes available</Text>
            <Text style={s.emptySub}>
              Buy more planes or free up an assigned one
            </Text>
          </View>
        ) : (
          candidates.map(({ plane, cap, fit, utilLabel }) => {
            const fc =
              fit >= 80 ? Colors.green : fit >= 40 ? Colors.amber : Colors.dim;
            return (
              <TouchableOpacity
                key={plane.id}
                style={s.row}
                onPress={() => handleSwap(plane.id)}
                disabled={swapping}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    s.fitBar,
                    { backgroundColor: fc + "18", borderColor: fc + "33" },
                  ]}
                >
                  <Text style={[s.fitTxt, { color: fc }]}>{fit}%</Text>
                  <Text style={[s.fitLabel, { color: fc }]}>fit</Text>
                </View>
                <View style={s.rowBody}>
                  <Text style={s.planeName}>{plane.plane_model.nickname}</Text>
                  <Text style={s.planeSub}>
                    {cap} seats · {plane.plane_model.range_nm.toLocaleString()}
                    nm · {utilLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.dim} />
              </TouchableOpacity>
            );
          })
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheetBg: { backgroundColor: "#0d1526" },
  handle: { backgroundColor: "rgba(255,255,255,0.35)", width: 40, height: 4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 16, fontWeight: "900", color: Colors.text },
  sub: { fontSize: 11, color: Colors.dim, marginTop: 3 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 48 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  fitBar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fitTxt: { fontSize: 13, fontWeight: "900", lineHeight: 15 },
  fitLabel: { fontSize: 8, fontWeight: "700", opacity: 0.7 },
  rowBody: { flex: 1 },
  planeName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  planeSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  empty: { alignItems: "center", gap: Spacing.md, paddingVertical: 60 },
  emptyTxt: { fontSize: 15, fontWeight: "700", color: Colors.text },
  emptySub: { fontSize: 12, color: Colors.dim, textAlign: "center" },
});
