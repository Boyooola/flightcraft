/**
 * The airline's permanent milestone and service record.
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
import {
  ACHIEVEMENTS,
  TOTAL_POINTS,
  type Achievement,
  type AchievementCategory,
} from "@/lib/achievements";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { useAirline, useEarnedAchievements, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IconName = keyof typeof Ionicons.glyphMap;

interface CategoryMeta {
  label: string;
  icon: IconName;
}

const CATEGORY_META: Record<AchievementCategory, CategoryMeta> = {
  pioneer: { label: "Getting started", icon: "rocket-outline" },
  passenger: { label: "Passengers", icon: "people-outline" },
  network: { label: "Routes and network", icon: "git-network-outline" },
  fleet: { label: "Fleet", icon: "airplane-outline" },
  operations: { label: "Operations", icon: "flash-outline" },
  financial: { label: "Finance", icon: "cash-outline" },
  missions: { label: "Missions", icon: "checkbox-outline" },
  prestige: { label: "Prestige", icon: "trophy-outline" },
};

const CATEGORY_ORDER: AchievementCategory[] = [
  "pioneer",
  "passenger",
  "network",
  "fleet",
  "operations",
  "financial",
  "missions",
  "prestige",
];

function ProgressLine({
  progress,
  label,
}: {
  progress: number;
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
            { width: `${percentage}%` as `${number}%` },
          ]}
        />
      </View>
      <Text style={styles.progressValue}>{percentage}%</Text>
    </View>
  );
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function RecentAchievement({
  achievement,
  day,
  last,
}: {
  achievement: Achievement;
  day: number;
  last: boolean;
}) {
  const meta = CATEGORY_META[achievement.category];

  return (
    <View style={[styles.recentRow, last && styles.lastRow]}>
      <View style={styles.listIcon}>
        <Ionicons
          name={achievement.icon as IconName}
          size={19}
          color={Colors.green}
        />
      </View>
      <View style={styles.recentCopy}>
        <Text style={styles.recentTitle}>{achievement.title}</Text>
        <Text style={styles.recentMeta}>
          {meta.label} · Unlocked on day {day}
        </Text>
      </View>
      <Text style={styles.recentPoints}>+{achievement.points} pts</Text>
    </View>
  );
}

function AchievementRow({
  achievement,
  dayEarned,
  last,
}: {
  achievement: Achievement;
  dayEarned?: number;
  last: boolean;
}) {
  const earned = dayEarned !== undefined;
  const hidden = achievement.hidden && !earned;
  const title = hidden ? "Classified milestone" : achievement.title;
  const description = hidden
    ? "Continue operating to reveal this milestone."
    : earned
      ? achievement.flavor
      : achievement.desc;
  const stateColor = earned ? Colors.green : Colors.muted;

  return (
    <View style={[styles.achievementRow, last && styles.lastRow]}>
      <View style={styles.listIcon}>
        <Ionicons
          name={(hidden ? "help-outline" : achievement.icon) as IconName}
          size={19}
          color={stateColor}
        />
      </View>
      <View style={styles.achievementCopy}>
        <View style={styles.achievementTitleRow}>
          <Text
            numberOfLines={1}
            style={[styles.achievementTitle, !earned && styles.lockedText]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.achievementPoints,
              { color: earned ? Colors.text : Colors.muted },
            ]}
          >
            {achievement.points} pts
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={[styles.achievementDescription, !earned && styles.lockedText]}
        >
          {description}
        </Text>
        <View style={styles.achievementState}>
          <Ionicons
            name={earned ? "checkmark-circle" : "lock-closed-outline"}
            size={14}
            color={stateColor}
          />
          <Text style={[styles.achievementStateText, { color: stateColor }]}>
            {earned ? `Unlocked on day ${dayEarned}` : "Locked"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CategorySection({
  achievements,
  meta,
  earned,
}: {
  achievements: Achievement[];
  meta: CategoryMeta;
  earned: Record<string, number>;
}) {
  const unlockedCount = achievements.filter(
    (achievement) => earned[achievement.id] !== undefined,
  ).length;
  const progress = unlockedCount / Math.max(1, achievements.length);

  return (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <View style={styles.categoryTitleRow}>
          <Ionicons name={meta.icon} size={19} color={Colors.skyDark} />
          <Text style={styles.categoryTitle}>{meta.label}</Text>
        </View>
        <Text style={styles.categoryCount}>
          {unlockedCount} / {achievements.length}
        </Text>
      </View>
      <ProgressLine progress={progress} label={meta.label} />
      <View style={styles.achievementList}>
        {achievements.map((achievement, index) => (
          <AchievementRow
            key={achievement.id}
            achievement={achievement}
            dayEarned={earned[achievement.id]}
            last={index === achievements.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

export default function AchievementsSheet() {
  const earned = useEarnedAchievements();
  const airline = useAirline();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const tabBarHeight = useTabBarHeight();

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;

  const earnedPoints = useMemo(
    () =>
      ACHIEVEMENTS.reduce(
        (sum, achievement) =>
          earned[achievement.id] !== undefined ? sum + achievement.points : sum,
        0,
      ),
    [earned],
  );

  const earnedCount = useMemo(
    () =>
      ACHIEVEMENTS.filter((achievement) => earned[achievement.id] !== undefined)
        .length,
    [earned],
  );

  const overallProgress = earnedCount / Math.max(1, ACHIEVEMENTS.length);

  const groupedAchievements = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => {
        const achievements = ACHIEVEMENTS.filter(
          (achievement) => achievement.category === category,
        ).sort((first, second) => {
          const firstEarned = earned[first.id] !== undefined;
          const secondEarned = earned[second.id] !== undefined;

          if (firstEarned !== secondEarned) return firstEarned ? -1 : 1;
          return first.points - second.points;
        });

        return {
          category,
          achievements,
          meta: CATEGORY_META[category],
        };
      }).filter((group) => group.achievements.length > 0),
    [earned],
  );

  const recentAchievements = useMemo(
    () =>
      ACHIEVEMENTS.filter((achievement) => earned[achievement.id] !== undefined)
        .sort((first, second) => {
          const dayDifference =
            (earned[second.id] ?? 0) - (earned[first.id] ?? 0);
          return dayDifference !== 0
            ? dayDifference
            : second.points - first.points;
        })
        .slice(0, 3),
    [earned],
  );

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
          <Text style={styles.screenTitle}>Achievements</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {airlineName} · {airlineCode} · Service record
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close achievements"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryValue}>
            {Math.round(overallProgress * 100)}%
          </Text>
          <Text style={styles.summaryLabel}>Completion</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryValue}>
            {earnedCount} / {ACHIEVEMENTS.length}
          </Text>
          <Text style={styles.summaryLabel}>Unlocked</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryValue}>
            {earnedPoints.toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>
            Points of {TOTAL_POINTS.toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.overallProgress}>
        <ProgressLine progress={overallProgress} label="Achievement record" />
        <Text style={styles.overallHelp}>
          Milestones unlock automatically as your airline operates and grows.
        </Text>
      </View>

      {recentAchievements.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title="Recently unlocked"
            detail={`${recentAchievements.length} shown`}
          />
          <View style={styles.recentList}>
            {recentAchievements.map((achievement, index) => (
              <RecentAchievement
                key={achievement.id}
                achievement={achievement}
                day={earned[achievement.id]}
                last={index === recentAchievements.length - 1}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="Complete record"
          detail={`${ACHIEVEMENTS.length} milestones`}
        />
        <Text style={styles.recordHelp}>
          Unlocked milestones appear first within each category.
        </Text>
      </View>

      {groupedAchievements.map(({ category, achievements, meta }) => (
        <CategorySection
          key={category}
          achievements={achievements}
          meta={meta}
          earned={earned}
        />
      ))}
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
  summary: {
    minHeight: 92,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 42,
    backgroundColor: Colors.border,
  },
  summaryValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: Typography.weight.bold,
    textAlign: "center",
  },
  summaryLabel: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
  },
  overallProgress: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  overallHelp: {
    marginTop: Spacing.sm,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  progressRow: {
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
    backgroundColor: Colors.sky,
  },
  progressValue: {
    width: 42,
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "right",
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
  recentList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  recentRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  listIcon: {
    width: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
  },
  recentTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  recentMeta: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  recentPoints: {
    flexShrink: 0,
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  recordHelp: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  categorySection: {
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
  },
  categoryHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  categoryTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  categoryCount: {
    flexShrink: 0,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  achievementList: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  achievementRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  achievementCopy: {
    flex: 1,
    minWidth: 0,
  },
  achievementTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  achievementTitle: {
    flex: 1,
    minWidth: 0,
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  achievementPoints: {
    flexShrink: 0,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  achievementDescription: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  lockedText: {
    color: Colors.muted,
  },
  achievementState: {
    marginTop: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  achievementStateText: {
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.medium,
  },
});
