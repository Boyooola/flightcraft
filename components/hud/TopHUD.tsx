/**
 * Compact airline operations header.
 *
 * Persistent controls live in one row. Temporary operational information is
 * consolidated into a horizontally scrollable dispatch line below it.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import { Colors, Spacing, Typography } from "@/constants/theme";
import {
  type DispatchNewsTone,
  useDispatchNews,
} from "@/hooks/useDispatchNews";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { fmtCash } from "@/lib/revenue";
import { getActiveSeason } from "@/lib/seasons";
import {
  useActiveChoiceConsequence,
  useActiveDemandWave,
  useAirline,
  useCash,
  useDailyEvent,
  useDailyMissions,
  useDay,
  useDayProgress,
  useGameStore,
  useTodayCash,
} from "@/store";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type GameSpeed = 0 | 1 | 2 | 3;
type NewsTone = DispatchNewsTone;

interface NewsItem {
  id: string;
  text: string;
  tone: NewsTone;
}

const SPEEDS: { value: GameSpeed; label: string; spokenLabel: string }[] = [
  { value: 0, label: "II", spokenLabel: "Pause simulation" },
  { value: 1, label: "1x", spokenLabel: "Set speed to 1x" },
  { value: 2, label: "2x", spokenLabel: "Set speed to 2x" },
  { value: 3, label: "3x", spokenLabel: "Set speed to 3x" },
];

const NEWS_TONE_COLOR: Record<NewsTone, string> = {
  neutral: Colors.sky,
  positive: Colors.green,
  warning: Colors.amber,
  negative: Colors.red,
};

export default function TopHUD() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const dispatchNews = useDispatchNews(day);
  const todayResult = useTodayCash();
  const dayProgress = useDayProgress();
  const dailyEvent = useDailyEvent();
  const dailyMissions = useDailyMissions();
  const activeDemandWave = useActiveDemandWave();
  const activeChoiceConsequence = useActiveChoiceConsequence();
  const updateAirline = useGameStore((state) => state.updateAirline);
  const tickerX = useRef(new Animated.Value(0)).current;
  const [newsWidth, setNewsWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const speed = airline?.speed ?? 1;
  const fallbackPalette = getAirlinePalette("aviation-blue");
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimary = airline?.color ?? fallbackPalette.primary;
  const airlineSecondary =
    airline?.secondary_color ?? fallbackPalette.secondary;
  const lowCash = cash < 200_000;
  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;

  const minutes = Math.floor(dayProgress * 24 * 60);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const gameTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0",
  )}`;
  const progress = Math.max(0, Math.min(100, Math.round(dayProgress * 100)));

  const newsItems: NewsItem[] = [];

  dispatchNews.forEach((item) => {
    newsItems.push({
      id: item.id,
      text: item.text,
      tone: item.tone,
    });
  });

  if (activeDemandWave) {
    const routeCount = activeDemandWave.updates.length;
    newsItems.push({
      id: `wave-${activeDemandWave.wave.id}`,
      text: `${activeDemandWave.wave.title}: +${activeDemandWave.totalAddedPax.toLocaleString()} passengers across ${routeCount} route ${routeCount === 1 ? "opportunity" : "opportunities"}`,
      tone: "warning",
    });
  }

  const eventDuplicatesWave =
    dailyEvent &&
    activeDemandWave &&
    (dailyEvent.id === activeDemandWave.wave.id ||
      dailyEvent.title === activeDemandWave.wave.title);

  if (dailyEvent && !eventDuplicatesWave) {
    newsItems.push({
      id: dailyEvent.id,
      text: `${dailyEvent.title}: ${dailyEvent.effect}`,
      tone:
        dailyEvent.type === "positive"
          ? "positive"
          : dailyEvent.type === "negative"
            ? "negative"
            : "neutral",
    });
  }

  const seasonalEffect = getActiveSeason(day).effects[0];
  if (seasonalEffect && Math.abs(seasonalEffect.multiplier - 1) >= 0.05) {
    const seasonalPercent = Math.round(
      Math.abs(seasonalEffect.multiplier - 1) * 100,
    );
    const seasonalDirection =
      seasonalEffect.multiplier > 1
        ? `up ${seasonalPercent}%`
        : `down ${seasonalPercent}%`;

    newsItems.push({
      id: `season-${day}-${seasonalEffect.region}`,
      text: `${seasonalEffect.label}: ${seasonalEffect.region.replace(/_/g, " ")} demand ${seasonalDirection}`,
      tone: seasonalEffect.multiplier > 1 ? "positive" : "warning",
    });
  }

  const choiceEndsDay = activeChoiceConsequence?.revenueMultiplierEndsDay;
  const choiceMultiplier = activeChoiceConsequence?.revenueMultiplier;
  if (
    activeChoiceConsequence &&
    choiceEndsDay !== undefined &&
    choiceMultiplier !== undefined &&
    day < choiceEndsDay
  ) {
    const choicePercent = Math.round((choiceMultiplier - 1) * 100);
    const choiceSign = choicePercent > 0 ? "+" : "";
    const daysRemaining = choiceEndsDay - day;

    newsItems.push({
      id: `choice-${activeChoiceConsequence.eventId}`,
      text: `Decision effect: ${choiceSign}${choicePercent}% revenue for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}`,
      tone: choicePercent >= 0 ? "positive" : "negative",
    });
  }

  if (dailyMissions.length > 0) {
    const completedMissions = dailyMissions.filter(
      (mission) => mission.completed,
    ).length;
    const allMissionsComplete = completedMissions === dailyMissions.length;

    newsItems.push({
      id: "daily-missions",
      text: allMissionsComplete
        ? "Daily missions complete"
        : `Daily missions: ${completedMissions}/${dailyMissions.length} complete`,
      tone: allMissionsComplete ? "positive" : "neutral",
    });
  }

  const resultText =
    todayResult > 0
      ? `+${fmtCash(todayResult)}`
      : todayResult < 0
        ? fmtCash(todayResult)
        : "$0";
  newsItems.push({
    id: "today-result",
    text: `Today: ${resultText}`,
    tone:
      todayResult > 0 ? "positive" : todayResult < 0 ? "negative" : "neutral",
  });

  const newsSignature = newsItems
    .map((item) => `${item.id}:${item.text}`)
    .join("|");
  const tickerGap = Spacing.xxl;
  const shouldScroll =
    !reduceMotion && newsWidth > viewportWidth && viewportWidth > 0;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    tickerX.stopAnimation();
    tickerX.setValue(0);

    if (!shouldScroll) return;

    const travelDistance = newsWidth + tickerGap;
    const duration = Math.max(9000, Math.round((travelDistance / 28) * 1000));
    const animation = Animated.loop(
      Animated.timing(tickerX, {
        toValue: -travelDistance,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animation.start();
    return () => animation.stop();
  }, [newsSignature, newsWidth, shouldScroll, tickerGap, tickerX]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    setViewportWidth(Math.round(event.nativeEvent.layout.width));
  };

  const renderNewsTrack = (copy: "primary" | "duplicate") => (
    <View
      key={copy}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={
        copy === "primary"
          ? (event) => setNewsWidth(Math.round(event.nativeEvent.layout.width))
          : undefined
      }
      style={styles.newsTrack}
    >
      {newsItems.map((item, index) => (
        <View key={`${copy}-${item.id}`} style={styles.newsItem}>
          {index > 0 ? <View style={styles.newsSeparator} /> : null}
          <View
            style={[
              styles.newsMarker,
              { backgroundColor: NEWS_TONE_COLOR[item.tone] },
            ]}
          />
          <Text style={styles.newsText} numberOfLines={1}>
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: topInset + Spacing.xs }]}>
      <View style={styles.operationsRow}>
        <View
          accessibilityLabel={`${airline?.name ?? "FlightCraft"}, ${airline?.airline_code ?? "airline"}. Available cash ${fmtCash(cash)}`}
          style={styles.identity}
        >
          <AirlineBrandMark
            accessibilityLabel=""
            logoId={airlineLogoId}
            primary={airlinePrimary}
            secondary={airlineSecondary}
            size={28}
            variant="emblem"
          />
          <View style={styles.identityCopy}>
            <Text style={styles.airline} numberOfLines={1}>
              {airline?.name ?? "FlightCraft"}
            </Text>
            <Text
              style={[styles.cash, lowCash && styles.cashWarning]}
              numberOfLines={1}
            >
              {fmtCash(cash)}
            </Text>
          </View>
        </View>

        <View style={styles.rowDivider} />

        <View style={styles.clock}>
          <Text style={styles.dayLabel}>Day {day}</Text>
          <Text style={styles.clockValue}>{gameTime}</Text>
        </View>

        <View style={styles.rowDivider} />

        <View
          accessibilityLabel={`Simulation speed ${speed === 0 ? "paused" : `${speed}x`}`}
          style={styles.speedGroup}
        >
          {SPEEDS.map(({ value, label, spokenLabel }) => {
            const active = speed === value;

            return (
              <TouchableOpacity
                key={value}
                accessibilityLabel={spokenLabel}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={0.65}
                onPress={() => updateAirline({ speed: value })}
                style={[styles.speedButton, active && styles.speedButtonActive]}
              >
                <Text
                  style={[styles.speedLabel, active && styles.speedLabelActive]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.newsRow}>
        <Text style={styles.newsHeading}>Dispatch</Text>
        <View style={styles.newsDivider} />
        <View
          accessible
          accessibilityLabel={newsItems.map((item) => item.text).join(". ")}
          accessibilityLiveRegion="polite"
          onLayout={handleViewportLayout}
          style={styles.newsViewport}
        >
          <Animated.View
            style={[
              styles.newsTicker,
              { transform: [{ translateX: tickerX }] },
            ]}
          >
            {renderNewsTrack("primary")}
            {shouldScroll ? <View style={{ width: tickerGap }} /> : null}
            {shouldScroll ? renderNewsTrack("duplicate") : null}
          </Animated.View>
        </View>
      </View>

      <View
        accessibilityElementsHidden
        style={[styles.dayProgress, { width: `${progress}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  operationsRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: Spacing.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  airline: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: Typography.weight.semibold,
    lineHeight: 18,
  },
  cash: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
  cashWarning: {
    color: Colors.red,
  },
  rowDivider: {
    width: 1,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.border,
  },
  clock: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  dayLabel: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  clockValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
    lineHeight: 15,
    fontVariant: ["tabular-nums"],
  },
  speedGroup: {
    width: 176,
    flexDirection: "row",
    alignItems: "stretch",
  },
  speedButton: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  speedButtonActive: {
    backgroundColor: Colors.skyDim,
  },
  speedLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    lineHeight: 14,
  },
  speedLabelActive: {
    color: Colors.skyDark,
  },
  newsRow: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  newsHeading: {
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    fontSize: 10,
    fontWeight: Typography.weight.semibold,
    lineHeight: 14,
  },
  newsDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.borderSection,
  },
  newsViewport: {
    flex: 1,
    overflow: "hidden",
  },
  newsTicker: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  newsTrack: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  newsItem: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
  },
  newsSeparator: {
    width: 1,
    height: 14,
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.border,
  },
  newsMarker: {
    width: 5,
    height: 5,
    marginRight: Spacing.sm,
    borderRadius: 3,
  },
  newsText: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  dayProgress: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: Colors.sky,
  },
});
