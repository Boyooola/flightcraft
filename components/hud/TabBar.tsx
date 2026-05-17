/**
 * components/hud/TabBar.tsx
 *
 * WorldWide Rush-style bottom controls.
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
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

interface TabDef {
  id: ActiveSheet;
  label: string;
  Icon: (props: { color: string; size: number }) => React.ReactNode;
}

const LEFT_TABS: TabDef[] = [
  {
    id: "routes",
    label: "Operations",
    Icon: ({ color, size }) => (
      <Ionicons name="flash-outline" size={size} color={color} />
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
    label: "Cash",
    Icon: ({ color, size }) => (
      <Ionicons name="cash-outline" size={size} color={color} />
    ),
  },
  {
    id: "settings",
    label: "Menu",
    Icon: ({ color, size }) => (
      <Ionicons name="grid-outline" size={size} color={color} />
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
  const ownedPlanes = useOwnedPlanes();
  const activeRoutes = useRoutes().filter((route) => route.active);
  const busyPlaneIds = new Set(activeRoutes.map((route) => route.plane.id));
  const idleCount = ownedPlanes.filter(
    (plane) => !busyPlaneIds.has(plane.id),
  ).length;

  const pendingMissions = dailyMissions.filter(
    (mission) => !mission.completed,
  ).length;
  const allMissionsDone = pendingMissions === 0 && dailyMissions.length > 0;

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isCreating) {
      pulse.setValue(1);
      return;
    }

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    anim.start();
    return () => anim.stop();
  }, [isCreating, pulse]);

  const handleTab = (id: ActiveSheet) => {
    haptics.tap();
    if (isCreating) clearCreation();
    activeSheet === id ? closeSheet() : openSheet(id);
  };

  const handleFab = () => {
    haptics.confirm();

    if (isCreating) {
      clearCreation();
      return;
    }

    closeSheet();
    startCreation();
  };

  const handleFabLongPress = () => {
    haptics.confirm();
    if (isCreating) clearCreation();
    openSheet("missions");
  };

  const renderTab = ({ id, label, Icon }: TabDef) => {
    const active = activeSheet === id && !isCreating;
    const tabColor = active ? color : Colors.dim;

    const showRoutesBadge = id === "routes" && routeCount > 0 && !isCreating;
    const showIdleBadge = id === "fleet" && idleCount > 0 && !isCreating;

    return (
      <TouchableOpacity
        key={id}
        style={s.tab}
        onPress={() => handleTab(id)}
        activeOpacity={0.78}
      >
        <View
          style={[
            s.iconWrap,
            active && {
              backgroundColor: color + "18",
              borderColor: color + "44",
            },
          ]}
        >
          <Icon color={tabColor} size={22} />

          {showRoutesBadge && (
            <View style={[s.badge, { backgroundColor: color }]}>
              <Text style={s.badgeText}>{routeCount}</Text>
            </View>
          )}

          {showIdleBadge && (
            <View style={[s.badge, { backgroundColor: Colors.amber }]}>
              <Text style={s.badgeText}>{idleCount}</Text>
            </View>
          )}
        </View>

        <Text style={[s.label, active && { color }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        s.container,
        {
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
        },
      ]}
    >
      <View style={s.inner}>
        {LEFT_TABS.map(renderTab)}

        <View style={s.fabWrap}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity
              style={[
                s.fab,
                {
                  backgroundColor: isCreating ? Colors.red : color,
                  borderColor: isCreating ? Colors.red + "66" : color + "77",
                },
              ]}
              onPress={handleFab}
              onLongPress={handleFabLongPress}
              delayLongPress={400}
              activeOpacity={0.88}
            >
              <Ionicons
                name={isCreating ? "close" : "flash-outline"}
                size={26}
                color={Colors.bg}
              />

              {!isCreating && dailyMissions.length > 0 && (
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
                  <Text style={s.missionBadgeText}>
                    {allMissionsDone ? "✓" : pendingMissions}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Text
            style={[
              s.fabLabel,
              {
                color: isCreating ? Colors.red : color,
              },
            ]}
          >
            {isCreating ? "Cancel" : "Build"}
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
    zIndex: 20,
    backgroundColor: "rgba(8,15,30,0.98)",
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
    width: 42,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 9,
    color: Colors.dim,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    borderRadius: 999,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "rgba(8,15,30,0.98)",
  },
  badgeText: {
    fontSize: 7,
    color: Colors.bg,
    fontWeight: "900",
  },
  fabWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
    gap: 3,
    width: 66,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 9,
    elevation: 9,
  },
  fabLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  missionBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 19,
    height: 19,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(8,15,30,0.98)",
  },
  missionBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: Colors.bg,
  },
});
