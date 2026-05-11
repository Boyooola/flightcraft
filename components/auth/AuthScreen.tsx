/**
 * components/auth/AuthScreen.tsx
 *
 * First screen the player sees.
 * Requires Google Play Games sign-in — no other auth option.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isLoading } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + 24 }]}>
      {/* Background gradient feel */}
      <View style={s.bgGlow} />

      <Animated.View
        style={[
          s.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Logo / hero */}
        <View style={s.hero}>
          <View style={s.logoWrap}>
            <Ionicons name="airplane" size={52} color={Colors.sky} />
          </View>
          <Text style={s.appName}>Flightcraft</Text>
          <Text style={s.tagline}>Build your global airline empire</Text>
        </View>

        {/* Feature pills */}
        <View style={s.pills}>
          {[
            { icon: "globe-outline", label: "Real airports worldwide" },
            { icon: "people-outline", label: "Compete with AI rivals" },
            { icon: "trophy-outline", label: "Google Play achievements" },
          ].map((f) => (
            <View key={f.label} style={s.pill}>
              <Ionicons name={f.icon as any} size={14} color={Colors.sky} />
              <Text style={s.pillTxt}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Sign in button */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.signInBtn, isLoading && { opacity: 0.7 }]}
            onPress={signIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <Animated.View style={s.btnInner}>
                <Ionicons name="hourglass-outline" size={20} color="#fff" />
                <Text style={s.btnTxt}>Signing in...</Text>
              </Animated.View>
            ) : (
              <View style={s.btnInner}>
                {/* Google Play Games logo color */}
                <View style={s.gpgIcon}>
                  <Ionicons name="game-controller" size={20} color="#fff" />
                </View>
                <Text style={s.btnTxt}>Sign in with Play Games</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={s.legal}>
            By playing you agree to Google Play Games Services.{"\n"}
            Your game data is saved to your Play account.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#04090f",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
  },
  bgGlow: {
    position: "absolute",
    top: -100,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: Colors.sky,
    opacity: 0.04,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 80,
  },
  hero: {
    alignItems: "center",
    gap: Spacing.md,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: "rgba(56,189,248,0.1)",
    borderWidth: 1,
    borderColor: Colors.sky + "33",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: Colors.muted,
    textAlign: "center",
  },
  pills: {
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  pillTxt: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "500",
  },
  footer: {
    gap: Spacing.md,
  },
  signInBtn: {
    backgroundColor: "#1a73e8", // Google blue
    borderRadius: Radius.xl,
    paddingVertical: 8,
    paddingHorizontal: Spacing.xl,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  gpgIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
