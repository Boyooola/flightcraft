/**
 * app/(game)/index.tsx
 *
 * Root game screen. Routes between all phases.
 * Single default export always present — Metro requires this.
 */

import AuthScreen from "@/components/auth/AuthScreen";
import TabBar from "@/components/hud/TabBar";
import TopHUD from "@/components/hud/TopHUD";
import GameMap from "@/components/map/GameMap";
import SheetManager from "@/components/sheets/SheetManager";
import BankruptScreen from "@/components/ui/BankruptScreen";
import ChoiceEventModal from "@/components/ui/ChoiceEventModal";
import DailyEventCard from "@/components/ui/DailyEventCard";
import GoalsOverlay from "@/components/ui/GoalsOverlay";
import LoadingScreen from "@/components/ui/LoadingScreen";
import MissionsPill from "@/components/ui/MissionsPill";
import RouteCreationBanner from "@/components/ui/RouteCreationBanner";
import SeasonPill from "@/components/ui/SeasonPill";
import SurgeIndicator from "@/components/ui/SurgeIndicator";
import ToastStack from "@/components/ui/ToastStack";
import { Colors } from "@/constants/theme";
import { useAICompetition } from "@/hooks/useAICompetition";
import { useAITick } from "@/hooks/useAITick";
import { useAchievementChecker } from "@/hooks/useAchievementChecker";
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
import { useWeeklyChallenge } from "@/hooks/useWeeklyChallenge";
import { useAirline, useLoadComplete, useLoadSteps, usePhase } from "@/store";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SetupScreen from "./setup";
import TutorialScreen from "./tutorial";
import WelcomeScreen from "./welcome";

function GameContent() {
  useGameClock();
  useRevenueTick();
  useMissionChecker();
  useAchievementChecker();
  useDailyEvents();
  useNotifications();
  useRateUs();
  useWeeklyChallenge();
  useAITick();
  useAICompetition();
  useLoadPresence();
  useLoadChoiceEventState();
  useAutoSaveChoiceEventState();

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

  if (phase === "auth") return <AuthScreen />;

  if (!loadComplete) return <LoadingScreen steps={loadSteps} />;

  if (phase === "setup" || !airline) return <SetupScreen />;

  if (phase === "welcome") return <WelcomeScreen />;

  return (
    <View style={s.root}>
      <GameMap
        airlineColor={airline.color}
        onMapReady={() => setMapReady(true)}
      />
      {mapReady && (
        <>
          <TopHUD />
          <TabBar />
        </>
      )}
      {!mapReady && <LoadingScreen steps={loadSteps} overlay />}
      <SheetManager />
      {phase === "playing" && <MissionsPill />}
      {phase === "playing" && <GoalsOverlay />}
      {phase === "playing" && <DailyEventCard />}
      {phase === "playing" && <SurgeIndicator />}
      {phase === "playing" && <SeasonPill />}
      {phase === "playing" && <ToastStack />}
      {(phase === "playing" || phase === "tutorial") && <RouteCreationBanner />}
      {phase === "tutorial" && mapReady && <TutorialScreen />}
      {phase === "bankrupt" && <BankruptScreen />}
      <ChoiceEventModal />
      {/* <AwayEarningsModal /> */}
    </View>
  );
}

export default function GameScreen() {
  useGameLoader();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GameContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
