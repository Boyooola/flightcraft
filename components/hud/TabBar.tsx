/**
 * Primary game navigation and map actions.
 *
 * Navigation stays flat and predictable. Route creation and settings remain
 * available from a compact map toolbar instead of a floating center button.
 */

import { Colors, Spacing, Typography } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import type { ActiveSheet } from "@/store";
import { useActiveSheet, useGameStore, useRouteCreationActive } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SheetTabId = Extract<ActiveSheet, "routes" | "fleet" | "finance">;
type NavigationId = "map" | SheetTabId;
type IconName = keyof typeof Ionicons.glyphMap;

interface TabDefinition {
  id: NavigationId;
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  activeIcon: IconName;
}

const TABS: TabDefinition[] = [
  {
    id: "map",
    label: "Map",
    accessibilityLabel: "Return to the airline map",
    icon: "map-outline",
    activeIcon: "map",
  },
  {
    id: "routes",
    label: "Routes",
    accessibilityLabel: "Open route operations",
    icon: "git-network-outline",
    activeIcon: "git-network",
  },
  {
    id: "fleet",
    label: "Fleet",
    accessibilityLabel: "Open aircraft fleet",
    icon: "airplane-outline",
    activeIcon: "airplane",
  },
  {
    id: "finance",
    label: "Finance",
    accessibilityLabel: "Open airline finances",
    icon: "bar-chart-outline",
    activeIcon: "bar-chart",
  },
];

export default function TabBar() {
  const insets = useSafeAreaInsets();
  const activeSheet = useActiveSheet();
  const isCreating = useRouteCreationActive();
  const haptics = useHaptics();

  const openSheet = useGameStore((state) => state.openSheet);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const startCreation = useGameStore((state) => state.startRouteCreation);
  const clearCreation = useGameStore((state) => state.clearRouteCreation);

  const activeTab: NavigationId =
    activeSheet === "routes" ||
    activeSheet === "fleet" ||
    activeSheet === "finance"
      ? activeSheet
      : "map";
  const showMapActions = activeSheet === null;

  const handleTab = (id: NavigationId) => {
    haptics.tap();

    if (isCreating) clearCreation();

    if (id === "map") {
      closeSheet();
      return;
    }

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

  const openSettings = () => {
    haptics.tap();
    if (isCreating) clearCreation();
    openSheet("settings");
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
    >
      {showMapActions ? (
        <View style={styles.mapActions}>
          {!isCreating ? (
            <TouchableOpacity
              accessibilityLabel="Open game settings"
              accessibilityRole="button"
              activeOpacity={0.65}
              onPress={openSettings}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            accessibilityLabel={
              isCreating ? "Cancel route creation" : "Create a new route"
            }
            accessibilityRole="button"
            activeOpacity={0.72}
            onPress={handleRouteAction}
            style={[styles.routeAction, isCreating && styles.routeActionCancel]}
          >
            <Ionicons
              name={isCreating ? "close" : "add"}
              size={20}
              color={Colors.textOnColor}
            />
            <Text style={styles.routeActionLabel}>
              {isCreating ? "Cancel route" : "New route"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.navigation}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <TouchableOpacity
              key={tab.id}
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              activeOpacity={0.65}
              onPress={() => handleTab(tab.id)}
              style={styles.tab}
            >
              {active ? <View style={styles.activeIndicator} /> : null}
              <Ionicons
                name={active ? tab.activeIcon : tab.icon}
                size={21}
                color={active ? Colors.sky : Colors.muted}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
    borderTopColor: Colors.borderSection,
  },
  mapActions: {
    position: "absolute",
    top: -52,
    right: Spacing.md,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: 5,
  },
  routeAction: {
    minWidth: 122,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.sky,
    borderRadius: 5,
  },
  routeActionCancel: {
    backgroundColor: Colors.red,
  },
  routeActionLabel: {
    color: Colors.textOnColor,
    fontSize: 13,
    fontWeight: Typography.weight.semibold,
    lineHeight: 18,
  },
  navigation: {
    height: 70,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: Spacing.xs,
  },
  tab: {
    position: "relative",
    flex: 1,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xxs,
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 2,
    backgroundColor: Colors.sky,
  },
  tabLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: Typography.weight.medium,
    lineHeight: 15,
  },
  tabLabelActive: {
    color: Colors.skyDark,
    fontWeight: Typography.weight.semibold,
  },
});
