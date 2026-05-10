/**
 * components/auth/AuthScreen.tsx
 *
 * Shown only while Play Games silent sign-in is in progress.
 * If sign-in succeeds → game loads automatically.
 * If it fails → shows a simple retry button.
 */

import { Colors, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isLoading, authState } = useAuth();
  const failed = authState === "signed-out" && !isLoading;

  // Attempt silent sign-in automatically on mount
  useEffect(() => {
    signIn();
  }, []);

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + 24 }]}>
      <View style={s.center}>
        <Ionicons name="airplane" size={36} color={Colors.sky} style={s.icon} />
        <Text style={s.name}>Flightcraft</Text>

        {!failed ? (
          <ActivityIndicator
            size="small"
            color={Colors.dim}
            style={s.spinner}
          />
        ) : (
          <View style={s.failWrap}>
            <Text style={s.failTxt}>Play Games sign-in failed.</Text>
            <TouchableOpacity
              style={s.retryBtn}
              onPress={signIn}
              activeOpacity={0.8}
            >
              <Text style={s.retryTxt}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#04090f",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  icon: {
    marginBottom: 4,
    opacity: 0.85,
  },
  name: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  spinner: {
    marginTop: Spacing.lg,
  },
  failWrap: {
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  failTxt: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  retryTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
  },
});
