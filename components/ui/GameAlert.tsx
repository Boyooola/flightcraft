/**
 * Shared action sheet for notices, confirmations, and permanent actions.
 *
 * Callers supply the exact consequence and button wording. This component
 * keeps the visual hierarchy and dismissal behavior consistent everywhere.
 */

import { Colors, Radius, Spacing, Typography } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface GameAlertButton {
  label: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export interface GameAlertConfig {
  icon?: string;
  title: string;
  message: string;
  buttons: GameAlertButton[];
}

export interface GameAlertHandle {
  show: (config: GameAlertConfig) => void;
  hide: () => void;
}

type ButtonAppearance = "primary" | "secondary" | "destructive";

function buttonAppearance(
  button: GameAlertButton,
  buttonCount: number,
): ButtonAppearance {
  if (button.style === "destructive") return "destructive";
  if (button.style === "cancel" && buttonCount > 1) return "secondary";
  return "primary";
}

function isWarningIcon(icon?: string) {
  if (!icon) return false;
  return ["warning", "alert", "trash", "close-circle"].some((name) =>
    icon.includes(name),
  );
}

function alertType(
  destructive: boolean,
  warning: boolean,
  buttonCount: number,
) {
  if (destructive) return "Permanent action";
  if (warning) return "Warning";
  if (buttonCount > 1) return "Confirmation";
  return "FlightCraft notice";
}

export const GameAlert = forwardRef<GameAlertHandle>((_, ref) => {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<GameAlertConfig | null>(null);

  const show = useCallback((nextConfig: GameAlertConfig) => {
    setConfig(nextConfig);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setConfig(null);
  }, []);

  useImperativeHandle(ref, () => ({ show, hide }), [hide, show]);

  if (!visible || !config) return null;

  const cancel = config.buttons.find((button) => button.style === "cancel");
  const destructive = config.buttons.some(
    (button) => button.style === "destructive",
  );
  const warning = destructive || isWarningIcon(config.icon);
  const typeLabel = alertType(destructive, warning, config.buttons.length);
  const iconColor = warning ? Colors.red : Colors.skyDark;

  const handleButton = (button: GameAlertButton) => {
    hide();
    button.onPress?.();
  };

  const handleDismiss = () => {
    if (cancel) handleButton(cancel);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={cancel ? "Dismiss dialog" : undefined}
          accessibilityRole={cancel ? "button" : undefined}
          disabled={!cancel}
          onPress={handleDismiss}
          style={styles.backdrop}
        />

        <View
          accessibilityLabel={`${typeLabel}. ${config.title}. ${config.message}`}
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
          ]}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.typeRow}>
              <View style={[styles.iconBox, warning && styles.iconBoxWarning]}>
                <Ionicons
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  name={
                    (config.icon ??
                      (destructive
                        ? "warning-outline"
                        : "information-circle-outline")) as keyof typeof Ionicons.glyphMap
                  }
                  size={21}
                  color={iconColor}
                />
              </View>
              <Text style={[styles.typeLabel, warning && styles.typeWarning]}>
                {typeLabel}
              </Text>
            </View>

            <Text accessibilityRole="header" style={styles.title}>
              {config.title}
            </Text>
            <Text style={styles.message}>{config.message}</Text>

            <View
              style={[
                styles.actions,
                config.buttons.length > 2 && styles.actionsStacked,
              ]}
            >
              {config.buttons.map((button, index) => {
                const appearance = buttonAppearance(
                  button,
                  config.buttons.length,
                );

                return (
                  <Pressable
                    accessibilityLabel={button.label}
                    accessibilityRole="button"
                    key={`${button.label}-${index}`}
                    onPress={() => handleButton(button)}
                    style={({ pressed }) => [
                      styles.button,
                      config.buttons.length <= 2 && styles.buttonInRow,
                      appearance === "primary" && styles.primaryButton,
                      appearance === "secondary" && styles.secondaryButton,
                      appearance === "destructive" && styles.destructiveButton,
                      pressed &&
                        appearance === "primary" &&
                        styles.primaryButtonPressed,
                      pressed &&
                        appearance === "secondary" &&
                        styles.secondaryButtonPressed,
                      pressed &&
                        appearance === "destructive" &&
                        styles.destructiveButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        appearance === "secondary"
                          ? styles.secondaryButtonText
                          : styles.filledButtonText,
                      ]}
                    >
                      {button.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!cancel ? (
              <Text style={styles.requiredNote}>
                Choose an action to continue.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

GameAlert.displayName = "GameAlert";

export function useGameAlert() {
  const ref = useRef<GameAlertHandle>(null);

  const show = useCallback((config: GameAlertConfig) => {
    ref.current?.show(config);
  }, []);

  const hide = useCallback(() => {
    ref.current?.hide();
  }, []);

  return { ref, show, hide };
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "82%",
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: Colors.panel,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  content: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  typeRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.sm,
  },
  iconBoxWarning: {
    backgroundColor: "#F1E8E7",
  },
  typeLabel: {
    flex: 1,
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  typeWarning: {
    color: Colors.red,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  message: {
    marginTop: Spacing.sm,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  actionsStacked: {
    flexDirection: "column",
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  buttonInRow: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: Colors.sky,
  },
  primaryButtonPressed: {
    backgroundColor: Colors.skyDark,
  },
  secondaryButton: {
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.borderSection,
  },
  secondaryButtonPressed: {
    backgroundColor: Colors.skyDim,
  },
  destructiveButton: {
    backgroundColor: Colors.red,
  },
  destructiveButtonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
    textAlign: "center",
  },
  filledButtonText: {
    color: Colors.textOnColor,
  },
  secondaryButtonText: {
    color: Colors.text,
  },
  requiredNote: {
    marginTop: Spacing.md,
    color: Colors.dim,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
  },
});
