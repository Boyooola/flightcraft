/**
 * components/ui/LoadingScreen.tsx
 *
 * Animated loading screen.
 * Shows the step checklist with live status indicators.
 */

import { Colors, Spacing } from "@/constants/theme";
import { LoadStep } from "@/types";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_W } = Dimensions.get("window");

interface LoadingScreenProps {
  steps: LoadStep[];
  error?: string | null;
}

function StepRow({ step }: { step: LoadStep }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step.status === "loading") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.3,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [step.status]);

  const dotColor =
    step.status === "done"
      ? Colors.green
      : step.status === "loading"
        ? Colors.sky
        : step.status === "error"
          ? Colors.red
          : Colors.dim;

  const textColor =
    step.status === "loading"
      ? Colors.text
      : step.status === "done"
        ? Colors.muted
        : step.status === "error"
          ? Colors.red
          : Colors.dim;

  const badge =
    step.status === "done"
      ? "✓"
      : step.status === "error"
        ? "✗"
        : step.status === "loading"
          ? "…"
          : "";

  return (
    <View style={s.stepRow}>
      <Animated.View
        style={[s.dot, { backgroundColor: dotColor, opacity: pulse }]}
      />
      <Text style={[s.stepLabel, { color: textColor }]}>{step.label}</Text>
      {badge ? (
        <Text style={[s.badge, { color: dotColor }]}>{badge}</Text>
      ) : null}
    </View>
  );
}

export default function LoadingScreen({ steps, error }: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const done = steps.filter((s) => s.status === "done").length;
  const total = steps.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const hasError = !!error || steps.some((s) => s.status === "error");

  return (
    <View
      style={[
        s.root,
        {
          paddingTop: insets.top + Spacing.xxl,
          paddingBottom: insets.bottom + Spacing.lg,
        },
      ]}
    >
      <Animated.View
        style={[
          s.content,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}
      >
        {/* Logo */}
        <View style={s.logoBox}>
          <Text style={s.logoPlane}>✈</Text>
        </View>

        <Text style={s.wordmark}>FLIGHTCRAFT</Text>
        <Text style={s.tagline}>GLOBAL AVIATION TYCOON</Text>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <Animated.View
            style={[
              s.progressFill,
              {
                width: `${pct}%`,
                backgroundColor: hasError ? Colors.red : Colors.sky,
              },
            ]}
          />
        </View>

        <View style={s.progressLabel}>
          <Text style={[s.progressText, hasError && { color: Colors.red }]}>
            {hasError
              ? (error ??
                steps.find((s) => s.status === "error")?.error ??
                "Error")
              : (steps.find((s) => s.status === "loading")?.label ??
                "Loading…")}
          </Text>
          <Text style={s.progressPct}>{Math.round(pct)}%</Text>
        </View>

        {/* Step list */}
        <View style={s.steps}>
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </View>
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
    padding: Spacing.xl,
  },
  content: { width: "100%", maxWidth: 340, alignItems: "center" },

  // Logo
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 17,
    backgroundColor: "#0c1c33",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoPlane: { fontSize: 28, color: Colors.sky },
  wordmark: {
    fontSize: 36,
    color: Colors.text,
    letterSpacing: 8,
    fontWeight: "700",
    marginBottom: 4,
  },
  tagline: {
    fontSize: 9,
    color: "rgba(56,189,248,.6)",
    letterSpacing: 4,
    marginBottom: Spacing.xxl,
  },

  // Progress
  progressTrack: {
    width: "100%",
    height: 2,
    backgroundColor: "rgba(255,255,255,.07)",
    borderRadius: 1,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 1,
  },
  progressLabel: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  progressText: {
    fontSize: 10,
    color: Colors.muted,
    letterSpacing: 0.5,
    flex: 1,
  },
  progressPct: { fontSize: 10, color: Colors.dim },

  // Steps
  steps: { width: "100%", gap: Spacing.sm },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stepLabel: { flex: 1, fontSize: 11, letterSpacing: 0.3 },
  badge: { fontSize: 11, fontWeight: "700" },
});
