/**
 * app/_layout.tsx
 */

import { useGameSounds } from "@/hooks/useGameSounds";
import * as Sentry from "@sentry/react-native";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

Sentry.init({
  dsn: "https://c3478a7b8bf9f4fead9689cb3a3214a6@o406186.ingest.us.sentry.io/4511289003474944",
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],
});

SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  // Initializes global SFX + background music once.
  useGameSounds();

  const [fontsLoaded, fontError] = Font.useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor="transparent" translucent />

      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(game)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#04090f",
  },
});
