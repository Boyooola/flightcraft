/**
 * components/ui/GoalsOverlay.tsx
 *
 * WorldWide Rush-style goals overlay.
 *
 * Positioned below the taller 2-row TopHUD and stacked under MissionsPill.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import {
  contractDaysLeft,
  contractProgressLabel,
  contractProgressPct,
} from "@/lib/globalContracts";
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDemands,
  useEarnedAchievements,
  useGlobalContract,
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

const FLOAT_GAP = Spacing.sm;
const MISSIONS_PILL_HEIGHT = 36;
const GOAL_TOP_OFFSET = FLOAT_GAP + MISSIONS_PILL_HEIGHT + FLOAT_GAP;

interface Goal {
  id: string;
  category: string;
  icon: string;
  label: string;
  current: number;
  target: number;
  reward: string;
  priority: number;
}

function pct(goal: Goal) {
  return Math.min(100, Math.round((goal.current / goal.target) * 100));
}

function buildGoals(state: {
  cash: number;
  netWorth: number;
  routes: number;
  hubs: number;
  planes: number;
  achPoints: number;
  pendingDemands: number;
  servedDemands: number;
  totalDemandPax: number;
  deliveredDemandPax: number;
}): Goal[] {
  const goals: Goal[] = [];

  if (state.pendingDemands > 0) {
    goals.push({
      id: "clear-demand-slot",
      category: "RUSH",
      icon: "flash-outline",
      label: "Clear 1 demand slot",
      current: state.servedDemands,
      target: state.servedDemands + 1,
      reward: "New demand appears",
      priority: 100,
    });
  }

  if (state.totalDemandPax > 0) {
    goals.push({
      id: "move-waiting-pax",
      category: "FLOW",
      icon: "people-outline",
      label: "Move waiting passengers",
      current: state.deliveredDemandPax,
      target: state.totalDemandPax,
      reward: "Trust and cash",
      priority: 95,
    });
  }

  const routeTargets = [1, 3, 5, 10, 20, 35, 50];
  const nextRoute = routeTargets.find((t) => state.routes < t);
  if (nextRoute) {
    goals.push({
      id: `routes-${nextRoute}`,
      category: "ROUTES",
      icon: "git-network-outline",
      label: `Open ${nextRoute} active route${nextRoute !== 1 ? "s" : ""}`,
      current: state.routes,
      target: nextRoute,
      reward: nextRoute >= 10 ? "Route web" : "More flow",
      priority: 85,
    });
  }

  const planeTargets = [1, 3, 5, 10, 20, 30];
  const nextPlane = planeTargets.find((t) => state.planes < t);
  if (nextPlane) {
    goals.push({
      id: `planes-${nextPlane}`,
      category: "FLEET",
      icon: "airplane-outline",
      label: `Own ${nextPlane} aircraft`,
      current: state.planes,
      target: nextPlane,
      reward: "Carry more pax",
      priority: 75,
    });
  }

  const hubTargets = [1, 2, 3, 5, 10];
  const nextHub = hubTargets.find((t) => state.hubs < t);
  if (nextHub) {
    goals.push({
      id: `hubs-${nextHub}`,
      category: "HUBS",
      icon: "business-outline",
      label: `Own ${nextHub} hub${nextHub !== 1 ? "s" : ""}`,
      current: state.hubs,
      target: nextHub,
      reward: "More demand slots",
      priority: 70,
    });
  }

  const cashTargets = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
  const nextCash = cashTargets.find((t) => state.cash < t);
  if (nextCash) {
    goals.push({
      id: `cash-${nextCash}`,
      category: "CASH",
      icon: "cash-outline",
      label: `Reach ${fmtCash(nextCash)} cash`,
      current: state.cash,
      target: nextCash,
      reward: "Upgrade power",
      priority: 55,
    });
  }

  const achTargets = [100, 250, 500, 1000, 2000];
  const nextAch = achTargets.find((t) => state.achPoints < t);
  if (nextAch) {
    goals.push({
      id: `ach-${nextAch}`,
      category: "TROPHY",
      icon: "trophy-outline",
      label: `Earn ${nextAch} achievement points`,
      current: state.achPoints,
      target: nextAch,
      reward: `${nextAch}pt club`,
      priority: 40,
    });
  }

  return goals.sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return pct(b) - pct(a);
  });
}

function GoalRow({ goal, color }: { goal: Goal; color: string }) {
  const progress = pct(goal);
  const hot = goal.category === "RUSH" || goal.category === "FLOW";
  const accent = hot ? "#22c55e" : color;

  return (
    <View style={[gr.row, hot && gr.hotRow]}>
      <View style={[gr.iconWrap, { backgroundColor: accent + "18" }]}>
        <Ionicons name={goal.icon as any} size={15} color={accent} />
      </View>

      <View style={gr.body}>
        <View style={gr.topRow}>
          <Text style={[gr.category, { color: accent }]}>{goal.category}</Text>
          <Text style={[gr.pct, { color: accent }]}>{progress}%</Text>
        </View>

        <Text style={gr.label} numberOfLines={1}>
          {goal.label}
        </Text>

        <View style={gr.barTrack}>
          <View
            style={[
              gr.barFill,
              {
                width: `${progress}%` as any,
                backgroundColor: accent,
              },
            ]}
          />
        </View>

        <Text style={gr.reward}>{goal.reward}</Text>
      </View>
    </View>
  );
}

export default function GoalsOverlay() {
  const insets = useSafeAreaInsets();
  const hudH = useHudHeight();
  const airline = useAirline();
  const cash = useCash();
  const loan = useLoan();
  const routes = useRoutes();
  const hubs = useHubs();
  const planes = useOwnedPlanes();
  const demands = useDemands();
  const earned = useEarnedAchievements();
  const isCreating = useRouteCreationActive();
  const globalContract = useGlobalContract();
  const [open, setOpen] = useState(false);

  if (isCreating || !airline) return null;

  const color = airline.color ?? Colors.sky;
  const activeRoutes = routes.filter((r) => r.active).length;
  const pendingDemands = demands.filter((d) => d.status === "pending");
  const servedDemands = demands.filter((d) => d.status === "served").length;

  const totalDemandPax = pendingDemands.reduce(
    (sum, d) => sum + Math.max(0, d.base_pax_day),
    0,
  );

  const deliveredDemandPax = pendingDemands.reduce(
    (sum, d) => sum + Math.max(0, d.delivered_pax_today ?? 0),
    0,
  );

  const achPoints = ACHIEVEMENTS.filter(
    (a) => earned[a.id] !== undefined,
  ).reduce((sum, a) => sum + a.points, 0);

  const goals = buildGoals({
    cash,
    netWorth: Math.max(0, cash - loan),
    routes: activeRoutes,
    hubs: hubs.length,
    planes: planes.length,
    achPoints,
    pendingDemands: pendingDemands.length,
    servedDemands,
    totalDemandPax,
    deliveredDemandPax,
  });

  const nextGoal = goals[0];
  if (!nextGoal) return null;

  const nextPct = pct(nextGoal);
  const activeContract =
    globalContract?.status === "active" ? globalContract : null;
  const contractPct = activeContract ? contractProgressPct(activeContract) : 0;
  const pillPctText = activeContract ? `${contractPct}%` : `${nextPct}%`;
  const pillLabel = activeContract ? activeContract.title : nextGoal.label;

  return (
    <>
      <TouchableOpacity
        style={[
          s.pill,
          {
            top: hudH + GOAL_TOP_OFFSET,
            borderColor: color + "55",
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.88}
      >
        <View style={[s.pulseDot, { backgroundColor: color }]} />
        <Text style={[s.pillPct, { color }]}>{pillPctText}</Text>
        <Text style={s.pillLabel} numberOfLines={1}>
          {pillLabel}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={s.modalBackdrop}>
          <View
            style={[
              s.panel,
              {
                paddingBottom: insets.bottom + Spacing.lg,
              },
            ]}
          >
            <View style={s.panelHeader}>
              <View style={s.panelHdrL}>
                <Ionicons name="flash-outline" size={19} color={color} />
                <View>
                  <Text style={s.panelTitle}>Rush Goals</Text>
                  <Text style={s.panelSub}>Keep passengers moving</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={Colors.dim} />
              </TouchableOpacity>
            </View>

            <View style={[s.statBar, { borderColor: color + "33" }]}>
              {[
                { label: "Demand", val: pendingDemands.length },
                { label: "Routes", val: activeRoutes },
                { label: "Cash", val: fmtCash(cash) },
              ].map(({ label, val }) => (
                <View key={label} style={s.stat}>
                  <Text style={[s.statVal, { color }]}>{val}</Text>
                  <Text style={s.statLbl}>{label}</Text>
                </View>
              ))}
            </View>

            {globalContract && (
              <View
                style={[
                  s.contractCard,
                  {
                    borderColor:
                      globalContract.status === "completed"
                        ? Colors.green + "44"
                        : globalContract.status === "failed"
                          ? Colors.red + "44"
                          : color + "44",
                  },
                ]}
              >
                <View style={s.contractTop}>
                  <View
                    style={[
                      s.contractIcon,
                      {
                        backgroundColor:
                          globalContract.status === "failed"
                            ? Colors.red + "18"
                            : color + "18",
                      },
                    ]}
                  >
                    <Ionicons
                      name={globalContract.icon as any}
                      size={17}
                      color={
                        globalContract.status === "failed" ? Colors.red : color
                      }
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        s.contractTag,
                        {
                          color:
                            globalContract.status === "completed"
                              ? Colors.green
                              : globalContract.status === "failed"
                                ? Colors.red
                                : color,
                        },
                      ]}
                    >
                      GLOBAL CONTRACT
                    </Text>
                    <Text style={s.contractTitle} numberOfLines={1}>
                      {globalContract.title}
                    </Text>
                  </View>

                  <Text
                    style={[
                      s.contractPct,
                      {
                        color:
                          globalContract.status === "completed"
                            ? Colors.green
                            : globalContract.status === "failed"
                              ? Colors.red
                              : color,
                      },
                    ]}
                  >
                    {contractProgressPct(globalContract)}%
                  </Text>
                </View>

                <Text style={s.contractDesc}>{globalContract.desc}</Text>

                <View style={s.contractBar}>
                  <View
                    style={[
                      s.contractFill,
                      {
                        width: `${contractProgressPct(globalContract)}%` as any,
                        backgroundColor:
                          globalContract.status === "completed"
                            ? Colors.green
                            : globalContract.status === "failed"
                              ? Colors.red
                              : color,
                      },
                    ]}
                  />
                </View>

                <View style={s.contractFooter}>
                  <Text style={s.contractMeta}>
                    {contractProgressLabel(globalContract)}
                  </Text>
                  <Text style={s.contractMeta}>
                    {globalContract.status === "active"
                      ? `${contractDaysLeft(globalContract, airline.day)}d left`
                      : globalContract.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}

            <Text style={s.sectionHdr}>NEXT OBJECTIVES</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {goals.map((goal) => (
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

const gr = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  hotRow: {
    backgroundColor: "rgba(34,197,94,0.035)",
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  category: {
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: "800",
  },
  pct: {
    fontSize: 10,
    fontWeight: "800",
  },
  label: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "700",
  },
  barTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  reward: {
    fontSize: 10,
    color: Colors.dim,
  },
});

const s = StyleSheet.create({
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 29,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    backgroundColor: "rgba(8,15,30,0.94)",
    maxWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 7,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    flexShrink: 0,
  },
  pillPct: {
    fontSize: 10,
    fontWeight: "900",
    flexShrink: 0,
  },
  pillLabel: {
    fontSize: 9,
    color: Colors.muted,
    flex: 1,
    fontWeight: "700",
    minWidth: 0,
  },

  contractCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  contractTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  contractIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  contractTag: {
    fontSize: 8,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  contractTitle: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "900",
    marginTop: 1,
  },
  contractPct: {
    fontSize: 17,
    fontWeight: "900",
  },
  contractDesc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  contractBar: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,.08)",
    overflow: "hidden",
  },
  contractFill: {
    height: "100%",
    borderRadius: 999,
  },
  contractFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  contractMeta: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "800",
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
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
  panelHdrL: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  panelTitle: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: "800",
  },
  panelSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },

  statBar: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statVal: {
    fontSize: 16,
    fontWeight: "900",
  },
  statLbl: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1,
    marginTop: 2,
  },
  sectionHdr: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    marginBottom: Spacing.xs,
    fontWeight: "800",
  },
});
