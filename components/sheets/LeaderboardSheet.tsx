/**
 * components/sheets/LeaderboardSheet.tsx
 *
 * Global leaderboard — top 50 airlines by score.
 * Score = netWorth × 0.4 + demand_score × 1000 × 0.4 + reputation × 500 × 0.2
 *
 * Features:
 *   - Manual refresh button with last-updated timestamp
 *   - Loading indicator during fetch
 *   - Current player highlighted
 *   - Rank badge coloured by position (gold/silver/bronze/default)
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import { useAirline, useGameStore } from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

  // Sum achievement points from earned achievements
  const earnedIds = Object.keys(row.achievements ?? {});
  const achPoints = ACHIEVEMENTS.filter((a) => earnedIds.includes(a.id)).reduce(
    (s, a) => s + a.points,
    0,
  );

  return Math.round(
    netWorth * 0.35 +
      row.demand_score * 1000 * 0.35 +
      row.reputation * 500 * 0.15 +
      achPoints * 0.15,
  );
}

const RANK_COLORS: Record<number, string> = {
  1: "#F59E0B", // gold
  2: "#94A3B8", // silver
  3: "#CD7C4A", // bronze
};

function rankColor(rank: number): string {
  return RANK_COLORS[rank] ?? Colors.dim;
}

function RankBadge({ rank }: { rank: number }) {
  const color = rankColor(rank);
  const isTop = rank <= 3;
  return (
    <View
      style={[
        rb.badge,
        { backgroundColor: color + "18", borderColor: color + "44" },
      ]}
    >
      {isTop && <Ionicons name="trophy" size={9} color={color} />}
      <Text style={[rb.txt, { color }]}>#{rank}</Text>
    </View>
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
    paddingVertical: 2,
  },
  txt: { fontSize: 11, fontWeight: "700" },
});

function formatLastUpdated(date: Date | null): string {
  if (!date) return "Never";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function LeaderboardSheet() {
  const airline = useAirline();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const tabBarH = useTabBarHeight();

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
        .map((r: any) => ({ ...r, score: calcScore(r) }))
        .sort((a: LeaderRow, b: LeaderRow) => b.score - a.score);

      setRows(scored);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const myRank = airline ? rows.findIndex((r) => r.id === airline.id) + 1 : 0;

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
          <MaterialCommunityIcons
            name="trophy-outline"
            size={20}
            color={color}
          />
          <Text style={s.title}>Leaderboard</Text>
        </View>
        <View style={s.hdrR}>
          {/* Refresh button */}
          <TouchableOpacity
            style={[s.refreshBtn, { borderColor: color + "44" }]}
            onPress={fetchLeaderboard}
            disabled={loading}
            activeOpacity={0.7}
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

      {/* Last updated */}
      <View style={s.metaRow}>
        <Text style={s.lastUpdated}>
          Updated {formatLastUpdated(lastUpdated)}
        </Text>
        {myRank > 0 && (
          <View
            style={[
              s.myRankBadge,
              { borderColor: color + "44", backgroundColor: color + "12" },
            ]}
          >
            <Text style={[s.myRankTxt, { color }]}>You&apos;re #{myRank}</Text>
          </View>
        )}
      </View>

      <View style={s.divider} />

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <Ionicons name="warning-outline" size={14} color={Colors.red} />
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity onPress={fetchLeaderboard} style={s.retryBtn}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={color} size="large" />
          <Text style={s.loadingTxt}>Fetching rankings...</Text>
        </View>
      )}

      {/* Rows */}
      {rows.map((row, i) => {
        const rank = i + 1;
        const isMe = row.id === airline?.id;
        const rc = rankColor(rank);

        return (
          <View
            key={row.id}
            style={[
              s.row,
              isMe && {
                backgroundColor: color + "0a",
                borderColor: color + "33",
              },
            ]}
          >
            <RankBadge rank={rank} />

            {/* Airline colour dot */}
            <View
              style={[s.dot, { backgroundColor: row.color ?? Colors.sky }]}
            />

            {/* Name + score */}
            <View style={s.rowBody}>
              <Text style={[s.rowName, isMe && { color }]} numberOfLines={1}>
                {row.name}
                {isMe ? " (You)" : ""}
              </Text>
              <Text style={s.rowMeta}>
                {fmtCash(row.cash - row.loan)} net · {row.demand_score} routes ·{" "}
                {Object.keys(row.achievements ?? {}).length} achievements
              </Text>
            </View>

            {/* Score */}
            <Text
              style={[s.rowScore, { color: rank <= 3 ? rc : Colors.muted }]}
            >
              {row.score.toLocaleString()}
            </Text>
          </View>
        );
      })}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <View style={s.empty}>
          <MaterialCommunityIcons
            name="trophy-broken"
            size={40}
            color={Colors.dim}
          />
          <Text style={s.emptyTxt}>No rankings yet</Text>
        </View>
      )}

      {/* Score explanation */}
      {rows.length > 0 && (
        <View style={s.scoreNote}>
          <Ionicons
            name="information-circle-outline"
            size={12}
            color={Colors.dim}
          />
          <Text style={s.scoreNoteTxt}>
            Score = net worth × 0.4 + routes × 0.4 + reputation × 0.2
          </Text>
        </View>
      )}
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
    paddingBottom: Spacing.sm,
  },
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  hdrR: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  lastUpdated: { fontSize: 10, color: Colors.dim },
  myRankBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  myRankTxt: { fontSize: 11, fontWeight: "700" },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xs,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    backgroundColor: "rgba(248,113,113,.08)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.25)",
    padding: Spacing.sm,
  },
  errorTxt: { fontSize: 11, color: Colors.red, flex: 1 },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.red + "20",
    borderRadius: Radius.sm,
  },
  retryTxt: { fontSize: 10, color: Colors.red, fontWeight: "700" },

  loadingWrap: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingTxt: { fontSize: 12, color: Colors.dim },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    borderWidth: 0,
    borderRadius: 0,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontSize: 13, color: Colors.text, fontWeight: "600" },
  rowMeta: { fontSize: 9, color: Colors.dim },
  rowScore: { fontSize: 13, fontWeight: "700", flexShrink: 0 },

  empty: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyTxt: { fontSize: 12, color: Colors.dim },

  scoreNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    opacity: 0.6,
  },
  scoreNoteTxt: { fontSize: 9, color: Colors.dim, flex: 1 },
});
