/**
 * components/auth/AuthScreen.tsx
 *
 * First screen players see.
 * Two options:
 *   - Sign in with Google (full account, cloud sync, IAP ready)
 *   - Continue as Guest  (anonymous, progress stored locally + Supabase)
 *
 * Design: dark aviation theme matching the game UI.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GOOGLE_BLUE = "#4285F4";

export default function AuthScreen() {
  const { state, error, signInWithGoogle, signInAsGuest } = useAuth();

  const loading = state === "loading";

  return (
    <SafeAreaView style={s.root}>
      {/* Hero */}
      <View style={s.hero}>
        <View style={s.logoWrap}>
          <Ionicons name="airplane" size={48} color={Colors.sky} />
        </View>
        <Text style={s.appName}>FlightCraft</Text>
        <Text style={s.tagline}>Build your airline empire</Text>
      </View>

      {/* Auth options */}
      <View style={s.actions}>
        {/* Google Sign-In — primary */}
        <TouchableOpacity
          style={[s.googleBtn, loading && { opacity: 0.6 }]}
          onPress={signInWithGoogle}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <>
              {/* Google G logo */}
              <View style={s.googleIcon}>
                <Text style={s.googleG}>G</Text>
              </View>
              <Text style={s.googleTxt}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Benefits of signing in */}
        <View style={s.benefits}>
          {[
            { icon: "cloud-outline", text: "Progress saved across devices" },
            { icon: "trophy-outline", text: "Global leaderboard ranking" },
            { icon: "card-outline", text: "Required for in-app purchases" },
          ].map(({ icon, text }) => (
            <View key={icon} style={s.benefitRow}>
              <Ionicons name={icon as any} size={14} color={Colors.sky} />
              <Text style={s.benefitTxt}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerTxt}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Guest option */}
        <TouchableOpacity
          style={[s.guestBtn, loading && { opacity: 0.6 }]}
          onPress={signInAsGuest}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="person-outline" size={16} color={Colors.muted} />
          <Text style={s.guestTxt}>Continue as Guest</Text>
        </TouchableOpacity>

        <Text style={s.guestNote}>
          Guest progress is saved on this device only.{"\n"}
          You can link a Google account later in Settings.
        </Text>

        {/* Error */}
        {error && (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={14} color={Colors.red} />
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <Text style={s.footer}>
        By continuing you agree to our Privacy Policy
      </Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
  },

  // Hero
  hero: { alignItems: "center", paddingTop: Spacing.xxl, gap: Spacing.md },
  logoWrap: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: Colors.sky + "15",
    borderWidth: 1,
    borderColor: Colors.sky + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 36,
    color: Colors.text,
    fontWeight: "700",
    letterSpacing: 1,
  },
  tagline: { fontSize: 14, color: Colors.dim, letterSpacing: 0.5 },

  // Actions
  actions: { gap: Spacing.md },

  // Google button
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GOOGLE_BLUE,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    shadowColor: GOOGLE_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: { fontSize: 14, fontWeight: "700", color: GOOGLE_BLUE },
  googleTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // Benefits
  benefits: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  benefitTxt: { fontSize: 12, color: Colors.muted },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerTxt: { fontSize: 11, color: Colors.dim },

  // Guest
  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(255,255,255,.03)",
  },
  guestTxt: { fontSize: 14, color: Colors.muted, fontWeight: "600" },
  guestNote: {
    fontSize: 10,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 16,
  },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.red + "12",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red + "33",
    padding: Spacing.sm,
  },
  errorTxt: { fontSize: 11, color: Colors.red, flex: 1 },

  // Footer
  footer: { fontSize: 9, color: Colors.dim, textAlign: "center" },
});
