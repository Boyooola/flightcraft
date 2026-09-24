/**
 * Compact network-plan shortcut and long-term operations overview.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import {
  contractDaysLeft,
  contractProgressLabel,
  contractProgressPct,
  type GlobalContractState,
} from "@/lib/globalContracts";
import { fmtCash } from "@/lib/revenue";
import {
  useActiveSheet,
  useAirline,
  useCash,
  useDemands,
  useEarnedAchievements,
  useGlobalContract,
  useHubs,
  useOwnedPlanes,
  useRouteCreationActive,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MISSIONS_PILL_GAP, MISSIONS_PILL_HEIGHT } from "./MissionsPill";

type IconName = keyof typeof Ionicons.glyphMap;

interface Goal {
  id: string;
  category: string;
  icon: IconName;
  label: string;
  current: number;
  target: number;
  outcome: string;
  priority: number;
}

const GOAL_TOP_OFFSET = MISSIONS_PILL_GAP + MISSIONS_PILL_HEIGHT + Spacing.sm;

function goalProgress(goal: Goal) {
  if (goal.target <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((goal.current / goal.target) * 100)),
  );
}

function buildGoals(state: {
  cash: number;
  routes: number;
  hubs: number;
  planes: number;
  achievementPoints: number;
  pendingDemands: number;
  totalDemandPax: number;
  deliveredDemandPax: number;
}): Goal[] {
  const goals: Goal[] = [];

  if (state.pendingDemands > 0) {
    goals.push({
      id: "serve-next-demand",
      category: "Priority",
      icon: "navigate-outline",
      label: "Serve the next demand destination",
      current: 0,
      target: 1,
      outcome: "Opens capacity for new demand",
      priority: 100,
    });
  }

  if (state.totalDemandPax > 0) {
    goals.push({
      id: "move-waiting-pax",
      category: "Passengers",
      icon: "people-outline",
      label: "Move today’s waiting passengers",
      current: state.deliveredDemandPax,
      target: state.totalDemandPax,
      outcome: "Improves trust and revenue",
      priority: 95,
    });
  }

  const nextRoute = [1, 3, 5, 10, 20, 35, 50].find(
    (target) => state.routes < target,
  );
  if (nextRoute) {
    goals.push({
      id: `routes-${nextRoute}`,
      category: "Network",
      icon: "git-network-outline",
      label: `Operate ${nextRoute} active route${nextRoute === 1 ? "" : "s"}`,
      current: state.routes,
      target: nextRoute,
      outcome: "Expands passenger reach",
      priority: 80,
    });
  }

  const nextPlane = [1, 3, 5, 10, 20, 30].find(
    (target) => state.planes < target,
  );
  if (nextPlane) {
    goals.push({
      id: `planes-${nextPlane}`,
      category: "Fleet",
      icon: "airplane-outline",
      label: `Own ${nextPlane} aircraft`,
      current: state.planes,
      target: nextPlane,
      outcome: "Adds operating capacity",
      priority: 70,
    });
  }

  const nextHub = [1, 2, 3, 5, 10].find((target) => state.hubs < target);
  if (nextHub) {
    goals.push({
      id: `hubs-${nextHub}`,
      category: "Hubs",
      icon: "business-outline",
      label: `Own ${nextHub} hub${nextHub === 1 ? "" : "s"}`,
      current: state.hubs,
      target: nextHub,
      outcome: "Unlocks more destinations",
      priority: 60,
    });
  }

  const nextCash = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000].find(
    (target) => state.cash < target,
  );
  if (nextCash) {
    goals.push({
      id: `cash-${nextCash}`,
      category: "Cash",
      icon: "wallet-outline",
      label: `Build a ${fmtCash(nextCash)} reserve`,
      current: Math.max(0, state.cash),
      target: nextCash,
      outcome: "Funds aircraft and expansion",
      priority: 50,
    });
  }

  const nextAchievement = [100, 250, 500, 1000, 2000].find(
    (target) => state.achievementPoints < target,
  );
  if (nextAchievement) {
    goals.push({
      id: `achievements-${nextAchievement}`,
      category: "Milestone",
      icon: "trophy-outline",
      label: `Earn ${nextAchievement} achievement points`,
      current: state.achievementPoints,
      target: nextAchievement,
      outcome: "Marks airline progress",
      priority: 40,
    });
  }

  return goals
    .sort((left, right) => {
      const priority = right.priority - left.priority;
      return priority || goalProgress(right) - goalProgress(left);
    })
    .slice(0, 5);
}

function GoalRow({ goal }: { goal: Goal }) {
  const progress = goalProgress(goal);
  const priority =
    goal.category === "Priority" || goal.category === "Passengers";
  const accent = priority ? Colors.green : Colors.sky;
  const surface = priority ? Palette.greenSoft : Palette.blueSoft;
  const width = `${progress}%` as `${number}%`;

  return (
    <View style={styles.goal}>
      <View style={[styles.goalIcon, { backgroundColor: surface }]}>
        <Ionicons name={goal.icon} size={17} color={accent} />
      </View>

      <View style={styles.goalBody}>
        <View style={styles.goalHeading}>
          <Text style={[styles.goalCategory, { color: accent }]}>
            {goal.category.toUpperCase()}
          </Text>
          <Text style={[styles.goalPercent, { color: accent }]}>
            {progress}%
          </Text>
        </View>

        <Text style={styles.goalTitle}>{goal.label}</Text>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width, backgroundColor: accent }]}
          />
        </View>

        <Text style={styles.goalOutcome}>{goal.outcome}</Text>
      </View>
    </View>
  );
}

function contractColor(contract: GlobalContractState) {
  if (contract.status === "completed") return Colors.green;
  if (contract.status === "failed") return Colors.red;
  return Colors.amber;
}

function ContractCard({
  contract,
  day,
}: {
  contract: GlobalContractState;
  day: number;
}) {
  const progress = contractProgressPct(contract);
  const accent = contractColor(contract);
  const surface =
    contract.status === "completed"
      ? Palette.greenSoft
      : contract.status === "failed"
        ? Palette.redSoft
        : Palette.orangeSoft;
  const width = `${progress}%` as `${number}%`;
  const status =
    contract.status === "active"
      ? `${contractDaysLeft(contract, day)} days left`
      : contract.status === "completed"
        ? "Completed"
        : "Expired";

  return (
    <View style={[styles.contract, { borderLeftColor: accent }]}>
      <View style={styles.contractHeading}>
        <View style={[styles.contractIcon, { backgroundColor: surface }]}>
          <Ionicons name={contract.icon as IconName} size={19} color={accent} />
        </View>

        <View style={styles.contractCopy}>
          <Text style={[styles.contractKicker, { color: accent }]}>
            GLOBAL CONTRACT
          </Text>
          <Text style={styles.contractTitle}>{contract.title}</Text>
        </View>

        <View style={[styles.contractStatus, { backgroundColor: surface }]}>
          <Text style={[styles.contractStatusText, { color: accent }]}>
            {status}
          </Text>
        </View>
      </View>

      <Text style={styles.contractDescription}>{contract.desc}</Text>

      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width, backgroundColor: accent }]}
        />
      </View>

      <View style={styles.contractFooter}>
        <Text style={styles.contractProgress}>
          {contractProgressLabel(contract)}
        </Text>
        <Text style={[styles.contractPercent, { color: accent }]}>
          {progress}%
        </Text>
      </View>
    </View>
  );
}

export default function GoalsOverlay() {
  const insets = useSafeAreaInsets();
  const hudHeight = useHudHeight();
  const airline = useAirline();
  const cash = useCash();
  const routes = useRoutes();
  const hubs = useHubs();
  const planes = useOwnedPlanes();
  const demands = useDemands();
  const earnedAchievements = useEarnedAchievements();
  const globalContract = useGlobalContract();
  const isCreating = useRouteCreationActive();
  const activeSheet = useActiveSheet();
  const haptics = useHaptics();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (activeSheet || isCreating) setOpen(false);
  }, [activeSheet, isCreating]);

  const activeRoutes = routes.filter((route) => route.active).length;
  const pendingDemands = demands.filter(
    (demand) => demand.status === "pending",
  );
  const totalDemandPax = pendingDemands.reduce(
    (total, demand) => total + Math.max(0, demand.base_pax_day),
    0,
  );
  const deliveredDemandPax = pendingDemands.reduce(
    (total, demand) => total + Math.max(0, demand.delivered_pax_today ?? 0),
    0,
  );
  const achievementPoints = ACHIEVEMENTS.filter(
    (achievement) => earnedAchievements[achievement.id] !== undefined,
  ).reduce((total, achievement) => total + achievement.points, 0);

  const goals = useMemo(
    () =>
      buildGoals({
        cash,
        routes: activeRoutes,
        hubs: hubs.length,
        planes: planes.length,
        achievementPoints,
        pendingDemands: pendingDemands.length,
        totalDemandPax,
        deliveredDemandPax,
      }),
    [
      achievementPoints,
      activeRoutes,
      cash,
      deliveredDemandPax,
      hubs.length,
      pendingDemands.length,
      planes.length,
      totalDemandPax,
    ],
  );

  const nextGoal = goals[0] ?? null;
  if (!airline || (!nextGoal && !globalContract)) return null;

  const cardProgress = globalContract
    ? contractProgressPct(globalContract)
    : nextGoal
      ? goalProgress(nextGoal)
      : 0;
  const cardLabel = globalContract?.title ?? nextGoal?.label ?? "Network plan";
  const cardAccent = globalContract
    ? contractColor(globalContract)
    : Colors.sky;

  const openPlan = () => {
    haptics.tap();
    setOpen(true);
  };

  const closePlan = () => {
    haptics.tap();
    setOpen(false);
  };

  return (
    <>
      {!activeSheet && !isCreating ? (
        <TouchableOpacity
          accessibilityHint="Opens long-term goals and global contracts"
          accessibilityLabel={`Network plan. ${cardLabel}. ${cardProgress} percent complete.`}
          accessibilityRole="button"
          activeOpacity={0.78}
          onPress={openPlan}
          style={[styles.pill, { top: hudHeight + GOAL_TOP_OFFSET }]}
        >
          <View
            style={[styles.pillIcon, { backgroundColor: Palette.orangeSoft }]}
          >
            <Ionicons name="compass-outline" size={17} color={cardAccent} />
          </View>
          <View style={styles.pillBody}>
            <Text style={[styles.pillKicker, { color: cardAccent }]}>
              NETWORK PLAN · {cardProgress}%
            </Text>
            <Text style={styles.pillLabel} numberOfLines={1}>
              {cardLabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
        </TouchableOpacity>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={closePlan}
        statusBarTranslucent
        transparent
        visible={open}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            accessibilityLabel="Close network plan"
            accessibilityRole="button"
            activeOpacity={1}
            onPress={closePlan}
            style={StyleSheet.absoluteFillObject}
          />

          <View
            accessibilityViewIsModal
            style={[
              styles.panel,
              { paddingBottom: Math.max(insets.bottom, Spacing.md) },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerMark}>
                <Ionicons name="compass-outline" size={22} color={Colors.sky} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.headerKicker}>OPERATIONS BRIEF</Text>
                <Text style={styles.headerTitle}>Network plan</Text>
                <Text style={styles.headerSubtitle}>
                  Your clearest next steps for growth
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Close network plan"
                accessibilityRole="button"
                onPress={closePlan}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={21} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{pendingDemands.length}</Text>
                <Text style={styles.statLabel}>DEMANDS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{activeRoutes}</Text>
                <Text style={styles.statLabel}>ROUTES</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{fmtCash(cash)}</Text>
                <Text style={styles.statLabel}>CASH</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {globalContract ? (
                <>
                  <Text style={styles.sectionLabel}>CURRENT CONTRACT</Text>
                  <ContractCard contract={globalContract} day={airline.day} />
                </>
              ) : null}

              <Text style={styles.sectionLabel}>NEXT PRIORITIES</Text>
              <View style={styles.goalList}>
                {goals.map((goal) => (
                  <GoalRow goal={goal} key={goal.id} />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: Spacing.md,
    zIndex: 29,
    minHeight: MIN_TOUCH,
    width: 210,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  pillIcon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  pillBody: {
    flex: 1,
    minWidth: 0,
  },
  pillKicker: {
    fontSize: 7,
    lineHeight: 10,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.65,
  },
  pillLabel: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: Typography.weight.semibold,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Colors.overlay,
  },
  panel: {
    maxHeight: "82%",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderColor: Colors.border,
    ...Shadow.floating,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    marginBottom: Spacing.md,
    backgroundColor: Colors.borderSection,
    borderRadius: Radius.full,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerMark: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.blueSoft,
    borderRadius: Radius.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerKicker: {
    color: Colors.sky,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: Typography.weight.bold,
  },
  headerSubtitle: {
    color: Colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  stats: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    backgroundColor: Colors.inset,
    borderRadius: Radius.lg,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  statValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: Typography.weight.bold,
  },
  statLabel: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: 7,
    lineHeight: 10,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.7,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.1,
  },
  contract: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  contractHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  contractIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  contractCopy: {
    flex: 1,
    minWidth: 0,
  },
  contractKicker: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  contractTitle: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  contractStatus: {
    flexShrink: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  contractStatusText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: Typography.weight.bold,
  },
  contractDescription: {
    color: Colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  progressTrack: {
    height: 5,
    overflow: "hidden",
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  contractFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  contractProgress: {
    flex: 1,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
  },
  contractPercent: {
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  goalList: {
    overflow: "hidden",
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    ...Shadow.card,
  },
  goal: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  goalIcon: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  goalBody: {
    flex: 1,
    minWidth: 0,
  },
  goalHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  goalCategory: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  goalPercent: {
    fontFamily: Typography.mono,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: Typography.weight.bold,
  },
  goalTitle: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: Typography.weight.semibold,
  },
  goalOutcome: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
  },
});
