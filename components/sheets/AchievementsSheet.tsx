/**
 * components/sheets/AchievementsSheet.tsx
 *
 * Trophy cabinet — shows all 27 achievements.
 * Earned: full colour, shows day earned.
 * Locked: dim, hidden achievements show as ???.
 *
 * Header shows total points earned / total possible.
 * Grouped by category with counts.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  ACHIEVEMENTS,
  TOTAL_POINTS,
  type AchievementCategory,
} from "@/lib/achievements";
import { useAirline, useEarnedAchievements, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const PURPLE = "#a78bfa";

const CATEGORY_META: Record<
  AchievementCategory,
  { label: string; icon: string; color: string }
> = {
  pioneer: { label: "Pioneer", icon: "rocket-outline", color: Colors.sky },
  network: {
    label: "Network",
    icon: "git-network-outline",
    color: Colors.green,
  },
  fleet: { label: "Fleet", icon: "airplane-outline", color: Colors.amber },
  financial: {
    label: "Financial",
    icon: "trending-up-outline",
    color: Colors.green,
  },
  passenger: { label: "Passenger", icon: "people-outline", color: Colors.sky },
  operations: {
    label: "Operations",
    icon: "settings-outline",
    color: Colors.amber,
  },
  prestige: { label: "Prestige", icon: "trophy-outline", color: PURPLE },
  missions: {
    label: "",
    icon: "",
    color: "",
  },
};

const CATEGORY_ORDER: AchievementCategory[] = [
  "pioneer",
  "network",
  "fleet",
  "financial",
  "passenger",
  "operations",
  "prestige",
];

export default function AchievementsSheet() {
  const earned = useEarnedAchievements();
  const airline = useAirline();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

  const color = airline?.color ?? Colors.sky;

  const earnedPoints = useMemo(
    () =>
      ACHIEVEMENTS.reduce(
        (sum, a) => (earned[a.id] !== undefined ? sum + a.points : sum),
        0,
      ),
    [earned],
  );

  const earnedCount = Object.keys(earned).length;

  // Group by category
  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      meta: CATEGORY_META[cat],
      achievements: ACHIEVEMENTS.filter((a) => a.category === cat),
    }));
  }, []);

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="trophy" size={20} color={PURPLE} />
          <Text style={s.title}>Achievements</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Points summary */}
      <View style={s.summary}>
        <View style={[s.summaryCard, { borderColor: PURPLE + "44" }]}>
          <Text style={[s.summaryPts, { color: PURPLE }]}>
            {earnedPoints.toLocaleString()}
          </Text>
          <Text style={s.summaryOf}>
            of {TOTAL_POINTS.toLocaleString()} pts
          </Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryPts, { color: Colors.sky }]}>
            {earnedCount}
          </Text>
          <Text style={s.summaryOf}>of {ACHIEVEMENTS.length} earned</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryPts, { color: Colors.green }]}>
            {Math.round((earnedCount / ACHIEVEMENTS.length) * 100)}%
          </Text>
          <Text style={s.summaryOf}>complete</Text>
        </View>
      </View>

      {/* Points bar */}
      <View style={s.barWrap}>
        <View style={s.barTrack}>
          <View
            style={[
              s.barFill,
              {
                width:
                  `${Math.round((earnedPoints / TOTAL_POINTS) * 100)}%` as any,
                backgroundColor: PURPLE,
              },
            ]}
          />
        </View>
      </View>

      <View style={s.divider} />

      {/* Achievement groups */}
      {grouped.map(({ cat, meta, achievements }) => {
        const catEarned = achievements.filter(
          (a) => earned[a.id] !== undefined,
        ).length;
        return (
          <View key={cat} style={s.group}>
            {/* Category header */}
            <View style={s.catHeader}>
              <View
                style={[s.catIconWrap, { backgroundColor: meta.color + "18" }]}
              >
                <Ionicons
                  name={meta.icon as any}
                  size={14}
                  color={meta.color}
                />
              </View>
              <Text style={[s.catLabel, { color: meta.color }]}>
                {meta.label}
              </Text>
              <Text style={s.catCount}>
                {catEarned}/{achievements.length}
              </Text>
            </View>

            {/* Achievement rows */}
            {achievements.map((achievement) => {
              const isEarned = earned[achievement.id] !== undefined;
              const dayEarned = earned[achievement.id];
              const isHidden = achievement.hidden && !isEarned;

              return (
                <View
                  key={achievement.id}
                  style={[
                    s.achRow,
                    isEarned && {
                      borderColor: meta.color + "33",
                      backgroundColor: meta.color + "06",
                    },
                    !isEarned && s.achRowLocked,
                  ]}
                >
                  {/* Icon */}
                  <View
                    style={[
                      s.achIcon,
                      {
                        backgroundColor: isEarned
                          ? meta.color + "20"
                          : "rgba(255,255,255,.04)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={(isHidden ? "help" : achievement.icon) as any}
                      size={18}
                      color={isEarned ? meta.color : Colors.dim}
                    />
                  </View>

                  {/* Text */}
                  <View style={s.achBody}>
                    <View style={s.achTitleRow}>
                      <Text
                        style={[s.achTitle, !isEarned && { color: Colors.dim }]}
                      >
                        {isHidden ? "???" : achievement.title}
                      </Text>
                      <View
                        style={[
                          s.ptsBadge,
                          {
                            backgroundColor: isEarned
                              ? meta.color + "18"
                              : "rgba(255,255,255,.04)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.ptsVal,
                            { color: isEarned ? meta.color : Colors.dim },
                          ]}
                        >
                          {achievement.points}pts
                        </Text>
                      </View>
                    </View>
                    {!isHidden && (
                      <Text
                        style={[s.achDesc, !isEarned && { color: Colors.dim }]}
                        numberOfLines={2}
                      >
                        {isEarned ? achievement.flavor : achievement.desc}
                      </Text>
                    )}
                    {isEarned && dayEarned !== undefined && (
                      <Text style={[s.achDay, { color: meta.color + "aa" }]}>
                        Earned on day {dayEarned}
                      </Text>
                    )}
                  </View>

                  {/* Check */}
                  {isEarned && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={meta.color}
                    />
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
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

  summary: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  summaryPts: { fontSize: 20, fontWeight: "700" },
  summaryOf: { fontSize: 9, color: Colors.dim, letterSpacing: 0.3 },

  barWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  barTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },

  group: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { fontSize: 12, fontWeight: "700", flex: 1 },
  catCount: { fontSize: 10, color: Colors.dim },

  achRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.02)",
  },
  achRowLocked: { opacity: 0.55 },
  achIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  achBody: { flex: 1, gap: 2, minWidth: 0 },
  achTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  achTitle: { fontSize: 13, color: Colors.text, fontWeight: "700", flex: 1 },
  ptsBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  ptsVal: { fontSize: 8, fontWeight: "700" },
  achDesc: { fontSize: 11, color: Colors.muted, lineHeight: 16 },
  achDay: { fontSize: 9, marginTop: 2 },
});
