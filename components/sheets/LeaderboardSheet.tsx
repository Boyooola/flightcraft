/**
 * components/sheets/LeaderboardSheet.tsx
 *
 * Rival board + Google Play Games integration.
 *
 * - Google Play Games handles:
 *   • Real player leaderboard
 *   • Achievements
 *
 * - This sheet handles:
 *   • AI rival rankings
 *   • Rival progression
 *   • In-world competition
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import {
  showAchievements,
  showLeaderboard,
  usePlayGames,
} from "@/hooks/usePlayGames";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { fmtCash } from "@/lib/revenue";
import { useAIAirlines, useAirline, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RivalRow {
  id: string;
  name: string;
  color: string;
  cash: number;
  netWorth: number;
  reputation: number;
  demandScore: number;
  score: number;
}

function shortScore(score: number) {
  if (score >= 1_000_000) {
    return `${(score / 1_000_000).toFixed(1)}M`;
  }

  if (score >= 1_000) {
    return `${Math.round(score / 1_000)}K`;
  }

  return score.toLocaleString();
}

function rankColor(rank: number) {
  if (rank === 1) return "#F59E0B";
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7C4A";
  return Colors.dim;
}

function RankBadge({ rank }: { rank: number }) {
  const color = rankColor(rank);

  return (
    <View
      style={[
        rankStyles.badge,
        {
          backgroundColor: color + "18",
          borderColor: color + "44",
        },
      ]}
    >
      {rank <= 3 && <Ionicons name="trophy" size={9} color={color} />}

      <Text style={[rankStyles.text, { color }]}>#{rank}</Text>
    </View>
  );
}

function PlayGamesCard() {
  const { isSignedIn, signIn, player } = usePlayGames();

  return (
    <View style={pg.card}>
      <View style={pg.header}>
        <View style={pg.icon}>
          <Ionicons name="game-controller" size={20} color={Colors.sky} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={pg.title}>Google Play Games</Text>

          <Text style={pg.subtitle}>
            {isSignedIn
              ? `Signed in as ${player?.displayName ?? "Pilot"}`
              : "Connect to compete globally"}
          </Text>
        </View>
      </View>

      {isSignedIn ? (
        <View style={pg.actions}>
          <TouchableOpacity
            style={pg.button}
            activeOpacity={0.82}
            onPress={showLeaderboard}
          >
            <Ionicons name="trophy-outline" size={16} color={Colors.text} />

            <Text style={pg.buttonText}>Global Rankings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={pg.button}
            activeOpacity={0.82}
            onPress={showAchievements}
          >
            <Ionicons name="star-outline" size={16} color={Colors.text} />

            <Text style={pg.buttonText}>Achievements</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={pg.signInBtn}
          activeOpacity={0.82}
          onPress={signIn}
        >
          <Ionicons
            name="logo-google-playstore"
            size={16}
            color={Colors.text}
          />

          <Text style={pg.signInText}>Sign in with Play Games</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RivalCard({ row, rank }: { row: RivalRow; rank: number }) {
  return (
    <View style={r.card}>
      <RankBadge rank={rank} />

      <View style={[r.dot, { backgroundColor: row.color || Colors.sky }]} />

      <View style={r.body}>
        <View style={r.nameRow}>
          <Text numberOfLines={1} style={r.name}>
            {row.name}
          </Text>

          <View style={r.aiBadge}>
            <Text style={r.aiText}>AI</Text>
          </View>
        </View>

        <Text numberOfLines={1} style={r.meta}>
          {fmtCash(row.netWorth)} net worth · {row.demandScore} demand ·{" "}
          {row.reputation}% reputation
        </Text>
      </View>

      <View style={r.scoreBox}>
        <Text
          style={[
            r.score,
            {
              color: rank <= 3 ? rankColor(rank) : Colors.text,
            },
          ]}
        >
          {shortScore(row.score)}
        </Text>

        <Text style={r.scoreLabel}>score</Text>
      </View>
    </View>
  );
}

export default function LeaderboardSheet() {
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

  const airline = useAirline();
  const aiAirlines = useAIAirlines();

  const color = airline?.color ?? Colors.sky;

  const rivals = useMemo(() => {
    return [...aiAirlines]
      .sort((a, b) => b.score - a.score)
      .map((ai) => ({
        id: ai.id,
        name: ai.name,
        color: ai.color,
        cash: ai.cash,
        netWorth: ai.netWorth,
        reputation: ai.reputation,
        demandScore: ai.demandScore,
        score: ai.score,
      }));
  }, [aiAirlines]);

  const topRival = rivals[0];

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        {
          paddingBottom: tabBarH + Spacing.xxl,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="speedometer-outline" size={22} color={color} />

          <View>
            <Text style={s.title}>Rival Rankings</Text>

            <Text style={s.subtitle}>Compete against simulated airlines</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{
            top: 12,
            bottom: 12,
            left: 12,
            right: 12,
          }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <PlayGamesCard />

      <View
        style={[
          s.hero,
          {
            borderColor: color + "44",
          },
        ]}
      >
        <View>
          <Text style={s.heroLabel}>TOP RIVAL</Text>

          <Text
            style={[
              s.heroValue,
              {
                color: topRival?.color ?? Colors.sky,
              },
            ]}
          >
            #1
          </Text>

          <Text style={s.heroSub}>
            {rivals.length} rival
            {rivals.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {topRival && (
          <View style={s.heroRight}>
            <Text style={s.heroRightLabel}>DOMINATING AIRLINE</Text>

            <Text style={s.heroRightName} numberOfLines={1}>
              {topRival.name}
            </Text>

            <Text style={s.heroRightScore}>
              {shortScore(topRival.score)} score
            </Text>
          </View>
        )}
      </View>

      <View style={s.section}>
        {rivals.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="trophy-outline" size={40} color={Colors.dim} />

            <Text style={s.emptyTitle}>No rivals yet</Text>

            <Text style={s.emptySub}>Add AI airlines during game setup.</Text>
          </View>
        ) : (
          rivals.map((row, index) => (
            <RivalCard key={row.id} row={row} rank={index + 1} />
          ))
        )}

        <View style={s.note}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={Colors.dim}
          />

          <Text style={s.noteText}>
            Global rankings and achievements are handled through Google Play
            Games.
          </Text>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}

const rankStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  text: {
    fontSize: 11,
    fontWeight: "900",
  },
});

const pg = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  icon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: Colors.sky + "18",
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 14,
    fontWeight: "900",
    color: Colors.text,
  },

  subtitle: {
    fontSize: 11,
    color: Colors.dim,
    marginTop: 2,
  },

  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(255,255,255,.05)",
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
  },

  buttonText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.text,
  },

  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.sky + "18",
    borderWidth: 1,
    borderColor: Colors.sky + "44",
    paddingVertical: 12,
  },

  signInText: {
    fontSize: 12,
    fontWeight: "900",
    color: Colors.text,
  },
});

const r = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },

  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  body: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: Colors.text,
  },

  meta: {
    fontSize: 9,
    color: Colors.dim,
    marginTop: 2,
  },

  aiBadge: {
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,.08)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  aiText: {
    fontSize: 7,
    fontWeight: "900",
    color: Colors.dim,
    letterSpacing: 0.5,
  },

  scoreBox: {
    alignItems: "flex-end",
  },

  score: {
    fontSize: 15,
    fontWeight: "900",
  },

  scoreLabel: {
    fontSize: 8,
    color: Colors.dim,
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
  },

  content: {
    paddingBottom: Spacing.xxl,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.text,
  },

  subtitle: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 1,
  },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
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
  },

  heroSub: {
    fontSize: 10,
    color: Colors.dim,
  },

  heroRight: {
    maxWidth: "55%",
    alignItems: "flex-end",
  },

  heroRightLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.4,
    fontWeight: "900",
  },

  heroRightName: {
    fontSize: 13,
    fontWeight: "900",
    color: Colors.text,
    marginTop: 2,
  },

  heroRightScore: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.green,
    marginTop: 1,
  },

  section: {
    paddingHorizontal: Spacing.lg,
  },

  empty: {
    alignItems: "center",
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.sm,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: Colors.text,
  },

  emptySub: {
    fontSize: 11,
    color: Colors.dim,
    textAlign: "center",
  },

  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
    opacity: 0.75,
  },

  noteText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: Colors.dim,
  },
});
