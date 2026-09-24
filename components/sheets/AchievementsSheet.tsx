/**
 * The airline's milestone record, grouped into easy-to-scan categories.
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
import {
  ACHIEVEMENTS,
  TOTAL_POINTS,
  type Achievement,
  type AchievementCategory,
} from "@/lib/achievements";
import { useAirline, useEarnedAchievements, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
  surface: string;
}

const CATEGORY_META: Record<AchievementCategory, CategoryMeta> = {
  pioneer: {
    label: "Getting Started",
    icon: "rocket-outline",
    color: Colors.sky,
    surface: Palette.blueSoft,
  },
  passenger: {
    label: "Passengers",
    icon: "people-outline",
    color: Colors.green,
    surface: Palette.greenSoft,
  },
  network: {
    label: "Routes & Network",
    icon: "git-network-outline",
    color: Colors.skyDark,
    surface: Palette.blueSoft,
  },
  fleet: {
    label: "Fleet",
    icon: "airplane-outline",
    color: Colors.amber,
    surface: Palette.orangeSoft,
  },
  operations: {
    label: "Operations",
    icon: "flash-outline",
    color: Colors.orange,
    surface: Palette.orangeSoft,
  },
  financial: {
    label: "Finances",
    icon: "cash-outline",
    color: Colors.green,
    surface: Palette.greenSoft,
  },
  missions: {
    label: "Missions",
    icon: "checkbox-outline",
    color: Colors.purple,
    surface: Palette.violetSoft,
  },
  prestige: {
    label: "Prestige",
    icon: "trophy-outline",
    color: Colors.purple,
    surface: Palette.violetSoft,
  },
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

function ProgressBar({
  progress,
  color,
  height = 7,
}: {
  progress: number;
  color: string;
  height?: number;
}) {
  const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <View style={[progressStyles.track, { height }]}>
      <View
        style={[
          progressStyles.fill,
          {
            width: `${percentage}%` as `${number}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function RecentAchievement({
  achievement,
  day,
}: {
  achievement: Achievement;
  day: number;
}) {
  const meta = CATEGORY_META[achievement.category];

  return (
    <View style={recentStyles.row}>
      <View style={[recentStyles.icon, { backgroundColor: meta.surface }]}>
        <Ionicons name={achievement.icon as any} size={17} color={meta.color} />
      </View>

      <View style={recentStyles.copy}>
        <Text style={recentStyles.title} numberOfLines={1}>
          {achievement.title}
        </Text>
        <Text style={recentStyles.meta}>
          Day {day} · {meta.label}
        </Text>
      </View>

      <View style={recentStyles.points}>
        <Text style={recentStyles.pointsValue}>+{achievement.points}</Text>
        <Text style={recentStyles.pointsLabel}>PTS</Text>
      </View>
    </View>
  );
}

function AchievementRow({
  achievement,
  dayEarned,
  meta,
}: {
  achievement: Achievement;
  dayEarned?: number;
  meta: CategoryMeta;
}) {
  const isEarned = dayEarned !== undefined;
  const isHidden = achievement.hidden && !isEarned;
  const title = isHidden ? "Classified milestone" : achievement.title;
  const description = isHidden
    ? "Keep flying to reveal this achievement."
    : isEarned
      ? achievement.flavor
      : achievement.desc;

  return (
    <View
      style={[
        achievementStyles.row,
        isEarned
          ? {
              borderColor: meta.color + "3D",
              backgroundColor: Colors.panel,
            }
          : achievementStyles.lockedRow,
      ]}
    >
      <View
        style={[
          achievementStyles.icon,
          { backgroundColor: isEarned ? meta.surface : Colors.inset },
        ]}
      >
        <Ionicons
          name={(isHidden ? "help-outline" : achievement.icon) as any}
          size={19}
          color={isEarned ? meta.color : Colors.dim}
        />
      </View>

      <View style={achievementStyles.body}>
        <View style={achievementStyles.titleRow}>
          <Text
            style={[
              achievementStyles.title,
              !isEarned && achievementStyles.lockedText,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>

          <View
            style={[
              achievementStyles.points,
              { backgroundColor: isEarned ? meta.surface : Colors.inset },
            ]}
          >
            <Text
              style={[
                achievementStyles.pointsText,
                { color: isEarned ? meta.color : Colors.dim },
              ]}
            >
              {achievement.points} PTS
            </Text>
          </View>
        </View>

        <Text
          style={[
            achievementStyles.description,
            !isEarned && achievementStyles.lockedText,
          ]}
          numberOfLines={2}
        >
          {description}
        </Text>

        <View style={achievementStyles.stateRow}>
          <Ionicons
            name={isEarned ? "checkmark-circle" : "lock-closed-outline"}
            size={13}
            color={isEarned ? Colors.green : Colors.dim}
          />
          <Text
            style={[
              achievementStyles.stateText,
              isEarned && { color: Colors.green },
            ]}
          >
            {isEarned ? `Unlocked on day ${dayEarned}` : "Not unlocked"}
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
    <View style={categoryStyles.section}>
      <View style={categoryStyles.header}>
        <View style={[categoryStyles.icon, { backgroundColor: meta.surface }]}>
          <Ionicons name={meta.icon as any} size={17} color={meta.color} />
        </View>

        <View style={categoryStyles.headingCopy}>
          <View style={categoryStyles.titleRow}>
            <Text style={categoryStyles.title}>{meta.label}</Text>
            <Text style={categoryStyles.count}>
              {unlockedCount}/{achievements.length}
            </Text>
          </View>
          <ProgressBar progress={progress} color={meta.color} height={5} />
        </View>
      </View>

      <View style={categoryStyles.list}>
        {achievements.map((achievement) => (
          <AchievementRow
            key={achievement.id}
            achievement={achievement}
            dayEarned={earned[achievement.id]}
            meta={meta}
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

  const color = airline?.color ?? Colors.sky;

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

  const overallProgress = earnedPoints / Math.max(1, TOTAL_POINTS);
  const progressPercentage = Math.round(overallProgress * 100);

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
        .sort(
          (first, second) => (earned[second.id] ?? 0) - (earned[first.id] ?? 0),
        )
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
        <View
          style={[
            styles.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="trophy-outline" size={21} color={color} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>PILOT RECORD</Text>
          <Text style={styles.screenTitle}>Achievements</Text>
          <Text style={styles.subtitle}>
            Milestones from your airline journey
          </Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close achievements"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.summaryCard, { borderLeftColor: color }]}>
        <View style={styles.summaryTop}>
          <View style={styles.progressCopy}>
            <Text style={styles.summaryLabel}>TOTAL COMPLETION</Text>
            <Text style={[styles.progressValue, { color }]}>
              {progressPercentage}%
            </Text>
            <Text style={styles.pointsLine}>
              {earnedPoints.toLocaleString()} of {TOTAL_POINTS.toLocaleString()}{" "}
              points
            </Text>
          </View>

          <View style={styles.unlockedBox}>
            <Text style={styles.unlockedValue}>{earnedCount}</Text>
            <Text style={styles.unlockedLabel}>OF {ACHIEVEMENTS.length}</Text>
            <Text style={styles.unlockedCaption}>UNLOCKED</Text>
          </View>
        </View>

        <ProgressBar progress={overallProgress} color={color} height={9} />

        <View style={styles.summaryFooter}>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={Colors.dim}
          />
          <Text style={styles.summaryNote}>
            Achievements unlock automatically as your airline grows.
          </Text>
        </View>
      </View>

      {recentAchievements.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>RECENTLY UNLOCKED</Text>
            <Ionicons name="sparkles-outline" size={15} color={Colors.amber} />
          </View>

          <View style={styles.recentList}>
            {recentAchievements.map((achievement) => (
              <RecentAchievement
                key={achievement.id}
                achievement={achievement}
                day={earned[achievement.id]}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.recordHeading}>
        <View>
          <Text style={styles.sectionLabel}>COMPLETE RECORD</Text>
          <Text style={styles.sectionHint}>
            Unlocked milestones appear first in each category
          </Text>
        </View>
        <View style={styles.recordCount}>
          <Text style={styles.recordCountText}>{ACHIEVEMENTS.length}</Text>
        </View>
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

const progressStyles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.full,
  },
});

const recentStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  meta: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  points: {
    alignItems: "flex-end",
  },
  pointsValue: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: Typography.weight.bold,
  },
  pointsLabel: {
    color: Colors.dim,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
});

const achievementStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  lockedRow: {
    backgroundColor: Palette.cloud,
    borderColor: Colors.border,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  lockedText: {
    color: Colors.muted,
  },
  points: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pointsText: {
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
  },
  description: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xxs,
  },
  stateText: {
    color: Colors.dim,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: Typography.weight.medium,
  },
});

const categoryStyles = StyleSheet.create({
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  count: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
  list: {
    gap: Spacing.sm,
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
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
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
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.card,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  progressCopy: {
    flex: 1,
  },
  summaryLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.4,
  },
  progressValue: {
    fontFamily: Typography.mono,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: Typography.weight.bold,
  },
  pointsLine: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
  unlockedBox: {
    minWidth: 82,
    alignItems: "center",
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  unlockedValue: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: Typography.weight.bold,
  },
  unlockedLabel: {
    color: Colors.green,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
  },
  unlockedCaption: {
    color: Colors.muted,
    fontSize: 7,
    letterSpacing: 0.7,
    marginTop: 2,
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  summaryNote: {
    flex: 1,
    color: Colors.dim,
    fontSize: 10,
    lineHeight: 14,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
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
  recentList: {
    gap: Spacing.sm,
  },
  recordHeading: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  recordCount: {
    minWidth: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Palette.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  recordCountText: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
});
