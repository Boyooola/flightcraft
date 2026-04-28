/**
 * app/(game)/tutorial.tsx
 *
 * DIRECTED onboarding — guides player through their FIRST actions.
 * Instead of passive text cards, each step highlights what to do
 * and waits for the player to actually do it before advancing.
 *
 * Steps:
 *   1. BUY HUB   — pulse a hub dot, prompt player to tap it
 *   2. BUY PLANE — open Fleet automatically, prompt to buy CRJ200
 *   3. CREATE ROUTE — activate FAB, prompt to tap hub then dest
 *   4. SPEED UP  — show speed controls
 *   5. DONE      — dismiss tutorial
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import {
  useAirline,
  useGameStore,
  useHubs,
  useOwnedPlanes,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "hub" | "plane" | "route" | "speed" | "done";

interface StepDef {
  id: Step;
  icon: string;
  title: string;
  body: string;
  action: string; // what the player should do right now
  checkDone: (state: {
    hubCount: number;
    planeCount: number;
    routeCount: number;
  }) => boolean;
}

const STEPS: StepDef[] = [
  {
    id: "hub",
    icon: "location",
    title: "Buy your first hub",
    body: "Tap any airport dot on the map to open it, then tap Buy Hub. Start with a regional or domestic airport — they're cheaper.",
    action: "👆 Tap an airport on the map",
    checkDone: (s) => s.hubCount >= 1,
  },
  {
    id: "plane",
    icon: "airplane",
    title: "Buy an aircraft",
    body: "Open the Fleet tab below. The CRJ200 ($100K) is the best starter — cheap and reliable. Tap Buy to purchase it.",
    action: "👇 Open Fleet tab and buy a plane",
    checkDone: (s) => s.planeCount >= 1,
  },
  {
    id: "route",
    icon: "add-circle-outline",
    title: "Create your first route",
    body: "Tap the ✈ button in the centre of the tab bar to enter route creation. Then tap your hub, then a destination. The banner at top will guide you.",
    action: "👇 Tap the ✈ button below",
    checkDone: (s) => s.routeCount >= 1,
  },
  {
    id: "speed",
    icon: "speedometer-outline",
    title: "Speed up time",
    body: "Your route earns revenue as planes fly. Tap 2× or 3× in the top bar to speed up the game. Watch the TODAY counter rise in real time.",
    action: "☝️ Tap 2× in the top right",
    checkDone: () => false, // manual advance only
  },
  {
    id: "done",
    icon: "checkmark-circle",
    title: "You're ready!",
    body: "Your airline is in the air. Check Missions (flag pill, top right) for daily goals. Open Achievements to see what to unlock next.",
    action: "Tap below to start playing",
    checkDone: () => false,
  },
];

function ProgressDots({ current, color }: { current: number; color: string }) {
  return (
    <View style={pd.wrap}>
      {STEPS.filter((s) => s.id !== "done").map((step, i) => (
        <View
          key={step.id}
          style={[
            pd.dot,
            i < current && { backgroundColor: color, opacity: 0.4 },
            i === current && { backgroundColor: color, width: 20 },
          ]}
        />
      ))}
    </View>
  );
}
const pd = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dim },
});

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const hubs = useHubs();
  const planes = useOwnedPlanes();
  const routes = useRoutes();
  const openSheet = useGameStore((s) => s.openSheet);
  const setPhase = useGameStore((s) => s.setPhase);

  const color = airline?.color ?? Colors.sky;
  const [idx, setIdx] = useState(0);
  const step = STEPS[Math.min(idx, STEPS.length - 1)];

  // Pulse animation for action hint
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [idx]);

  // Auto-advance when player completes the action
  useEffect(() => {
    if (idx >= STEPS.length - 1) return;
    const state = {
      hubCount: hubs.length,
      planeCount: planes.length,
      routeCount: routes.filter((r) => r.active).length,
    };
    if (STEPS[idx].checkDone(state)) {
      // Short delay so player sees the result before advancing
      const t = setTimeout(
        () => setIdx((i) => Math.min(i + 1, STEPS.length - 1)),
        800,
      );
      return () => clearTimeout(t);
    }
  }, [idx, hubs.length, planes.length, routes.length]);

  const handleNext = () => {
    if (step.id === "done") {
      setPhase("playing");
      return;
    }
    // Open relevant sheet on "plane" step
    if (step.id === "plane") openSheet("fleet");
    setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const handleSkip = () => setPhase("playing");

  const bottom = insets.bottom + 80 + Spacing.md;
  const isDoneStep = step.id === "done";

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: 150, elevation: 150 }]}
      pointerEvents="box-none"
    >
      {/* Semi-transparent backdrop — only at bottom so map is still usable */}
      <View
        style={[s.backdrop, { bottom: 0, height: bottom + 200 }]}
        pointerEvents="none"
      />

      {/* Tutorial card — bottom of screen */}
      <View
        style={[
          s.card,
          {
            bottom,
            left: Spacing.lg,
            right: Spacing.lg,
            borderColor: color + "44",
          },
        ]}
      >
        {/* Skip */}
        {!isDoneStep && (
          <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
            <Text style={s.skipTxt}>Skip tutorial</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconBox, { backgroundColor: color + "1a" }]}>
            <Ionicons name={step.icon as any} size={22} color={color} />
          </View>
          <View style={s.headerRight}>
            <ProgressDots current={idx} color={color} />
            <Text style={s.stepTitle}>{step.title}</Text>
          </View>
        </View>

        {/* Body */}
        <Text style={s.body}>{step.body}</Text>

        {/* Next / Done button */}
        <TouchableOpacity
          style={[s.nextBtn, { backgroundColor: color }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={s.nextTxt}>
            {isDoneStep
              ? "Start Playing →"
              : step.id === "speed"
                ? "Got it →"
                : "Next →"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(4,9,15,0.6)",
  },
  card: {
    position: "absolute",
    backgroundColor: "rgba(8,15,30,0.97)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  skipBtn: { alignSelf: "flex-end" },
  skipTxt: { fontSize: 10, color: Colors.dim },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 15, color: Colors.text, fontWeight: "700" },
  body: { fontSize: 12, color: Colors.muted, lineHeight: 18 },
  actionHint: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  actionTxt: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  nextBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
  },
  nextTxt: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
