// app/(auth)/index.tsx

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { isGoogleSignInAvailable, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
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
        <View style={s.logoBox}>
          <Ionicons name="flash-outline" size={34} color={Colors.sky} />
        </View>

        <Text style={s.wordmark}>FLIGHTCRAFT</Text>
        <Text style={s.tagline}>PASSENGER RUSH TYCOON</Text>

        <View style={s.heroCard}>
          <Text style={s.heroLabel}>BUILD ROUTES</Text>
          <Text style={s.heroTitle}>
            Move passengers. Clear demand. Grow fast.
          </Text>

          <View style={s.statRow}>
            <View style={s.stat}>
              <Ionicons name="airplane-outline" size={14} color={Colors.sky} />
              <Text style={s.statText}>Routes</Text>
            </View>
            <View style={s.stat}>
              <Ionicons name="people-outline" size={14} color={Colors.green} />
              <Text style={s.statText}>Pax Flow</Text>
            </View>
            <View style={s.stat}>
              <Ionicons name="cash-outline" size={14} color={Colors.amber} />
              <Text style={s.statText}>Rewards</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            s.primaryBtn,
            anyLoading && s.btnDisabled,
            !googleAvailable && s.btnDisabled,
          ]}
          onPress={handleGoogle}
          disabled={anyLoading || !googleAvailable}
          activeOpacity={0.88}
        >
          {googleLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <View style={s.googleIconWrap}>
                <Text style={s.googleG}>G</Text>
              </View>
              <Text style={s.primaryText}>
                {googleAvailable
                  ? "SYNC WITH GOOGLE"
                  : "GOOGLE REQUIRES UPDATE"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.rushBtn, anyLoading && s.btnDisabled]}
          onPress={handleGuest}
          disabled={anyLoading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <>
              <Ionicons name="flash-outline" size={16} color={Colors.bg} />
              <Text style={s.rushText}>START AS GUEST</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.note}>
          Guest progress stays on this device · Google sync can be linked later
        </Text>

        {error && (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={14} color={Colors.red} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  logoBox: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: "rgba(56,189,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,.32)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  wordmark: {
    fontSize: 34,
    color: Colors.text,
    letterSpacing: 7,
    fontWeight: "900",
  },
  tagline: {
    fontSize: 9,
    color: Colors.sky,
    letterSpacing: 3.5,
    fontWeight: "800",
    marginTop: 5,
    marginBottom: Spacing.xl,
    opacity: 0.75,
  },
  heroCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.sky + "25",
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  heroLabel: {
    fontSize: 8,
    color: Colors.sky,
    letterSpacing: 2,
    fontWeight: "900",
    marginBottom: 5,
  },
  heroTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  statRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,.035)",
    paddingVertical: Spacing.sm,
  },
  statText: {
    fontSize: 9,
    color: Colors.dim,
    fontWeight: "800",
  },
  primaryBtn: {
    width: "100%",
    maxWidth: 340,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.lg,
    backgroundColor: GOOGLE_BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: Spacing.sm,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    fontSize: 13,
    fontWeight: "900",
    color: GOOGLE_BLUE,
  },
  primaryText: {
    fontSize: 12,
    color: "#fff",
    letterSpacing: 1.5,
    fontWeight: "900",
  },
  rushBtn: {
    width: "100%",
    maxWidth: 340,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.lg,
    backgroundColor: Colors.sky,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: Spacing.md,
  },
  rushText: {
    color: Colors.bg,
    fontSize: 12,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  btnDisabled: {
    opacity: 0.55,
  },
  note: {
    maxWidth: 320,
    fontSize: 10,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: Spacing.lg,
  },
  errorBox: {
    width: "100%",
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "rgba(248,113,113,.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.2)",
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: Colors.red,
    lineHeight: 16,
  },
});
