/**
 * components/sheets/SheetManager.tsx
 *
 * Single BottomSheet instance that swaps content based on activeSheet.
 * Constrained between TopHUD (topInset) and TabBar (pixel snap points).
 */

import { Colors, Radius, Shadow } from "@/constants/theme";
import { useAvailableSheetHeight, useHudHeight } from "@/hooks/useSheetLayout";
import type { ActiveSheet } from "@/store";
import { useActiveSheet, useGameStore } from "@/store";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import AchievementsSheet from "./AchievementsSheet";
import AirportSheet from "./AirportSheet";
import AssignRouteSheet from "./AssignRouteSheet";
import BankSheet from "./BankSheet";
import CreateRouteSheet from "./CreateRouteSheet";
import FinanceSheet from "./FinanceSheet";
import FleetSheet from "./FleetSheet";
import LeaderboardSheet from "./LeaderboardSheet";
import ManagePlanesSheet from "./ManagePlanesSheet";
import MissionsSheet from "./MissionsSheet";
import PrivacyPolicySheet from "./PrivacyPolicySheet";
import RoutesSheet from "./RoutesSheet";
import SettingsSheet from "./SettingsSheet";

type SheetId = Exclude<ActiveSheet, null>;

const SNAP_RATIOS: Record<SheetId, number[]> = {
  airport: [0.55, 1.0],
  fleet: [1.0],
  "manage-planes": [1.0],
  "assign-route": [0.75, 1.0],
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
    const ratios = activeSheet ? SNAP_RATIOS[activeSheet] : [0.65];
    const usableHeight = Math.max(240, availableH);
    return ratios.map((ratio) => Math.round(usableHeight * ratio));
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
        style={[props.style, s.backdrop]}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.32}
        pressBehavior="close"
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
      enableDynamicSizing={false}
      enableBlurKeyboardOnGesture
      keyboardBlurBehavior="restore"
      overDragResistanceFactor={4}
      topInset={hudH}
      backgroundStyle={s.bg}
      handleIndicatorStyle={s.handle}
      handleStyle={s.handleWrap}
      style={s.sheet}
      containerStyle={s.container}
    >
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
      {activeSheet === "manage-planes" && <ManagePlanesSheet />}
      {activeSheet === "assign-route" && <AssignRouteSheet />}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  container: {
    zIndex: 200,
  },
  sheet: {
    zIndex: 200,
    elevation: 24,
  },
  bg: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: Shadow.floating.shadowColor,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: Shadow.floating.shadowOpacity,
    shadowRadius: Shadow.floating.shadowRadius,
  },
  handleWrap: {
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: Colors.borderSection,
    borderRadius: Radius.full,
  },
  backdrop: {
    backgroundColor: Colors.text,
  },
});
