/**
 * components/ui/BankruptScreen.tsx
 *
 * Full-screen overlay shown when the player goes bankrupt.
 * Gives context on what happened and a single restart action.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import { useAirline, useCash, useDay, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function BankruptScreen() {
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  async function handleRestart() {
    // Delete airline and all related data — player starts fresh
    const airlineId = airline?.id;
    if (airlineId) {
      await supabase.from("routes").delete().eq("airline_id", airlineId);
      await supabase.from("demands").delete().eq("airline_id", airlineId);
      await supabase.from("owned_planes").delete().eq("airline_id", airlineId);
      await supabase.from("hubs").delete().eq("airline_id", airlineId);
      await supabase.from("ledger").delete().eq("airline_id", airlineId);
      await supabase.from("airlines").delete().eq("id", airlineId);
    }
    // Reset store and go back to setup
    useGameStore.getState().resetGame?.();
    useGameStore.getState().setPhase("setup");
  }

  return (
    <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
      <Animated.View
        style={[s.card, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Icon */}
        <View style={s.iconWrap}>
          <Ionicons name="warning" size={44} color={Colors.red} />
        </View>

        {/* Headline */}
        <Text style={s.headline}>Airline Bankrupt</Text>
        <Text style={s.sub}>
          {airline?.name ?? "Your airline"} has collapsed after {day} day
          {day !== 1 ? "s" : ""} of operations.
        </Text>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{day}</Text>
            <Text style={s.statLabel}>Days flown</Text>
          </View>
          <View style={[s.stat, s.statDivider]}>
            <Text style={[s.statVal, { color: Colors.red }]}>
              {fmtCash(cash)}
            </Text>
            <Text style={s.statLabel}>Final cash</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statVal}>{fmtCash(airline?.loan ?? 0)}</Text>
            <Text style={s.statLabel}>Outstanding loan</Text>
          </View>
        </View>

        {/* What happened */}
        <View style={s.reasonBox}>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={Colors.dim}
          />
          <Text style={s.reasonTxt}>
            Your cash stayed negative for 5 consecutive days. Pay down your
            loan, add more routes, or cut idle planes to stay solvent.
          </Text>
        </View>

        {/* Restart */}
        <TouchableOpacity
          style={s.restartBtn}
          onPress={handleRestart}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.restartTxt}>Start Over</Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          Tip: keep loan below 2× your daily revenue and always have planes on
          active routes.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,9,15,0.96)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.red + "44",
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.red + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  headline: {
    fontSize: 26,
    fontWeight: "900",
    color: Colors.text,
    textAlign: "center",
  },
  sub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  statsRow: { flexDirection: "row", width: "100%", marginVertical: Spacing.sm },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  statVal: { fontSize: 18, fontWeight: "800", color: Colors.text },
  statLabel: { fontSize: 9, color: Colors.dim, letterSpacing: 0.5 },
  reasonBox: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "flex-start",
    width: "100%",
  },
  reasonTxt: { flex: 1, fontSize: 11, color: Colors.dim, lineHeight: 16 },
  restartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.red,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    width: "100%",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  restartTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
  hint: {
    fontSize: 10,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 15,
  },
});
