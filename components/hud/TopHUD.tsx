/**
 * components/hud/TopHUD.tsx
 *
 * Top bar: airline name · total cash · [DAY / pax] · today's revenue · speed
 *
 * "Today's revenue" — live ticker showing earnings so far this game-day.
 * Derived from delivered_pax_today × yield so it ticks up as planes land.
 * Resets to $0 automatically when day advances (delivered_pax_today resets).
 *
 * Day number pulses (scale + colour) when day increments.
 * Today's revenue flashes green when it increases.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
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

const SPEEDS: { value: GameSpeed; icon: string }[] = [
  { value: 0, icon: "pause" },
  { value: 1, icon: "play" },
  { value: 2, icon: "play-forward" },
  { value: 3, icon: "play-skip-forward" },
];

// Yield per pax — matches revenue.ts
const YIELD: Record<string, number> = {
  short: 120,
  medium: 280,
  long: 550,
};

export default function TopHUD() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
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

  // ── Live stats derived from store ───────────────────────────────
  // Today's revenue = sum of (deliveredPax × yield) per active route
  // This ticks up live every time addPaxDelivered fires in RouteLayer
  const todayRevenue = routes.reduce((total, route) => {
    if (!route.active) return total;
    const demand = demands.find((d) => d.id === route.demand.id);
    if (!demand) return total;
    const pax = demand.delivered_pax_today ?? 0;
    const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
    const trust = hub?.trust ?? 0;
    const baseYield = YIELD[demand.haul] ?? 120;
    const trustMult = 1 + (trust / 100) * 0.25;
    return total + Math.round(pax * baseYield * trustMult);
  }, 0);

  // ── Day tick pulse ───────────────────────────────────────────────
  const dayScale = useRef(new Animated.Value(1)).current;
  const dayColor = useRef(new Animated.Value(0)).current;
  const prevDay = useRef(day);

  useEffect(() => {
    if (day === prevDay.current) return;
    prevDay.current = day;
    Animated.sequence([
      Animated.parallel([
        Animated.spring(dayScale, {
          toValue: 1.35,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(dayColor, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(dayScale, {
          toValue: 1.0,
          friction: 6,
          tension: 150,
          useNativeDriver: true,
        }),
        Animated.timing(dayColor, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [day]);

  const animatedDayColor = dayColor.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.text, color],
  });

  // ── Today's revenue ticker animation ────────────────────────────
  // Flashes bright green briefly each time revenue increases
  const revAnim = useRef(new Animated.Value(0)).current; // 0 = normal, 1 = flash
  const prevRev = useRef(0);

  useEffect(() => {
    if (todayRevenue > prevRev.current) {
      prevRev.current = todayRevenue;
      Animated.sequence([
        Animated.timing(revAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(revAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (todayRevenue === 0) {
      // Day reset
      prevRev.current = 0;
    }
  }, [todayRevenue]);

  const animatedRevColor = revAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#4ade80", "#ffffff"], // green → flash white
  });

  const animatedRevScale = revAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.15, 1],
  });

  const setSpeed = (v: GameSpeed) => updateAirline({ speed: v });

  return (
    <View style={[st.container, { paddingTop: topInset + 4 }]}>
      <View style={st.inner}>
        {/* ── Left — airline name + total cash ── */}
        <View style={st.left}>
          <Text style={[st.airlineName, { color }]} numberOfLines={1}>
            {airline?.name ?? "FlightCraft"}
          </Text>
          <Text
            style={[st.cash, { color: lowCash ? Colors.red : Colors.text }]}
          >
            {fmtCash(cash)}
          </Text>
        </View>

        {/* ── Centre — day + pax ── */}
        <View style={st.centre}>
          <Text style={st.dayLabel}>DAY</Text>
          <Animated.Text
            style={[
              st.dayNum,
              { color: animatedDayColor, transform: [{ scale: dayScale }] },
            ]}
          >
            {day}
          </Animated.Text>
        </View>

        {/* ── Today revenue ticker ── */}
        <View style={st.revWrap}>
          <Text style={st.revLabel}>TODAY</Text>
          {todayRevenue > 0 ? (
            <Animated.Text
              style={[
                st.revAmount,
                {
                  color: animatedRevColor,
                  transform: [{ scale: animatedRevScale }],
                },
              ]}
            >
              +{fmtCash(todayRevenue)}
            </Animated.Text>
          ) : (
            <Text style={st.revZero}>$0</Text>
          )}
        </View>

        {/* ── Speed controls ── */}
        <View style={st.speeds}>
          {SPEEDS.map(({ value, icon }) => {
            const active = speed === value;
            return (
              <TouchableOpacity
                key={value}
                style={[
                  st.speedBtn,
                  active && {
                    backgroundColor: color + "22",
                    borderColor: color + "66",
                  },
                ]}
                onPress={() => setSpeed(value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={icon as any}
                  size={13}
                  color={active ? color : Colors.dim}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(8,15,30,0.97)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },

  // Left
  left: { flex: 1, minWidth: 0, gap: 1 },
  airlineName: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  cash: { fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

  // Centre
  centre: { alignItems: "center" },
  dayLabel: { fontSize: 7, color: Colors.dim, letterSpacing: 2 },
  dayNum: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    minWidth: 36,
    textAlign: "center",
  },
  // Revenue ticker
  revWrap: { alignItems: "center", minWidth: 64 },
  revLabel: { fontSize: 7, color: Colors.dim, letterSpacing: 1.5 },
  revAmount: { fontSize: 14, fontWeight: "700" },
  revZero: { fontSize: 14, fontWeight: "700", color: Colors.dim },
  // Speed
  speeds: { flexDirection: "row", gap: 3 },
  speedBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    minWidth: 30,
    alignItems: "center",
  },
});
