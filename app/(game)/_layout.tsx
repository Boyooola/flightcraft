/**
 * app/(game)/_layout.tsx
 *
 * Game group — all screens here assume an authenticated session.
 * The loader runs once and populates the Zustand store.
 */

import { Stack } from "expo-router";

export default function GameLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
