/**
 * Root game screen.
 *
 * Loading and setup stay lightweight. Persistent game systems mount only
 * after an airline exists, while the map owns its own readiness lifecycle.
 */

import AuthScreen from "@/components/auth/AuthScreen";
import TabBar from "@/components/hud/TabBar";
import TopHUD from "@/components/hud/TopHUD";
import GameMap from "@/components/map/GameMap";
import SheetManager from "@/components/sheets/SheetManager";
import BankruptScreen from "@/components/ui/BankruptScreen";
import ChoiceEventModal from "@/components/ui/ChoiceEventModal";
import LoadingScreen from "@/components/ui/LoadingScreen";
import RouteCreationBanner from "@/components/ui/RouteCreationBanner";
import ToastStack from "@/components/ui/ToastStack";
import { Colors } from "@/constants/theme";
import { useAchievementChecker } from "@/hooks/useAchievementChecker";
import { useAICompetition } from "@/hooks/useAICompetition";
import { useAITick } from "@/hooks/useAITick";
import { useDailyEvents } from "@/hooks/useDailyEvents";
import { useGameClock } from "@/hooks/useGameClock";
import { useGameLoader } from "@/hooks/useGameLoader";
import { useMissionChecker } from "@/hooks/useMissionChecker";
import { useNotifications } from "@/hooks/useNotifications";
import { useRateUs } from "@/hooks/useRateUs";
import { useRevenueTick } from "@/hooks/useRevenueTick";
import {
  useAutoSaveChoiceEventState,
  useLoadChoiceEventState,
  useLoadPresence,
} from "@/hooks/useSupabaseWrite";
import {
  useGameStore,
  useLoadComplete,
  useLoadSteps,
  usePhase,
  type GamePhase,
  type LoadStep,
} from "@/store";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SetupScreen from "./setup";
import TutorialScreen from "./tutorial";

const MAP_READY_FALLBACK_MS = 4_000;

/**
 * Long-lived systems that observe the loaded airline.
 *
 * Weekly challenge data is intentionally absent here. Its sheet owns that
 * request, while weekly counters are updated by the systems that earn them.
 */
function GameRuntime() {
  useLoadPresence();
  useLoadChoiceEventState();
  useAutoSaveChoiceEventState();

  useGameClock();
  useRevenueTick();
  useMissionChecker();
  useAchievementChecker();
  useDailyEvents();
  useAITick();
  useAICompetition();

  useNotifications();
  useRateUs();

  return null;
}

function GameWorld({
  phase,
  loadSteps,
}: {
  phase: GamePhase;
  loadSteps: LoadStep[];
}) {
  const [mapReady, setMapReady] = useState(false);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  useEffect(() => {
    const fallback = setTimeout(handleMapReady, MAP_READY_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [handleMapReady]);

  const showRouteCreation = phase === "playing" || phase === "tutorial";

  return (
    <View style={styles.root}>
      <GameMap onMapReady={handleMapReady} />

      {mapReady ? (
        <>
          <TopHUD />
          <TabBar />
        </>
      ) : (
        <LoadingScreen steps={loadSteps} overlay />
      )}

      <SheetManager />
      {phase === "playing" && <ToastStack />}
      {showRouteCreation && <RouteCreationBanner />}
      {phase === "tutorial" && mapReady && <TutorialScreen />}
      {phase === "bankrupt" && <BankruptScreen />}
      <ChoiceEventModal />
    </View>
  );
}

function GameContent() {
  const loadComplete = useLoadComplete();
  const loadSteps = useLoadSteps();
  const phase = usePhase();
  const airlineId = useGameStore((state) => state.airline?.id ?? null);

  if (phase === "auth") return <AuthScreen />;
  if (!loadComplete) return <LoadingScreen steps={loadSteps} />;
  if (phase === "setup" || !airlineId) return <SetupScreen />;

  return (
    <>
      <GameRuntime />
      <GameWorld key={airlineId} phase={phase} loadSteps={loadSteps} />
    </>
  );
}

export default function GameScreen() {
  useGameLoader();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <GameContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
