/**
 * components/sheets/SheetManager.tsx
 *
 * Single BottomSheet instance that swaps content based on activeSheet.
 * Constrained between TopHUD (topInset) and TabBar (pixel snap points).
 */

import { Colors } from "@/constants/theme";
import { useAvailableSheetHeight, useHudHeight } from "@/hooks/useSheetLayout";
import { useActiveSheet, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AchievementsSheet from "./AchievementsSheet";
import AirportSheet from "./AirportSheet";
import BankSheet from "./BankSheet";
import CreateRouteSheet from "./CreateRouteSheet";
import FinanceSheet from "./FinanceSheet";
import FleetSheet from "./FleetSheet";
import LeaderboardSheet from "./LeaderboardSheet";
import MissionsSheet from "./MissionsSheet";
import PrivacyPolicySheet from "./PrivacyPolicySheet";
import RoutesSheet from "./RoutesSheet";
import SettingsSheet from "./SettingsSheet";

const SNAP_RATIOS: Record<string, number[]> = {
  airport: [0.55, 1.0],
  fleet: [1.0],
  finance: [1.0],
  routes: [0.55, 1.0],
  settings: [0.55],
  leaderboard: [1.0],
  bank: [0.75, 1.0],
  "create-route": [0.65, 1.0],
  achievements: [1.0],
  missions: [0.65, 1.0],
  "privacy-policy": [0.85],
};

export default function SheetManager() {
  const sheetRef = useRef<BottomSheet>(null);
  const activeSheet = useActiveSheet();
  const closeSheet = useGameStore((s) => s.closeSheet);

  const availableH = useAvailableSheetHeight();
  const hudH = useHudHeight();

  const snapPoints = useMemo(() => {
    const ratios = SNAP_RATIOS[activeSheet ?? ""] ?? [0.65];
    return ratios.map((r) => Math.round(availableH * r));
  }, [activeSheet, availableH]);

  useEffect(() => {
    if (activeSheet) {
      const t = setTimeout(() => sheetRef.current?.snapToIndex(0), 30);
      return () => clearTimeout(t);
    } else {
      sheetRef.current?.close();
    }
  }, [activeSheet]);

  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) closeSheet();
    },
    [closeSheet],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        onPress={closeSheet}
      />
    ),
    [closeSheet],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      topInset={hudH}
      backgroundStyle={s.bg}
      handleIndicatorStyle={s.handle}
      handleStyle={s.handleWrap}
      style={s.sheet}
      containerStyle={{ zIndex: 200 }}
    >
      {/* Close button row — always visible at top of every sheet */}
      <View style={s.closeRow}>
        <Text style={s.sheetTitle}>
          {activeSheet === "airport"
            ? "Airport"
            : activeSheet === "routes"
              ? "Routes"
              : activeSheet === "fleet"
                ? "Fleet"
                : activeSheet === "finance"
                  ? "Finance"
                  : activeSheet === "settings"
                    ? "Settings"
                    : activeSheet === "leaderboard"
                      ? "Leaderboard"
                      : activeSheet === "bank"
                        ? "Bank"
                        : activeSheet === "create-route"
                          ? "New Route"
                          : activeSheet === "achievements"
                            ? "Achievements"
                            : activeSheet === "missions"
                              ? "Missions"
                              : ""}
        </Text>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => useGameStore.getState().closeSheet()}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={16} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {activeSheet === "airport" && <AirportSheet />}
      {activeSheet === "routes" && <RoutesSheet />}
      {activeSheet === "fleet" && <FleetSheet />}
      {activeSheet === "finance" && <FinanceSheet />}
      {activeSheet === "settings" && <SettingsSheet />}
      {activeSheet === "leaderboard" && <LeaderboardSheet />}
      {activeSheet === "bank" && <BankSheet />}
      {activeSheet === "create-route" && <CreateRouteSheet />}
      {activeSheet === "achievements" && <AchievementsSheet />}
      {activeSheet === "missions" && <MissionsSheet />}
      {activeSheet === "privacy-policy" && <PrivacyPolicySheet />}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheet: {
    // gorhom/bottom-sheet uses its own Portal — zIndex here
    // applies within the Portal layer, above all map/HUD elements
    zIndex: 200,
    elevation: 200,
  },
  bg: {
    backgroundColor: "#0d1526",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  handleWrap: { paddingTop: 10, paddingBottom: 0 },
  handle: { backgroundColor: "rgba(255,255,255,.45)", width: 40, height: 5 },
  closeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.muted,
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 0.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
