/**
 * hooks/useSheetLayout.ts
 *
 * Shared height constants for bottom sheets.
 * Ensures sheets never overlap TopHUD (top) or TabBar (bottom).
 *
 * TopHUD height  = topSafeArea + 56px content
 * TabBar height  = 53px content + bottomSafeArea
 *
 * Used by:
 *   - SheetManager  → topInset + pixel snap points
 *   - Every sheet   → contentContainerStyle paddingBottom
 */

import { Platform, StatusBar, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HUD_CONTENT_H = 56; // TopHUD rows height (excluding safe area)
const TAB_CONTENT_H = 53; // TabBar rows height (excluding safe area)

/** Height of TopHUD including top safe area inset */
export function useHudHeight(): number {
  const insets = useSafeAreaInsets();
  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;
  return topInset + HUD_CONTENT_H;
}

/** Height of TabBar including bottom safe area inset */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_CONTENT_H + Math.max(insets.bottom, 8);
}

/**
 * Available height between TopHUD bottom and TabBar top.
 * This is the maximum a sheet can ever grow to.
 */
export function useAvailableSheetHeight(): number {
  const { height } = useWindowDimensions();
  const hudH = useHudHeight();
  const tabH = useTabBarHeight();
  return height - hudH - tabH;
}
