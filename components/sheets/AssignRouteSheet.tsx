/**
 * components/sheets/AssignRouteSheet.tsx
 *
 * Quick-assign sheet — shown when player taps Assign on an idle plane.
 * Lists all unserved demands the plane can reach, sorted by revenue potential.
 * Player taps a demand → route created instantly. No map interaction needed.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useCreateRoute } from "@/hooks/useSupabaseWrite";
import { haulFromDistance } from "@/lib/revenue";
import { getSeasonForRoute } from "@/lib/seasons";
import type { Demand } from "@/store";
import {
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
  useSelectedPlane,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function AssignRouteSheet() {
  const sheetRef = useRef<BottomSheet>(null);
  const tabBarH = useTabBarHeight();
  const createRoute = useCreateRoute();
  const snapPoints = useMemo(() => ["60%", "90%"], []);

  const plane = useSelectedPlane();
  const airline = useGameStore((s) => s.airline);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const color = airline?.color ?? "#38bdf8";

  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const day = useGameStore((s) => s.airline?.day ?? 1);
  const [creating, setCreating] = useState<string | null>(null);

  if (!plane) return null;

  // All demands within plane range — served ones shown separately
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const candidates = useMemo(() => {
    const activeDemandIds = new Set(
      routes.filter((r) => r.active).map((r) => r.demand.id),
    );

    return (
      demands
        .filter((d) => {
          const inRange = plane.plane_model.range_nm >= d.dist_nm;
          const hasHub = hubs.some((h) => h.airport.iata === d.hub_iata);
          return inRange && hasHub;
        })
        .map((d) => {
          const hub = hubs.find((h) => h.airport.iata === d.hub_iata);
          const haul = haulFromDistance(d.dist_nm);
          const fitPct = Math.min(
            100,
            Math.round(
              (plane.plane_model.pax_capacity / Math.max(1, d.base_pax_day)) *
                100,
            ),
          );
          const season = getSeasonForRoute(
            day,
            d.dest?.country,
            d.dest?.continent,
          );
          const hasRoute = activeDemandIds.has(d.id);
          return { demand: d, hub, haul, fitPct, season, hasRoute };
        })
        // Sort: unserved first, then by fit
        .sort((a, b) => {
          if (a.hasRoute !== b.hasRoute) return a.hasRoute ? 1 : -1;
          const fitDiff = Math.abs(100 - a.fitPct) - Math.abs(100 - b.fitPct);
          if (fitDiff !== 0) return fitDiff;
          return b.demand.base_pax_day - a.demand.base_pax_day;
        })
    );
  }, [demands, routes, hubs, plane, day]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
        onPress={closeSheet}
      />
    ),
    [closeSheet],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const dismiss = useCallback(() => closeSheet(), [closeSheet]);

  const handleAssign = async (demand: Demand) => {
    setCreating(demand.id);
    const { error } = await createRoute(demand, plane);
    setCreating(null);
    if (!error) dismiss();
  };

  const haulLabel: Record<string, string> = {
    short: "Short haul",
    medium: "Medium haul",
    long: "Long haul",
  };

  return (
    <BottomSheetScrollView
      contentContainerStyle={[
        a.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={a.header}>
        <View>
          <Text style={a.title}>Assign {plane.plane_model.nickname}</Text>
          <Text style={a.sub}>
            {plane.plane_model.pax_capacity} seats
            {" · "}
            {plane.plane_model.range_nm.toLocaleString()}nm range
            {" · "}
            {candidates.length} route{candidates.length !== 1 ? "s" : ""}{" "}
            available
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {candidates.length === 0 ? (
        <View style={a.empty}>
          <Ionicons name="map-outline" size={48} color={Colors.dim} />
          <Text style={a.emptyTitle}>No available routes</Text>
          <Text style={a.emptySub}>
            All demand slots are already served, or no hubs are in range.
          </Text>
        </View>
      ) : (
        candidates.map(({ demand, hub, haul, fitPct, season, hasRoute }) => {
          const isCreating = creating === demand.id;
          const fitColor =
            fitPct >= 80
              ? Colors.green
              : fitPct >= 50
                ? Colors.amber
                : Colors.red;

          return (
            <TouchableOpacity
              key={demand.id}
              style={a.row}
              onPress={() => handleAssign(demand)}
              disabled={!!creating}
              activeOpacity={0.85}
            >
              {/* Fit bar */}
              <View
                style={[
                  a.fitBox,
                  {
                    backgroundColor: fitColor + "18",
                    borderColor: fitColor + "33",
                  },
                ]}
              >
                <Text style={[a.fitPct, { color: fitColor }]}>{fitPct}%</Text>
                <Text style={[a.fitLbl, { color: fitColor }]}>fit</Text>
              </View>

              {/* Route info */}
              <View style={a.body}>
                <View style={a.routeRow}>
                  <Text style={a.iata}>{demand.origin.iata}</Text>
                  <Ionicons name="arrow-forward" size={10} color={Colors.dim} />
                  <Text style={a.iata}>{demand.dest.iata}</Text>
                  {season && (
                    <View
                      style={[
                        a.seasonBadge,
                        { backgroundColor: season.color + "18" },
                      ]}
                    >
                      <Ionicons
                        name={season.icon as any}
                        size={8}
                        color={season.color}
                      />
                      <Text style={[a.seasonTxt, { color: season.color }]}>
                        {season.pctLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={a.meta} numberOfLines={1}>
                  {demand.dest.city} · {haulLabel[haul] ?? haul}
                  {" · "}
                  {demand.dist_nm.toLocaleString()}nm
                  {" · "}~{demand.base_pax_day} pax/day
                </Text>
                <Text style={a.hubLabel}>
                  {hub?.airport.iata ?? demand.hub_iata}
                  {hasRoute && <Text style={a.servedLbl}> · Route active</Text>}
                </Text>
              </View>

              {/* Action */}
              {isCreating ? (
                <Ionicons
                  name="hourglass-outline"
                  size={16}
                  color={Colors.dim}
                />
              ) : (
                <View
                  style={[
                    a.assignBtn,
                    { backgroundColor: hasRoute ? Colors.dim : color },
                  ]}
                >
                  <Ionicons
                    name={hasRoute ? "add-outline" : "flash-outline"}
                    size={12}
                    color={Colors.bg}
                  />
                  <Text style={a.assignTxt}>{hasRoute ? "Add" : "Assign"}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </BottomSheetScrollView>
  );
}

const a = StyleSheet.create({
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

  empty: { alignItems: "center", gap: Spacing.md, paddingVertical: 60 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  emptySub: { fontSize: 12, color: Colors.dim, textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  fitBox: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fitPct: { fontSize: 13, fontWeight: "900", lineHeight: 15 },
  fitLbl: { fontSize: 8, fontWeight: "700", opacity: 0.7 },

  body: { flex: 1, gap: 3 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  iata: { fontSize: 14, fontWeight: "900", color: Colors.text },
  meta: { fontSize: 11, color: Colors.muted },
  hubLabel: { fontSize: 9, color: Colors.dim, fontWeight: "700" },

  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: Radius.full,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  seasonTxt: { fontSize: 8, fontWeight: "800" },

  assignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  assignTxt: { fontSize: 11, fontWeight: "700", color: Colors.bg },
  servedLbl: { fontSize: 9, color: Colors.green, fontWeight: "700" },
});
