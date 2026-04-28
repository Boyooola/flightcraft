/**
 * components/ui/GameAlert.tsx
 *
 * In-game slide-up modal that replaces native Alert.alert.
 * Matches the dark game aesthetic — no jarring OS dialogs.
 *
 * Usage:
 *   const alert = useGameAlert();
 *
 *   alert.show({
 *     title:   "Remove Route",
 *     message: "Stop flying MNL → SIN?",
 *     buttons: [
 *       { label: "Cancel",       style: "cancel",      onPress: () => {} },
 *       { label: "Remove Route", style: "destructive",  onPress: handleRemove },
 *     ],
 *   });
 *
 *   // In JSX:
 *   <GameAlert ref={alert.ref} />
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
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

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────

const SLIDE_MS = 280;

export const GameAlert = forwardRef<GameAlertHandle>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<GameAlertConfig | null>(null);
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback((cfg: GameAlertConfig) => {
    setConfig(cfg);
    setVisible(true);
    slideY.setValue(80);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const hide = useCallback((onDone?: () => void) => {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 80,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
      onDone?.();
    });
  }, []);

  useImperativeHandle(ref, () => ({ show, hide }));

  if (!visible || !config) return null;

  const handleButton = (btn: GameAlertButton) => {
    hide(() => btn.onPress?.());
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => hide()}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback
        onPress={() => {
          // Only dismiss on backdrop tap if there's a cancel button
          const cancel = config.buttons.find((b) => b.style === "cancel");
          if (cancel) hide(() => cancel.onPress?.());
        }}
      >
        <Animated.View style={[s.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <Animated.View
        style={[s.wrap, { transform: [{ translateY: slideY }], opacity }]}
      >
        <View style={s.card}>
          {/* Icon */}
          {config.icon && (
            <View style={s.iconWrap}>
              <Ionicons
                name={config.icon as any}
                size={28}
                color={Colors.sky}
              />
            </View>
          )}

          {/* Text */}
          <Text style={s.title}>{config.title}</Text>
          <Text style={s.message}>{config.message}</Text>

          {/* Divider */}
          <View style={s.divider} />

          {/* Buttons */}
          <View style={[s.btnRow, config.buttons.length > 2 && s.btnCol]}>
            {config.buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  config.buttons.length > 2 && s.btnFull,
                  btn.style === "cancel" && s.btnCancel,
                  btn.style === "destructive" && s.btnDestructive,
                  btn.style === "default" && s.btnDefault,
                  i > 0 && config.buttons.length <= 2 && s.btnBorderLeft,
                  i > 0 && config.buttons.length > 2 && s.btnBorderTop,
                ]}
                onPress={() => handleButton(btn)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.btnTxt,
                    btn.style === "cancel" && s.btnTxtCancel,
                    btn.style === "destructive" && s.btnTxtDestructive,
                    btn.style === "default" && s.btnTxtDefault,
                  ]}
                >
                  {btn.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
});

GameAlert.displayName = "GameAlert";

// ─────────────────────────────────────────────────────────────────
// HOOK — creates ref and exposes show/hide
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  wrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl + Spacing.lg,
  },
  card: {
    backgroundColor: "rgba(12,20,38,0.99)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    paddingTop: Spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.sky + "18",
    borderWidth: 1,
    borderColor: Colors.sky + "33",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  btnRow: {
    flexDirection: "row",
  },
  btnCol: {
    flexDirection: "column",
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  btnFull: {
    flex: 0,
  },
  btnCancel: {
    backgroundColor: "transparent",
  },
  btnDestructive: {
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  btnDefault: {
    backgroundColor: "rgba(56,189,248,0.08)",
  },
  btnBorderLeft: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
  btnBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  btnTxt: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.muted,
  },
  btnTxtCancel: {
    color: Colors.muted,
    fontWeight: "500",
  },
  btnTxtDestructive: {
    color: "#ef4444",
    fontWeight: "700",
  },
  btnTxtDefault: {
    color: Colors.sky,
    fontWeight: "700",
  },
});
