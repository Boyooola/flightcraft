/**
 * components/ui/GameAlert.tsx
 *
 * WorldWide Rush-style in-game alert.
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

const SLIDE_MS = 220;

export const GameAlert = forwardRef<GameAlertHandle>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<GameAlertConfig | null>(null);
  const slideY = useRef(new Animated.Value(90)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const show = useCallback(
    (cfg: GameAlertConfig) => {
      setConfig(cfg);
      setVisible(true);

      slideY.setValue(90);
      opacity.setValue(0);
      scale.setValue(0.96);

      Animated.parallel([
        Animated.spring(slideY, {
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
          duration: SLIDE_MS,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [opacity, scale, slideY],
  );

  const hide = useCallback(
    (onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 90,
          duration: SLIDE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.96,
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
    },
    [opacity, scale, slideY],
  );

  useImperativeHandle(ref, () => ({ show, hide }), [show, hide]);

  if (!visible || !config) return null;

  const primary =
    config.buttons.find((b) => b.style === "destructive") ??
    config.buttons.find((b) => b.style === "default");

  const cancel = config.buttons.find((b) => b.style === "cancel");

  const extraButtons = config.buttons.filter(
    (button) => button !== primary && button !== cancel,
  );

  const iconColor = primary?.style === "destructive" ? Colors.red : Colors.sky;

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
      <TouchableWithoutFeedback
        onPress={() => {
          if (cancel) hide(() => cancel.onPress?.());
        }}
      >
        <Animated.View style={[s.backdrop, { opacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          s.wrap,
          {
            opacity,
            transform: [{ translateY: slideY }, { scale }],
          },
        ]}
      >
        <View style={s.card}>
          <View style={s.handle} />

          {config.icon && (
            <View
              style={[
                s.iconWrap,
                {
                  backgroundColor: iconColor + "18",
                  borderColor: iconColor + "44",
                },
              ]}
            >
              <Ionicons name={config.icon as any} size={28} color={iconColor} />
            </View>
          )}

          <Text style={s.title}>{config.title}</Text>
          <Text style={s.message}>{config.message}</Text>

          <View style={s.actions}>
            {primary && (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  {
                    backgroundColor:
                      primary.style === "destructive" ? Colors.red : Colors.sky,
                  },
                ]}
                onPress={() => handleButton(primary)}
                activeOpacity={0.86}
              >
                <Text style={s.primaryText}>{primary.label}</Text>
              </TouchableOpacity>
            )}

            {extraButtons.map((btn, index) => (
              <TouchableOpacity
                key={`${btn.label}-${index}`}
                style={s.secondaryBtn}
                onPress={() => handleButton(btn)}
                activeOpacity={0.78}
              >
                <Text style={s.secondaryText}>{btn.label}</Text>
              </TouchableOpacity>
            ))}

            {cancel && (
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => handleButton(cancel)}
                activeOpacity={0.75}
              >
                <Text style={s.cancelText}>{cancel.label}</Text>
              </TouchableOpacity>
            )}
          </View>
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

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(8,15,30,0.98)",
    padding: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: Spacing.lg,
  },
  iconWrap: {
    alignSelf: "center",
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 19,
    color: Colors.text,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.sm,
  },
  primaryBtn: {
    minHeight: 46,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontSize: 14,
    color: Colors.bg,
    fontWeight: "900",
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  secondaryText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "800",
  },
  cancelBtn: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 13,
    color: Colors.dim,
    fontWeight: "800",
  },
});
