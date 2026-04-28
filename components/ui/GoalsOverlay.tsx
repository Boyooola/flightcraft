/**
 * components/ui/GoalsOverlay.tsx
 *
 * Floating goals pill on the map — shows next 3 milestones to chase.
 * Tap to expand into a full goals panel.
 *
 * Goals ladder:
 *   Net worth milestones: $100K → $500K → $1M → $5M → $10M → $50M → $100M
 *   Route milestones:     1 → 3 → 5 → 10 → 20 → 35 → 50
 *   Hub milestones:       1 → 2 → 3 → 5 → 10
 *   Plane milestones:     1 → 3 → 5 → 10 → 20
 *   Achievement points:   100 → 250 → 500 → 1000 → 2000
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useEarnedAchievements,
  useHubs,
  useLoan,
  useOwnedPlanes,
  useRouteCreationActive,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────
// GOAL DEFINITIONS
// ─────────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  category: string;
  icon: string;
  label: string;
  current: number;
  target: number;
  reward: string; // flavour text
}

function buildGoals(state: {
  netWorth: number;
  routes: number;
  hubs: number;
  planes: number;
  achPoints: number;
}): Goal[] {
  const goals: Goal[] = [];

  // Net worth ladder
  const nwTargets = [
    100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000,
  ];
  const nextNW = nwTargets.find((t) => state.netWorth < t);
  if (nextNW)
    goals.push({
      id: `nw-${nextNW}`,
      category: "WEALTH",
      icon: "trending-up-outline",
      label: `Reach ${fmtCash(nextNW)} net worth`,
      current: Math.max(0, state.netWorth),
      target: nextNW,
      reward:
        nextNW >= 10_000_000
          ? "Empire Builder"
          : nextNW >= 1_000_000
            ? "First Million"
            : "Getting started",
    });

  // Route ladder
  const routeTargets = [1, 3, 5, 10, 20, 35, 50];
  const nextRoute = routeTargets.find((t) => state.routes < t);
  if (nextRoute)
    goals.push({
      id: `route-${nextRoute}`,
      category: "NETWORK",
      icon: "git-network-outline",
      label: `Open ${nextRoute} active route${nextRoute !== 1 ? "s" : ""}`,
      current: state.routes,
      target: nextRoute,
      reward:
        nextRoute >= 20
          ? "Route Empire"
          : nextRoute >= 10
            ? "Established Carrier"
            : "Growing Network",
    });

  // Hub ladder
  const hubTargets = [1, 2, 3, 5, 10];
  const nextHub = hubTargets.find((t) => state.hubs < t);
  if (nextHub)
    goals.push({
      id: `hub-${nextHub}`,
      category: "HUBS",
      icon: "business-outline",
      label: `Own ${nextHub} hub${nextHub !== 1 ? "s" : ""}`,
      current: state.hubs,
      target: nextHub,
      reward:
        nextHub >= 5
          ? "Hub Empire"
          : nextHub >= 2
            ? "Second Base"
            : "Hub Owner",
    });

  // Fleet ladder
  const planeTargets = [1, 3, 5, 10, 20, 30];
  const nextPlane = planeTargets.find((t) => state.planes < t);
  if (nextPlane)
    goals.push({
      id: `plane-${nextPlane}`,
      category: "FLEET",
      icon: "airplane-outline",
      label: `Own ${nextPlane} aircraft`,
      current: state.planes,
      target: nextPlane,
      reward:
        nextPlane >= 10
          ? "Growing Fleet"
          : nextPlane >= 5
            ? "Full Fleet"
            : "First Fleet",
    });

  // Achievement points
  const achTargets = [100, 250, 500, 1000, 2000];
  const nextAch = achTargets.find((t) => state.achPoints < t);
  if (nextAch)
    goals.push({
      id: `ach-${nextAch}`,
      category: "ACHIEVEMENTS",
      icon: "trophy-outline",
      label: `Earn ${nextAch} achievement points`,
      current: state.achPoints,
      target: nextAch,
      reward: `${nextAch}pt club`,
    });

  return goals;
}

// ─────────────────────────────────────────────────────────────────
// GOAL ROW
// ─────────────────────────────────────────────────────────────────

function GoalRow({ goal, color }: { goal: Goal; color: string }) {
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const isClose = pct >= 75;
  const accent = isClose ? "#22c55e" : color;

  return (
    <View style={gr.row}>
      <View style={[gr.iconWrap, { backgroundColor: accent + "15" }]}>
        <Ionicons name={goal.icon as any} size={14} color={accent} />
      </View>
      <View style={gr.body}>
        <View style={gr.topRow}>
          <Text style={gr.category}>{goal.category}</Text>
          <Text style={[gr.pct, { color: accent }]}>{pct}%</Text>
        </View>
        <Text style={gr.label} numberOfLines={1}>
          {goal.label}
        </Text>
        <View style={gr.barTrack}>
          <View
            style={[
              gr.barFill,
              { width: `${pct}%` as any, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={gr.reward}>{goal.reward}</Text>
      </View>
    </View>
  );
}

const gr = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  category: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 2,
    fontWeight: "700",
  },
  pct: { fontSize: 9, fontWeight: "700" },
  label: { fontSize: 12, color: Colors.text, fontWeight: "600" },
  barTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
  reward: { fontSize: 9, color: Colors.dim },
});

// ─────────────────────────────────────────────────────────────────
// GOALS OVERLAY
// ─────────────────────────────────────────────────────────────────

export default function GoalsOverlay() {
  const insets = useSafeAreaInsets();
  const hudH = useHudHeight();
  const airline = useAirline();
  const cash = useCash();
  const loan = useLoan();
  const routes = useRoutes();
  const hubs = useHubs();
  const planes = useOwnedPlanes();
  const earned = useEarnedAchievements();
  const isCreating = useRouteCreationActive();
  const [open, setOpen] = useState(false);

  if (isCreating || !airline) return null;

  const color = airline.color ?? Colors.sky;
  const netWorth = Math.max(0, cash - loan);
  const achPoints = ACHIEVEMENTS.filter(
    (a) => earned[a.id] !== undefined,
  ).reduce((s, a) => s + a.points, 0);

  const allGoals = buildGoals({
    netWorth,
    routes: routes.filter((r) => r.active).length,
    hubs: hubs.length,
    planes: planes.length,
    achPoints,
  });

  // Next 3 goals — show the ones with highest % completion first
  const topGoals = [...allGoals]
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, 3);

  // First incomplete goal for pill display
  const nextGoal = topGoals[0];
  if (!nextGoal) return null;

  const nextPct = Math.min(
    100,
    Math.round((nextGoal.current / nextGoal.target) * 100),
  );

  return (
    <>
      {/* Pill — always visible */}
      <TouchableOpacity
        style={[
          s.pill,
          { top: hudH + Spacing.sm + 46, borderColor: color + "55" },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="trophy-outline" size={12} color={color} />
        <Text style={[s.pillTxt, { color }]}>{nextPct}%</Text>
        <Text style={s.pillLabel} numberOfLines={1}>
          {nextGoal.label}
        </Text>
      </TouchableOpacity>

      {/* Full goals panel — modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={s.modalBackdrop}>
          <View
            style={[s.panel, { paddingBottom: insets.bottom + Spacing.lg }]}
          >
            {/* Header */}
            <View style={s.panelHeader}>
              <View style={s.panelHdrL}>
                <Ionicons name="trophy-outline" size={18} color={color} />
                <Text style={s.panelTitle}>Goals</Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={Colors.dim} />
              </TouchableOpacity>
            </View>

            {/* Stats summary */}
            <View style={[s.statBar, { borderColor: color + "33" }]}>
              {[
                { label: "Net Worth", val: fmtCash(netWorth) },
                { label: "Routes", val: routes.filter((r) => r.active).length },
                { label: "Ach Pts", val: achPoints },
              ].map(({ label, val }) => (
                <View key={label} style={s.stat}>
                  <Text style={[s.statVal, { color }]}>{val}</Text>
                  <Text style={s.statLbl}>{label}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionHdr}>YOUR NEXT GOALS</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {allGoals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} color={color} />
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // Pill
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.full,
    borderWidth: 1,
    backgroundColor: "rgba(8,15,30,0.92)",
    maxWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  pillTxt: { fontSize: 10, fontWeight: "700" },
  pillLabel: { fontSize: 9, color: Colors.muted, flex: 1 },

  // Modal
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  panel: {
    backgroundColor: "rgba(8,15,30,0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: "75%",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  panelHdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  panelTitle: { fontSize: 20, color: Colors.text, fontWeight: "700" },

  statBar: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: Spacing.sm },
  statVal: { fontSize: 16, fontWeight: "700" },
  statLbl: { fontSize: 8, color: Colors.dim, letterSpacing: 1 },

  sectionHdr: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    marginBottom: Spacing.xs,
  },
});
