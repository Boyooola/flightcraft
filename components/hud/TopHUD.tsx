/**
 * Bright, compact operations header shown above the game map.
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
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useDayProgress,
  useGameStore,
  useTodayCash,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type GameSpeed = 0 | 1 | 2 | 3;

const SPEEDS: {
  value: GameSpeed;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 0, label: "", icon: "pause" },
  { value: 1, label: "1x", icon: "play" },
  { value: 2, label: "2x", icon: "play-forward" },
  { value: 3, label: "3x", icon: "play-skip-forward" },
];

export default function TopHUD() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const todayReward = useTodayCash();
  const dayProgress = useDayProgress();
  const updateAirline = useGameStore((state) => state.updateAirline);

  const airlineColor = airline?.color ?? Colors.sky;
  const speed = airline?.speed ?? 1;
  const lowCash = cash < 200_000;
  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;

  const timeTicker = useRef(new Animated.Value(0)).current;
  const previousMinutes = useRef(0);
  const [displayedMinutes, setDisplayedMinutes] = useState(0);

  const rewardTicker = useRef(new Animated.Value(0)).current;
  const previousReward = useRef(0);
  const [displayedReward, setDisplayedReward] = useState(0);
  const rewardFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = timeTicker.addListener(({ value }) => {
      setDisplayedMinutes(Math.floor(value));
    });

    return () => timeTicker.removeListener(listener);
  }, [timeTicker]);

  const targetMinutes = Math.floor(dayProgress * 24 * 60);

  useEffect(() => {
    if (targetMinutes === 0) {
      previousMinutes.current = 0;
      timeTicker.setValue(0);
      setDisplayedMinutes(0);
      return;
    }

    if (targetMinutes !== previousMinutes.current) {
      timeTicker.setValue(previousMinutes.current);
      Animated.timing(timeTicker, {
        toValue: targetMinutes,
        duration: 800,
        useNativeDriver: false,
      }).start();
      previousMinutes.current = targetMinutes;
    }
  }, [targetMinutes, timeTicker]);

  useEffect(() => {
    const listener = rewardTicker.addListener(({ value }) => {
      setDisplayedReward(Math.round(value));
    });

    return () => rewardTicker.removeListener(listener);
  }, [rewardTicker]);

  useEffect(() => {
    if (todayReward === 0) {
      previousReward.current = 0;
      rewardTicker.setValue(0);
      setDisplayedReward(0);
      return;
    }

    if (todayReward !== previousReward.current) {
      const from = previousReward.current;
      previousReward.current = todayReward;
      rewardTicker.setValue(from);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(rewardFlash, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(rewardFlash, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(rewardTicker, {
          toValue: todayReward,
          duration: 400,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [rewardFlash, rewardTicker, todayReward]);

  const hour = Math.floor(displayedMinutes / 60) % 24;
  const minute = displayedMinutes % 60;
  const gameTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0",
  )}`;

  const rewardScale = rewardFlash.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });

  const rewardColor =
    todayReward > 0
      ? Colors.green
      : todayReward < 0
        ? Colors.red
        : Colors.muted;

  const rewardText =
    todayReward > 0
      ? `+${fmtCash(displayedReward || todayReward)}`
      : todayReward < 0
        ? fmtCash(displayedReward || todayReward)
        : "$0";

  return (
    <View style={[styles.container, { paddingTop: topInset + Spacing.xs }]}>
      <View style={styles.commandRow}>
        <View
          accessibilityElementsHidden
          style={[
            styles.airlineMarker,
            { backgroundColor: airlineColor },
          ]}
        />

        <View style={styles.identity}>
          <Text style={styles.eyebrow}>AIRLINE OPERATIONS</Text>
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

        <View style={styles.simulationPanel}>
          <Text style={styles.simulationLabel}>SIM SPEED</Text>
          <View style={styles.speedGroup}>
            {SPEEDS.map(({ value, label, icon }) => {
              const active = speed === value;
              const accessibilityLabel =
                value === 0 ? "Pause simulation" : `Set speed to ${label}`;

              return (
                <TouchableOpacity
                  key={value}
                  accessibilityLabel={accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.speedButton, active && styles.speedButtonActive]}
                  onPress={() => updateAirline({ speed: value })}
                  activeOpacity={0.72}
                >
                  <Ionicons
                    name={icon}
                    size={14}
                    color={active ? Colors.textOnColor : Colors.muted}
                  />
                  {label ? (
                    <Text
                      style={[
                        styles.speedLabel,
                        active && styles.speedLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.operationsStrip}>
        <View
          style={[
            styles.resultMetric,
            todayReward > 0 && styles.resultPositive,
            todayReward < 0 && styles.resultNegative,
          ]}
        >
          <Text style={styles.metricLabel}>TODAY&apos;S RESULT</Text>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.metricValue,
              { color: rewardColor, transform: [{ scale: rewardScale }] },
            ]}
          >
            {rewardText}
          </Animated.Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.dayMetric}>
          <Text style={styles.metricLabel}>DAY</Text>
          <Text style={styles.metricValue}>{day}</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.clockMetric}>
          <View style={styles.clockCopy}>
            <Text style={styles.metricLabel}>GAME TIME</Text>
            <Text style={styles.clockValue}>{gameTime}</Text>
          </View>
          <View style={styles.clockTrack}>
            <View
              style={[
                styles.clockFill,
                {
                  width: `${Math.round(dayProgress * 100)}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.card,
  },
  commandRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  airlineMarker: {
    width: 4,
    height: 40,
    borderRadius: Radius.full,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.25,
    lineHeight: 11,
  },
  airline: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 20,
    letterSpacing: 0.5,
    lineHeight: 22,
    textTransform: "uppercase",
  },
  cash: {
    color: Colors.green,
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  cashWarning: {
    color: Colors.red,
  },
  simulationPanel: {
    alignItems: "flex-end",
    gap: 3,
  },
  simulationLabel: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  speedGroup: {
    flexDirection: "row",
    gap: 4,
  },
  speedButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  speedButtonActive: {
    backgroundColor: Colors.sky,
    borderColor: Colors.sky,
  },
  speedLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 7,
    fontWeight: "700",
    lineHeight: 8,
  },
  speedLabelActive: {
    color: Colors.textOnColor,
  },
  operationsStrip: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    overflow: "hidden",
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  resultMetric: {
    flex: 1.35,
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  resultPositive: {
    backgroundColor: Palette.greenSoft,
  },
  resultNegative: {
    backgroundColor: Palette.redSoft,
  },
  dayMetric: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.9,
    lineHeight: 10,
  },
  metricValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  clockMetric: {
    flex: 1.05,
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  clockCopy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  clockValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  clockTrack: {
    width: "100%",
    height: 3,
    overflow: "hidden",
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.full,
  },
  clockFill: {
    height: "100%",
    backgroundColor: Colors.sky,
    borderRadius: Radius.full,
  },
});
