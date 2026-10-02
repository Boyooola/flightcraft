/**
 * Shared gameplay bottom sheet.
 *
 * Context sheets preserve the map behind them. Task-focused sheets use a
 * light backdrop so the player can concentrate without losing orientation.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useAvailableSheetHeight, useHudHeight } from "@/hooks/useSheetLayout";
import type { ActiveSheet } from "@/store";
import { useActiveSheet, useGameStore } from "@/store";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import BottomSheet, {
  BottomSheetBackdrop,
  useBottomSheetTimingConfigs,
} from "@gorhom/bottom-sheet";
import type { ComponentType } from "react";
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

const SHEET_COMPONENTS: Record<SheetId, ComponentType> = {
  airport: AirportSheet,
  routes: RoutesSheet,
  fleet: FleetSheet,
  finance: FinanceSheet,
  settings: SettingsSheet,
  leaderboard: LeaderboardSheet,
  bank: BankSheet,
  "create-route": CreateRouteSheet,
  achievements: AchievementsSheet,
  missions: MissionsSheet,
  "privacy-policy": PrivacyPolicySheet,
  "manage-planes": ManagePlanesSheet,
  "assign-route": AssignRouteSheet,
};

/**
 * Context sheets expose the map at their first stop. Full workspaces open at
 * full height because a partial state would only reveal clipped information.
 */
const SNAP_RATIOS: Record<SheetId, readonly number[]> = {
  airport: [0.34, 0.62, 1],
  routes: [0.44, 1],
  fleet: [1],
  finance: [1],
  settings: [0.52],
  leaderboard: [1],
  bank: [0.72, 1],
  "create-route": [0.62, 1],
  achievements: [1],
  missions: [0.58, 1],
  "privacy-policy": [0.88],
  "manage-planes": [1],
  "assign-route": [0.72, 1],
};

const FOCUSED_SHEETS = new Set<SheetId>([
  "settings",
  "leaderboard",
  "bank",
  "create-route",
  "achievements",
  "missions",
  "privacy-policy",
  "manage-planes",
  "assign-route",
]);

export default function SheetManager() {
  const sheetRef = useRef<BottomSheet>(null);
  const activeSheet = useActiveSheet();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const availableHeight = useAvailableSheetHeight();
  const hudHeight = useHudHeight();
  const animationConfigs = useBottomSheetTimingConfigs({ duration: 190 });

  const ActiveSheetContent = activeSheet ? SHEET_COMPONENTS[activeSheet] : null;
  const useBackdrop = activeSheet ? FOCUSED_SHEETS.has(activeSheet) : false;

  const snapPoints = useMemo(() => {
    const ratios = activeSheet ? SNAP_RATIOS[activeSheet] : [0.58];
    const usableHeight = Math.max(240, availableHeight);

    return ratios.map((ratio) => Math.round(usableHeight * ratio));
  }, [activeSheet, availableHeight]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (activeSheet) {
        sheetRef.current?.snapToIndex(0, animationConfigs);
      } else {
        sheetRef.current?.close(animationConfigs);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSheet, animationConfigs]);

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
        opacity={0.18}
        pressBehavior="close"
        onPress={closeSheet}
        style={[props.style, styles.backdrop]}
      />
    ),
    [closeSheet],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      animationConfigs={animationConfigs}
      onChange={handleChange}
      backdropComponent={useBackdrop ? renderBackdrop : undefined}
      enablePanDownToClose
      enableOverDrag={false}
      enableDynamicSizing={false}
      enableBlurKeyboardOnGesture
      keyboardBlurBehavior="restore"
      topInset={hudHeight}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      handleStyle={styles.handleArea}
      style={styles.sheet}
      containerStyle={styles.container}
    >
      {ActiveSheetContent ? <ActiveSheetContent /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 200,
  },
  sheet: {
    zIndex: 200,
  },
  background: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  handleArea: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: Colors.borderSection,
    borderRadius: Radius.sm,
  },
  backdrop: {
    backgroundColor: Colors.text,
  },
});
