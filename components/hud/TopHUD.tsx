/**
 * components/hud/TopHUD.tsx
 *
 * WorldWide Rush-style top HUD.
 *
 * Redesigned to be less compact:
 *   Row 1: airline + cash · day · speed
 *   Row 2: waiting · moved · today's reward
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { waitingPaxForDemand } from "@/lib/passengerFlow";
import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useDayProgress,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
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

const SPEEDS: { value: GameSpeed; label: string; icon: string }[] = [
  { value: 0, label: "0", icon: "pause" },
  { value: 1, label: "1x", icon: "play" },
  { value: 2, label: "2x", icon: "play-forward" },
  { value: 3, label: "3x", icon: "play-skip-forward" },
];

function shortPax(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
}

function FlowCard({
  icon,
  label,
  value,
  color,
  scale,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  scale?: Animated.AnimatedInterpolation<string | number>;
}) {
  const ValueText: any = scale ? Animated.Text : Text;

  return (
    <View style={fc.card}>
      <View style={[fc.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>

      <View style={fc.body}>
        <Text style={fc.label}>{label}</Text>
        <ValueText
          style={[
            fc.value,
            {
              color,
              ...(scale ? { transform: [{ scale }] } : {}),
            },
          ]}
          numberOfLines={1}
        >
          {value}
        </ValueText>
      </View>
    </View>
  );
}

export default function TopHUD() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const dayProgress = useDayProgress();
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const updateAirline = useGameStore((s) => s.updateAirline);

  const color = airline?.color ?? Colors.sky;
  const speed = airline?.speed ?? 1;
  const lowCash = cash < 200_000;

  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;

  const activeRoutes = useMemo(
    () => routes.filter((route) => route.active),
    [routes],
  );

  const waiting = useMemo(() => {
    return demands
      .filter((demand) => demand.status !== "served")
      .reduce((sum, demand) => {
        return sum + waitingPaxForDemand(demand, dayProgress);
      }, 0);
  }, [demands, dayProgress]);

  const movedToday = useMemo(() => {
    return demands.reduce(
      (sum, demand) => sum + (demand.delivered_pax_today ?? 0),
      0,
    );
  }, [demands]);

  const todayReward = useMemo(() => {
    return activeRoutes.reduce((total, route) => {
      const demand = demands.find((d) => d.id === route.demand.id);
      if (!demand) return total;

      const deliveredPax = demand.delivered_pax_today ?? 0;
      if (deliveredPax <= 0) return total;

      const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
      const plane = route.plane.plane_model;

      const result = calcRouteRevenue({
        distNm: route.total_dist_nm ?? demand.dist_nm,
        speedKts: plane.speed_kts,
        trustPct: hub?.trust ?? 0,
        deliveredPax,
        paxDay: demand.pax_day,
        costPerSector: plane.cost_per_sector ?? 500,
        fuelPerNm: plane.fuel_per_nm ?? 2,
      });

      return total + result.net;
    }, 0);
  }, [activeRoutes, demands, hubs]);

  const dayScale = useRef(new Animated.Value(1)).current;
  const prevDay = useRef(day);

  useEffect(() => {
    if (day === prevDay.current) return;
    prevDay.current = day;

    Animated.sequence([
      Animated.spring(dayScale, {
        toValue: 1.25,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.spring(dayScale, {
        toValue: 1,
        friction: 7,
        tension: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [day, dayScale]);

  const movedPulse = useRef(new Animated.Value(0)).current;
  const prevMoved = useRef(movedToday);

  useEffect(() => {
    if (movedToday <= prevMoved.current) {
      prevMoved.current = movedToday;
      return;
    }

    prevMoved.current = movedToday;

    Animated.sequence([
      Animated.timing(movedPulse, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(movedPulse, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();
  }, [movedToday, movedPulse]);

  const rewardTicker = useRef(new Animated.Value(0)).current;
  const [displayedReward, setDisplayedReward] = useState(0);
  const rewardFlash = useRef(new Animated.Value(0)).current;
  const prevReward = useRef(0);

  useEffect(() => {
    const id = rewardTicker.addListener(({ value }) => {
      setDisplayedReward(Math.round(value));
    });

    return () => rewardTicker.removeListener(id);
  }, [rewardTicker]);

  useEffect(() => {
    if (todayReward !== prevReward.current) {
      Animated.sequence([
        Animated.timing(rewardFlash, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(rewardFlash, {
          toValue: 0,
          duration: 360,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.timing(rewardTicker, {
        toValue: todayReward,
        duration: 450,
        useNativeDriver: false,
      }).start();

      prevReward.current = todayReward;
    }

    if (todayReward === 0) {
      prevReward.current = 0;
      rewardTicker.setValue(0);
      setDisplayedReward(0);
    }
  }, [todayReward, rewardFlash, rewardTicker]);

  const movedScale = movedPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  const rewardScale = rewardFlash.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  const setSpeed = (value: GameSpeed) => updateAirline({ speed: value });

  const waitingColor =
    waiting <= 0 ? Colors.dim : waiting >= 500 ? Colors.red : Colors.amber;

  const rewardColor = todayReward > 0 ? Colors.green : Colors.dim;

  return (
    <View style={[st.container, { paddingTop: topInset + 5 }]}>
      <View style={st.topRow}>
        <View style={st.identity}>
          <Text style={[st.airline, { color }]} numberOfLines={1}>
            {airline?.name ?? "FlightCraft"}
          </Text>
          <Text
            style={[st.cash, { color: lowCash ? Colors.red : Colors.text }]}
            numberOfLines={1}
          >
            {fmtCash(cash)}
          </Text>
        </View>

        <View style={[st.dayBox, { borderColor: color + "44" }]}>
          <Text style={st.dayLabel}>DAY</Text>
          <Animated.Text
            style={[st.day, { color, transform: [{ scale: dayScale }] }]}
          >
            {day}
          </Animated.Text>
        </View>

        <View style={st.speedGroup}>
          {SPEEDS.map(({ value, label, icon }) => {
            const active = speed === value;

            return (
              <TouchableOpacity
                key={value}
                style={[
                  st.speedBtn,
                  active && {
                    backgroundColor: color,
                    borderColor: color,
                  },
                ]}
                onPress={() => setSpeed(value)}
                activeOpacity={0.82}
              >
                <Ionicons
                  name={icon as any}
                  size={11}
                  color={active ? Colors.bg : Colors.dim}
                />
                <Text
                  style={[
                    st.speedLabel,
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

      <View style={st.flowRow}>
        <FlowCard
          icon="people-outline"
          label="Waiting"
          value={`${shortPax(waiting)} pax`}
          color={waitingColor}
        />

        <FlowCard
          icon="checkmark-done-outline"
          label="Moved"
          value={`${shortPax(movedToday)} pax`}
          color={movedToday > 0 ? Colors.green : Colors.dim}
          scale={movedScale}
        />

        <FlowCard
          icon="cash-outline"
          label="Today"
          value={
            todayReward > 0
              ? `+${fmtCash(displayedReward || todayReward)}`
              : "$0"
          }
          color={rewardColor}
          scale={rewardScale}
        />
      </View>
    </View>
  );
}

const fc = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.035)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    minWidth: 0,
  },
  iconWrap: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.3,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },
});

const st = StyleSheet.create({
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
    gap: Spacing.sm,
  },
  topRow: {
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
  dayBox: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    paddingHorizontal: Spacing.sm + 1,
    paddingVertical: 5,
    minWidth: 52,
  },
  dayLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  day: {
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22,
  },
  speedGroup: {
    flexDirection: "row",
    gap: 4,
  },
  speedBtn: {
    minWidth: 34,
    minHeight: 31,
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
  flowRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
});
