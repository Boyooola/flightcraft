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
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AssignRouteSheet() {
  const tabBarH = useTabBarHeight();
  const createRoute = useCreateRoute();

  const plane = useSelectedPlane();
  const airline = useGameStore((s) => s.airline);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const color = airline?.color ?? Colors.sky;

  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const day = useGameStore((s) => s.airline?.day ?? 1);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // All demands within plane range — served ones shown separately
  const candidates = useMemo(() => {
    if (!plane) return [];

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

  const dismiss = useCallback(() => closeSheet(), [closeSheet]);

  const handleAssign = async (demand: Demand) => {
    if (!plane) return;
    setCreating(demand.id);
    setError(null);
    const { error } = await createRoute(demand, plane);
    setCreating(null);
    if (error) {
      setError(error);
      return;
    }
    dismiss();
  };

  const haulLabel: Record<string, string> = {
    short: "Short haul",
    medium: "Medium haul",
    long: "Long haul",
  };

  if (!plane) return null;
  const newRouteCount = candidates.filter(
    (candidate) => !candidate.hasRoute,
  ).length;

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
        <View
          style={[
            a.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="navigate-outline" size={20} color={color} />
        </View>
        <View style={a.headerCopy}>
          <Text style={a.kicker}>ROUTE ASSIGNMENT</Text>
          <Text style={a.title}>Assign Aircraft</Text>
          <Text style={a.sub}>
            {plane.plane_model.nickname} · {newRouteCount} new route
            {newRouteCount === 1 ? "" : "s"} available
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close route assignment"
          accessibilityRole="button"
          onPress={dismiss}
          activeOpacity={0.7}
          style={a.closeButton}
        >
          <Ionicons name="close" size={21} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={a.aircraftCard}>
        <View style={a.aircraftIcon}>
          <Ionicons name="airplane" size={20} color={Colors.sky} />
        </View>
        <View style={a.aircraftCopy}>
          <Text style={a.aircraftName}>{plane.plane_model.nickname}</Text>
          <Text style={a.aircraftMeta}>Selected aircraft</Text>
        </View>
        <View style={a.aircraftStat}>
          <Text style={a.aircraftStatValue}>
            {plane.plane_model.pax_capacity}
          </Text>
          <Text style={a.aircraftStatLabel}>SEATS</Text>
        </View>
        <View style={a.aircraftDivider} />
        <View style={a.aircraftStat}>
          <Text style={a.aircraftStatValue}>
            {plane.plane_model.range_nm.toLocaleString()}
          </Text>
          <Text style={a.aircraftStatLabel}>NM RANGE</Text>
        </View>
      </View>

      {error && (
        <View style={a.errorNotice}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.red} />
          <Text style={a.errorText}>{error}</Text>
        </View>
      )}

      {candidates.length === 0 ? (
        <View style={a.empty}>
          <View style={a.emptyIcon}>
            <Ionicons name="map-outline" size={30} color={Colors.sky} />
          </View>
          <Text style={a.emptyTitle}>No available routes</Text>
          <Text style={a.emptySub}>
            All demand slots are already served, or no hubs are in range.
          </Text>
        </View>
      ) : (
        <>
          <View style={a.sectionHeading}>
            <View>
              <Text style={a.sectionKicker}>COMPATIBLE ROUTES</Text>
              <Text style={a.sectionTitle}>Best aircraft matches first</Text>
            </View>
            <Text style={a.sectionCount}>{candidates.length} options</Text>
          </View>

          {candidates.map(({ demand, hub, haul, fitPct, season, hasRoute }) => {
            const isCreating = creating === demand.id;
            const fitColor =
              fitPct >= 80
                ? Colors.green
                : fitPct >= 50
                  ? Colors.amber
                  : Colors.red;
            const fitBackground =
              fitPct >= 80
                ? Palette.greenSoft
                : fitPct >= 50
                  ? Palette.orangeSoft
                  : Palette.redSoft;

            return (
              <TouchableOpacity
                key={demand.id}
                accessibilityHint={
                  hasRoute
                    ? "Adds this aircraft to the active route"
                    : "Creates this route with the selected aircraft"
                }
                accessibilityLabel={`${demand.origin.iata} to ${demand.dest.iata}, ${fitPct} percent fit`}
                accessibilityRole="button"
                style={[a.row, hasRoute && a.rowActive]}
                onPress={() => handleAssign(demand)}
                disabled={!!creating}
                activeOpacity={0.85}
              >
                <View style={[a.fitBox, { backgroundColor: fitBackground }]}>
                  <Text style={[a.fitPct, { color: fitColor }]}>{fitPct}%</Text>
                  <Text style={[a.fitLbl, { color: fitColor }]}>FIT</Text>
                </View>

                <View style={a.body}>
                  <View style={a.routeRow}>
                    <Text style={a.iata}>{demand.origin.iata}</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color={Colors.sky}
                    />
                    <Text style={a.iata}>{demand.dest.iata}</Text>
                    {hasRoute && (
                      <View style={a.activeBadge}>
                        <Text style={a.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={a.meta} numberOfLines={1}>
                    {demand.dest.city} · {haulLabel[haul] ?? haul} ·{" "}
                    {demand.dist_nm.toLocaleString()} nm
                  </Text>
                  <View style={a.routeDetails}>
                    <Text style={a.hubLabel}>
                      HUB {hub?.airport.iata ?? demand.hub_iata}
                    </Text>
                    <Text style={a.demandLabel}>
                      ~{demand.base_pax_day} PAX/DAY
                    </Text>
                    {season && (
                      <View
                        style={[
                          a.seasonBadge,
                          { backgroundColor: season.color + "18" },
                        ]}
                      >
                        <Ionicons
                          name={season.icon as any}
                          size={9}
                          color={season.color}
                        />
                        <Text style={[a.seasonTxt, { color: season.color }]}>
                          {season.pctLabel}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={[a.assignBtn, hasRoute && a.expandButton]}>
                  {isCreating ? (
                    <ActivityIndicator
                      size="small"
                      color={hasRoute ? Colors.sky : Colors.textOnColor}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={hasRoute ? "add" : "arrow-forward"}
                        size={15}
                        color={hasRoute ? Colors.sky : Colors.textOnColor}
                      />
                      <Text
                        style={[a.assignTxt, hasRoute && a.expandButtonText]}
                      >
                        {hasRoute ? "Add" : "Assign"}
                      </Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </BottomSheetScrollView>
  );
}

const a = StyleSheet.create({
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
  sub: { color: Colors.muted, fontSize: 10 },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.inset,
  },
  aircraftCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  aircraftIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.skyDim,
  },
  aircraftCopy: { flex: 1 },
  aircraftName: { color: Colors.text, fontSize: 13, fontWeight: "700" },
  aircraftMeta: { color: Colors.muted, fontSize: 9, marginTop: 2 },
  aircraftStat: { alignItems: "flex-end" },
  aircraftStatValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
  },
  aircraftStatLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 7,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  aircraftDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: Colors.border,
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Palette.redSoft,
  },
  errorText: { flex: 1, color: Colors.red, fontSize: 10, fontWeight: "700" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
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
  sectionTitle: { color: Colors.text, fontSize: 11, marginTop: 2 },
  sectionCount: { color: Colors.muted, fontSize: 9 },
  empty: {
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.skyDim,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginTop: Spacing.md,
  },
  emptySub: {
    maxWidth: 270,
    color: Colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  rowActive: { backgroundColor: Colors.bg, shadowOpacity: 0, elevation: 0 },
  fitBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fitPct: {
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
  },
  fitLbl: { fontFamily: Typography.mono, fontSize: 7, fontWeight: "700" },
  body: { flex: 1 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  iata: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: "700",
  },
  activeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Palette.greenSoft,
  },
  activeBadgeText: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 7,
    fontWeight: "700",
  },
  meta: { color: Colors.muted, fontSize: 10, marginTop: 3 },
  routeDetails: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: 5,
  },
  hubLabel: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
  },
  demandLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
  },
  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  seasonTxt: { fontFamily: Typography.mono, fontSize: 7, fontWeight: "700" },
  assignBtn: {
    minWidth: 72,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
    flexShrink: 0,
  },
  assignTxt: { fontSize: 10, fontWeight: "700", color: Colors.textOnColor },
  expandButton: {
    borderWidth: 1,
    borderColor: Colors.borderHi,
    backgroundColor: Colors.panel,
  },
  expandButtonText: { color: Colors.sky },
});
