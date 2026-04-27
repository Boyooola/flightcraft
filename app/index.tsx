/**
 * app/index.tsx
 *
 * Entry point — checks Supabase session and routes accordingly.
 *
 *   No session  → (auth)/index  (auth screen)
 *   Has session → (game)/index  (map screen via loader)
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
