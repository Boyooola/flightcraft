/**
 * @file app/index.tsx
 * @description Entry-point screen rendered at the root route ("/").
 *
 * This is the first screen users see after the app launches. Replace the
 * placeholder content with the actual home/loading screen once the
 * onboarding and auth flows are in place.
 */

import { Colors } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function Index() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/(game)");
      } else {
        router.replace("/(auth)");
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.sky} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
