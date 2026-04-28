/**
 * components/sheets/MissionsSheet.tsx
 *
 * Today's 3 missions with LIVE progress bars.
 * Progress computed in real-time from store — no need to wait for day tick.
 * Reward still credited at day advance, but player sees completion immediately.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import type { Mission } from "@/lib/missions";
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useBoughtPlaneToday,
  useDailyMissions,
  useDay,
  useDemands,
  useGameStore,
  useHubs,
  useMissionsCompleted,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const GREEN = "#22c55e";

const MISSION_ICONS: Record<string, string> = {
  route_create: "airplane-outline",
  pax_carry: "people-outline",
  revenue_earn: "trending-up-outline",
  trust_grow: "heart-outline",
  loan_repay: "shield-checkmark-outline",
  hub_buy: "location-outline",
  fill_rate: "speedometer-outline",
  clear_crowding: "alert-circle-outline",
  plane_buy: "construct-outline",
  no_crowding: "checkmark-done-outline",
};

// ─── Compute live progress 0-1 for a mission ─────────────────────

function useMissionProgress(mission: Mission): {
  progress: number; // 0.0 → 1.0
  liveComplete: boolean;
} {
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const ledger = useGameStore((s) => s.ledger);
  const boughtPlane = useBoughtPlaneToday();

  return useMemo(() => {
    if (mission.completed) return { progress: 1, liveComplete: true };
    const t = mission.target;

    switch (mission.type) {
      case "route_create": {
        if (t.originIata && t.destIata) {
          const found = routes.some(
            (r) =>
              r.active &&
              r.demand.origin.iata === t.originIata &&
              r.demand.dest.iata === t.destIata,
          );
          return { progress: found ? 1 : 0, liveComplete: found };
        }
        const found = routes.some((r) => r.active && r.demand.haul === t.haul);
        return { progress: found ? 1 : 0, liveComplete: found };
      }

      case "pax_carry": {
        const total = demands.reduce(
          (s, d) => s + (d.delivered_pax_today ?? 0),
          0,
        );
        const prog = Math.min(1, total / (t.paxTarget ?? 1));
        return { progress: prog, liveComplete: prog >= 1 };
      }

      case "revenue_earn": {
        const day = airline?.day ?? 1;
        const rev = ledger
          .filter(
            (e) =>
              e.day === day &&
              e.type === "revenue" &&
              !e.label.startsWith("Mission:"),
          )
          .reduce((s, e) => s + e.amount, 0);
        const prog = Math.min(1, rev / (t.revenueTarget ?? 1));
        return { progress: prog, liveComplete: prog >= 1 };
      }

      case "trust_grow": {
        const hub = hubs.find((h) => h.airport.iata === t.hubIata);
        const prog = hub ? Math.min(1, hub.trust / (t.trustTarget ?? 1)) : 0;
        return { progress: prog, liveComplete: prog >= 1 };
      }

      case "loan_repay": {
        // Progress = how much loan has dropped vs the repay target
        // We approximate using current loan vs stored loan on airline
        // Full completion only confirmed at day tick via loanRepaidRef
        const currentLoan = airline?.loan ?? 0;
        if (currentLoan <= 0) return { progress: 1, liveComplete: true };
        // Show indeterminate — repay missions complete at day advance
        return { progress: 0.5, liveComplete: false };
      }

      case "fill_rate": {
        const best = demands.reduce((max, d) => {
          if (d.pax_day <= 0) return max;
          return Math.max(max, (d.delivered_pax_today ?? 0) / d.pax_day);
        }, 0);
        const prog = Math.min(1, best / ((t.fillTarget ?? 100) / 100));
        return { progress: prog, liveComplete: prog >= 1 };
      }

      case "clear_crowding": {
        // Simplified — check if the overcrowded hub has more served routes now
        const overcrowdedDemands = demands.filter(
          (d) => d.hub_iata === t.crowdHubIata && d.status === "pending",
        );
        const done = overcrowdedDemands.length === 0;
        return { progress: done ? 1 : 0.5, liveComplete: done };
      }

      case "plane_buy":
        return { progress: boughtPlane ? 1 : 0, liveComplete: boughtPlane };

      case "no_crowding":
        return { progress: 0, liveComplete: false };

      default:
        return { progress: 0, liveComplete: false };
    }
  }, [
    mission.completed,
    mission.target,
    mission.type,
    boughtPlane,
    routes,
    demands,
    airline?.day,
    airline?.loan,
    ledger,
    hubs,
  ]);
}

// ─── Mission Card ─────────────────────────────────────────────────

function MissionCard({ mission, color }: { mission: Mission; color: string }) {
  const { progress, liveComplete } = useMissionProgress(mission);
  const isComplete = mission.completed || liveComplete;
  const accent = isComplete ? GREEN : color;
  const icon = MISSION_ICONS[mission.type] ?? "checkmark-outline";
  const progressPct = Math.round(progress * 100);

  return (
    <View
      style={[
        mc.card,
        isComplete && {
          borderColor: GREEN + "44",
          backgroundColor: GREEN + "06",
        },
        !isComplete && { borderColor: Colors.border },
      ]}
    >
      <View style={[mc.stripe, { backgroundColor: accent }]} />
      <View style={mc.body}>
        {/* Top row */}
        <View style={mc.topRow}>
          <View style={[mc.iconWrap, { backgroundColor: accent + "18" }]}>
            <Ionicons name={icon as any} size={16} color={accent} />
          </View>
          <View style={mc.titleWrap}>
            <Text
              style={[
                mc.title,
                isComplete && {
                  color: Colors.dim,
                  textDecorationLine: "line-through",
                },
              ]}
            >
              {mission.title}
            </Text>
            <Text style={mc.desc} numberOfLines={2}>
              {mission.desc}
            </Text>
          </View>
          {isComplete && (
            <Ionicons name="checkmark-circle" size={22} color={GREEN} />
          )}
        </View>

        {/* Progress bar — always visible */}
        <View style={mc.progRow}>
          <View style={mc.progTrack}>
            <View
              style={[
                mc.progFill,
                {
                  width: `${progressPct}%` as any,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
          <Text style={[mc.progPct, { color: accent }]}>{progressPct}%</Text>
        </View>

        {/* Reward + status */}
        <View style={mc.rewardRow}>
          <View
            style={[
              mc.rewardBadge,
              { backgroundColor: accent + "12", borderColor: accent + "33" },
            ]}
          >
            <Ionicons name="cash-outline" size={11} color={accent} />
            <Text style={[mc.rewardTxt, { color: accent }]}>
              {fmtCash(mission.reward)}
            </Text>
          </View>
          {isComplete && !mission.completed && (
            <Text style={mc.pendingNote}>Reward on day advance →</Text>
          )}
          {mission.completed && (
            <Text style={[mc.pendingNote, { color: GREEN }]}>✓ Earned</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleWrap: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "700",
    lineHeight: 19,
  },
  desc: { fontSize: 11, color: Colors.dim, lineHeight: 16 },
  progRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  progTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progFill: { height: "100%", borderRadius: 2 },
  progPct: {
    fontSize: 10,
    fontWeight: "700",
    minWidth: 32,
    textAlign: "right",
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rewardTxt: { fontSize: 11, fontWeight: "700" },
  pendingNote: { fontSize: 9, color: Colors.dim },
});

// ─── Missions Sheet ───────────────────────────────────────────────

export default function MissionsSheet() {
  const missions = useDailyMissions();
  const completed = useMissionsCompleted();
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

  const color = airline?.color ?? Colors.sky;
  const doneCount = missions.filter((m) => m.completed).length;
  const allDone = doneCount === 3 && missions.length === 3;

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: tabBarH }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="flag-outline" size={20} color={color} />
          <Text style={s.title}>Daily Missions</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Day + dots */}
      <View style={s.meta}>
        <View>
          <Text style={s.dayTxt}>Day {day}</Text>
          <Text style={s.dayNote}>
            Progress updates live · Reward on day advance
          </Text>
        </View>
        <View style={s.dots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                s.dot,
                i < doneCount
                  ? { backgroundColor: GREEN }
                  : { backgroundColor: "rgba(255,255,255,.12)" },
              ]}
            />
          ))}
        </View>
      </View>

      {allDone && (
        <View style={s.allDone}>
          <Ionicons name="trophy" size={14} color={GREEN} />
          <Text style={s.allDoneTxt}>
            All missions complete! Rewards credited on next day advance.
          </Text>
        </View>
      )}

      <View style={s.divider} />

      {/* Mission cards */}
      {missions.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="flag-outline" size={40} color={Colors.dim} />
          <Text style={s.emptyTxt}>
            Missions generate at the start of each day.
          </Text>
        </View>
      ) : (
        <View style={s.cards}>
          {missions.map((m) => (
            <MissionCard key={m.id} mission={m} color={color} />
          ))}
        </View>
      )}

      <View style={s.divider} />

      {/* Stats */}
      <View style={s.stats}>
        <Text style={s.eyebrow}>ALL TIME</Text>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color }]}>{completed}</Text>
            <Text style={s.statLbl}>Missions Done</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color }]}>{doneCount}/3</Text>
            <Text style={s.statLbl}>Today</Text>
          </View>
        </View>
      </View>
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
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  dayTxt: { fontSize: 15, color: Colors.text, fontWeight: "700" },
  dayNote: { fontSize: 9, color: Colors.dim, marginTop: 2 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  allDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: GREEN + "10",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GREEN + "33",
    padding: Spacing.sm,
  },
  allDoneTxt: { fontSize: 11, color: GREEN, flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  cards: { paddingHorizontal: Spacing.lg },
  empty: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyTxt: { fontSize: 12, color: Colors.dim, textAlign: "center" },
  stats: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  eyebrow: { fontSize: 9, color: Colors.dim, letterSpacing: 2.5 },
  statsRow: { flexDirection: "row", gap: Spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  statVal: { fontSize: 22, fontWeight: "700" },
  statLbl: { fontSize: 9, color: Colors.dim, letterSpacing: 0.5 },
});
