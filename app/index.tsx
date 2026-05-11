/**
 * app/index.tsx
 *
 * Entry point — routes straight to the game screen.
 * Play Games sign-in is handled inside useGameLoader.
 * If sign-in fails, useGameLoader sets phase → "auth" which shows AuthScreen.
 */

import { Colors } from "@/constants/theme";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function Index() {
  useEffect(() => {
    router.replace("/(game)");
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
