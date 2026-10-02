/**
 * First-flight tutorial.
 *
 * This guide follows the real game state. A step is complete only after the
 * player performs its action, so the tutorial cannot drift away from the map,
 * sheets, or a restored save.
 */

import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import {
  useActiveSheet,
  useAirline,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRouteCreationActive,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TutorialStep = "hub" | "plane" | "route" | "speed" | "done";
type IconName = keyof typeof Ionicons.glyphMap;

interface TutorialContent {
  icon: IconName;
  title: string;
  body: string;
  instruction?: string;
  buttonLabel?: string;
}

const STEP_ORDER: TutorialStep[] = ["hub", "plane", "route", "speed"];

const CONTENT: Record<TutorialStep, TutorialContent> = {
  hub: {
    icon: "location-outline",
    title: "Build your first hub",
    body: "Tap an airport marker. Review the cost, then choose Build hub.",
    instruction: "Tap an airport on the map",
  },
  plane: {
    icon: "airplane-outline",
    title: "Buy your first aircraft",
    body: "Open Fleet, choose Buy aircraft, and purchase an affordable starter aircraft.",
    buttonLabel: "Open Fleet",
  },
  route: {
    icon: "git-network-outline",
    title: "Open your first route",
    body: "Choose your hub, then a destination. Select an aircraft in the route review.",
    buttonLabel: "Start route",
  },
  speed: {
    icon: "speedometer-outline",
    title: "Start the simulation",
    body: "Tap 2x or 3x in the operations header. Aircraft will fly automatically and today's result will update.",
    instruction: "Tap 2x or 3x in the top bar",
  },
  done: {
    icon: "checkmark-circle-outline",
    title: "Your airline is operating",
    body: "Watch the map, review Routes, and use Finance to track results.",
    buttonLabel: "Continue playing",
  },
};

function requiredStep(
  hubCount: number,
  planeCount: number,
  routeCount: number,
  speed: number,
): TutorialStep {
  if (hubCount === 0) return "hub";
  if (planeCount === 0) return "plane";
  if (routeCount === 0) return "route";
  if (speed <= 1) return "speed";
  return "done";
}

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const hubs = useHubs();
  const planes = useOwnedPlanes();
  const routes = useRoutes();
  const activeSheet = useActiveSheet();
  const routeCreationActive = useRouteCreationActive();
  const haptics = useHaptics();

  const openSheet = useGameStore((state) => state.openSheet);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const startRouteCreation = useGameStore((state) => state.startRouteCreation);
  const clearRouteCreation = useGameStore((state) => state.clearRouteCreation);
  const setPhase = useGameStore((state) => state.setPhase);

  const activeRouteCount = routes.filter((route) => route.active).length;
  const speed = airline?.speed ?? 1;
  const [stepId, setStepId] = useState<TutorialStep>(() =>
    requiredStep(hubs.length, planes.length, activeRouteCount, speed),
  );

  useEffect(() => {
    const nextStep = requiredStep(
      hubs.length,
      planes.length,
      activeRouteCount,
      speed,
    );

    if (nextStep === stepId) return;

    const timer = setTimeout(() => {
      closeSheet();
      setStepId(nextStep);
      if (nextStep === "done") haptics.success();
      else haptics.tap();
    }, 350);

    return () => clearTimeout(timer);
  }, [
    activeRouteCount,
    closeSheet,
    haptics,
    hubs.length,
    planes.length,
    speed,
    stepId,
  ]);

  const finishTutorial = () => {
    haptics.confirm();
    clearRouteCreation();
    setPhase("playing");
  };

  const handlePrimaryAction = () => {
    haptics.confirm();

    if (stepId === "plane") {
      openSheet("fleet");
      return;
    }

    if (stepId === "route") {
      startRouteCreation();
      return;
    }

    if (stepId === "done") finishTutorial();
  };

  // The relevant sheet or route banner supplies the next instructions. Keeping
  // this panel hidden prevents two guides from competing for the same space.
  if (activeSheet !== null || routeCreationActive) return null;

  const content = CONTENT[stepId];
  const isDone = stepId === "done";
  const stepIndex = isDone ? STEP_ORDER.length : STEP_ORDER.indexOf(stepId);
  const visibleStep = Math.min(stepIndex + 1, STEP_ORDER.length);
  const progressWidth = `${(visibleStep / STEP_ORDER.length) * 100}%` as const;

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, styles.layer]}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${content.title}. ${content.body}`}
        style={[styles.panel, { bottom: insets.bottom + 70 + Spacing.md }]}
      >
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {isDone ? "First flight complete" : `Step ${visibleStep} of 4`}
          </Text>
          {!isDone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              hitSlop={4}
              onPress={finishTutorial}
              style={({ pressed }) => [
                styles.skipButton,
                pressed && styles.textButtonPressed,
              ]}
            >
              <Text style={styles.skipLabel}>Skip tutorial</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <View style={styles.headingRow}>
          <View style={styles.iconBox}>
            <Ionicons name={content.icon} size={21} color={Colors.skyDark} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {content.title}
          </Text>
        </View>

        <Text style={styles.body}>{content.body}</Text>

        {content.instruction ? (
          <View style={styles.instructionRow}>
            <Ionicons name="navigate-outline" size={17} color={Colors.sky} />
            <Text style={styles.instruction}>{content.instruction}</Text>
          </View>
        ) : null}

        {content.buttonLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={handlePrimaryAction}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>{content.buttonLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 40,
  },
  panel: {
    position: "absolute",
    right: Spacing.md,
    left: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  progressHeader: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -Spacing.sm,
    marginBottom: -Spacing.md,
  },
  progressLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  skipButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  skipLabel: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.medium,
    lineHeight: Typography.lineHeight.label,
  },
  textButtonPressed: {
    opacity: 0.58,
  },
  progressTrack: {
    height: 2,
    overflow: "hidden",
    backgroundColor: Colors.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: Colors.sky,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.sm,
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  body: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  instructionRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.bg,
    borderLeftWidth: 2,
    borderLeftColor: Colors.sky,
  },
  instruction: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  primaryButtonPressed: {
    backgroundColor: Colors.skyDark,
  },
  primaryButtonLabel: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
});
