/**
 * Bankruptcy report and restart flow.
 *
 * The result is presented as the closeout of an airline run. Restarting is
 * confirmed separately because it permanently removes the active save.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import { useAirline, useCash, useDay, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NEGATIVE_CASH_LIMIT_DAYS = 5;

const NEXT_RUN_GUIDANCE = [
  "Keep enough cash to cover several days of operating costs.",
  "Review routes with low demand or repeated daily losses.",
  "Buy aircraft only when an open market can use its range and seats.",
];

export default function BankruptScreen() {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const airline = useAirline();
  const cash = useCash();
  const day = useDay();
  const hubCount = useGameStore((state) => state.hubs.length);
  const routeCount = useGameStore(
    (state) => state.routes.filter((route) => route.active).length,
  );
  const aircraftCount = useGameStore((state) => state.ownedPlanes.length);
  const passengersCarried = useGameStore((state) =>
    state.presence.reduce(
      (total, airport) => total + airport.total_pax_delivered,
      0,
    ),
  );

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;

  const beginRestart = () => {
    haptics.warning();
    setError(null);
    setConfirming(true);
  };

  const cancelRestart = () => {
    haptics.tap();
    setError(null);
    setConfirming(false);
  };

  const handleRestart = async () => {
    if (deleting) return;

    const airlineId = airline?.id;
    if (!airlineId) {
      setError("No airline save was found. Close and reopen FlightCraft.");
      haptics.error();
      return;
    }

    haptics.confirm();
    setDeleting(true);
    setError(null);

    try {
      const childResults = await Promise.all([
        supabase.from("routes").delete().eq("airline_id", airlineId),
        supabase.from("demands").delete().eq("airline_id", airlineId),
        supabase.from("owned_planes").delete().eq("airline_id", airlineId),
        supabase.from("hubs").delete().eq("airline_id", airlineId),
        supabase.from("ledger").delete().eq("airline_id", airlineId),
        supabase.from("airport_presence").delete().eq("airline_id", airlineId),
      ]);
      const childError = childResults.find((result) => result.error)?.error;

      if (childError) throw childError;

      const { error: airlineError } = await supabase
        .from("airlines")
        .delete()
        .eq("id", airlineId);

      if (airlineError) throw airlineError;

      await AsyncStorage.removeItem(
        `flightcraft:weekly-progress:${airlineId}`,
      ).catch(() => undefined);

      useGameStore.getState().resetGame();
      useGameStore.getState().setPhase("setup");
      haptics.success();
    } catch {
      setError(
        "The airline could not be fully removed. Check your connection and try again.",
      );
      haptics.error();
      setDeleting(false);
    }
  };

  return (
    <View style={styles.overlay}>
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
        <View style={styles.airlineHeader}>
          <AirlineBrandMark
            accessibilityLabel={`${airlineName} emblem`}
            logoId={airlineLogoId}
            primary={airlinePrimaryColor}
            secondary={airlineSecondaryColor}
            size={58}
            variant="emblem"
          />
          <View style={styles.airlineIdentity}>
            <Text style={styles.reportLabel}>Final operations report</Text>
            <Text numberOfLines={1} style={styles.airlineName}>
              {airlineName}
            </Text>
          </View>
          <View style={styles.airlineCodeBlock}>
            <Text style={styles.airlineCode}>{airlineCode}</Text>
            <Text style={styles.finalDay}>Day {day}</Text>
          </View>
        </View>

        <View style={styles.outcome}>
          <View style={styles.outcomeIcon}>
            <Ionicons name="alert" size={20} color={Colors.red} />
          </View>
          <View style={styles.outcomeCopy}>
            <Text accessibilityRole="header" style={styles.title}>
              Operations ended
            </Text>
            <Text style={styles.summary}>
              Cash remained below $0 for {NEGATIVE_CASH_LIMIT_DAYS} consecutive
              game days. The airline can no longer fund daily operations.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Run summary</Text>
          <Text style={styles.sectionMeta}>Closed Day {day}</Text>
        </View>

        <View style={styles.summaryTable}>
          <SummaryRow label="Days operated" value={day.toLocaleString()} />
          <SummaryRow label="Hubs opened" value={hubCount.toLocaleString()} />
          <SummaryRow
            label="Active markets"
            value={routeCount.toLocaleString()}
          />
          <SummaryRow
            label="Aircraft owned"
            value={aircraftCount.toLocaleString()}
          />
          <SummaryRow
            label="Passengers carried"
            value={passengersCarried.toLocaleString()}
          />
          <SummaryRow label="Final cash" negative value={fmtCash(cash)} />
          <SummaryRow
            label="Outstanding loan"
            value={fmtCash(airline?.loan ?? 0)}
          />
        </View>

        {!confirming ? (
          <View style={styles.guidanceSection}>
            <Text style={styles.sectionTitle}>For your next airline</Text>
            <View style={styles.guidanceList}>
              {NEXT_RUN_GUIDANCE.map((item, index) => (
                <View key={item} style={styles.guidanceRow}>
                  <Text style={styles.guidanceNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <Text style={styles.guidanceText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          {confirming ? (
            <>
              <View style={styles.confirmation}>
                <View style={styles.confirmationHeading}>
                  <Ionicons name="trash-outline" size={20} color={Colors.red} />
                  <Text style={styles.confirmationTitle}>
                    Delete {airlineCode} and restart?
                  </Text>
                </View>
                <Text style={styles.confirmationText}>
                  This permanently removes the airline, hubs, routes, fleet,
                  finances, and local run progress. Play Games achievements and
                  leaderboard scores remain.
                </Text>
              </View>

              {error ? (
                <View
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                  style={styles.errorRow}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={19}
                    color={Colors.red}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: deleting, disabled: deleting }}
                disabled={deleting}
                onPress={handleRestart}
                style={({ pressed }) => [
                  styles.deleteButton,
                  deleting && styles.buttonDisabled,
                  pressed && !deleting && styles.deleteButtonPressed,
                ]}
              >
                {deleting ? (
                  <>
                    <ActivityIndicator
                      color={Colors.textOnColor}
                      size="small"
                    />
                    <Text style={styles.deleteButtonLabel}>
                      Removing airline
                    </Text>
                  </>
                ) : (
                  <Text style={styles.deleteButtonLabel}>
                    Delete airline and begin again
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={deleting}
                onPress={cancelRestart}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && !deleting && styles.cancelButtonPressed,
                ]}
              >
                <Text style={styles.cancelButtonLabel}>Review this report</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={beginRestart}
              style={({ pressed }) => [
                styles.restartButton,
                pressed && styles.restartButtonPressed,
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={19}
                color={Colors.textOnColor}
              />
              <Text style={styles.restartButtonLabel}>Start a new airline</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string | number;
  negative?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, negative && styles.negativeValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: Colors.surface,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
  },
  airlineHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  airlineIdentity: {
    flex: 1,
    gap: Spacing.xxs,
  },
  reportLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  airlineName: {
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  airlineCodeBlock: {
    alignItems: "flex-end",
    gap: Spacing.xxs,
  },
  airlineCode: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  finalDay: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  outcome: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  outcomeIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1E8E7",
    borderRadius: Radius.sm,
  },
  outcomeCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.display,
  },
  summary: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  sectionHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  sectionMeta: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  summaryTable: {
    marginBottom: Spacing.xxl,
  },
  summaryRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  summaryValue: {
    flexShrink: 0,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  negativeValue: {
    color: Colors.red,
  },
  guidanceSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  guidanceList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  guidanceRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  guidanceNumber: {
    width: 24,
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  guidanceText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  actions: {
    marginTop: "auto",
    gap: Spacing.md,
  },
  confirmation: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  confirmationHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmationTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  confirmationText: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  errorRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: Colors.red,
  },
  errorText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  restartButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  restartButtonPressed: {
    backgroundColor: Colors.skyDark,
  },
  restartButtonLabel: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.body,
  },
  deleteButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.red,
    borderRadius: Radius.md,
  },
  deleteButtonPressed: {
    opacity: 0.82,
  },
  deleteButtonLabel: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.body,
  },
  buttonDisabled: {
    backgroundColor: Colors.borderSection,
  },
  cancelButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  cancelButtonPressed: {
    backgroundColor: Colors.skyDim,
  },
  cancelButtonLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
});
