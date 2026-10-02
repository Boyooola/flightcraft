/**
 * Temporary route-planning rail attached below the operations header.
 */

import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { useGameStore } from "@/store";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function routePath(waypoints: { iata: string }[]): string {
  const ordered =
    waypoints.length === 3
      ? [waypoints[0], waypoints[2], waypoints[1]]
      : waypoints;

  return ordered.map((waypoint) => waypoint.iata).join(" → ");
}

export default function RouteCreationBanner() {
  const active = useGameStore((state) => state.routeCreationMode);
  const waypoints = useGameStore((state) => state.creationWaypoints);
  const activeSheet = useGameStore((state) => state.activeSheet);
  const selectedPlane = useGameStore((state) => state.selectedPlane);
  const openSheet = useGameStore((state) => state.openSheet);
  const haptics = useHaptics();
  const hudHeight = useHudHeight();

  if (!active) return null;

  const count = waypoints.length;
  const canReview = count >= 2;
  const path = routePath(waypoints);

  const summary =
    count === 0
      ? "Choose origin hub"
      : count === 1
        ? `${path} → Choose destination`
        : path;

  const instruction =
    count === 0
      ? "Tap one of your blue hub markers"
      : count === 1
        ? "Tap the airport you want to serve"
        : count === 2
          ? "Review now, or tap one airport to add a stop"
          : "One-stop route ready to review";

  const reviewRoute = () => {
    haptics.tap();
    openSheet("create-route", undefined, undefined, undefined, selectedPlane);
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.container, { top: hudHeight }]}
    >
      <View style={styles.copy}>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <Text style={styles.instruction} numberOfLines={1}>
          {instruction}
        </Text>
      </View>

      {canReview && activeSheet !== "create-route" ? (
        <TouchableOpacity
          accessibilityLabel="Review route"
          accessibilityRole="button"
          activeOpacity={0.72}
          onPress={reviewRoute}
          style={styles.reviewButton}
        >
          <Text style={styles.reviewLabel}>Review</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 35,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.md,
    paddingRight: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: Spacing.sm,
  },
  summary: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
    lineHeight: 16,
  },
  instruction: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  reviewButton: {
    minWidth: 76,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  reviewLabel: {
    color: Colors.textOnColor,
    fontSize: 12,
    fontWeight: Typography.weight.semibold,
    lineHeight: 17,
  },
});
