/**
 * components/ui/LoadingScreen.tsx
 *
 * FlightCraft loading screen — clean and minimal.
 */

import { Colors, Spacing } from "@/constants/theme";
import type { LoadStep } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface LoadingScreenProps {
  steps?: LoadStep[];
  message?: string;
  error?: string | null;
  overlay?: boolean;
}

export default function LoadingScreen({
  steps,
  message,
  error,
  overlay,
}: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(20)).current;
  const planeBob = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  const done = steps?.filter((s) => s.status === "done").length ?? 0;
  const total = steps?.length ?? 1;
  const pct = Math.round((done / total) * 100);

  const hasError = !!error || steps?.some((s) => s.status === "error");
  const accentColor = hasError ? Colors.red : Colors.sky;

  const currentStep = steps?.find((s) => s.status === "loading");
  const statusText = hasError
    ? (error ??
      steps?.find((s) => s.status === "error")?.error ??
      "Something went wrong")
    : (currentStep?.label ?? message ?? "Getting ready…");

  // Fade + rise on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Plane gentle bob
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(planeBob, {
          toValue: -6,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(planeBob, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Animate progress bar width
  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: pct,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <Animated.View
      style={[
        s.root,
        overlay && s.overlay,
        {
          paddingTop: insets.top + Spacing.xxl,
          paddingBottom: insets.bottom + Spacing.xl,
          opacity: fade,
        },
      ]}
    >
      <Animated.View style={[s.content, { transform: [{ translateY: rise }] }]}>
        {/* Plane icon */}
        <Animated.View
          style={[
            s.iconWrap,
            {
              borderColor: accentColor + "33",
              transform: [{ translateY: planeBob }],
            },
          ]}
        >
          <Ionicons
            name={hasError ? "warning-outline" : "airplane"}
            size={36}
            color={accentColor}
          />
        </Animated.View>

        {/* Wordmark */}
        <Text style={s.wordmark}>Flightcraft</Text>
        <Text style={[s.tagline, { color: accentColor }]}>Airline Tycoon</Text>

        {/* Progress area */}
        <View style={s.progressArea}>
          {/* Status text + percentage */}
          <View style={s.statusRow}>
            <Text
              style={[s.statusTxt, hasError && { color: Colors.red }]}
              numberOfLines={1}
            >
              {statusText}
            </Text>
            <Text style={[s.pct, { color: accentColor }]}>{pct}%</Text>
          </View>

          {/* Progress bar */}
          <View style={s.track}>
            <Animated.View
              style={[
                s.fill,
                {
                  backgroundColor: accentColor,
                  width: barWidth.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>

          {/* Step dots — compact, no labels */}
          {!!steps && steps.length > 0 && (
            <View style={s.dots}>
              {steps.map((step) => {
                const dotColor =
                  step.status === "done"
                    ? Colors.green
                    : step.status === "loading"
                      ? Colors.sky
                      : step.status === "error"
                        ? Colors.red
                        : Colors.dim + "44";
                return (
                  <View
                    key={step.key}
                    style={[s.dot, { backgroundColor: dotColor }]}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    flex: undefined,
  },
  content: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: Spacing.sm,
  },

  // Icon
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(56,189,248,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },

  // Wordmark
  wordmark: {
    fontSize: 30,
    color: Colors.text,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    opacity: 0.7,
    marginBottom: Spacing.xl,
    textTransform: "uppercase" as const,
  },

  // Progress
  progressArea: {
    width: "100%",
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  statusTxt: {
    flex: 1,
    fontSize: 11,
    color: Colors.muted,
    fontWeight: "600",
  },
  pct: {
    fontSize: 11,
    fontWeight: "900",
  },
  track: {
    height: 4,
    backgroundColor: "rgba(255,255,255,.07)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%" as any,
    borderRadius: 999,
  },

  // Step dots
  dots: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    marginTop: Spacing.xs ?? 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});
