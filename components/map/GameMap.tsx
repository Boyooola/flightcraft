/**
 * components/map/GameMap.tsx
 *
 * Main mobile map component. Wires together:
 *   - Mapbox GL map
 *   - AirportLayer (dots + tap handling)
 *   - RouteLayer (animated planes)
 *
 * Airport tap logic:
 *   Normal mode      → open AirportSheet for that airport
 *   Route creation   → add airport as waypoint
 *                      when 2+ waypoints, open CreateRouteSheet
 */

import { Colors, MAP_STYLE_URL } from "@/constants/theme";
import type { Airport } from "@/store";
import { useAirline, useGameStore, useHubs } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import AIRouteLayer from "./AIRouteLayer";
import AirportLayer from "./AirportLayer";
import RouteLayer from "./RouteLayer";
import RoutePreviewLayer from "./RoutePreviewLayer";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
if (__DEV__ && !MAPBOX_TOKEN) {
  console.warn(
    "[GameMap] EXPO_PUBLIC_MAPBOX_TOKEN is not set — map will not render",
  );
}
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// Default camera — centered on world landmass (Africa/Europe junction)
// Gives a balanced view of all continents on first load
const DEFAULT_CAMERA = {
  centerCoordinate: [20.0, 20.0],
  zoomLevel: 2.5,
  padding: {
    paddingTop: 160,
    paddingRight: 16,
    paddingBottom: 96,
    paddingLeft: 16,
  },
  animationDuration: 0,
};

interface GameMapProps {
  airlineColor: string;
  onMapReady?: () => void;
}

export default function GameMap({ airlineColor, onMapReady }: GameMapProps) {
  const airline = useAirline();
  const hubs = useHubs();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const routeCreationMode = useGameStore((s) => s.routeCreationMode);
  const creationWaypoints = useGameStore((s) => s.creationWaypoints);

  const color = airline?.color ?? airlineColor ?? Colors.sky;
  const speed = airline?.speed ?? 1;

  // ── Fly to first hub when it's purchased ────────────────────────
  const prevHubCount = useRef(0);
  useEffect(() => {
    if (hubs.length === 1 && prevHubCount.current === 0) {
      const hub = hubs[0].airport;
      cameraRef.current?.setCamera({
        centerCoordinate: [hub.lng, hub.lat],
        zoomLevel: 4.5,
        padding: DEFAULT_CAMERA.padding,
        animationDuration: 800,
        animationMode: "flyTo",
      });
    }
    prevHubCount.current = hubs.length;
  }, [hubs]);

  // ── Airport tap handler ──────────────────────────────────────────
  const handleAirportPress = useCallback((airport: Airport) => {
    const {
      routeCreationMode: isCreating,
      creationWaypoints: waypoints,
      hubs: currentHubs,
      addWaypoint: addWpt,
      openSheet: open,
    } = useGameStore.getState();

    if (isCreating) {
      if (waypoints.length === 0) {
        const isOwnedHub = currentHubs.some(
          (h) => h.airport.iata === airport.iata,
        );
        if (!isOwnedHub) {
          addWpt(airport);
          return;
        }
      }
      addWpt(airport);
      if (waypoints.length + 1 >= 2) {
        open("create-route");
      }
      return;
    }

    // Normal mode — open airport sheet
    useGameStore.getState().openSheet("airport", airport);
  }, []);

  const waypointIatas = creationWaypoints.map((a) => a.iata);

  return (
    <View style={s.root}>
      <MapboxGL.MapView
        style={s.map}
        styleURL={MAP_STYLE_URL}
        projection="mercator"
        tintColor={Colors.sky}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        onDidFinishLoadingMap={onMapReady}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={DEFAULT_CAMERA}
          minZoomLevel={2.2}
          maxZoomLevel={12}
        />

        <AirportLayer
          airlineColor={color}
          onAirportPress={handleAirportPress}
          routeCreationMode={routeCreationMode}
          waypointIatas={waypointIatas}
        />

        {/* AI routes — rendered behind player routes */}
        <AIRouteLayer paused={speed === 0} speed={speed} />

        <RouteLayer airlineColor={color} speed={speed} paused={speed === 0} />

        {/* Preview arc during route creation */}
        <RoutePreviewLayer airlineColor={color} />
      </MapboxGL.MapView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  map: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
