/**
 * Loading and map-readiness status.
 *
 * This is an operations manifest, not a promotional splash screen. It reports
 * real loader state and never invents progress while the game is working.
 */

import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import type { LoadStep } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface LoadingScreenProps {
  steps?: LoadStep[];
  message?: string;
  error?: string | null;
  overlay?: boolean;
}

function stepPresentation(status: LoadStep["status"]) {
  switch (status) {
    case "done":
      return {
        icon: "checkmark" as const,
        color: Colors.green,
        label: "Ready",
      };
    case "loading":
      return {
        icon: "sync-outline" as const,
        color: Colors.sky,
        label: "In progress",
      };
    case "error":
      return {
        icon: "alert" as const,
        color: Colors.red,
        label: "Check failed",
      };
    default:
      return {
        icon: "remove" as const,
        color: Colors.dim,
        label: "Waiting",
      };
  }
}

function systemName(label: string) {
  const cleanLabel = label.replace(/^loading\s+/i, "").trim();
  return cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1);
}

export default function LoadingScreen({
  steps,
  message,
  error,
  overlay = false,
}: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const completedSteps =
    steps?.filter((step) => step.status === "done").length ?? 0;
  const totalSteps = steps?.length ?? 0;
  const progress =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const failedStep = steps?.find((step) => step.status === "error");
  const activeStep = steps?.find((step) => step.status === "loading");
  const hasError = Boolean(error || failedStep);
  const allStepsReady = totalSteps > 0 && completedSteps === totalSteps;
  const statusText = hasError
    ? (error ?? failedStep?.error ?? "Unable to finish loading game data.")
    : (activeStep?.label ??
      message ??
      (allStepsReady
        ? "Opening the operations map"
        : "Preparing your airline"));
  const progressWidth = `${progress}%` as const;

  return (
    <View style={[styles.root, overlay && styles.overlay]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.productHeader}>
          <Image
            accessibilityLabel="FlightCraft app icon"
            contentFit="cover"
            source={require("../../assets/images/icon.png")}
            style={styles.appIcon}
          />
          <View style={styles.productCopy}>
            <Text style={styles.productName}>FlightCraft</Text>
            <Text style={styles.productContext}>Operations startup</Text>
          </View>
          {!hasError ? (
            <ActivityIndicator
              accessibilityLabel="Loading"
              color={Colors.sky}
              size="small"
            />
          ) : null}
        </View>

        <View
          accessibilityLiveRegion={hasError ? "assertive" : "polite"}
          accessibilityRole={hasError ? "alert" : "summary"}
          style={styles.statusBlock}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {hasError ? "Startup interrupted" : "Preparing operations"}
          </Text>
          <Text style={[styles.statusText, hasError && styles.statusTextError]}>
            {statusText}
          </Text>
        </View>

        {totalSteps > 0 ? (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                {completedSteps} of {totalSteps} systems ready
              </Text>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View
              accessibilityLabel={`${completedSteps} of ${totalSteps} systems ready`}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={styles.progressTrack}
            >
              <View
                style={[
                  styles.progressFill,
                  hasError && styles.progressFillError,
                  { width: progressWidth },
                ]}
              />
            </View>
          </View>
        ) : !hasError ? (
          <View style={styles.indeterminateStatus}>
            <ActivityIndicator color={Colors.sky} size="small" />
            <Text style={styles.indeterminateText}>{statusText}</Text>
          </View>
        ) : null}

        {steps && steps.length > 0 ? (
          <View style={styles.manifest}>
            <View style={styles.manifestHeader}>
              <Text style={styles.manifestTitle}>Startup manifest</Text>
              <Text style={styles.manifestColumn}>Status</Text>
            </View>

            {steps.map((step, index) => {
              const presentation = stepPresentation(step.status);
              const name = systemName(step.label);

              return (
                <View
                  accessibilityLabel={`${name}. ${presentation.label}`}
                  key={step.key}
                  style={styles.stepRow}
                >
                  <Text style={styles.stepNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <View
                    style={[
                      styles.stepIndicator,
                      { borderColor: presentation.color },
                    ]}
                  >
                    {step.status === "loading" ? (
                      <ActivityIndicator
                        color={presentation.color}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        name={presentation.icon}
                        size={14}
                        color={presentation.color}
                      />
                    )}
                  </View>
                  <View style={styles.stepCopy}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.stepLabel,
                        step.status === "error" && styles.stepLabelError,
                      ]}
                    >
                      {name}
                    </Text>
                    {step.status === "error" && step.error ? (
                      <Text numberOfLines={2} style={styles.stepError}>
                        {step.error}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.stepState, { color: presentation.color }]}
                  >
                    {presentation.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.footerNote}>
          <Ionicons
            name={hasError ? "refresh-outline" : "phone-portrait-outline"}
            size={17}
            color={hasError ? Colors.red : Colors.dim}
          />
          <Text
            style={[styles.footerNoteText, hasError && styles.footerNoteError]}
          >
            {hasError
              ? "Close and reopen FlightCraft to retry startup."
              : "Keep FlightCraft open until startup is complete."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  productHeader: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xxxl,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
  },
  productCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  productName: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  productContext: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  statusBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.display,
  },
  statusText: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  statusTextError: {
    color: Colors.red,
  },
  progressSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  progressLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  progressValue: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  progressTrack: {
    height: 5,
    overflow: "hidden",
    backgroundColor: Colors.border,
    borderRadius: Radius.sm,
  },
  progressFill: {
    height: 5,
    backgroundColor: Colors.sky,
  },
  progressFillError: {
    backgroundColor: Colors.red,
  },
  indeterminateStatus: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  indeterminateText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  manifest: {
    marginBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  manifestHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  manifestTitle: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.label,
  },
  manifestColumn: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  stepRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepNumber: {
    width: 22,
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  stepIndicator: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  stepCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  stepLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  stepLabelError: {
    color: Colors.red,
    fontWeight: Typography.weight.semibold,
  },
  stepError: {
    color: Colors.red,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  stepState: {
    flexShrink: 0,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  footerNote: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  footerNoteText: {
    color: Colors.dim,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
  },
  footerNoteError: {
    color: Colors.red,
  },
});
