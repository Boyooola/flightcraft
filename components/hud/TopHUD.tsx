/**
 * components/hud/TopHUD.tsx
 *
 * One-row readable HUD.
 * Keeps only the most important info:
 * Airline/Cash · Today's Income · Day · Speed
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
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
  { value: 0, label: "0", icon: "pause" },
  { value: 1, label: "1x", icon: "play" },
  { value: 2, label: "2x", icon: "play-forward" },
  { value: 3, label: "3x", icon: "play-skip-forward" },
];

export default function TopHUD() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const updateAirline = useGameStore((s) => s.updateAirline);
  const todayCash = useTodayCash();
  const dayProgress = useDayProgress();

  const color = airline?.color ?? Colors.sky;
  const speed = airline?.speed ?? 1;
  const lowCash = cash < 200_000;

  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;

  const todayReward = todayCash;

  const timeTicker = useRef(new Animated.Value(0)).current;
  const [displayedMinutes, setDisplayedMinutes] = useState(0);
  const rewardTicker = useRef(new Animated.Value(0)).current;
  const [displayedReward, setDisplayedReward] = useState(0);
  const rewardFlash = useRef(new Animated.Value(0)).current;
  const prevReward = useRef(0);

  // Time ticker — listens to animated value and updates displayed minutes
  useEffect(() => {
    const id = timeTicker.addListener(({ value }) => {
      setDisplayedMinutes(Math.floor(value));
    });
    return () => timeTicker.removeListener(id);
  }, [timeTicker]);

  // Animate time forward when dayProgress changes
  const targetMinutes = Math.floor(dayProgress * 24 * 60);
  const prevMinutes = useRef(0);

  useEffect(() => {
    if (targetMinutes === 0) {
      // Day reset — snap back to midnight
      prevMinutes.current = 0;
      timeTicker.setValue(0);
      setDisplayedMinutes(0);
      return;
    }
    if (targetMinutes !== prevMinutes.current) {
      timeTicker.setValue(prevMinutes.current);
      Animated.timing(timeTicker, {
        toValue: targetMinutes,
        duration: 800,
        useNativeDriver: false,
      }).start();
      prevMinutes.current = targetMinutes;
    }
  }, [targetMinutes, timeTicker]);

  // Format displayed minutes → HH:MM
  const gameTime = (() => {
    const h = Math.floor(displayedMinutes / 60) % 24;
    const m = displayedMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  })();

  useEffect(() => {
    const id = rewardTicker.addListener(({ value }) => {
      setDisplayedReward(Math.round(value));
    });

    return () => rewardTicker.removeListener(id);
  }, [rewardTicker]);

  useEffect(() => {
    if (todayReward === 0) {
      // Day reset — snap back to zero immediately, no animation
      prevReward.current = 0;
      rewardTicker.setValue(0);
      setDisplayedReward(0);
      return;
    }

    if (todayReward !== prevReward.current) {
      const from = prevReward.current;
      const to = todayReward;
      prevReward.current = to;

      // Start ticker from current displayed value → new value
      // so it increments by the delta, not from 0
      rewardTicker.setValue(from);

      Animated.parallel([
        // Flash
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
        // Count up from previous → new
        Animated.timing(rewardTicker, {
          toValue: to,
          duration: 400,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [todayReward, rewardFlash, rewardTicker]);

  const rewardScale = rewardFlash.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });

  const setSpeed = (value: GameSpeed) => {
    updateAirline({ speed: value });
  };

  return (
    <View style={[s.container, { paddingTop: topInset + 6 }]}>
      <View style={s.row}>
        <View style={s.identity}>
          <Text style={[s.airline, { color }]} numberOfLines={1}>
            {airline?.name ?? "FlightCraft"}
          </Text>
          <Text
            style={[s.cash, { color: lowCash ? Colors.red : Colors.text }]}
            numberOfLines={1}
          >
            {fmtCash(cash)}
          </Text>
        </View>

        <View style={s.incomeBox}>
          <Text style={s.incomeLabel}>TODAY</Text>
          <Animated.Text
            style={[
              s.income,
              {
                color:
                  todayReward > 0
                    ? Colors.green
                    : todayReward < 0
                      ? Colors.red
                      : Colors.dim,
                transform: [{ scale: rewardScale }],
              },
            ]}
            numberOfLines={1}
          >
            {todayReward > 0
              ? `+${fmtCash(displayedReward || todayReward)}`
              : todayReward < 0
                ? fmtCash(displayedReward || todayReward)
                : "$0"}
          </Animated.Text>
        </View>

        <View style={[s.dayBox, { borderColor: color + "44" }]}>
          <Text style={s.dayLabel}>DAY</Text>
          <Text style={[s.day, { color }]}>{day}</Text>
        </View>

        <View style={s.clockBox}>
          <Text style={s.clockLabel}>TIME</Text>
          <Text style={s.clockTime}>{gameTime}</Text>
          {/* Progress bar showing day progress */}
          <View style={s.clockTrack}>
            <View
              style={[
                s.clockFill,
                {
                  width: `${Math.round(dayProgress * 100)}%` as `${number}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        </View>

        <View style={s.speedGroup}>
          {SPEEDS.map(({ value, label, icon }) => {
            const active = speed === value;

            return (
              <TouchableOpacity
                key={value}
                style={[
                  s.speedBtn,
                  active && {
                    backgroundColor: color,
                    borderColor: color,
                  },
                ]}
                onPress={() => setSpeed(value)}
                activeOpacity={0.82}
              >
                <Ionicons
                  name={icon}
                  size={11}
                  color={active ? Colors.bg : Colors.dim}
                />
                <Text
                  style={[
                    s.speedLabel,
                    { color: active ? Colors.bg : Colors.dim },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(8,15,30,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  identity: {
    flex: 1,
    minWidth: 0,
  },
  airline: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cash: {
    fontSize: 17,
    fontWeight: "900",
    marginTop: 1,
  },

  incomeBox: {
    minWidth: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green + "33",
    backgroundColor: Colors.green + "10",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    alignItems: "center",
  },
  incomeLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.5,
    fontWeight: "900",
  },
  income: {
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
  },

  dayBox: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    minWidth: 48,
  },
  dayLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.6,
    fontWeight: "900",
  },
  day: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20,
  },

  clockBox: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.04)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    minWidth: 52,
    gap: 2,
  },
  clockLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.4,
    fontWeight: "900",
  },
  clockTime: {
    fontSize: 13,
    fontWeight: "900",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
    lineHeight: 15,
  },
  clockTrack: {
    width: "100%",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1,
    overflow: "hidden",
    marginTop: 1,
  },
  clockFill: {
    height: "100%",
    borderRadius: 1,
  },
  speedGroup: {
    flexDirection: "row",
    gap: 3,
  },
  speedBtn: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.035)",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  speedLabel: {
    fontSize: 7,
    fontWeight: "900",
    lineHeight: 8,
  },
});
