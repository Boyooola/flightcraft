/**
 * app/(game)/index.tsx
 *
 * Routes between all game phases:
 *   loading   → LoadingScreen
 *   setup     → SetupScreen
 *   welcome   → WelcomeScreen
 *   tutorial  → TutorialScreen (overlaid on live map)
 *   playing   → GameMap + HUD
 */

import AuthScreen from "@/components/auth/AuthScreen";
import TabBar from "@/components/hud/TabBar";
import TopHUD from "@/components/hud/TopHUD";
import GameMap from "@/components/map/GameMap";
import SheetManager from "@/components/sheets/SheetManager";
import LoadingScreen from "@/components/ui/LoadingScreen";
import MissionsPill from "@/components/ui/MissionsPill";
import RouteCreationBanner from "@/components/ui/RouteCreationBanner";
import ToastStack from "@/components/ui/ToastStack";
import { useAchievementChecker } from "@/hooks/useAchievementChecker";
import { useGameClock } from "@/hooks/useGameClock";
import { useGameLoader } from "@/hooks/useGameLoader";
import { useMissionChecker } from "@/hooks/useMissionChecker";
import { useRevenueTick } from "@/hooks/useRevenueTick";
import { useAirline, useLoadComplete, useLoadSteps, usePhase } from "@/store";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SetupScreen from "./setup";
import TutorialScreen from "./tutorial";
import WelcomeScreen from "./welcome";

export default function GameScreen() {
  useGameLoader();
  useGameClock();
  useRevenueTick();
  useMissionChecker();
  useAchievementChecker();

  const loadComplete = useLoadComplete();
  const loadSteps = useLoadSteps();
  const phase = usePhase();
  const airline = useAirline();
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!loadComplete) return;
    const t = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(t);
  }, [loadComplete]);

  if (phase === "auth") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (!loadComplete) return <LoadingScreen steps={loadSteps} />;

  if (phase === "setup" || !airline) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <SetupScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase === "welcome") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <WelcomeScreen />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={s.root}>
          {/* Map always mounted */}
          <GameMap
            airlineColor={airline.color}
            onMapReady={() => setMapReady(true)}
          />

          {/* HUD once map ready */}
          {mapReady && (
            <>
              <TopHUD />
              <TabBar />
            </>
          )}

          {/* Map loading overlay */}
          {!mapReady && <LoadingScreen steps={loadSteps} overlay />}

          {/* Sheets */}
          <SheetManager />

          {/* Missions pill — persistent map button */}
          {phase === "playing" && <MissionsPill />}

          {/* Unified toast stack — hidden when sheet open */}
          {phase === "playing" && <ToastStack />}

          {/* Route creation banner */}
          {phase === "playing" && <RouteCreationBanner />}

          {/* Tutorial overlay */}
          {phase === "tutorial" && mapReady && <TutorialScreen />}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#04090f" },
});
