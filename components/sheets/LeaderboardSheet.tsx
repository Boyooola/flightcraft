/**
 * components/sheets/LeaderboardSheet.tsx
 *
 * WorldWide Rush-style leaderboard.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import { useAIAirlines, useAirline, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface LeaderRow {
  id: string;
  name: string;
  color: string;
  cash: number;
  loan: number;
  demand_score: number;
  reputation: number;
  achievements: Record<string, number> | null;
  score: number;
}

function calcScore(row: Omit<LeaderRow, "score">): number {
  const netWorth = Math.max(0, row.cash - row.loan);
  const earnedIds = Object.keys(row.achievements ?? {});
  const achPoints = ACHIEVEMENTS.filter((a) => earnedIds.includes(a.id)).reduce(
    (sum, achievement) => sum + achievement.points,
    0,
  );

  return Math.round(
    netWorth * 0.35 +
      row.demand_score * 1000 * 0.35 +
      row.reputation * 500 * 0.15 +
      achPoints * 0.15,
  );
}

function rankColor(rank: number) {
  if (rank === 1) return "#F59E0B";
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7C4A";
  return Colors.dim;
}

function shortScore(score: number) {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000) return `${Math.round(score / 1_000)}K`;
  return score.toLocaleString();
}

function formatLastUpdated(date: Date | null) {
  if (!date) return "Never";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function RankBadge({ rank }: { rank: number }) {
  const color = rankColor(rank);
  const top = rank <= 3;

  return (
    <View
      style={[
        rb.badge,
        {
          backgroundColor: color + "18",
          borderColor: color + "44",
        },
      ]}
    >
      {top && <Ionicons name="trophy" size={9} color={color} />}
      <Text style={[rb.text, { color }]}>#{rank}</Text>
    </View>
  );
}

function LeaderRowCard({
  row,
  rank,
  isMe,
}: {
  row: LeaderRow;
  rank: number;
  isMe: boolean;
}) {
  const color = row.color ?? Colors.sky;
  const netWorth = Math.max(0, row.cash - row.loan);
  const isAI = row.name.endsWith(" ✦");

  return (
    <View
      style={[
        rowStyles.card,
        isMe && {
          borderColor: color + "55",
          backgroundColor: color + "0c",
        },
      ]}
    >
      <RankBadge rank={rank} />

      <View style={[rowStyles.dot, { backgroundColor: color }]} />

      <View style={rowStyles.body}>
        <View style={rowStyles.nameRow}>
          <Text style={[rowStyles.name, isMe && { color }]} numberOfLines={1}>
            {isAI ? row.name.slice(0, -2) : row.name}
            {isMe ? " (You)" : ""}
          </Text>

          {isAI && (
            <View style={rowStyles.aiBadge}>
              <Text style={rowStyles.aiText}>AI</Text>
            </View>
          )}
        </View>

        <Text style={rowStyles.meta} numberOfLines={1}>
          {fmtCash(netWorth)} net · {row.demand_score} cleared ·{" "}
          {Object.keys(row.achievements ?? {}).length} trophies
        </Text>
      </View>

      <View style={rowStyles.scoreBox}>
        <Text
          style={[
            rowStyles.score,
            {
              color: rank <= 3 ? rankColor(rank) : Colors.text,
            },
          ]}
        >
          {shortScore(row.score)}
        </Text>
        <Text style={rowStyles.scoreLabel}>score</Text>
      </View>
    </View>
  );
}

export default function LeaderboardSheet() {
  const airline = useAirline();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();
  const aiAirlines = useAIAirlines();

  const [tab, setTab] = useState<"global" | "rivals">("global");
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const color = airline?.color ?? Colors.sky;

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from("airlines")
        .select(
          "id, name, color, cash, loan, demand_score, reputation, achievements",
        )
        .order("cash", { ascending: false })
        .limit(50);

      if (err) throw new Error(err.message);

      const scored: LeaderRow[] = (data ?? [])
        .map((row: any) => ({
          ...row,
          score: calcScore(row),
        }))
        .sort((a: LeaderRow, b: LeaderRow) => b.score - a.score);

      setRows(scored.slice(0, 50));
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    if (rows.length === 0) return;

    const realRows = rows.filter((row) => !row.name.endsWith("✦"));
    const aiRows: LeaderRow[] = aiAirlines.map((ai) => ({
      id: ai.id,
      name: `${ai.name} ✦`,
      color: ai.color,
      cash: ai.cash,
      loan: ai.cash - ai.netWorth,
      demand_score: ai.demandScore,
      reputation: ai.reputation,
      achievements: null,
      score: ai.score,
    }));

    setRows(
      [...realRows, ...aiRows].sort((a, b) => b.score - a.score).slice(0, 50),
    );
  }, [aiAirlines]);

  const myRank = airline
    ? rows.findIndex((row) => row.id === airline.id) + 1
    : 0;
  const topRow = rows[0];

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
            <Text style={s.title}>Rank Rush</Text>
            <Text style={s.subtitle}>Climb by moving passengers</Text>
          </View>
        </View>

        <View style={s.hdrR}>
          <TouchableOpacity
            style={[s.refreshBtn, { borderColor: color + "44" }]}
            onPress={fetchLeaderboard}
            disabled={loading}
            activeOpacity={0.75}
          >
            {loading ? (
              <ActivityIndicator size="small" color={color} />
            ) : (
              <Ionicons name="refresh-outline" size={16} color={color} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={Colors.dim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.tabs}>
        {(["global", "rivals"] as const).map((value) => {
          const active = tab === value;

          return (
            <TouchableOpacity
              key={value}
              style={[s.tab, active && { borderColor: color + "44" }]}
              onPress={() => setTab(value)}
              activeOpacity={0.82}
            >
              <Text style={[s.tabText, { color: active ? color : Colors.dim }]}>
                {value === "global" ? "Global" : `Rivals ${aiAirlines.length}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[s.hero, { borderColor: color + "44" }]}>
        <View>
          <Text style={s.heroLabel}>YOUR RANK</Text>
          <Text style={[s.heroValue, { color }]}>
            {myRank > 0 ? `#${myRank}` : "—"}
          </Text>
          <Text style={s.heroSub}>
            Updated {formatLastUpdated(lastUpdated)}
          </Text>
        </View>

        {topRow && (
          <View style={s.topBox}>
            <Text style={s.topLabel}>TOP AIRLINE</Text>
            <Text style={s.topName} numberOfLines={1}>
              {topRow.name.replace(" ✦", "")}
            </Text>
            <Text style={s.topScore}>{shortScore(topRow.score)} score</Text>
          </View>
        )}
      </View>

      {tab === "rivals" ? (
        <View style={s.section}>
          {aiAirlines.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={Colors.dim} />
              <Text style={s.emptyTitle}>No rivals yet</Text>
              <Text style={s.emptySub}>Add AI rivals during setup.</Text>
            </View>
          ) : (
            [...aiAirlines]
              .sort((a, b) => b.score - a.score)
              .map((ai, index) => {
                const rank = index + 1;

                return (
                  <View key={ai.id} style={s.rivalCard}>
                    <RankBadge rank={rank} />
                    <View style={[s.rivalDot, { backgroundColor: ai.color }]} />

                    <View style={s.rivalBody}>
                      <Text style={s.rivalName}>{ai.name}</Text>
                      <Text style={s.rivalMeta}>
                        {ai.routeCount} routes · {ai.hubIatas.length} hubs ·
                        trust {ai.trust}%
                      </Text>
                    </View>

                    <Text style={[s.rivalScore, { color: ai.color }]}>
                      {shortScore(ai.score)}
                    </Text>
                  </View>
                );
              })
          )}
        </View>
      ) : (
        <View style={s.section}>
          {error && (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={14} color={Colors.red} />
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchLeaderboard}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && rows.length === 0 && (
            <View style={s.loading}>
              <ActivityIndicator color={color} size="large" />
              <Text style={s.loadingText}>Fetching rankings...</Text>
            </View>
          )}

          {rows.map((row, index) => (
            <LeaderRowCard
              key={row.id}
              row={row}
              rank={index + 1}
              isMe={row.id === airline?.id}
            />
          ))}

          {!loading && !error && rows.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="trophy-outline" size={40} color={Colors.dim} />
              <Text style={s.emptyTitle}>No rankings yet</Text>
              <Text style={s.emptySub}>Play more to appear on the board.</Text>
            </View>
          )}

          {rows.length > 0 && (
            <View style={s.note}>
              <Ionicons
                name="information-circle-outline"
                size={13}
                color={Colors.dim}
              />
              <Text style={s.noteText}>
                Score rewards net worth, cleared demand, reputation, and
                trophies.
              </Text>
            </View>
          )}
        </View>
      )}
    </BottomSheetScrollView>
  );
}

const rb = StyleSheet.create({
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

const rowStyles = StyleSheet.create({
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
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  name: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  aiBadge: {
    borderRadius: Radius.sm,
    backgroundColor: "rgba(255,255,255,.08)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  aiText: {
    fontSize: 7,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  meta: {
    fontSize: 9,
    color: Colors.dim,
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
  hdrR: {
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
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "900",
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 3,
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
  topBox: {
    maxWidth: "55%",
    alignItems: "flex-end",
  },
  topLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.4,
    fontWeight: "900",
  },
  topName: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
    marginTop: 2,
  },
  topScore: {
    fontSize: 10,
    color: Colors.green,
    marginTop: 1,
    fontWeight: "800",
  },

  section: {
    paddingHorizontal: Spacing.lg,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    backgroundColor: Colors.red + "08",
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: Colors.red,
  },
  retryText: {
    fontSize: 11,
    color: Colors.red,
    fontWeight: "900",
  },
  loading: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.dim,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
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
    color: Colors.dim,
    lineHeight: 15,
  },

  rivalCard: {
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
  rivalDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  rivalBody: {
    flex: 1,
    gap: 2,
  },
  rivalName: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  rivalMeta: {
    fontSize: 9,
    color: Colors.dim,
  },
  rivalScore: {
    fontSize: 15,
    fontWeight: "900",
  },
});
