/**
 * components/sheets/SwapPlaneSheet.tsx
 *
 * Two-step bottom sheet for swapping a plane on an active route.
 *
 * Single plane on route → skip step 1, go straight to replacements.
 * Multiple planes on route:
 *   Step 1 — player picks which plane to replace
 *   Step 2 — player picks the replacement from idle compatible planes
 */

import { Colors, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useSwapPlane } from "@/hooks/useSwapPlane";
import { computeAircraftUtilization } from "@/lib/revenue";
import { useOwnedPlanes, useRoutes } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
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
  routes: {
    id: string;
    plane: {
      id: string;
      plane_model: {
        nickname: string;
        pax_capacity: number;
        range_nm: number;
        speed_kts: number;
      };
    };
  }[];
}

interface Props {
  group: SwapRouteGroup;
  onClose: () => void;
}

export default function SwapPlaneSheet({ group, onClose }: Props) {
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const { swapPlane, swapping } = useSwapPlane();
  const tabBarH = useTabBarHeight();
  const sheetRef = useRef<BottomSheet>(null);

  const hasMultiplePlanes = group.routes.length > 1;

  // Step 1 state — which plane on the route to replace
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(
    hasMultiplePlanes ? null : group.routeId,
  );
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(
    hasMultiplePlanes ? null : group.currentPlaneId,
  );

  const snapPoints = useMemo(() => ["50%", "75%"], []);
  const dist = group.total_dist_nm;
  const showStep1 = hasMultiplePlanes && !selectedPlaneId;
  const selectedRoute = group.routes.find((r) => r.id === selectedRouteId);

  const busyIds = new Set(
    routes.filter((r) => r.active).map((r) => r.plane.id),
  );

  // Idle planes compatible with this route — excludes all planes already on it
  const candidates = useMemo(() => {
    return ownedPlanes
      .filter((p) => {
        const isOnThisGroup = group.routes.some((r) => r.plane.id === p.id);
        const isIdle = !busyIds.has(p.id);
        const inRange = p.plane_model.range_nm >= dist;
        return !isOnThisGroup && isIdle && inRange;
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
  }, [ownedPlanes, group.routes, dist, busyIds]);

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

  const dismiss = () => {
    sheetRef.current?.close();
    onClose();
  };

  const handleSelectPlaneToReplace = (routeId: string, planeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedPlaneId(planeId);
  };

  const handleBack = () => {
    setSelectedRouteId(null);
    setSelectedPlaneId(null);
  };

  const handleSwap = async (newPlaneId: string) => {
    if (!selectedRouteId || !selectedPlaneId) return;
    const ok = await swapPlane(selectedRouteId, selectedPlaneId, newPlaneId);
    if (ok) {
      sheetRef.current?.close();
      onClose();
    }
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
        <View style={s.headerLeft}>
          {hasMultiplePlanes && !showStep1 && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={handleBack}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={16} color={Colors.sky} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={s.title}>
              {showStep1
                ? "Swap Plane"
                : hasMultiplePlanes && selectedRoute
                  ? `Replace ${selectedRoute.plane.plane_model.nickname}`
                  : "Swap Plane"}
            </Text>
            <Text style={s.sub}>
              {group.demand.origin.iata} → {group.demand.dest.iata}
              {" · "}
              {dist.toLocaleString()}nm
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: tabBarH + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 1: Pick which plane to replace ── */}
        {showStep1 && (
          <>
            <Text style={s.stepLabel}>Which plane do you want to replace?</Text>
            {group.routes.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={s.row}
                onPress={() => handleSelectPlaneToReplace(r.id, r.plane.id)}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    s.fitBar,
                    {
                      backgroundColor: Colors.sky + "18",
                      borderColor: Colors.sky + "33",
                    },
                  ]}
                >
                  <Ionicons name="airplane" size={16} color={Colors.sky} />
                </View>
                <View style={s.rowBody}>
                  <Text style={s.planeName}>
                    {r.plane.plane_model.nickname}
                  </Text>
                  <Text style={s.planeSub}>
                    {r.plane.plane_model.pax_capacity} seats
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.dim} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── Step 2: Pick replacement plane ── */}
        {!showStep1 && (
          <>
            {hasMultiplePlanes && (
              <Text style={s.stepLabel}>Choose a replacement:</Text>
            )}
            {candidates.length === 0 ? (
              <View style={s.empty}>
                <Ionicons
                  name="airplane-outline"
                  size={36}
                  color={Colors.dim}
                />
                <Text style={s.emptyTxt}>No compatible planes available</Text>
                <Text style={s.emptySub}>
                  Buy more planes or free up an assigned one
                </Text>
              </View>
            ) : (
              candidates.map(({ plane, cap, fit, utilLabel }) => {
                const fc =
                  fit >= 80
                    ? Colors.green
                    : fit >= 40
                      ? Colors.amber
                      : Colors.dim;
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
                        {
                          backgroundColor: fc + "18",
                          borderColor: fc + "33",
                        },
                      ]}
                    >
                      <Text style={[s.fitTxt, { color: fc }]}>{fit}%</Text>
                      <Text style={[s.fitLabel, { color: fc }]}>fit</Text>
                    </View>
                    <View style={s.rowBody}>
                      <Text style={s.planeName}>
                        {plane.plane_model.nickname}
                      </Text>
                      <Text style={s.planeSub}>
                        {cap} seats ·{" "}
                        {plane.plane_model.range_nm.toLocaleString()}nm ·{" "}
                        {utilLabel}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={Colors.dim}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </>
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
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(56,189,248,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "900", color: Colors.text },
  sub: { fontSize: 11, color: Colors.dim, marginTop: 2 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 48 },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.muted,
    paddingVertical: Spacing.sm,
  },
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
