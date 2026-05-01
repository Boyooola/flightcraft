/**
 * components/sheets/AchievementsSheet.tsx
 *
 * Worldwide Rush-style achievements sheet.
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
  pioneer: { label: "Start Rush", icon: "rocket-outline", color: Colors.sky },
  passenger: {
    label: "Passenger Flow",
    icon: "people-outline",
    color: Colors.green,
  },
  network: {
    label: "Route Web",
    icon: "git-network-outline",
    color: Colors.sky,
  },
  fleet: {
    label: "Fleet Power",
    icon: "airplane-outline",
    color: Colors.amber,
  },
  operations: {
    label: "Smooth Flow",
    icon: "flash-outline",
    color: Colors.orange,
  },
  financial: { label: "Cash Rush", icon: "cash-outline", color: Colors.green },
  missions: { label: "Contracts", icon: "checkbox-outline", color: PURPLE },
  prestige: { label: "Prestige", icon: "trophy-outline", color: PURPLE },
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

export default function AchievementsSheet() {
  const earned = useEarnedAchievements();
  const airline = useAirline();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

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

  const earnedCount = ACHIEVEMENTS.filter(
    (achievement) => earned[achievement.id] !== undefined,
  ).length;

  const progressPct = Math.round(
    (earnedPoints / Math.max(1, TOTAL_POINTS)) * 100,
  );

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const achievements = ACHIEVEMENTS.filter(
        (achievement) => achievement.category === category,
      );

      const sortedAchievements = [...achievements].sort((a, b) => {
        const aEarned = earned[a.id] !== undefined;
        const bEarned = earned[b.id] !== undefined;

        if (aEarned !== bEarned) return aEarned ? -1 : 1;
        return a.points - b.points;
      });

      return {
        category,
        meta: CATEGORY_META[category],
        achievements: sortedAchievements,
      };
    }).filter((group) => group.achievements.length > 0);
  }, [earned]);

  const latestEarned = useMemo(() => {
    return ACHIEVEMENTS.filter((a) => earned[a.id] !== undefined)
      .sort((a, b) => (earned[b.id] ?? 0) - (earned[a.id] ?? 0))
      .slice(0, 3);
  }, [earned]);

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <View>
            <Text style={s.title}>Trophy Rush</Text>
            <Text style={s.subtitle}>Clear goals, earn points</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View style={[s.hero, { borderColor: color + "44" }]}>
        <View>
          <Text style={s.heroLabel}>TROPHY PROGRESS</Text>
          <Text style={[s.heroValue, { color }]}>{progressPct}%</Text>
          <Text style={s.heroSub}>
            {earnedPoints.toLocaleString()} / {TOTAL_POINTS.toLocaleString()}{" "}
            pts
          </Text>
        </View>

        <View style={s.heroRight}>
          <Text style={[s.heroCount, { color: Colors.green }]}>
            {earnedCount}
          </Text>
          <Text style={s.heroCountLbl}>earned</Text>
        </View>
      </View>

      <View style={s.barWrap}>
        <View style={s.barTrack}>
          <View
            style={[
              s.barFill,
              {
                width: `${progressPct}%` as any,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </View>

      {latestEarned.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>LATEST CLEARS</Text>
          {latestEarned.map((achievement) => {
            const meta = CATEGORY_META[achievement.category];
            return (
              <View key={achievement.id} style={s.latestRow}>
                <View
                  style={[s.latestIcon, { backgroundColor: meta.color + "18" }]}
                >
                  <Ionicons
                    name={achievement.icon as any}
                    size={15}
                    color={meta.color}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.latestTitle}>{achievement.title}</Text>
                  <Text style={s.latestSub}>
                    Day {earned[achievement.id]} · {achievement.points} pts
                  </Text>
                </View>

                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={Colors.green}
                />
              </View>
            );
          })}
        </View>
      )}

      <View style={s.divider} />

      {grouped.map(({ category, meta, achievements }) => {
        const catEarned = achievements.filter(
          (achievement) => earned[achievement.id] !== undefined,
        ).length;

        const catPct = Math.round(
          (catEarned / Math.max(1, achievements.length)) * 100,
        );

        return (
          <View key={category} style={s.group}>
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

              <View style={{ flex: 1 }}>
                <Text style={[s.catLabel, { color: meta.color }]}>
                  {meta.label}
                </Text>
                <View style={s.catBar}>
                  <View
                    style={[
                      s.catBarFill,
                      {
                        width: `${catPct}%` as any,
                        backgroundColor: meta.color,
                      },
                    ]}
                  />
                </View>
              </View>

              <Text style={s.catCount}>
                {catEarned}/{achievements.length}
              </Text>
            </View>

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
                      borderColor: meta.color + "44",
                      backgroundColor: meta.color + "07",
                    },
                    !isEarned && s.lockedRow,
                  ]}
                >
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

                  <View style={s.achBody}>
                    <View style={s.achTop}>
                      <Text
                        style={[s.achTitle, !isEarned && { color: Colors.dim }]}
                        numberOfLines={1}
                      >
                        {isHidden ? "Hidden Rush Goal" : achievement.title}
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
                            s.ptsText,
                            { color: isEarned ? meta.color : Colors.dim },
                          ]}
                        >
                          {achievement.points}
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
                      <Text style={[s.earnedText, { color: meta.color }]}>
                        Cleared on day {dayEarned}
                      </Text>
                    )}
                  </View>

                  {isEarned ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={meta.color}
                    />
                  ) : (
                    <Ionicons name="lock-closed" size={15} color={Colors.dim} />
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
  hdrL: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },

  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  heroValue: {
    fontSize: 34,
    fontWeight: "900",
    marginTop: 2,
  },
  heroSub: {
    fontSize: 10,
    color: Colors.dim,
  },
  heroRight: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.045)",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  heroCount: {
    fontSize: 22,
    fontWeight: "900",
  },
  heroCountLbl: {
    fontSize: 9,
    color: Colors.dim,
  },

  barWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  barTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },

  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.2,
    fontWeight: "900",
    marginBottom: Spacing.sm,
  },
  latestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  latestIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  latestTitle: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  latestSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },

  group: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  catIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: {
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  catBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,.07)",
    borderRadius: 999,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  catCount: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "800",
  },

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
  lockedRow: {
    opacity: 0.55,
  },
  achIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  achBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  achTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  achTitle: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
    flex: 1,
  },
  ptsBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ptsText: {
    fontSize: 8,
    fontWeight: "900",
  },
  achDesc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  earnedText: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: "700",
  },
});
