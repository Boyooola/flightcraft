/**
 * Local airline standings and the Google Play global ranking gateway.
 *
 * Every local airline uses the same comparison: cash minus outstanding loans.
 * The screen intentionally avoids synthetic scores and decorative podium UI.
 */

import {
  AirlineBrandMark,
  type AirlineLogoId,
} from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import {
  showAchievements,
  showLeaderboard,
  usePlayGames,
} from "@/hooks/usePlayGames";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { fmtCash } from "@/lib/revenue";
import {
  useAIAirlines,
  useAirline,
  useGameStore,
  useHubs,
  useRoutes,
  useTodayCash,
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

interface Standing {
  id: string;
  name: string;
  code: string;
  logoId: AirlineLogoId;
  primaryColor: string;
  secondaryColor: string;
  isPlayer: boolean;
  description: string;
  netWorth: number;
  dailyResult: number;
  routeCount: number;
  hubCount: number;
}

function signedCash(value: number) {
  return value > 0 ? `+${fmtCash(value)}` : fmtCash(value);
}

function plural(value: number, singular: string) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

function StandingRow({ standing, rank }: { standing: Standing; rank: number }) {
  const dailyColor =
    standing.dailyResult > 0
      ? Colors.green
      : standing.dailyResult < 0
        ? Colors.red
        : Colors.muted;

  return (
    <View
      accessibilityLabel={`${rank}. ${standing.name}, ${standing.code}. Net worth ${fmtCash(standing.netWorth)}. Daily result ${signedCash(standing.dailyResult)}.`}
      style={[styles.standingRow, standing.isPlayer && styles.playerRow]}
    >
      <Text style={[styles.rank, standing.isPlayer && styles.playerRank]}>
        {rank}
      </Text>

      <AirlineBrandMark
        accessibilityLabel=""
        logoId={standing.logoId}
        primary={standing.primaryColor}
        secondary={standing.secondaryColor}
        size={38}
        variant="leaderboard"
      />

      <View style={styles.airlineDetails}>
        <Text numberOfLines={1} style={styles.airlineName}>
          {standing.name}
        </Text>
        <Text numberOfLines={2} style={styles.airlineMeta}>
          {standing.code} · {standing.description} ·{" "}
          {plural(standing.routeCount, "route")} ·{" "}
          {plural(standing.hubCount, "hub")}
        </Text>
      </View>

      <View style={styles.financeValues}>
        <Text style={styles.netWorth}>{fmtCash(standing.netWorth)}</Text>
        <Text style={[styles.dailyResult, { color: dailyColor }]}>
          {signedCash(standing.dailyResult)} today
        </Text>
      </View>
    </View>
  );
}

function GlobalRankings() {
  const { status, isSignedIn, signIn, player } = usePlayGames();
  const isConnecting = status === "signing-in";
  const failed = status === "failed";

  const statusText = isSignedIn
    ? `Connected as ${player?.displayName ?? "Pilot"}`
    : isConnecting
      ? "Connecting your pilot profile..."
      : failed
        ? "Unable to connect. Check your connection and try again."
        : "Connect to compare your net worth with other players.";

  return (
    <View style={styles.globalSection}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionTitleCopy}>
          <Text style={styles.sectionTitle}>Global rankings</Text>
          <Text style={[styles.sectionDescription, failed && styles.errorText]}>
            {statusText}
          </Text>
        </View>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name="game-controller-outline"
          size={21}
          color={isSignedIn ? Colors.green : failed ? Colors.red : Colors.muted}
        />
      </View>

      {isSignedIn ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityLabel="View global airline rankings"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={showLeaderboard}
            style={styles.primaryButton}
          >
            <Ionicons
              name="earth-outline"
              size={18}
              color={Colors.textOnColor}
            />
            <Text style={styles.primaryButtonText}>View rankings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="View Google Play achievements"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={showAchievements}
            style={styles.secondaryButton}
          >
            <Ionicons name="ribbon-outline" size={18} color={Colors.skyDark} />
            <Text style={styles.secondaryButtonText}>Achievements</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          accessibilityLabel={
            failed
              ? "Retry Google Play Games connection"
              : "Connect Google Play Games"
          }
          accessibilityRole="button"
          accessibilityState={{ busy: isConnecting, disabled: isConnecting }}
          activeOpacity={0.7}
          disabled={isConnecting}
          onPress={signIn}
          style={[
            styles.primaryButton,
            styles.connectButton,
            isConnecting && styles.disabledButton,
          ]}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={Colors.textOnColor} />
          ) : (
            <Ionicons
              name="logo-google-playstore"
              size={18}
              color={Colors.textOnColor}
            />
          )}
          <Text style={styles.primaryButtonText}>
            {isConnecting
              ? "Connecting..."
              : failed
                ? "Try again"
                : "Connect Play Games"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function LeaderboardSheet() {
  const closeSheet = useGameStore((state) => state.closeSheet);
  const tabBarHeight = useTabBarHeight();
  const airline = useAirline();
  const aiAirlines = useAIAirlines();
  const routes = useRoutes();
  const hubs = useHubs();
  const todayCash = useTodayCash();

  const standings = useMemo<Standing[]>(() => {
    const defaultPalette = getAirlinePalette("aviation-blue");
    const player: Standing = {
      id: airline?.id ?? "player",
      name: airline?.name ?? "Your airline",
      code: airline?.airline_code ?? "AIR",
      logoId: airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID,
      primaryColor: airline?.color ?? defaultPalette.primary,
      secondaryColor: airline?.secondary_color ?? defaultPalette.secondary,
      isPlayer: true,
      description: "Your airline",
      netWorth: (airline?.cash ?? 0) - (airline?.loan ?? 0),
      dailyResult: todayCash,
      routeCount: routes.filter((route) => route.active).length,
      hubCount: hubs.length,
    };

    const rivals: Standing[] = aiAirlines.map((rival) => ({
      id: rival.id,
      name: rival.name,
      code: rival.code,
      logoId: rival.logoId,
      primaryColor: rival.color,
      secondaryColor: rival.secondaryColor,
      isPlayer: false,
      description: `${rival.difficulty[0].toUpperCase()}${rival.difficulty.slice(1)} rival`,
      netWorth: rival.cash - rival.loan,
      dailyResult: rival.dailyProfit,
      routeCount: rival.routeCount,
      hubCount: rival.hubIatas.length,
    }));

    return [player, ...rivals].sort((first, second) => {
      const worthDifference = second.netWorth - first.netWorth;
      if (worthDifference !== 0) return worthDifference;
      return second.dailyResult - first.dailyResult;
    });
  }, [aiAirlines, airline, hubs.length, routes, todayCash]);

  const playerIndex = standings.findIndex((standing) => standing.isPlayer);
  const playerRank = playerIndex + 1;
  const leader = standings[0];
  const player = standings[playerIndex];
  const leaderGap = leader && player ? leader.netWorth - player.netWorth : 0;
  const positionDetail =
    playerRank === 1
      ? "Leading the local market"
      : leader
        ? `${fmtCash(leaderGap)} behind ${leader.name}`
        : "No local competition configured";

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
        <View style={styles.headerCopy}>
          <Text style={styles.screenTitle}>Rankings</Text>
          <Text style={styles.subtitle}>Airline performance</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close rankings"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.positionSummary}>
        <View style={styles.positionIdentity}>
          {player ? (
            <AirlineBrandMark
              accessibilityLabel={`${player.name} badge`}
              logoId={player.logoId}
              primary={player.primaryColor}
              secondary={player.secondaryColor}
              size={42}
              variant="leaderboard"
            />
          ) : null}
          <View style={styles.positionCopy}>
            <Text style={styles.summaryLabel}>Local position</Text>
            <Text numberOfLines={2} style={styles.summaryDetail}>
              {positionDetail}
            </Text>
          </View>
        </View>
        <Text style={styles.positionValue}>
          #{playerRank}{" "}
          <Text style={styles.positionTotal}>of {standings.length}</Text>
        </Text>
      </View>

      <View style={styles.localSection}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionTitleCopy}>
            <Text style={styles.sectionTitle}>Local standings</Text>
            <Text style={styles.sectionDescription}>
              Ranked by cash minus outstanding loans
            </Text>
          </View>
        </View>

        <View style={styles.columnHeader}>
          <Text style={styles.airlineColumnLabel}>Airline</Text>
          <Text style={styles.valueColumnLabel}>Net worth</Text>
        </View>

        <View style={styles.standingsList}>
          {standings.map((standing, index) => (
            <StandingRow
              key={standing.id}
              standing={standing}
              rank={index + 1}
            />
          ))}
        </View>

        {aiAirlines.length === 0 && (
          <Text style={styles.noRivalsText}>
            No AI rivals are active in this game. Your airline is still shown so
            the financial measure remains clear.
          </Text>
        )}
      </View>

      <GlobalRankings />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: {
    flex: 1,
  },
  screenTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  positionSummary: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    marginHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  positionIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  positionCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  summaryDetail: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
  positionValue: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: Typography.weight.bold,
  },
  positionTotal: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: Typography.weight.regular,
  },
  localSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionTitleRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  sectionTitleCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  sectionDescription: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
  errorText: {
    color: Colors.red,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  airlineColumnLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
    paddingLeft: 72,
  },
  valueColumnLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
    textAlign: "right",
  },
  standingsList: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  standingRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  playerRow: {
    backgroundColor: Colors.skyDim,
  },
  rank: {
    width: 24,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    textAlign: "center",
  },
  playerRank: {
    color: Colors.skyDark,
    fontWeight: Typography.weight.bold,
  },
  airlineDetails: {
    flex: 1,
    minWidth: 0,
  },
  airlineName: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: Typography.weight.semibold,
  },
  airlineMeta: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  financeValues: {
    minWidth: 84,
    alignItems: "flex-end",
  },
  netWorth: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  dailyResult: {
    fontFamily: Typography.mono,
    fontSize: 9,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  noRivalsText: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    paddingTop: Spacing.md,
  },
  globalSection: {
    marginTop: Spacing.xxl,
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  actionRow: {
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
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  connectButton: {
    flex: 0,
    marginTop: Spacing.md,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
