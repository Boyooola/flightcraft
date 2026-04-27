/**
 * hooks/useHaptics.ts
 *
 * Centralised haptic feedback.
 * Wraps expo-haptics with named actions so we're consistent everywhere.
 *
 * Usage:
 *   const haptics = useHaptics();
 *   haptics.tap();
 *   haptics.confirm();
 *   haptics.success();
 *   haptics.warning();
 */

import * as Haptics from "expo-haptics";
import { useCallback } from "react";

export function useHaptics() {
  const tap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const confirm = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const success = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const warning = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const error = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  return { tap, confirm, success, warning, error };
}
