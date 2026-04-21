import GameMap from "@/components/map/GameMap";
import LoadingScreen from "@/components/ui/LoadngScreen";
import { Colors } from "@/constants/theme";
import { useGameClock } from "@/hooks/useGameClock";
import { useGameLoader } from "@/hooks/useGameLoader";
import { useRevenueTick } from "@/hooks/useRevenueTick";
import { useAirline, useLoadComplete, useLoadSteps } from "@/store";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function GameScreen() {
  useGameLoader();

  const loadComplete = useLoadComplete();
  const loadSteps = useLoadSteps();

  // Simulation hooks — safe to call before load completes,
  // they check phase internally before doing anything
  useGameClock();
  useRevenueTick();

  const airline = useAirline();

  if (!loadComplete) {
    return <LoadingScreen steps={loadSteps} />;
  }

  return (
    <SafeAreaProvider>
      <View style={s.root}>
        {/* Full-screen map */}
        <GameMap airlineColor={airline?.color ?? "#38BDF8"} />
      </View>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 24,
    color: Colors.sky,
    letterSpacing: 4,
    fontWeight: "700",
  },
  sub: { fontSize: 11, color: Colors.dim, marginTop: 8, letterSpacing: 1 },
});
