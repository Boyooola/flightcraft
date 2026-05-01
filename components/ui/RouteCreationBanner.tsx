/**
 * components/ui/RouteCreationBanner.tsx
 *
 * WorldWide Rush-style route creation banner.
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

  const slideY = useRef(new Animated.Value(-90)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: active ? 0 : -90,
      friction: 8,
      tension: 85,
      useNativeDriver: true,
    }).start();
  }, [active, slideY]);

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    anim.start();
    return () => anim.stop();
  }, [active, pulse]);

  if (!active) return null;

  const count = waypoints.length;
  const canConfirm = count >= 2;

  const instruction =
    count === 0
      ? "Tap a hub"
      : count === 1
        ? "Tap destination"
        : count === 2
          ? "Confirm route or add 1 stop"
          : "Route ready";

  const status =
    count === 0
      ? "START"
      : count === 1
        ? "DESTINATION"
        : count === 2
          ? "READY"
          : "CONNECTING";

  return (
    <Animated.View
      style={[
        s.container,
        {
          top: hudH + Spacing.sm,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={[s.banner, { borderColor: color + "55" }]}>
        <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
          <Animated.View style={{ opacity: pulse }}>
            <Ionicons name="flash-outline" size={15} color={color} />
          </Animated.View>
        </View>

        <View style={s.main}>
          <View style={s.topLine}>
            <Text style={[s.mode, { color }]}>{status}</Text>
            <Text style={s.instruction}>{instruction}</Text>
          </View>

          <View style={s.chain}>
            {waypoints.length === 0 ? (
              <Text style={s.emptyChain}>Choose airport on map</Text>
            ) : (
              waypoints.map((wp, index) => {
                const isVia = index > 0 && index < waypoints.length - 1;
                const dotColor = isVia ? Colors.purple : color;

                return (
                  <View key={`${wp.iata}-${index}`} style={s.stop}>
                    {index > 0 && (
                      <View
                        style={[s.line, { backgroundColor: color + "44" }]}
                      />
                    )}
                    <View style={[s.dot, { backgroundColor: dotColor }]} />
                    <Text style={[s.iata, { color: dotColor }]}>{wp.iata}</Text>
                  </View>
                );
              })
            )}

            {count > 0 && count < 2 && (
              <View style={s.stop}>
                <View style={[s.line, { backgroundColor: color + "44" }]} />
                <Animated.View
                  style={[s.emptyDot, { borderColor: color, opacity: pulse }]}
                />
                <Text style={s.question}>?</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.actions}>
          {canConfirm && (
            <TouchableOpacity
              style={[s.confirmBtn, { backgroundColor: color }]}
              onPress={() => openSheet("create-route")}
              activeOpacity={0.86}
            >
              <Text style={s.confirmText}>Go</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.closeBtn}
            onPress={clearCreation}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={Colors.dim} />
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
    paddingVertical: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  mode: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  instruction: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
    fontWeight: "800",
  },
  chain: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 16,
  },
  emptyChain: {
    fontSize: 9,
    color: Colors.dim,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  line: {
    width: 12,
    height: 2,
    borderRadius: 999,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  emptyDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  iata: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  question: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "900",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexShrink: 0,
  },
  confirmBtn: {
    minWidth: 36,
    height: 30,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  confirmText: {
    fontSize: 11,
    color: Colors.bg,
    fontWeight: "900",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
