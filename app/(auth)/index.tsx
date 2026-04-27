// app/(auth)/index.tsx

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { isGoogleSignInAvailable, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GOOGLE_BLUE = "#4285F4";

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signInWithGoogle } = useAuth();

  const handleGuest = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInAnonymously();
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    router.replace("/(game)");
  };

  const handleGoogle = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // signInWithGoogle calls setPhase("loading") on success
      // expo-router will pick up the auth state change and redirect
      router.replace("/(game)");
    } catch (err: any) {
      setError(err.message ?? "Google Sign-In failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleAvailable = isGoogleSignInAvailable;
  const anyLoading = loading || googleLoading;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.inner}>
        {/* Logo */}
        <View style={s.logoBox}>
          <Text style={s.logoPlane}>✈</Text>
        </View>
        <Text style={s.wordmark}>FLIGHTCRAFT</Text>
        <Text style={s.tagline}>GLOBAL AVIATION TYCOON</Text>

        {/* Google Sign-In — primary CTA */}
        <TouchableOpacity
          style={[
            s.googleBtn,
            anyLoading && s.btnDisabled,
            !googleAvailable && s.btnDisabled,
          ]}
          onPress={handleGoogle}
          disabled={anyLoading || !googleAvailable}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <View style={s.googleIconWrap}>
                <Text style={s.googleG}>G</Text>
              </View>
              <Text style={s.googleTxt}>
                {googleAvailable
                  ? "SIGN IN WITH GOOGLE"
                  : "GOOGLE (REQUIRES UPDATE)"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.divLine} />
          <Text style={s.divTxt}>OR</Text>
          <View style={s.divLine} />
        </View>

        {/* Guest */}
        <TouchableOpacity
          style={[s.btn, anyLoading && s.btnDisabled]}
          onPress={handleGuest}
          disabled={anyLoading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <Text style={s.btnText}>CONTINUE AS GUEST</Text>
          )}
        </TouchableOpacity>

        <Text style={s.note}>
          Guest progress saved on this device only · Link Google anytime in
          Settings
        </Text>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },

  // Logo
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#0c1c33",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoPlane: { fontSize: 32, color: Colors.sky },
  wordmark: {
    fontSize: 34,
    color: Colors.text,
    letterSpacing: 8,
    fontWeight: "700",
    marginBottom: 6,
  },
  tagline: {
    fontSize: 10,
    color: "rgba(56,189,248,.6)",
    letterSpacing: 4,
    marginBottom: Spacing.xl,
  },

  // Google button
  googleBtn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: GOOGLE_BLUE,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: Spacing.md,
    shadowColor: GOOGLE_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: { fontSize: 13, fontWeight: "700", color: GOOGLE_BLUE },
  googleTxt: {
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "700",
    color: "#fff",
  },

  // Benefits
  benefits: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(56,189,248,.05)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,.12)",
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitTxt: { fontSize: 11, color: Colors.muted },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "100%",
    maxWidth: 320,
    marginBottom: Spacing.lg,
  },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  divTxt: { fontSize: 9, color: Colors.dim, letterSpacing: 2 },

  // Guest button
  btn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: Colors.muted,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
  },
  note: {
    fontSize: 10,
    color: Colors.dim,
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },

  // Error
  errorBox: {
    width: "100%",
    maxWidth: 320,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "rgba(248,113,113,.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.2)",
  },
  errorText: { fontSize: 11, color: Colors.red, textAlign: "center" },
});
