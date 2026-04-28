/**
 * components/ui/RouteCreationBanner.tsx
 *
 * Shown whenever routeCreationMode is active.
 * Slides down from below the TopHUD with a spring animation.
 * The dot pulses/blinks when waiting for a tap.
 *
 * States:
 *   0 waypoints → "Tap your hub to start"
 *   1 waypoint  → "Tap destination airport"
 *   2 waypoints → "Tap to add a connecting stop — or open sheet to confirm"
 *   3 waypoints → "Route ready — open sheet to confirm"
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { useAirline, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Pull these as simple selectors — no object return
const useActive = () => useGameStore((s) => s.routeCreationMode);
const useWaypoints = () => useGameStore((s) => s.creationWaypoints);

export default function RouteCreationBanner() {
  const active = useActive();
  const waypoints = useWaypoints();
  const airline = useAirline();
  const clearCreation = useGameStore((s) => s.clearRouteCreation);
  const openSheet = useGameStore((s) => s.openSheet);
  const hudH = useHudHeight();

  const color = airline?.color ?? Colors.sky;

  // Slide in/out
  const slideY = useRef(new Animated.Value(-100)).current;
  useEffect(() => {
    Animated.spring(slideY, {
      toValue: active ? 0 : -100,
      friction: 9,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [active]);

  // Blink animation for the waiting dot
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || waypoints.length >= 3) {
      blink.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1.0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, waypoints.length]);

  if (!active) return null;

  const count = waypoints.length;

  const instruction =
    count === 0
      ? "Tap your hub airport to start"
      : count === 1
        ? "Now tap the destination airport"
        : count === 2
          ? "Tap an airport to add a connecting stop"
          : "Route ready — tap the button below to confirm";

  const canOpen = count >= 2;

  return (
    <Animated.View
      style={[
        s.container,
        { top: hudH + Spacing.sm, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={[s.banner, { borderColor: color + "55" }]}>
        {/* Left — blinking dot + instruction */}
        <View style={s.left}>
          <Animated.View
            style={[s.blinker, { backgroundColor: color, opacity: blink }]}
          />
          <View style={s.textWrap}>
            <Text style={s.mode}>CREATE ROUTE</Text>
            <Text style={s.instruction}>{instruction}</Text>
          </View>
        </View>

        {/* Waypoint chain — shows selected airports so far */}
        {count > 0 && (
          <View style={s.chain}>
            {waypoints.map((wp, i) => {
              const isVia = i > 0 && i < waypoints.length - 1;
              const dotColor = isVia ? Colors.purple : color;
              return (
                <View key={wp.iata} style={s.chainStop}>
                  {i > 0 && (
                    <View
                      style={[s.chainLine, { backgroundColor: color + "44" }]}
                    />
                  )}
                  <View style={[s.chainDot, { backgroundColor: dotColor }]} />
                  <Text style={[s.chainIata, { color: dotColor }]}>
                    {wp.iata}
                  </Text>
                </View>
              );
            })}
            {/* Pending dot — shows if waiting for more taps */}
            {count < 3 && count < 2 && (
              <View style={s.chainStop}>
                <View
                  style={[s.chainLine, { backgroundColor: color + "44" }]}
                />
                <Animated.View
                  style={[
                    s.chainDotEmpty,
                    { borderColor: color, opacity: blink },
                  ]}
                />
                <Text style={[s.chainIata, { color: Colors.dim }]}>?</Text>
              </View>
            )}
          </View>
        )}

        {/* Right — actions */}
        <View style={s.actions}>
          {canOpen && (
            <TouchableOpacity
              style={[
                s.openBtn,
                { backgroundColor: color + "20", borderColor: color + "55" },
              ]}
              onPress={() => openSheet("create-route")}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={14} color={color} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={clearCreation}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={20} color={Colors.dim} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 35,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,15,30,0.97)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },

  // Left
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  blinker: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  textWrap: { flex: 1, minWidth: 0 },
  mode: { fontSize: 7, color: Colors.dim, letterSpacing: 2, marginBottom: 1 },
  instruction: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: "500",
    lineHeight: 15,
  },

  // Chain
  chain: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  chainStop: { flexDirection: "row", alignItems: "center", gap: 3 },
  chainLine: { width: 10, height: 1.5 },
  chainDot: { width: 7, height: 7, borderRadius: 4 },
  chainDotEmpty: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
  chainIata: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  // Actions
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 0,
  },
  openBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
