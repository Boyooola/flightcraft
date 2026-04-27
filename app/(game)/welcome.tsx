/**
 * app/(game)/welcome.tsx
 *
 * Shown once after a new airline is created.
 * Celebrates the creation then leads into the tutorial.
 *
 * Phase: "welcome" → tap Continue → "tutorial"
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { fmtCash } from "@/lib/revenue";
import { useAirline, useAirports, useGameStore } from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const airports = useAirports();
  const setPhase = useGameStore((s) => s.setPhase);
  const haptics = useHaptics();

  // Entrance animations
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    haptics.success();

    Animated.sequence([
      // Logo pops in
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Text fades in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
      // Cards slide up
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Button appears
      Animated.timing(btnOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleContinue = () => {
    haptics.confirm();
    setPhase("tutorial");
  };

  if (!airline) return null;

  return (
    <View
      style={[
        s.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg },
      ]}
    >
      {/* Background glow */}
      <View style={[s.glow, { backgroundColor: airline.color + "12" }]} />

      {/* Logo */}
      <Animated.View
        style={[
          s.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <View style={[s.logoRing, { borderColor: airline.color + "44" }]}>
          <View
            style={[s.logoInner, { backgroundColor: airline.color + "22" }]}
          >
            <Ionicons name="airplane" size={48} color={airline.color} />
          </View>
        </View>
      </Animated.View>

      {/* Welcome text */}
      <Animated.View style={[s.textBlock, { opacity: textOpacity }]}>
        <Text style={s.congrats}>WELCOME ABOARD</Text>
        <Text style={[s.airlineName, { color: airline.color }]}>
          {airline.name}
        </Text>
        <Text style={s.subtitle}>
          Your airline is ready for takeoff.{"\n"}Let&apos;s build a global
          empire.
        </Text>
      </Animated.View>

      {/* Stats cards */}
      <Animated.View style={[s.cards, { opacity: cardOpacity }]}>
        <View style={s.card}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={20}
            color={Colors.green}
          />
          <Text style={s.cardValue}>{fmtCash(airline.cash)}</Text>
          <Text style={s.cardLabel}>Starting cash</Text>
        </View>
        <View style={s.card}>
          <MaterialCommunityIcons
            name="percent"
            size={20}
            color={Colors.amber}
          />
          <Text style={s.cardValue}>
            {airline.difficulty === "easy"
              ? "3%"
              : airline.difficulty === "hard"
                ? "9%"
                : "5%"}
          </Text>
          <Text style={s.cardLabel}>Loan rate</Text>
        </View>
        <View style={s.card}>
          <MaterialCommunityIcons name="earth" size={20} color={Colors.sky} />
          <Text style={s.cardValue}>{airports.length}</Text>
          <Text style={s.cardLabel}>Airports</Text>
        </View>
      </Animated.View>

      {/* What's next teaser */}
      <Animated.View
        style={[
          s.nextCard,
          { opacity: cardOpacity, borderColor: airline.color + "33" },
        ]}
      >
        <Text style={s.nextTitle}>YOUR FIRST STEPS</Text>
        {[
          "Buy a hub airport to base your operations",
          "Purchase an aircraft for your fleet",
          "Assign it to a passenger route",
          "Watch revenue tick in every game-day",
        ].map((step, i) => (
          <View key={i} style={s.nextRow}>
            <View
              style={[s.nextNum, { backgroundColor: airline.color + "22" }]}
            >
              <Text style={[s.nextNumText, { color: airline.color }]}>
                {i + 1}
              </Text>
            </View>
            <Text style={s.nextText}>{step}</Text>
          </View>
        ))}
      </Animated.View>

      {/* CTA */}
      <Animated.View
        style={{
          opacity: btnOpacity,
          width: "100%",
          paddingHorizontal: Spacing.lg,
        }}
      >
        <TouchableOpacity
          style={[s.btn, { backgroundColor: airline.color }]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={s.btnText}>START TUTORIAL</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.bg} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.skipBtn}
          onPress={() => {
            haptics.tap();
            setPhase("playing");
          }}
        >
          <Text style={s.skipText}>Skip — I know what I&apos;m doing</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },

  glow: {
    position: "absolute",
    top: -H * 0.1,
    width: W * 1.5,
    height: W * 1.5,
    borderRadius: W * 0.75,
    alignSelf: "center",
  },

  // Logo
  logoWrap: { alignItems: "center" },
  logoRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  // Text
  textBlock: { alignItems: "center" },
  congrats: {
    fontSize: 10,
    color: Colors.dim,
    letterSpacing: 4,
    marginBottom: Spacing.xs,
  },
  airlineName: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },

  // Stat cards
  cards: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
  },
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  cardValue: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  cardLabel: { fontSize: 9, color: Colors.dim, letterSpacing: 0.8 },

  // Next steps card
  nextCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  nextTitle: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nextNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  nextNumText: { fontSize: 11, fontWeight: "700" },
  nextText: { fontSize: 12, color: Colors.muted, flex: 1, lineHeight: 17 },

  // Buttons
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH + 4,
    marginBottom: Spacing.sm,
  },
  btnText: {
    fontSize: 14,
    color: Colors.bg,
    fontWeight: "700",
    letterSpacing: 1,
  },
  skipBtn: {
    alignItems: "center",
    padding: Spacing.sm,
    minHeight: MIN_TOUCH,
    justifyContent: "center",
  },
  skipText: {
    fontSize: 11,
    color: Colors.dim,
    letterSpacing: 0.3,
  },
});
