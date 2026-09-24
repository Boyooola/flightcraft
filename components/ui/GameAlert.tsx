/**
 * Shared animated decision dialog for notices, confirmations, and warnings.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

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

const ANIMATION_MS = 220;

function getAlertTone(primary?: GameAlertButton) {
  const destructive = primary?.style === "destructive";

  return {
    destructive,
    accent: destructive ? Colors.red : Colors.sky,
    surface: destructive ? Palette.redSoft : Palette.blueSoft,
    eyebrow: destructive ? "PERMANENT ACTION" : "FLIGHTCRAFT NOTICE",
  };
}

export const GameAlert = forwardRef<GameAlertHandle>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<GameAlertConfig | null>(null);
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;
  const closingRef = useRef(false);

  const show = useCallback(
    (nextConfig: GameAlertConfig) => {
      closingRef.current = false;
      translateY.stopAnimation();
      opacity.stopAnimation();
      scale.stopAnimation();

      setConfig(nextConfig);
      setVisible(true);
      translateY.setValue(80);
      opacity.setValue(0);
      scale.setValue(0.97);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 85,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [opacity, scale, translateY],
  );

  const hide = useCallback(
    (onDone?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 60,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.97,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setVisible(false);
        setConfig(null);
        closingRef.current = false;
        onDone?.();
      });
    },
    [opacity, scale, translateY],
  );

  useImperativeHandle(ref, () => ({ show, hide }), [hide, show]);

  if (!visible || !config) return null;

  const primary =
    config.buttons.find((button) => button.style === "destructive") ??
    config.buttons.find((button) => button.style === "default");
  const cancel = config.buttons.find((button) => button.style === "cancel");
  const secondaryButtons = config.buttons.filter(
    (button) => button !== primary && button !== cancel,
  );
  const tone = getAlertTone(primary);

  const handleButton = (button: GameAlertButton) => {
    hide(() => button.onPress?.());
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
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.positioner,
          {
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.card, { borderTopColor: tone.accent }]}
        >
          <View style={styles.heading}>
            <View style={[styles.icon, { backgroundColor: tone.surface }]}>
              <Ionicons
                name={(config.icon ?? "information-circle-outline") as any}
                size={24}
                color={tone.accent}
              />
            </View>

            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: tone.accent }]}>
                {tone.eyebrow}
              </Text>
              <Text style={styles.title}>{config.title}</Text>
            </View>
          </View>

          <Text style={styles.message}>{config.message}</Text>

          <View style={styles.actions}>
            {primary && (
              <TouchableOpacity
                accessibilityLabel={primary.label}
                accessibilityRole="button"
                style={[styles.primaryButton, { backgroundColor: tone.accent }]}
                onPress={() => handleButton(primary)}
                activeOpacity={0.86}
              >
                <Ionicons
                  name={
                    tone.destructive
                      ? "warning-outline"
                      : "checkmark-circle-outline"
                  }
                  size={17}
                  color={Colors.textOnColor}
                />
                <Text style={styles.primaryText}>{primary.label}</Text>
              </TouchableOpacity>
            )}

            {secondaryButtons.map((button, index) => (
              <TouchableOpacity
                key={`${button.label}-${index}`}
                accessibilityLabel={button.label}
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() => handleButton(button)}
                activeOpacity={0.82}
              >
                <Text style={styles.secondaryText}>{button.label}</Text>
              </TouchableOpacity>
            ))}

            {cancel && (
              <TouchableOpacity
                accessibilityLabel={cancel.label}
                accessibilityRole="button"
                style={[
                  styles.cancelButton,
                  !primary && styles.cancelButtonOnly,
                ]}
                onPress={() => handleButton(cancel)}
                activeOpacity={0.78}
              >
                <Text
                  style={[styles.cancelText, !primary && styles.cancelTextOnly]}
                >
                  {cancel.label}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {cancel && (
            <Text style={styles.dismissHint}>Tap outside to dismiss</Text>
          )}
        </View>
      </Animated.View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  positioner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: Colors.panel,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 5,
    padding: Spacing.lg,
    ...Shadow.floating,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xxs,
  },
  message: {
    color: Colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.sm,
  },
  primaryButton: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  primaryText: {
    color: Colors.textOnColor,
    fontSize: 14,
    fontWeight: Typography.weight.bold,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.blueSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(23,105,170,0.20)",
    paddingHorizontal: Spacing.md,
  },
  secondaryText: {
    color: Colors.skyDark,
    fontSize: 13,
    fontWeight: Typography.weight.bold,
  },
  cancelButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  cancelButtonOnly: {
    backgroundColor: Colors.sky,
  },
  cancelText: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: Typography.weight.bold,
  },
  cancelTextOnly: {
    color: Colors.textOnColor,
  },
  dismissHint: {
    color: Colors.dim,
    fontSize: 9,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
