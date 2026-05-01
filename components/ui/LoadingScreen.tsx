/**
 * components/ui/LoadingScreen.tsx
 *
 * WorldWide Rush-style loading screen.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
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

function StepRow({ step }: { step: LoadStep }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step.status !== "loading") {
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
  }, [pulse, step.status]);

  const color =
    step.status === "done"
      ? Colors.green
      : step.status === "loading"
        ? Colors.sky
        : step.status === "error"
          ? Colors.red
          : Colors.dim;

  const icon =
    step.status === "done"
      ? "checkmark"
      : step.status === "error"
        ? "close"
        : step.status === "loading"
          ? "flash-outline"
          : "ellipse-outline";

  return (
    <View style={s.stepRow}>
      <Animated.View
        style={[s.stepIcon, { backgroundColor: color + "18", opacity: pulse }]}
      >
        <Ionicons name={icon as any} size={12} color={color} />
      </Animated.View>

      <Text
        style={[
          s.stepLabel,
          { color: step.status === "loading" ? Colors.text : color },
        ]}
        numberOfLines={1}
      >
        {step.label}
      </Text>
    </View>
  );
}

export default function LoadingScreen({
  steps,
  message,
  error,
  overlay,
}: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(14)).current;
  const planePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(planePulse, {
          toValue: 1.08,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(planePulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    anim.start();
    return () => anim.stop();
  }, [fade, rise, planePulse]);

  const done = steps?.filter((step) => step.status === "done").length ?? 0;
  const total = steps?.length ?? 1;
  const pct = Math.round((done / total) * 100);
  const hasError = !!error || steps?.some((step) => step.status === "error");

  const statusText = hasError
    ? (error ??
      steps?.find((step) => step.status === "error")?.error ??
      "Loading error")
    : (steps?.find((step) => step.status === "loading")?.label ??
      message ??
      "Building your route map…");

  return (
    <Animated.View
      style={[
        s.root,
        overlay && s.overlay,
        {
          paddingTop: insets.top + Spacing.xxl,
          paddingBottom: insets.bottom + Spacing.lg,
          opacity: fade,
        },
      ]}
    >
      <Animated.View style={[s.content, { transform: [{ translateY: rise }] }]}>
        <Animated.View
          style={[
            s.logo,
            {
              borderColor: hasError ? Colors.red + "44" : Colors.sky + "44",
              transform: [{ scale: planePulse }],
            },
          ]}
        >
          <Ionicons
            name={hasError ? "warning-outline" : "airplane"}
            size={34}
            color={hasError ? Colors.red : Colors.sky}
          />
        </Animated.View>

        <Text style={s.wordmark}>FLIGHTCRAFT</Text>
        <Text style={s.tagline}>PASSENGER RUSH TYCOON</Text>

        <View style={s.statusCard}>
          <View style={s.statusTop}>
            <Text style={[s.statusText, hasError && { color: Colors.red }]}>
              {statusText}
            </Text>
            <Text
              style={[s.pct, { color: hasError ? Colors.red : Colors.sky }]}
            >
              {pct}%
            </Text>
          </View>

          <View style={s.track}>
            <View
              style={[
                s.fill,
                {
                  width: `${pct}%` as any,
                  backgroundColor: hasError ? Colors.red : Colors.sky,
                },
              ]}
            />
          </View>
        </View>

        {!!steps && (
          <View style={s.steps}>
            {steps.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </View>
        )}
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
    maxWidth: 340,
    alignItems: "center",
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(56,189,248,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  wordmark: {
    fontSize: 34,
    color: Colors.text,
    letterSpacing: 7,
    fontWeight: "900",
  },
  tagline: {
    fontSize: 9,
    color: Colors.sky,
    letterSpacing: 3.4,
    fontWeight: "800",
    marginTop: 4,
    marginBottom: Spacing.xl,
    opacity: 0.75,
  },
  statusCard: {
    width: "100%",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statusTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statusText: {
    flex: 1,
    fontSize: 11,
    color: Colors.muted,
    fontWeight: "800",
  },
  pct: {
    fontSize: 12,
    fontWeight: "900",
  },
  track: {
    height: 5,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  steps: {
    width: "100%",
    gap: Spacing.sm,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stepIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
});
