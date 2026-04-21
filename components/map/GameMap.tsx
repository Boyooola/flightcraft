import { Colors, MAP_STYLE_URL } from "@/constants/theme";
import { useHubs } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

// Set Mapbox token — called once at module level
MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// Initial camera — centered on a good world overview
const INITIAL_CAMERA: MapboxGL.CameraStop = {
  centerCoordinate: [20, 20],
  zoomLevel: 2,
  animationMode: "none",
  animationDuration: 0,
};

interface GameMapProps {
  airlineColor?: string;
}

export default function GameMap({ airlineColor = Colors.sky }: GameMapProps) {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const mapRef = useRef<MapboxGL.MapView>(null);

  const hubs = useHubs();

  // ── Fly to newly purchased hub ────────────────────────────────
  const prevHubCount = useRef(hubs.length);
  useEffect(() => {
    if (hubs.length > prevHubCount.current) {
      const newest = hubs[hubs.length - 1];
      cameraRef.current?.flyTo([newest.airport.lng, newest.airport.lat], 1200);
      // Zoom in after flying
      setTimeout(() => {
        cameraRef.current?.zoomTo(5, 800);
      }, 1400);
    }
    prevHubCount.current = hubs.length;
  }, [hubs.length]);

  return (
    <View style={s.container}>
      <MapboxGL.MapView
        ref={mapRef}
        style={s.map}
        styleURL={MAP_STYLE_URL}
        onPress={() => {}}
        compassEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled={false}
        logoEnabled={false}
        rotateEnabled={false} // disable rotation — cleaner UX on mobile
        pitchEnabled={false} // keep map flat
        scrollEnabled={true}
        zoomEnabled={true}
      >
        {/* Camera */}
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={INITIAL_CAMERA}
          minZoomLevel={1.5}
          maxZoomLevel={12}
        />
      </MapboxGL.MapView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  map: {
    flex: 1,
  },
});
