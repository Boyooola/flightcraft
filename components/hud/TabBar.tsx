/**
 * components/hud/TabBar.tsx
 *
 * 4 tabs + FAB in centre.
 * Layout: Routes | Fleet | [FAB] | Finance | Settings
 *
 * FAB enters route creation mode.
 * Missions accessible via long-press on FAB or from Settings.
 * Pending mission count shown as badge on FAB.
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import type { ActiveSheet } from "@/store";
import {
  useActiveSheet,
  useAirline,
  useDailyMissions,
  useGameStore,
  useRouteCount,
  useRouteCreationActive,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface TabDef {
  id: ActiveSheet;
  label: string;
  Icon: (props: { color: string; size: number }) => React.ReactNode;
}

const LEFT_TABS: TabDef[] = [
  {
    id: "routes",
    label: "Routes",
    Icon: ({ color, size }) => (
      <MaterialCommunityIcons name="routes" size={size} color={color} />
    ),
  },
  {
    id: "fleet",
    label: "Fleet",
    Icon: ({ color, size }) => (
      <Ionicons name="airplane" size={size} color={color} />
    ),
  },
];

const RIGHT_TABS: TabDef[] = [
  {
    id: "finance",
    label: "Finance",
    Icon: ({ color, size }) => (
      <MaterialCommunityIcons name="chart-line" size={size} color={color} />
    ),
  },
  {
    id: "settings",
    label: "Settings",
    Icon: ({ color, size }) => (
      <Ionicons name="settings-outline" size={size} color={color} />
    ),
  },
];

export default function TabBar() {
  const insets = useSafeAreaInsets();
  const activeSheet = useActiveSheet();
  const openSheet = useGameStore((s) => s.openSheet);
  const closeSheet = useGameStore((s) => s.closeSheet);
  const startCreation = useGameStore((s) => s.startRouteCreation);
  const clearCreation = useGameStore((s) => s.clearRouteCreation);
  const routeCount = useRouteCount();
  const airline = useAirline();
  const isCreating = useRouteCreationActive();
  const dailyMissions = useDailyMissions();
  const haptics = useHaptics();

  const color = airline?.color ?? Colors.sky;

  // Pending missions count for FAB badge
  const pendingMissions = dailyMissions.filter((m) => !m.completed).length;
  const allMissionsDone = pendingMissions === 0 && dailyMissions.length > 0;

  // Pulse animation while in creation mode
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isCreating) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.12,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1.0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [isCreating]);

  const handleTab = (id: ActiveSheet) => {
    haptics.tap();
    if (isCreating) clearCreation();
    activeSheet === id ? closeSheet() : openSheet(id);
  };

  const handleFAB = () => {
    haptics.confirm();
    if (isCreating) {
      clearCreation();
    } else {
      closeSheet();
      startCreation();
    }
  };

  // Long press FAB → open missions
  const handleFABLongPress = () => {
    haptics.confirm();
    if (isCreating) clearCreation();
    openSheet("missions");
  };

  const renderTab = ({ id, label, Icon }: TabDef) => {
    const active = activeSheet === id && !isCreating;
    const c = active ? Colors.sky : Colors.dim;
    const showBadge = id === "routes" && routeCount > 0 && !isCreating;

    return (
      <TouchableOpacity
        key={id}
        style={s.tab}
        onPress={() => handleTab(id)}
        activeOpacity={0.7}
      >
        <View style={[s.iconWrap, active && s.iconWrapActive]}>
          <Icon color={c} size={22} />
          {showBadge && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{routeCount}</Text>
            </View>
          )}
        </View>
        <Text style={[s.label, active && s.labelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        s.container,
        { paddingBottom: Math.max(insets.bottom, Spacing.sm) },
      ]}
    >
      <View style={s.inner}>
        {LEFT_TABS.map(renderTab)}

        {/* FAB — Create Route / Cancel */}
        <View style={s.fabWrap}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity
              style={[
                s.fab,
                {
                  backgroundColor: isCreating
                    ? Colors.red + "20"
                    : color + "18",
                  borderColor: isCreating ? Colors.red : color,
                },
              ]}
              onPress={handleFAB}
              onLongPress={handleFABLongPress}
              delayLongPress={400}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isCreating ? "close" : "add"}
                size={26}
                color={isCreating ? Colors.red : color}
              />
              {/* Mission badge — shows pending count */}
              {!isCreating && pendingMissions > 0 && (
                <View
                  style={[
                    s.missionBadge,
                    {
                      backgroundColor: allMissionsDone
                        ? Colors.green
                        : Colors.amber,
                    },
                  ]}
                >
                  <Text style={s.missionBadgeTxt}>
                    {allMissionsDone ? "✓" : pendingMissions}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
          <Text
            style={[
              s.fabLabel,
              { color: isCreating ? Colors.red : Colors.dim },
            ]}
          >
            {isCreating ? "Cancel" : "Route"}
          </Text>
        </View>

        {RIGHT_TABS.map(renderTab)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 250,
    backgroundColor: "rgba(8,15,30,0.97)",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  inner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    minHeight: MIN_TOUCH,
    justifyContent: "center",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: Colors.skyDim, borderRadius: Radius.md },
  label: { fontSize: 9, color: Colors.dim, letterSpacing: 0.5 },
  labelActive: { color: Colors.sky },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: Colors.sky,
    borderRadius: 6,
    minWidth: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  badgeText: { fontSize: 7, color: Colors.bg, fontWeight: "700" },

  // FAB
  fabWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
    gap: 3,
    width: 64,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabLabel: { fontSize: 9, letterSpacing: 0.5 },

  // Mission badge on FAB
  missionBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(8,15,30,0.97)",
  },
  missionBadgeTxt: { fontSize: 8, fontWeight: "700", color: Colors.bg },
});
