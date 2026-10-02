/**
 * Pausing airline-decision sheet.
 *
 * Every option exposes the simulation effects it can actually apply. The
 * decision cannot be dismissed without a response, and the previous game
 * speed is restored only after the player acknowledges the result.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { resolveChoiceEvent } from "@/hooks/useDailyEvents";
import { useHaptics } from "@/hooks/useHaptics";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import type {
  ChoiceEvent,
  ChoiceOption,
  ResolvedChoice,
} from "@/lib/choiceEvents";
import { fmtCash } from "@/lib/revenue";
import { useAirline, useCash, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CATEGORY_LABEL: Record<ChoiceEvent["category"], string> = {
  operations: "Operations decision",
  finance: "Finance decision",
  weather: "Weather response",
  competitor: "Competitor response",
  opportunity: "Commercial opportunity",
};

interface ResolvedDecision {
  event: ChoiceEvent;
  option: ChoiceOption;
  result: ResolvedChoice;
}

function effectsFor(option: ChoiceOption) {
  return option.effectSummary
    .split("|")
    .map((effect) => effect.trim())
    .filter(Boolean);
}

function effectColor(effect: string) {
  if (/\+/.test(effect)) return Colors.green;
  if (/-/.test(effect)) return Colors.red;
  return Colors.muted;
}

function EffectList({ option }: { option: ChoiceOption }) {
  return (
    <View style={styles.effectList}>
      {effectsFor(option).map((effect) => (
        <View key={effect} style={styles.effectRow}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.effectRule,
              { backgroundColor: effectColor(effect) },
            ]}
          />
          <Text style={[styles.effectText, { color: effectColor(effect) }]}>
            {effect}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OptionRow({
  option,
  index,
  cash,
  disabled,
  onPress,
}: {
  option: ChoiceOption;
  index: number;
  cash: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const optionLetter = String.fromCharCode(65 + index);
  const projectedCash = cash + (option.consequence.cashDelta ?? 0);
  const willOverdraw = projectedCash < 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Option ${optionLetter}: ${option.label}`}
      accessibilityHint={`${option.desc} Expected effect: ${option.effectSummary}`}
      accessibilityState={{ disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && styles.optionPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.optionHeader}>
        <Text style={styles.optionLetter}>{optionLetter}</Text>
        <Text style={styles.optionTitle}>{option.label}</Text>
        <View style={styles.chooseAction}>
          <Text style={styles.chooseLabel}>Choose</Text>
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name="arrow-forward"
            size={16}
            color={Colors.skyDark}
          />
        </View>
      </View>

      <Text style={styles.optionDescription}>{option.desc}</Text>
      <EffectList option={option} />

      {willOverdraw ? (
        <View style={styles.overdrawWarning}>
          <Ionicons name="warning-outline" size={16} color={Colors.red} />
          <Text style={styles.overdrawText}>
            This choice would leave cash below $0.
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function DecisionResult({
  decision,
  cash,
  onContinue,
}: {
  decision: ResolvedDecision;
  cash: number;
  onContinue: () => void;
}) {
  const endDay = decision.result.revenueMultiplierEndsDay;

  return (
    <View style={styles.result} accessibilityLiveRegion="polite">
      <View style={styles.resultStatus}>
        <Ionicons
          name="checkmark-circle"
          size={20}
          color={Colors.green}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={styles.resultStatusText}>Decision applied</Text>
      </View>

      <Text style={styles.resultTitle}>{decision.option.label}</Text>
      <Text style={styles.resultDescription}>{decision.option.desc}</Text>

      <View style={styles.appliedSection}>
        <Text style={styles.appliedLabel}>Applied effects</Text>
        <EffectList option={decision.option} />
      </View>

      <View style={styles.resultData}>
        <View style={styles.resultDataRow}>
          <Text style={styles.resultDataLabel}>Cash after decision</Text>
          <Text
            style={[
              styles.resultDataValue,
              cash < 0 && styles.resultDataValueNegative,
            ]}
          >
            {fmtCash(cash)}
          </Text>
        </View>
        {endDay !== undefined ? (
          <View style={styles.resultDataRow}>
            <Text style={styles.resultDataLabel}>Temporary effect ends</Text>
            <Text style={styles.resultDataValue}>Day {endDay}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resume simulation"
        onPress={onContinue}
        style={({ pressed }) => [
          styles.continueButton,
          pressed && styles.continueButtonPressed,
        ]}
      >
        <Text style={styles.continueButtonText}>Resume simulation</Text>
        <Ionicons name="play" size={18} color={Colors.textOnColor} />
      </Pressable>
    </View>
  );
}

export default function ChoiceEventModal() {
  const insets = useSafeAreaInsets();
  const pendingEvent = useGameStore((state) => state.pendingChoiceEvent);
  const airline = useAirline();
  const cash = useCash();
  const { confirm, success, error: errorHaptic } = useHaptics();
  const [resolved, setResolved] = useState<ResolvedDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;
  const day = airline?.day ?? 1;

  useEffect(() => {
    if (!pendingEvent) return;
    if (resolved?.event.id === pendingEvent.id) return;
    setResolved(null);
    setSubmitting(false);
    setError(null);
  }, [pendingEvent, resolved?.event.id]);

  const event = pendingEvent ?? resolved?.event ?? null;
  if (!event) return null;

  const handleChoose = (option: ChoiceOption) => {
    if (!pendingEvent || submitting || resolved) return;

    confirm();
    setSubmitting(true);
    setError(null);

    try {
      const result = resolveChoiceEvent(pendingEvent, option.id);
      setResolved({ event: pendingEvent, option, result });
      success();
    } catch (choiceError) {
      console.warn("[choice-event] failed to apply decision", choiceError);
      setError("Unable to apply this decision. Try again.");
      setSubmitting(false);
      errorHaptic();
    }
  };

  const handleContinue = () => {
    confirm();
    useGameStore.getState().resumeAfterChoice();
    setResolved(null);
    setSubmitting(false);
    setError(null);
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.scrim} accessibilityViewIsModal>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.md) },
          ]}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.airlineHeader}>
              <AirlineBrandMark
                accessibilityLabel={`${airlineName} emblem`}
                logoId={airlineLogoId}
                primary={airlinePrimaryColor}
                secondary={airlineSecondaryColor}
                size={40}
                variant="emblem"
              />
              <View style={styles.airlineCopy}>
                <Text numberOfLines={1} style={styles.airlineName}>
                  {airlineName}
                </Text>
                <Text style={styles.airlineContext}>
                  {airlineCode} · Day {day}
                </Text>
              </View>
              <View style={styles.pausedState}>
                <Ionicons name="pause" size={13} color={Colors.red} />
                <Text style={styles.pausedText}>Paused</Text>
              </View>
            </View>

            <View style={styles.eventMeta}>
              <Ionicons
                name={event.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={Colors.skyDark}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={styles.categoryText}>
                {CATEGORY_LABEL[event.category]}
              </Text>
              <Text style={styles.cashPosition}>{fmtCash(cash)} cash</Text>
            </View>

            <Text accessibilityRole="header" style={styles.title}>
              {event.title}
            </Text>
            <Text style={styles.situation}>{event.situation}</Text>

            <View style={styles.sectionDivider} />

            {resolved ? (
              <DecisionResult
                cash={cash}
                decision={resolved}
                onContinue={handleContinue}
              />
            ) : (
              <View>
                <View style={styles.decisionHeader}>
                  <Text style={styles.sectionLabel}>Decision required</Text>
                  <Text style={styles.decisionCount}>
                    {event.options.length} responses
                  </Text>
                </View>
                <Text style={styles.pauseNote}>
                  Compare the operational effects. The simulation remains paused
                  until you choose.
                </Text>

                <View style={styles.options}>
                  {event.options.map((option, index) => (
                    <OptionRow
                      cash={cash}
                      disabled={submitting}
                      index={index}
                      key={option.id}
                      onPress={() => handleChoose(option)}
                      option={option}
                    />
                  ))}
                </View>

                {error ? (
                  <View accessibilityRole="alert" style={styles.errorRow}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={18}
                      color={Colors.red}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: Colors.overlayLight,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  airlineHeader: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  airlineCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  airlineName: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.label,
  },
  airlineContext: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  pausedState: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  pausedText: {
    color: Colors.red,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.caption,
  },
  eventMeta: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  categoryText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  cashPosition: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  title: {
    marginTop: Spacing.sm,
    color: Colors.text,
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.display,
  },
  situation: {
    marginTop: Spacing.sm,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  sectionDivider: {
    height: 1,
    marginVertical: Spacing.lg,
    backgroundColor: Colors.borderSection,
  },
  decisionHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  sectionLabel: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  decisionCount: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  pauseNote: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  options: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  option: {
    minHeight: MIN_TOUCH,
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  optionPressed: {
    backgroundColor: Colors.skyDim,
  },
  disabled: {
    opacity: 0.55,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  optionLetter: {
    width: 24,
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.label,
  },
  optionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.body,
  },
  chooseAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  chooseLabel: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  optionDescription: {
    marginLeft: 32,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  effectList: {
    marginLeft: 32,
    gap: Spacing.xs,
  },
  effectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  effectRule: {
    width: 10,
    height: 2,
  },
  effectText: {
    flex: 1,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  overdrawWarning: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginLeft: 32,
  },
  overdrawText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.caption,
  },
  errorRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  errorText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  result: {
    paddingBottom: Spacing.sm,
  },
  resultStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  resultStatusText: {
    color: Colors.green,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  resultTitle: {
    marginTop: Spacing.md,
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  resultDescription: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  appliedSection: {
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  appliedLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.label,
  },
  resultData: {
    marginTop: Spacing.md,
  },
  resultDataRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultDataLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  resultDataValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  resultDataValueNegative: {
    color: Colors.red,
  },
  continueButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  continueButtonPressed: {
    backgroundColor: Colors.skyDark,
  },
  continueButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
});
