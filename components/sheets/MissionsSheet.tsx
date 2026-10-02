/**
 * Daily and weekly objectives presented as a flat dispatch brief.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import type { WeeklyChallenge } from "@/hooks/useWeeklyChallenge";
import {
  useWeeklyChallenge,
  useWeeklyProgress,
} from "@/hooks/useWeeklyChallenge";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
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
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type IconName = keyof typeof Ionicons.glyphMap;

const MISSION_ICONS: Record<Mission["type"], IconName> = {
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
      return { progress: 1, complete: true, detail: "Reward paid" };
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
          detail: `${Math.floor(moved).toLocaleString()} / ${goal.toLocaleString()} passengers`,
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
            : `${remaining.length} ${remaining.length === 1 ? "market" : "markets"} waiting`,
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
        return { progress: 0, complete: false, detail: "In progress" };
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

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function ProgressLine({
  progress,
  color,
  label,
}: {
  progress: number;
  color: string;
  label: string;
}) {
  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <View style={styles.progressRow}>
      <View
        accessibilityLabel={`${label}: ${percentage}% complete`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percentage }}
        style={styles.progressTrack}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${percentage}%` as `${number}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressValue, { color }]}>{percentage}%</Text>
    </View>
  );
}

function MissionRow({ mission, last }: { mission: Mission; last: boolean }) {
  const { progress, complete, detail } = useMissionProgress(mission);
  const paid = mission.completed;
  const ready = complete && !paid;
  const stateColor = paid || ready ? Colors.green : Colors.skyDark;
  const stateIcon: IconName = paid
    ? "checkmark-circle"
    : ready
      ? "time-outline"
      : "ellipse-outline";
  const stateLabel = paid
    ? "Reward paid"
    : ready
      ? "Ready for day close"
      : "In progress";

  return (
    <View style={[styles.missionRow, last && styles.lastRow]}>
      <View style={styles.missionHeading}>
        <View style={styles.missionIcon}>
          <Ionicons
            name={MISSION_ICONS[mission.type]}
            size={20}
            color={stateColor}
          />
        </View>
        <View style={styles.missionCopy}>
          <Text style={styles.missionTitle}>{mission.title}</Text>
          <Text style={styles.missionDescription}>{mission.desc}</Text>
        </View>
      </View>

      <View style={styles.missionStateRow}>
        <View style={styles.missionState}>
          <Ionicons name={stateIcon} size={15} color={stateColor} />
          <Text style={[styles.missionStateText, { color: stateColor }]}>
            {stateLabel}
          </Text>
        </View>
        <Text style={styles.missionReward}>
          Reward {fmtCash(mission.reward)}
        </Text>
      </View>

      <ProgressLine
        progress={progress}
        color={paid || ready ? Colors.green : Colors.sky}
        label={mission.title}
      />

      <Text style={styles.missionDetail}>{detail}</Text>
    </View>
  );
}

function WeeklyObjective({
  challenge,
  completing,
  onComplete,
}: {
  challenge: WeeklyChallenge;
  completing: boolean;
  onComplete: () => void;
}) {
  const progress = useWeeklyProgress(challenge);
  const ready = !challenge.completed && progress >= 1;
  const stateColor = challenge.completed || ready ? Colors.green : Colors.sky;

  return (
    <View style={styles.weeklyObjective}>
      <View style={styles.weeklyHeading}>
        <View style={styles.weeklyIcon}>
          <Ionicons
            name={challenge.icon as IconName}
            size={21}
            color={stateColor}
          />
        </View>
        <View style={styles.weeklyCopy}>
          <Text style={styles.weeklyTitle}>{challenge.title}</Text>
          <Text style={styles.weeklyDescription}>{challenge.desc}</Text>
        </View>
      </View>

      <View style={styles.weeklyRewardRow}>
        <Text style={styles.weeklyState}>
          {challenge.completed
            ? "Bonus claimed"
            : ready
              ? "Objective complete"
              : "Progress saves throughout the week"}
        </Text>
        <Text style={styles.weeklyReward}>
          Bonus {fmtCash(challenge.reward)}
        </Text>
      </View>

      <ProgressLine
        progress={progress}
        color={stateColor}
        label={challenge.title}
      />

      {ready ? (
        <TouchableOpacity
          accessibilityLabel={`Claim ${fmtCash(challenge.reward)} weekly reward`}
          accessibilityRole="button"
          accessibilityState={{ busy: completing, disabled: completing }}
          activeOpacity={0.7}
          disabled={completing}
          onPress={onComplete}
          style={[styles.claimButton, completing && styles.disabledControl]}
        >
          {completing ? (
            <ActivityIndicator size="small" color={Colors.textOnColor} />
          ) : (
            <Text style={styles.claimButtonText}>Claim weekly bonus</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function MissionsSheet() {
  const missions = useDailyMissions();
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const {
    challenge,
    loading: weeklyLoading,
    completing,
    error: weeklyError,
    completeWeekly,
  } = useWeeklyChallenge();
  const tabBarHeight = useTabBarHeight();

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;
  const paidCount = missions.filter((mission) => mission.completed).length;

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
        <AirlineBrandMark
          accessibilityLabel={`${airlineName} identity`}
          logoId={airlineLogoId}
          primary={airlinePrimaryColor}
          secondary={airlineSecondaryColor}
          size={42}
          variant="leaderboard"
        />
        <View style={styles.headerCopy}>
          <Text style={styles.screenTitle}>Missions</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {airlineName} · {airlineCode} · Day {day} dispatch brief
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close missions"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.dailySummary}>
        <View style={styles.dailySummaryCopy}>
          <Text style={styles.dailySummaryLabel}>Today&apos;s assignments</Text>
          <Text style={styles.dailySummaryHelp}>
            Complete objectives before closing the game day.
          </Text>
        </View>
        <View style={styles.dailySummaryValue}>
          <Text style={styles.dailySummaryNumber}>
            {paidCount} / {missions.length}
          </Text>
          <Text style={styles.dailySummaryCaption}>paid</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Daily assignments"
          detail={`${missions.length} ${missions.length === 1 ? "objective" : "objectives"}`}
        />
        {missions.length > 0 ? (
          <View style={styles.missionList}>
            {missions.map((mission, index) => (
              <MissionRow
                key={mission.id}
                mission={mission}
                last={index === missions.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No assignments available</Text>
            <Text style={styles.emptyText}>
              New daily assignments will be issued when the next game day
              begins.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Weekly objective"
          detail={
            challenge
              ? `Week ${challenge.weekNumber}, ${challenge.weekYear}`
              : undefined
          }
        />
        {weeklyLoading ? (
          <View style={styles.weeklyStatusRow}>
            <ActivityIndicator size="small" color={Colors.sky} />
            <Text style={styles.weeklyStatusText}>
              Loading weekly objective
            </Text>
          </View>
        ) : weeklyError ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.weeklyStatusRow}
          >
            <Ionicons name="warning-outline" size={18} color={Colors.red} />
            <Text style={[styles.weeklyStatusText, { color: Colors.red }]}>
              {weeklyError}
            </Text>
          </View>
        ) : challenge ? (
          <WeeklyObjective
            challenge={challenge}
            completing={completing}
            onComplete={completeWeekly}
          />
        ) : (
          <View style={styles.weeklyStatusRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.muted} />
            <Text style={styles.weeklyStatusText}>
              No weekly objective is currently available.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.guidance}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={Colors.muted}
        />
        <Text style={styles.guidanceText}>
          A daily objective may show as ready before payment. Advance the game
          day to verify the final result and settle its reward.
        </Text>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    backgroundColor: Colors.surface,
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  dailySummary: {
    minHeight: 78,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  dailySummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  dailySummaryLabel: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  dailySummaryHelp: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  dailySummaryValue: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  dailySummaryNumber: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
  },
  dailySummaryCaption: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
  },
  sectionDetail: {
    flexShrink: 1,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    textAlign: "right",
  },
  missionList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  missionRow: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  missionHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  missionIcon: {
    width: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  missionCopy: {
    flex: 1,
    minWidth: 0,
  },
  missionTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  missionDescription: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  missionStateRow: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  missionState: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  missionStateText: {
    flexShrink: 1,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  missionReward: {
    flexShrink: 0,
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  progressRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    overflow: "hidden",
    backgroundColor: Colors.inset,
  },
  progressFill: {
    height: 3,
  },
  progressValue: {
    width: 42,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "right",
  },
  missionDetail: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  emptyText: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  weeklyObjective: {
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  weeklyHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  weeklyIcon: {
    width: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyCopy: {
    flex: 1,
    minWidth: 0,
  },
  weeklyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  weeklyDescription: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  weeklyRewardRow: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  weeklyState: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  weeklyReward: {
    flexShrink: 0,
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  claimButton: {
    minHeight: MIN_TOUCH,
    marginTop: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  claimButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  disabledControl: {
    opacity: 0.5,
  },
  weeklyStatusRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  weeklyStatusText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  guidance: {
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  guidanceText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
});
