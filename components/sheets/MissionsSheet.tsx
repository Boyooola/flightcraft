/**
 * A focused dispatch board for daily missions and the weekly challenge.
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
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import type { WeeklyChallenge } from "@/hooks/useWeeklyChallenge";
import {
  useWeeklyChallenge,
  useWeeklyProgress,
} from "@/hooks/useWeeklyChallenge";
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
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const MISSION_ICONS: Record<string, string> = {
  route_create: "git-branch-outline",
  pax_carry: "people-outline",
  revenue_earn: "cash-outline",
  trust_grow: "heart-outline",
  loan_repay: "shield-checkmark-outline",
  fill_rate: "speedometer-outline",
  clear_crowding: "alert-circle-outline",
  plane_buy: "airplane-outline",
  no_crowding: "checkmark-done-outline",
};

interface MissionProgress {
  progress: number;
  complete: boolean;
  detail: string;
}

function useMissionProgress(mission: Mission): MissionProgress {
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const ledger = useGameStore((state) => state.ledger);
  const boughtPlane = useBoughtPlaneToday();

  return useMemo(() => {
    if (mission.completed) {
      return { progress: 1, complete: true, detail: "Goal complete" };
    }

    const target = mission.target;

    switch (mission.type) {
      case "route_create": {
        const found =
          target.originIata && target.destIata
            ? routes.some(
                (route) =>
                  route.active &&
                  route.demand.origin.iata === target.originIata &&
                  route.demand.dest.iata === target.destIata,
              )
            : routes.some(
                (route) => route.active && route.demand.haul === target.haul,
              );

        return {
          progress: found ? 1 : 0,
          complete: found,
          detail: found ? "Route is active" : "Open the requested route",
        };
      }

      case "pax_carry": {
        const moved = demands.reduce(
          (sum, demand) => sum + (demand.delivered_pax_today ?? 0),
          0,
        );
        const goal = target.paxTarget ?? 1;
        const progress = Math.min(1, moved / goal);

        return {
          progress,
          complete: progress >= 1,
          detail: `${Math.floor(moved).toLocaleString()} / ${goal.toLocaleString()} pax`,
        };
      }

      case "revenue_earn": {
        const currentDay = airline?.day ?? 1;
        const earned = ledger
          .filter(
            (entry) =>
              entry.day === currentDay &&
              entry.type === "revenue" &&
              !entry.label.startsWith("Mission:"),
          )
          .reduce((sum, entry) => sum + entry.amount, 0);
        const goal = target.revenueTarget ?? 1;
        const progress = Math.max(0, Math.min(1, earned / goal));

        return {
          progress,
          complete: progress >= 1,
          detail: `${fmtCash(Math.max(0, earned))} / ${fmtCash(goal)}`,
        };
      }

      case "trust_grow": {
        const hub = hubs.find((item) => item.airport.iata === target.hubIata);
        const goal = target.trustTarget ?? 1;
        const current = hub?.trust ?? 0;
        const progress = Math.min(1, current / goal);

        return {
          progress,
          complete: progress >= 1,
          detail: `${Math.round(current)}% / ${goal}% trust`,
        };
      }

      case "loan_repay": {
        const currentLoan = airline?.loan ?? 0;
        const complete = currentLoan <= 0;

        return {
          progress: complete ? 1 : 0.5,
          complete,
          detail: complete ? "Loan cleared" : `${fmtCash(currentLoan)} remains`,
        };
      }

      case "fill_rate": {
        const bestFill = demands.reduce((best, demand) => {
          if (demand.base_pax_day <= 0) return best;
          return Math.max(
            best,
            (demand.delivered_pax_today ?? 0) / demand.base_pax_day,
          );
        }, 0);
        const goalPercent = target.fillTarget ?? 100;
        const progress = Math.min(1, bestFill / (goalPercent / 100));

        return {
          progress,
          complete: progress >= 1,
          detail: `${Math.round(bestFill * 100)}% / ${goalPercent}% filled`,
        };
      }

      case "clear_crowding": {
        const remaining = demands.filter(
          (demand) =>
            demand.hub_iata === target.crowdHubIata &&
            demand.status === "pending",
        );
        const complete = remaining.length === 0;

        return {
          progress: complete ? 1 : 0.5,
          complete,
          detail: complete
            ? "Crowding cleared"
            : `${remaining.length} slot${remaining.length === 1 ? "" : "s"} waiting`,
        };
      }

      case "plane_buy":
        return {
          progress: boughtPlane ? 1 : 0,
          complete: boughtPlane,
          detail: boughtPlane ? "Aircraft purchased" : "Purchase one aircraft",
        };

      case "no_crowding":
        return {
          progress: 0,
          complete: false,
          detail: "Checked when the day closes",
        };

      default:
        return { progress: 0, complete: false, detail: "Goal in progress" };
    }
  }, [
    airline?.day,
    airline?.loan,
    boughtPlane,
    demands,
    hubs,
    ledger,
    mission.completed,
    mission.target,
    mission.type,
    routes,
  ]);
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <View style={progressStyles.row}>
      <View style={progressStyles.track}>
        <View
          style={[
            progressStyles.fill,
            { width: `${percentage}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[progressStyles.value, { color }]}>{percentage}%</Text>
    </View>
  );
}

function MissionCard({ mission, color }: { mission: Mission; color: string }) {
  const { progress, complete, detail } = useMissionProgress(mission);
  const isPaid = mission.completed;
  const isReady = complete && !isPaid;
  const accent = complete ? Colors.green : color;
  const icon = MISSION_ICONS[mission.type] ?? "flag-outline";

  return (
    <View style={[missionStyles.card, complete && missionStyles.cardComplete]}>
      <View style={[missionStyles.rail, { backgroundColor: accent }]} />

      <View style={missionStyles.body}>
        <View style={missionStyles.heading}>
          <View
            style={[
              missionStyles.icon,
              {
                backgroundColor: complete
                  ? Palette.greenSoft
                  : Palette.blueSoft,
              },
            ]}
          >
            <Ionicons name={icon as any} size={18} color={accent} />
          </View>

          <View style={missionStyles.headingCopy}>
            <Text style={missionStyles.title} numberOfLines={2}>
              {mission.title}
            </Text>
            <Text style={missionStyles.description}>{mission.desc}</Text>
          </View>

          <View
            style={[
              missionStyles.status,
              complete
                ? missionStyles.statusComplete
                : missionStyles.statusActive,
            ]}
          >
            <Text
              style={[
                missionStyles.statusText,
                { color: complete ? Colors.green : Colors.skyDark },
              ]}
            >
              {isPaid ? "PAID" : isReady ? "READY" : "ACTIVE"}
            </Text>
          </View>
        </View>

        <ProgressBar progress={progress} color={accent} />

        <View style={missionStyles.detailRow}>
          <Text style={missionStyles.detail}>{detail}</Text>
          <View style={missionStyles.reward}>
            <Ionicons name="cash-outline" size={13} color={Colors.green} />
            <Text style={missionStyles.rewardText}>
              {fmtCash(mission.reward)}
            </Text>
          </View>
        </View>

        {isReady && (
          <View style={missionStyles.readyNote}>
            <Ionicons name="time-outline" size={13} color={Colors.green} />
            <Text style={missionStyles.readyNoteText}>
              Goal reached. Reward pays when the next day begins.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function WeeklyChallengeCard({
  challenge,
  onComplete,
  completing,
}: {
  challenge: WeeklyChallenge;
  onComplete: () => void;
  completing: boolean;
}) {
  const progress = useWeeklyProgress(challenge);
  const ready = !challenge.completed && progress >= 1;
  const accent = challenge.completed ? Colors.green : Colors.amber;

  return (
    <View style={weeklyStyles.card}>
      <View style={weeklyStyles.topRow}>
        <View style={weeklyStyles.badge}>
          <Ionicons name="calendar-outline" size={12} color={Colors.amber} />
          <Text style={weeklyStyles.badgeText}>WEEKLY ASSIGNMENT</Text>
        </View>

        <View style={weeklyStyles.reward}>
          <Text style={weeklyStyles.rewardLabel}>BONUS</Text>
          <Text style={weeklyStyles.rewardValue}>
            {fmtCash(challenge.reward)}
          </Text>
        </View>
      </View>

      <View style={weeklyStyles.heading}>
        <View style={weeklyStyles.icon}>
          <Ionicons
            name={challenge.icon as any}
            size={20}
            color={Colors.amber}
          />
        </View>
        <View style={weeklyStyles.copy}>
          <Text style={weeklyStyles.title}>{challenge.title}</Text>
          <Text style={weeklyStyles.description}>{challenge.desc}</Text>
        </View>
      </View>

      <ProgressBar progress={progress} color={accent} />

      <View style={weeklyStyles.footer}>
        <Text
          style={[
            weeklyStyles.state,
            challenge.completed && { color: Colors.green },
          ]}
        >
          {challenge.completed
            ? "Bonus claimed"
            : ready
              ? "Challenge complete"
              : "Progress saves throughout the week"}
        </Text>

        {ready && (
          <TouchableOpacity
            accessibilityLabel="Claim weekly mission reward"
            accessibilityRole="button"
            style={weeklyStyles.claimButton}
            onPress={onComplete}
            disabled={completing}
            activeOpacity={0.85}
          >
            <Ionicons
              name="gift-outline"
              size={16}
              color={Colors.textOnColor}
            />
            <Text style={weeklyStyles.claimText}>
              {completing ? "Claiming…" : "Claim bonus"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function MissionsSheet() {
  const missions = useDailyMissions();
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const { challenge, completeWeekly, completing } = useWeeklyChallenge();
  const tabBarHeight = useTabBarHeight();

  const color = airline?.color ?? Colors.sky;
  const totalCount = missions.length;

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="flag-outline" size={21} color={color} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>DISPATCH BOARD</Text>
          <Text style={styles.screenTitle}>Missions</Text>
          <Text style={styles.subtitle}>Clear goals. Useful rewards.</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close missions"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.dailyBrief, { borderLeftColor: color }]}>
        <View style={styles.briefCopy}>
          <Text style={styles.briefLabel}>DAY {day} OPERATIONS</Text>
          <Text style={styles.briefTitle}>Today’s flight plan</Text>
          <Text style={styles.briefDescription}>
            Complete each assignment before advancing the day.
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreValue, { color }]}>{totalCount || 3}</Text>
          <Text style={styles.scoreLabel}>ASSIGNMENTS</Text>
          <View style={styles.scoreDots}>
            {Array.from({ length: Math.max(totalCount, 3) }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.scoreDot,
                  {
                    backgroundColor: index < totalCount ? color : Colors.inset,
                    borderColor:
                      index < totalCount ? color : Colors.borderSection,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      {challenge && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THIS WEEK</Text>
          <WeeklyChallengeCard
            challenge={challenge}
            onComplete={completeWeekly}
            completing={completing}
          />
        </View>
      )}

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionLabel}>TODAY’S ASSIGNMENTS</Text>
          <Text style={styles.sectionHint}>
            Rewards pay at the next day change
          </Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{totalCount}</Text>
        </View>
      </View>

      {missions.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sunny-outline" size={25} color={Colors.sky} />
          </View>
          <Text style={styles.emptyTitle}>Board cleared</Text>
          <Text style={styles.emptyText}>
            New daily assignments will be posted when tomorrow begins.
          </Text>
        </View>
      ) : (
        <View style={styles.missionList}>
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} color={color} />
          ))}
        </View>
      )}

      <View style={styles.infoNote}>
        <Ionicons
          name="information-circle-outline"
          size={15}
          color={Colors.dim}
        />
        <Text style={styles.infoText}>
          A goal can show as ready before its reward is paid. Advance the day to
          settle completed daily missions.
        </Text>
      </View>
    </BottomSheetScrollView>
  );
}

const progressStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  value: {
    width: 38,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    textAlign: "right",
  },
});

const missionStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    ...Shadow.card,
  },
  cardComplete: {
    backgroundColor: Palette.paper,
    borderColor: "rgba(46,139,101,0.28)",
  },
  rail: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  headingCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: Typography.weight.bold,
  },
  description: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  status: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: Palette.blueSoft,
    borderColor: "rgba(23,105,170,0.20)",
  },
  statusComplete: {
    backgroundColor: Palette.greenSoft,
    borderColor: "rgba(46,139,101,0.24)",
  },
  statusText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  detail: {
    flex: 1,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
  },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  rewardText: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
  readyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  readyNoteText: {
    flex: 1,
    color: Colors.green,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: Typography.weight.medium,
  },
});

const weeklyStyles = StyleSheet.create({
  card: {
    backgroundColor: Palette.orangeSoft,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(233,138,46,0.30)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.panel,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  badgeText: {
    color: Colors.amber,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  reward: {
    alignItems: "flex-end",
  },
  rewardLabel: {
    color: Colors.muted,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  rewardValue: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: Typography.weight.bold,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  description: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  state: {
    flex: 1,
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: Typography.weight.medium,
  },
  claimButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.green,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  claimText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: Colors.skyDark,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  screenTitle: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  dailyBrief: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  briefCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  briefLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.4,
  },
  briefTitle: {
    color: Colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: Typography.weight.bold,
  },
  briefDescription: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  scoreBlock: {
    alignItems: "flex-end",
  },
  scoreValue: {
    fontFamily: Typography.mono,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: Typography.weight.bold,
  },
  scoreLabel: {
    color: Colors.dim,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  scoreDots: {
    flexDirection: "row",
    gap: 5,
    marginTop: Spacing.sm,
  },
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  sectionHeading: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  sectionHint: {
    color: Colors.dim,
    fontSize: 10,
    marginTop: Spacing.xs,
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Palette.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  missionList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  emptyState: {
    marginHorizontal: Spacing.lg,
    alignItems: "center",
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Palette.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: Typography.weight.bold,
  },
  emptyText: {
    maxWidth: 280,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  infoNote: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  infoText: {
    flex: 1,
    color: Colors.dim,
    fontSize: 10,
    lineHeight: 15,
  },
});
