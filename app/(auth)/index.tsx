// app/(auth)/index.tsx

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <SafeAreaView style={s.root}>
      <View style={s.inner}>
        {/* Logo */}
        <View style={s.logoBox}>
          <Text style={s.logoPlane}>✈</Text>
        </View>
        <Text style={s.wordmark}>FLIGHTCRAFT</Text>
        <Text style={s.tagline}>GLOBAL AVIATION TYCOON</Text>

        {/* Guest button */}
        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleGuest}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <Text style={s.btnText}>CONTINUE AS GUEST</Text>
          )}
        </TouchableOpacity>

        <Text style={s.note}>
          No account needed · Progress saved to this device
        </Text>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Text style={s.soon}>Sign in & leaderboards coming soon</Text>
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
    fontSize: 32,
    color: Colors.text,
    letterSpacing: 8,
    fontWeight: "700",
    marginBottom: 6,
  },
  tagline: {
    fontSize: 10,
    color: "rgba(56,189,248,.6)",
    letterSpacing: 4,
    marginBottom: Spacing.xxl * 1.5,
  },

  // Button
  btn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Colors.sky,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: {
    color: Colors.bg,
    fontSize: 13,
    letterSpacing: 2.5,
    fontWeight: "700",
  },

  note: {
    fontSize: 10,
    color: Colors.dim,
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: Spacing.xxl,
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
    marginBottom: Spacing.lg,
  },
  errorText: { fontSize: 11, color: Colors.red, textAlign: "center" },

  soon: {
    fontSize: 10,
    color: Colors.dim,
    letterSpacing: 1,
    opacity: 0.4,
  },
});
