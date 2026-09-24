/**
 * Shared measurements for the fixed game HUD, bottom navigation, sheets,
 * and map overlays.
 */

import { Spacing } from "@/constants/theme";
import { Platform, StatusBar, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TOP_COMMAND_ROW_HEIGHT = 56;
const TOP_OPERATIONS_STRIP_HEIGHT = 48;
const BOTTOM_BRAND_RAIL_HEIGHT = 3;
const BOTTOM_NAVIGATION_HEIGHT = 67;
const ANDROID_STATUS_BAR_FALLBACK = 24;

/**
 * Exact fixed heights excluding device safe-area insets.
 *
 * Keep these values synchronized with TopHUD.tsx and TabBar.tsx whenever
 * their structural heights change.
 */
export const GAME_SHELL_METRICS = {
  hudContentHeight:
    Spacing.xs +
    TOP_COMMAND_ROW_HEIGHT +
    Spacing.sm +
    TOP_OPERATIONS_STRIP_HEIGHT +
    Spacing.md,
  tabContentHeight: BOTTOM_BRAND_RAIL_HEIGHT + BOTTOM_NAVIGATION_HEIGHT,
  minimumBottomPadding: Spacing.sm,
} as const;

function resolveTopInset(safeAreaTop: number) {
  if (Platform.OS !== "android") return safeAreaTop;

  return (
    StatusBar.currentHeight ||
    safeAreaTop ||
    ANDROID_STATUS_BAR_FALLBACK
  );
}

function calculateLayout(
  windowHeight: number,
  safeAreaTop: number,
  safeAreaBottom: number,
) {
  const hudHeight =
    resolveTopInset(safeAreaTop) + GAME_SHELL_METRICS.hudContentHeight;
  const tabBarHeight =
    GAME_SHELL_METRICS.tabContentHeight +
    Math.max(safeAreaBottom, GAME_SHELL_METRICS.minimumBottomPadding);
  const availableHeight = Math.max(
    0,
    windowHeight - hudHeight - tabBarHeight,
  );

  return { hudHeight, tabBarHeight, availableHeight };
}

/** Full height of the top HUD, including the platform safe area. */
export function useHudHeight(): number {
  const insets = useSafeAreaInsets();

  return (
    resolveTopInset(insets.top) + GAME_SHELL_METRICS.hudContentHeight
  );
}

/** Full height of the bottom navigation, including its safe-area padding. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();

  return (
    GAME_SHELL_METRICS.tabContentHeight +
    Math.max(insets.bottom, GAME_SHELL_METRICS.minimumBottomPadding)
  );
}

/** Usable vertical space between the top HUD and bottom navigation. */
export function useAvailableSheetHeight(): number {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return calculateLayout(height, insets.top, insets.bottom).availableHeight;
}

/** All shell measurements from one safe-area and window calculation. */
export function useSheetLayout() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return calculateLayout(height, insets.top, insets.bottom);
}
