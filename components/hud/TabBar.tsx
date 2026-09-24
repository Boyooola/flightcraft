/**
 * Primary game navigation and route-creation action.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import type { ActiveSheet } from "@/store";
import {
  useActiveSheet,
  useAirline,
  useDailyMissions,
  useGameStore,
  useOwnedPlanes,
  useRouteCount,
  useRouteCreationActive,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabId = Exclude<ActiveSheet, null>;

interface TabDefinition {
  id: TabId;
  label: string;
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const LEFT_TABS: TabDefinition[] = [
  {
    id: "routes",
    label: "Routes",
    accessibilityLabel: "Open route operations",
    icon: "map-outline",
  },
  {
    id: "fleet",
    label: "Fleet",
    accessibilityLabel: "Open aircraft fleet",
    icon: "airplane-outline",
  },
];

const RIGHT_TABS: TabDefinition[] = [
  {
    id: "finance",
    label: "Finance",
    accessibilityLabel: "Open airline finances",
    icon: "wallet-outline",
  },
  {
    id: "settings",
    label: "More",
    accessibilityLabel: "Open game menu",
    icon: "grid-outline",
  },
];

export default function TabBar() {
  const insets = useSafeAreaInsets();
  const activeSheet = useActiveSheet();
  const airline = useAirline();
  const routeCount = useRouteCount();
  const isCreating = useRouteCreationActive();
  const dailyMissions = useDailyMissions();
  const ownedPlanes = useOwnedPlanes();
  const routes = useRoutes();
  const haptics = useHaptics();

  const openSheet = useGameStore((state) => state.openSheet);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const startCreation = useGameStore((state) => state.startRouteCreation);
  const clearCreation = useGameStore((state) => state.clearRouteCreation);

  const airlineColor = airline?.color ?? Colors.sky;
  const busyPlaneIds = new Set(
    routes.filter((route) => route.active).map((route) => route.plane.id),
  );
  const idleCount = ownedPlanes.filter(
    (plane) => !busyPlaneIds.has(plane.id),
  ).length;
  const pendingMissions = dailyMissions.filter(
    (mission) => !mission.completed,
  ).length;
  const allMissionsDone = pendingMissions === 0 && dailyMissions.length > 0;

  const actionPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isCreating) {
      actionPulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(actionPulse, {
          toValue: 1.06,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(actionPulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [actionPulse, isCreating]);

  const handleTab = (id: TabId) => {
    haptics.tap();

    if (isCreating) clearCreation();
    if (activeSheet === id) closeSheet();
    else openSheet(id);
  };

  const handleRouteAction = () => {
    haptics.confirm();

    if (isCreating) {
      clearCreation();
      return;
    }

    closeSheet();
    startCreation();
  };

  const openMissions = () => {
    haptics.confirm();
    if (isCreating) clearCreation();
    openSheet("missions");
  };

  const renderTab = ({
    id,
    label,
    accessibilityLabel,
    icon,
  }: TabDefinition) => {
    const active = activeSheet === id && !isCreating;
    const routesBadge = id === "routes" && routeCount > 0 && !isCreating;
    const idleBadge = id === "fleet" && idleCount > 0 && !isCreating;

    return (
      <TouchableOpacity
        key={id}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={styles.tab}
        onPress={() => handleTab(id)}
        activeOpacity={0.68}
      >
        <View style={[styles.iconContainer, active && styles.iconContainerActive]}>
          <Ionicons
            name={active ? icon.replace("-outline", "") as typeof icon : icon}
            size={21}
            color={active ? Colors.sky : Colors.muted}
          />

          {routesBadge ? (
            <View style={[styles.badge, styles.routeBadge]}>
              <Text style={styles.badgeTextLight}>{routeCount}</Text>
            </View>
          ) : null}

          {idleBadge ? (
            <View style={[styles.badge, styles.idleBadge]}>
              <Text style={styles.badgeTextDark}>{idleCount}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
    >
      <View style={styles.brandRail}>
        <View
          style={[styles.brandRailAccent, { backgroundColor: airlineColor }]}
        />
      </View>

      <View style={styles.navigation}>
        {LEFT_TABS.map(renderTab)}

        <View style={styles.routeActionSlot}>
          <Animated.View style={{ transform: [{ scale: actionPulse }] }}>
            <TouchableOpacity
              accessibilityHint="Long press to open missions"
              accessibilityLabel={
                isCreating ? "Cancel route creation" : "Create a new route"
              }
              accessibilityRole="button"
              style={[
                styles.routeAction,
                isCreating && styles.routeActionCancel,
              ]}
              onPress={handleRouteAction}
              onLongPress={openMissions}
              delayLongPress={400}
              activeOpacity={0.76}
            >
              <Ionicons
                name={isCreating ? "close" : "add"}
                size={27}
                color={Colors.textOnColor}
              />

              {!isCreating && dailyMissions.length > 0 ? (
                <View
                  style={[
                    styles.missionBadge,
                    allMissionsDone
                      ? styles.missionBadgeComplete
                      : styles.missionBadgePending,
                  ]}
                >
                  <Text
                    style={
                      allMissionsDone
                        ? styles.badgeTextLight
                        : styles.badgeTextDark
                    }
                  >
                    {allMissionsDone ? "✓" : pendingMissions}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </Animated.View>

          <Text
            style={[
              styles.routeActionLabel,
              isCreating && styles.routeActionLabelCancel,
            ]}
          >
            {isCreating ? "Cancel" : "New Route"}
          </Text>
        </View>

        {RIGHT_TABS.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: Shadow.card.shadowColor,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: Shadow.card.shadowOpacity,
    shadowRadius: Shadow.card.shadowRadius,
    elevation: Shadow.card.elevation,
  },
  brandRail: {
    height: 3,
    overflow: "hidden",
    backgroundColor: Colors.skyDim,
  },
  brandRailAccent: {
    width: "28%",
    height: "100%",
  },
  navigation: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  tab: {
    minHeight: MIN_TOUCH + 12,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  iconContainer: {
    width: 46,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  iconContainerActive: {
    backgroundColor: Palette.blueSoft,
  },
  tabLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  tabLabelActive: {
    color: Colors.skyDark,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 1,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.surface,
    borderRadius: Radius.full,
  },
  routeBadge: {
    backgroundColor: Colors.sky,
  },
  idleBadge: {
    backgroundColor: Colors.amber,
  },
  badgeTextLight: {
    color: Colors.textOnColor,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
  },
  badgeTextDark: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
  },
  routeActionSlot: {
    width: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  routeAction: {
    width: 54,
    height: 54,
    marginTop: -18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.sky,
    borderWidth: 3,
    borderColor: Colors.surface,
    borderRadius: Radius.full,
    ...Shadow.floating,
  },
  routeActionCancel: {
    backgroundColor: Colors.red,
  },
  routeActionLabel: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  routeActionLabelCancel: {
    color: Colors.red,
  },
  missionBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.surface,
    borderRadius: Radius.full,
  },
  missionBadgeComplete: {
    backgroundColor: Colors.green,
  },
  missionBadgePending: {
    backgroundColor: Colors.amber,
  },
});
