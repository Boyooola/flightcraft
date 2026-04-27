/**
 * app/_layout.tsx
 *
 * Root layout — loaded once on app start.
 * Responsibilities:
 *   1. Load custom fonts (Bebas Neue, Space Mono)
 *   2. Wrap tree with GestureHandlerRootView (required by @gorhom/bottom-sheet)
 *   3. Hide native splash screen once fonts are ready
 *   4. Set dark status bar
 *   5. Route to (auth) or (game) based on store phase
 */

import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://c3478a7b8bf9f4fead9689cb3a3214a6@o406186.ingest.us.sentry.io/4511289003474944',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Keep splash visible while we load fonts
SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
    // We approximate Bebas Neue and DM Mono using the closest
    // available free alternatives bundled with Expo.
    // Replace with actual font files in assets/fonts/ if you have them.
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
  root: { flex: 1, backgroundColor: "#04090f" },
});
