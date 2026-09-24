/**
 * Local AI rival standings with a gateway to Google Play competition.
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
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface RivalRow {
  id: string;
  name: string;
  color: string;
  netWorth: number;
  reputation: number;
  demandScore: number;
  score: number;
}

function shortScore(score: number) {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000) return `${Math.round(score / 1_000)}K`;
  return score.toLocaleString();
}

function rankTheme(rank: number) {
  if (rank === 1) {
    return { color: Colors.amber, surface: Palette.orangeSoft };
  }

  if (rank === 2) {
    return { color: Colors.muted, surface: Colors.inset };
  }

  if (rank === 3) {
    return { color: "#A65F32", surface: "#F3E3D7" };
  }

  return { color: Colors.muted, surface: Palette.cloud };
}

function RankBadge({ rank }: { rank: number }) {
  const theme = rankTheme(rank);

  return (
    <View style={[rankStyles.badge, { backgroundColor: theme.surface }]}>
      {rank <= 3 ? (
        <Ionicons name="medal-outline" size={13} color={theme.color} />
      ) : (
        <Text style={rankStyles.hash}>#</Text>
      )}
      <Text style={[rankStyles.value, { color: theme.color }]}>{rank}</Text>
    </View>
  );
}

function PlayGamesCard() {
  const { status, isSignedIn, signIn, player } = usePlayGames();
  const isConnecting = status === "signing-in";
  const failed = status === "failed";

  return (
    <View style={playStyles.card}>
      <View style={playStyles.header}>
        <View style={playStyles.icon}>
          <Ionicons
            name="game-controller-outline"
            size={22}
            color={Colors.sky}
          />
        </View>

        <View style={playStyles.headerCopy}>
          <Text style={playStyles.eyebrow}>ONLINE COMPETITION</Text>
          <Text style={playStyles.title}>Google Play Games</Text>
          <Text style={[playStyles.subtitle, failed && { color: Colors.red }]}>
            {isSignedIn
              ? `Connected as ${player?.displayName ?? "Pilot"}`
              : isConnecting
                ? "Connecting your pilot profile…"
                : failed
                  ? "Could not connect. You can try again."
                  : "Connect to compare net worth with real players."}
          </Text>
        </View>

        <View
          style={[
            playStyles.connectionDot,
            {
              backgroundColor: isSignedIn
                ? Colors.green
                : failed
                  ? Colors.red
                  : Colors.dim,
            },
          ]}
        />
      </View>

      {isSignedIn ? (
        <View style={playStyles.actions}>
          <TouchableOpacity
            accessibilityLabel="Open global airline rankings"
            accessibilityRole="button"
            style={playStyles.primaryButton}
            activeOpacity={0.85}
            onPress={showLeaderboard}
          >
            <Ionicons
              name="earth-outline"
              size={17}
              color={Colors.textOnColor}
            />
            <Text style={playStyles.primaryButtonText}>Global rankings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Open Google Play achievements"
            accessibilityRole="button"
            style={playStyles.secondaryButton}
            activeOpacity={0.85}
            onPress={showAchievements}
          >
            <Ionicons name="ribbon-outline" size={17} color={Colors.skyDark} />
            <Text style={playStyles.secondaryButtonText}>Achievements</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          accessibilityLabel={
            failed ? "Retry Play Games sign in" : "Sign in to Play Games"
          }
          accessibilityRole="button"
          style={[
            playStyles.signInButton,
            isConnecting && playStyles.disabledButton,
          ]}
          activeOpacity={0.85}
          onPress={signIn}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={Colors.textOnColor} />
          ) : (
            <Ionicons
              name="logo-google-playstore"
              size={17}
              color={Colors.textOnColor}
            />
          )}
          <Text style={playStyles.signInText}>
            {isConnecting
              ? "Connecting…"
              : failed
                ? "Try again"
                : "Connect Play Games"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RivalCard({ row, rank }: { row: RivalRow; rank: number }) {
  const isPodium = rank <= 3;

  return (
    <View style={[rivalStyles.card, isPodium && rivalStyles.podiumCard]}>
      <RankBadge rank={rank} />

      <View
        style={[
          rivalStyles.airlineMark,
          { backgroundColor: row.color || Colors.sky },
        ]}
      >
        <Ionicons name="airplane" size={14} color={Colors.textOnColor} />
      </View>

      <View style={rivalStyles.body}>
        <View style={rivalStyles.nameRow}>
          <Text numberOfLines={1} style={rivalStyles.name}>
            {row.name}
          </Text>
          <View style={rivalStyles.aiBadge}>
            <Text style={rivalStyles.aiText}>AI RIVAL</Text>
          </View>
        </View>

        <Text numberOfLines={1} style={rivalStyles.meta}>
          {fmtCash(row.netWorth)} net worth · {row.demandScore} demand ·{" "}
          {row.reputation}% rep
        </Text>
      </View>

      <View style={rivalStyles.scoreBox}>
        <Text
          style={[
            rivalStyles.score,
            { color: isPodium ? rankTheme(rank).color : Colors.text },
          ]}
        >
          {shortScore(row.score)}
        </Text>
        <Text style={rivalStyles.scoreLabel}>LEAGUE SCORE</Text>
      </View>
    </View>
  );
}

export default function LeaderboardSheet() {
  const closeSheet = useGameStore((state) => state.closeSheet);
  const tabBarHeight = useTabBarHeight();
  const airline = useAirline();
  const aiAirlines = useAIAirlines();

  const color = airline?.color ?? Colors.sky;

  const rivals = useMemo<RivalRow[]>(
    () =>
      [...aiAirlines]
        .sort((first, second) => second.score - first.score)
        .map((rival) => ({
          id: rival.id,
          name: rival.name,
          color: rival.color,
          netWorth: rival.netWorth,
          reputation: rival.reputation,
          demandScore: rival.demandScore,
          score: rival.score,
        })),
    [aiAirlines],
  );

  const topRival = rivals[0];

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
          <Ionicons name="podium-outline" size={21} color={color} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>COMPETITION</Text>
          <Text style={styles.screenTitle}>Rankings</Text>
          <Text style={styles.subtitle}>Local rivals and global players</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close rankings"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <PlayGamesCard />

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionLabel}>LOCAL AI LEAGUE</Text>
          <Text style={styles.sectionHint}>
            Rivals grow as your game advances
          </Text>
        </View>
        <View style={styles.rivalCount}>
          <Text style={styles.rivalCountValue}>{rivals.length}</Text>
          <Text style={styles.rivalCountLabel}>RIVALS</Text>
        </View>
      </View>

      {topRival && (
        <View style={[styles.leaderCard, { borderLeftColor: topRival.color }]}>
          <View style={styles.leaderCrown}>
            <Ionicons name="trophy" size={21} color={Colors.amber} />
          </View>

          <View style={styles.leaderCopy}>
            <Text style={styles.leaderLabel}>CURRENT LEAGUE LEADER</Text>
            <Text style={styles.leaderName} numberOfLines={1}>
              {topRival.name}
            </Text>
            <Text style={styles.leaderMeta}>
              {fmtCash(topRival.netWorth)} net worth · {topRival.reputation}%
              reputation
            </Text>
          </View>

          <View style={styles.leaderScoreBox}>
            <Text style={styles.leaderScore}>{shortScore(topRival.score)}</Text>
            <Text style={styles.leaderScoreLabel}>SCORE</Text>
          </View>
        </View>
      )}

      <View style={styles.rankingsSection}>
        {rivals.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={24} color={Colors.sky} />
            </View>
            <Text style={styles.emptyTitle}>No local rivals</Text>
            <Text style={styles.emptyText}>
              AI airlines can be added when creating a new game.
            </Text>
          </View>
        ) : (
          <View style={styles.rivalList}>
            {rivals.map((rival, index) => (
              <RivalCard key={rival.id} row={rival} rank={index + 1} />
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
            Local league scores track simulated rivals. Real-player rankings use
            your submitted net worth in Google Play Games.
          </Text>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}

const rankStyles = StyleSheet.create({
  badge: {
    width: 42,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: Radius.full,
  },
  hash: {
    color: Colors.dim,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
  },
  value: {
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
});

const playStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Palette.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: Colors.skyDark,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Palette.blueSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(23,105,170,0.20)",
    paddingHorizontal: Spacing.sm,
  },
  secondaryButtonText: {
    color: Colors.skyDark,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  signInButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  disabledButton: {
    opacity: 0.6,
  },
  signInText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
});

const rivalStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  podiumCard: {
    backgroundColor: Palette.paper,
    borderColor: Colors.borderSection,
  },
  airlineMark: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  name: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: Typography.weight.bold,
  },
  aiBadge: {
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  aiText: {
    color: Colors.muted,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.5,
  },
  meta: {
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: Spacing.xxs,
  },
  scoreBox: {
    alignItems: "flex-end",
  },
  score: {
    fontFamily: Typography.mono,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  scoreLabel: {
    color: Colors.dim,
    fontSize: 6,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.5,
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
  sectionHeading: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
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
  rivalCount: {
    alignItems: "flex-end",
  },
  rivalCountValue: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  rivalCountLabel: {
    color: Colors.dim,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.7,
  },
  leaderCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    padding: Spacing.md,
    ...Shadow.card,
  },
  leaderCrown: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Palette.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  leaderLabel: {
    color: Colors.amber,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  leaderName: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  leaderMeta: {
    color: Colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: Spacing.xxs,
  },
  leaderScoreBox: {
    alignItems: "flex-end",
  },
  leaderScore: {
    color: Colors.amber,
    fontFamily: Typography.mono,
    fontSize: 17,
    fontWeight: Typography.weight.bold,
  },
  leaderScoreLabel: {
    color: Colors.dim,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.7,
  },
  rankingsSection: {
    paddingHorizontal: Spacing.lg,
  },
  rivalList: {
    gap: Spacing.sm,
  },
  emptyState: {
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
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
