/**
 * components/auth/AuthScreen.tsx
 *
 * First screen the player sees.
 * Attempts silent sign-in on mount.
 * Shows full screen only if silent sign-in fails.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEATURES = [
  { icon: "globe-outline", label: "40,000+ real airports worldwide" },
  { icon: "airplane-outline", label: "Buy hubs, assign planes, grow routes" },
  { icon: "people-outline", label: "Compete against AI rival airlines" },
  { icon: "trophy-outline", label: "55 Google Play achievements" },
];

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isLoading } = useAuth();
  const [failed, setFailed] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  // Attempt silent sign-in on mount
  useEffect(() => {
    signIn().then((result) => {
      if (!result) setFailed(true);
    });
  }, []);

  // Fade in once we know silent sign-in failed
  useEffect(() => {
    if (failed || (!isLoading && !failed)) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [failed, isLoading]);

  const handleSignIn = async () => {
    setFailed(false);
    const result = await signIn();
    if (!result) setFailed(true);
  };

  // While silently signing in — minimal spinner, no flash of content
  if (isLoading && !failed) {
    return (
      <View style={s.splashContainer}>
        <View style={s.logoWrap}>
          <Ionicons name="airplane" size={40} color={Colors.sky} />
        </View>
        <Text style={s.splashName}>FlightCraft</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + Spacing.xl }]}>
      {/* Atmosphere — subtle glow behind logo */}
      <View style={s.bgGlow} />

      <Animated.View
        style={[
          s.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.logoWrap}>
            <Ionicons name="airplane" size={44} color={Colors.sky} />
          </View>
          <Text style={s.appName}>FlightCraft</Text>
          <Text style={s.tagline}>
            Run your own airline.{"\n"}Compete. Expand. Dominate.
          </Text>
        </View>

        {/* Features */}
        <View style={s.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={s.featureRow}>
              <View style={s.featureIcon}>
                <Ionicons name={f.icon as any} size={15} color={Colors.sky} />
              </View>
              <Text style={s.featureTxt}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Sign in */}
        <View style={s.footer}>
          {failed && (
            <View style={s.errorBox}>
              <Ionicons name="warning-outline" size={14} color={Colors.amber} />
              <Text style={s.errorTxt}>
                Sign-in failed. Make sure Google Play Games is installed and try
                again.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.signInBtn, isLoading && { opacity: 0.65 }]}
            onPress={handleSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <View style={s.btnInner}>
              <View style={s.gpgIcon}>
                <Ionicons name="game-controller" size={18} color="#fff" />
              </View>
              <Text style={s.btnTxt}>
                {isLoading
                  ? "Signing in…"
                  : failed
                    ? "Try Again"
                    : "Sign in with Play Games"}
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={s.legal}>
            By playing you agree to Google Play Games Services.{"\n"}
            Progress saves automatically to your Play account.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // Splash — shown during silent sign-in attempt
  splashContainer: {
    flex: 1,
    backgroundColor: "#04090f",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },

  // Main screen
  container: {
    flex: 1,
    backgroundColor: "#04090f",
    paddingHorizontal: Spacing.xl,
  },
  bgGlow: {
    position: "absolute",
    top: -60,
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: Colors.sky,
    opacity: 0.06,
  },
  content: {
    flex: 1,
    paddingTop: 72,
    justifyContent: "space-between",
  },

  // Hero
  hero: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "rgba(56,189,248,0.1)",
    borderWidth: 1,
    borderColor: Colors.sky + "30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: 34,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  splashName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.muted,
  },

  // Features
  features: {
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureTxt: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "500",
    flex: 1,
  },

  // Footer
  footer: {
    gap: Spacing.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    padding: Spacing.md,
  },
  errorTxt: {
    flex: 1,
    fontSize: 12,
    color: Colors.amber,
    lineHeight: 17,
  },
  signInBtn: {
    backgroundColor: "#1a73e8",
    borderRadius: Radius.xl,
    paddingVertical: 15,
    paddingHorizontal: Spacing.xl,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  gpgIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnTxt: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  legal: {
    fontSize: 11,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 17,
  },
});
