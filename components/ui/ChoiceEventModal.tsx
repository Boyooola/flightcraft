/**
 * components/modals/ChoiceEventModal.tsx
 *
 * Full-screen modal that interrupts gameplay when a choice event fires.
 * The game is paused (speed=0) while this is visible.
 * Dismissing without choosing is not possible — player must decide.
 *
 * Fixes applied:
 *   FIX 3 — Card content wrapped in ScrollView with bounces={false}.
 *            On small phones (SE, Pixel 4a) long situation text + two
 *            option buttons overflow the screen. Now scrollable.
 *
 *   FIX 4 — Active consequence badge added above the options.
 *            When a lingering revenue multiplier from a previous choice
 *            is still running, a small indicator shows it alongside
 *            "YOUR DECISION" so the player knows they're stacking effects.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { resolveChoiceEvent } from "@/hooks/useDailyEvents";
import type { ChoiceOption, ResolvedChoice } from "@/lib/choiceEvents";
import { fmtCash } from "@/lib/revenue";
import { useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────
// CATEGORY CONFIG
// ─────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  operations: { label: "Operations", color: Colors.sky },
  finance: { label: "Finance", color: Colors.green },
  weather: { label: "Weather", color: Colors.amber },
  competitor: { label: "Competitor", color: Colors.red },
  opportunity: { label: "Opportunity", color: Colors.purple ?? "#a855f7" },
} as const;

// ─────────────────────────────────────────────────────────────────
// RESULT SUMMARY — shown after choice is made
// ─────────────────────────────────────────────────────────────────

function ResultCard({
  option,
  resolved,
  onDone,
}: {
  option: ChoiceOption;
  resolved: ResolvedChoice;
  onDone: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    Animated.timing(progress, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    }).start();
    return () => clearTimeout(timer);
  }, []);

  const cash = resolved.consequence.cashDelta ?? 0;
  const hasLingering = !!resolved.revenueMultiplierEndsDay;

  return (
    <View style={rc.card}>
      <View style={rc.iconWrap}>
        <Ionicons name="checkmark-circle" size={28} color={Colors.green} />
      </View>
      <Text style={rc.chosen}>You chose: {option.label}</Text>
      <Text style={rc.effect}>{option.effectSummary}</Text>

      {cash !== 0 && (
        <Text
          style={[rc.cashLine, { color: cash > 0 ? Colors.green : Colors.red }]}
        >
          {cash > 0 ? "+" : ""}
          {fmtCash(cash)}
        </Text>
      )}

      {hasLingering && (
        <Text style={rc.linger}>
          Effect lasts until Day {resolved.revenueMultiplierEndsDay}
        </Text>
      )}

      <View style={rc.progressTrack}>
        <Animated.View
          style={[
            rc.progressFill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const rc = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green + "44",
    padding: Spacing.lg,
    alignItems: "center",
    gap: 6,
  },
  iconWrap: { marginBottom: 4 },
  chosen: {
    fontSize: 14,
    fontWeight: "900",
    color: Colors.text,
    textAlign: "center",
  },
  effect: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: "center",
    fontWeight: "600",
  },
  cashLine: { fontSize: 18, fontWeight: "900" },
  linger: { fontSize: 11, color: Colors.dim, textAlign: "center" },
  progressTrack: {
    marginTop: 10,
    height: 2,
    width: "100%",
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.green,
    borderRadius: 1,
  },
});

// ─────────────────────────────────────────────────────────────────
// ACTIVE CONSEQUENCE BADGE
// FIX 4 — surfaces a lingering multiplier from a previous choice
// so the player knows effects are stacking before they decide again
// ─────────────────────────────────────────────────────────────────

function ActiveConsequenceBadge({
  consequence,
  currentDay,
}: {
  consequence: ResolvedChoice;
  currentDay: number;
}) {
  if (
    !consequence.revenueMultiplier ||
    !consequence.revenueMultiplierEndsDay ||
    currentDay >= consequence.revenueMultiplierEndsDay
  ) {
    return null;
  }

  const daysLeft = consequence.revenueMultiplierEndsDay - currentDay;
  const pct = Math.round((consequence.revenueMultiplier - 1) * 100);
  const sign = pct >= 0 ? "+" : "";
  const color = pct >= 0 ? Colors.green : Colors.red;

  return (
    <View
      style={[
        acb.wrap,
        { borderColor: color + "33", backgroundColor: color + "0d" },
      ]}
    >
      <Ionicons name="timer-outline" size={11} color={color} />
      <Text style={[acb.txt, { color }]}>
        Previous choice: {sign}
        {pct}% revenue · {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
      </Text>
    </View>
  );
}

const acb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  txt: { fontSize: 10, fontWeight: "700", flex: 1 },
});

// ─────────────────────────────────────────────────────────────────
// OPTION BUTTON
// ─────────────────────────────────────────────────────────────────

function OptionButton({
  option,
  onPress,
  disabled,
  airlineColor,
}: {
  option: ChoiceOption;
  onPress: () => void;
  disabled: boolean;
  airlineColor: string;
}) {
  return (
    <TouchableOpacity
      style={[ob.btn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.84}
    >
      <View style={ob.top}>
        <Text style={ob.label}>{option.label}</Text>
        <View
          style={[
            ob.effectChip,
            {
              backgroundColor: airlineColor + "18",
              borderColor: airlineColor + "44",
            },
          ]}
        >
          <Text
            style={[ob.effectTxt, { color: airlineColor }]}
            numberOfLines={1}
          >
            {option.effectSummary}
          </Text>
        </View>
      </View>
      <Text style={ob.desc}>{option.desc}</Text>
    </TouchableOpacity>
  );
}

const ob = StyleSheet.create({
  btn: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
    gap: 6,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  label: { fontSize: 14, fontWeight: "900", color: Colors.text, flex: 1 },
  effectChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
    maxWidth: 140,
  },
  effectTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  desc: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 17,
    fontWeight: "600",
  },
});

// ─────────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────────

export default function ChoiceEventModal() {
  const pendingChoiceEvent = useGameStore((s) => s.pendingChoiceEvent);
  const activeChoiceConsequence = useGameStore(
    (s) => s.activeChoiceConsequence,
  );
  const airline = useGameStore((s) => s.airline);
  const airlineColor = airline?.color ?? Colors.sky;
  const day = airline?.day ?? 1;

  const [resolved, setResolved] = useState<{
    option: ChoiceOption;
    result: ResolvedChoice;
  } | null>(null);

  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pendingChoiceEvent) {
      setResolved(null);
      scale.setValue(0.92);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 70,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [pendingChoiceEvent?.id]);

  const handleChoose = (optionId: "a" | "b") => {
    if (!pendingChoiceEvent) return;
    const result = resolveChoiceEvent(pendingChoiceEvent, optionId);
    const option = pendingChoiceEvent.options.find((o) => o.id === optionId)!;
    setResolved({ option, result });
  };

  const handleDismiss = () => setResolved(null);

  if (!pendingChoiceEvent) return null;

  const catCfg =
    CATEGORY_CONFIG[pendingChoiceEvent.category] ?? CATEGORY_CONFIG.operations;

  return (
    <Modal
      visible={!!pendingChoiceEvent}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Animated.View style={[s.card, { transform: [{ scale }], opacity }]}>
          {/* Day indicator */}
          <Text style={s.dayLabel}>DAY {day}</Text>

          {/* FIX 3 — ScrollView wraps all card content so it doesn't
              overflow on small phones. bounces={false} keeps it feeling
              like a card rather than a list. */}
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
          >
            {/* Category tag */}
            <View
              style={[
                s.categoryTag,
                {
                  backgroundColor: catCfg.color + "18",
                  borderColor: catCfg.color + "44",
                },
              ]}
            >
              <Ionicons
                name={pendingChoiceEvent.icon as any}
                size={12}
                color={catCfg.color}
              />
              <Text style={[s.categoryTxt, { color: catCfg.color }]}>
                {catCfg.label.toUpperCase()}
              </Text>
            </View>

            {/* Title */}
            <Text style={s.title}>{pendingChoiceEvent.title}</Text>

            {/* Situation */}
            <Text style={s.situation}>{pendingChoiceEvent.situation}</Text>

            {/* Divider */}
            <View style={s.divider} />

            {/* Result card OR option buttons */}
            {resolved ? (
              <ResultCard
                option={resolved.option}
                resolved={resolved.result}
                onDone={handleDismiss}
              />
            ) : (
              <View style={s.options}>
                <Text style={s.optionsLabel}>YOUR DECISION</Text>

                {/* FIX 4 — Show active lingering consequence before options
                    so player knows effects stack before they decide again */}
                {activeChoiceConsequence && (
                  <ActiveConsequenceBadge
                    consequence={activeChoiceConsequence}
                    currentDay={day}
                  />
                )}

                {pendingChoiceEvent.options.map((option) => (
                  <OptionButton
                    key={option.id}
                    option={option}
                    onPress={() => handleChoose(option.id)}
                    disabled={false}
                    airlineColor={airlineColor}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4,9,20,0.88)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    // Vertical padding keeps card away from status bar / home indicator
    paddingVertical: 48,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    // maxHeight ensures ScrollView kicks in on small phones
    maxHeight: "90%",
    backgroundColor: "#0d1526",
    borderRadius: Radius.xl ?? 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden", // clips ScrollView to rounded corners
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 24,
  },
  dayLabel: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 2,
    zIndex: 1,
  },
  // ScrollView content — mirrors old card padding + gap
  scrollContent: {
    padding: Spacing.lg,
    gap: 10,
    // Extra top padding so content clears the absolute dayLabel
    paddingTop: Spacing.lg + 4,
  },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  categoryTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.text,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  situation: {
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 20,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  optionsLabel: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "900",
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  options: { gap: 8 },
});
