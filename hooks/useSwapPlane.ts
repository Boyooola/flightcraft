/**
 * hooks/useSwapPlane.ts
 *
 * Swaps the plane on an active route without deleting/recreating it.
 * - Unassigns old plane (route_id → null)
 * - Assigns new plane (route_id → route.id)
 * - Updates route record in Supabase (plane_id)
 * - Updates store atomically
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback, useState } from "react";

export function useSwapPlane() {
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swapPlane = useCallback(
    async (
      routeId: string,
      oldPlaneId: string,
      newPlaneId: string,
    ): Promise<boolean> => {
      setSwapping(true);
      setError(null);

      try {
        // 1. Update route's plane_id in DB
        const { error: routeErr } = await supabase
          .from("routes")
          .update({ plane_id: newPlaneId })
          .eq("id", routeId);
        if (routeErr) throw routeErr;

        // 2. Unassign old plane
        const { error: oldErr } = await supabase
          .from("owned_planes")
          .update({ route_id: null })
          .eq("id", oldPlaneId);
        if (oldErr) throw oldErr;

        // 3. Assign new plane
        const { error: newErr } = await supabase
          .from("owned_planes")
          .update({ route_id: routeId })
          .eq("id", newPlaneId);
        if (newErr) throw newErr;

        // 4. Update store atomically
        const { routes, ownedPlanes } = useGameStore.getState();

        // Find the new plane model
        const newPlane = ownedPlanes.find((p) => p.id === newPlaneId);
        if (!newPlane) throw new Error("Plane not found in store");

        // Update route with new plane
        useGameStore.setState({
          routes: routes.map((r) =>
            r.id === routeId ? { ...r, plane: newPlane } : r,
          ),
          ownedPlanes: ownedPlanes.map((p) => {
            if (p.id === oldPlaneId) return { ...p, route_id: null };
            if (p.id === newPlaneId) return { ...p, route_id: routeId };
            return p;
          }),
        });

        return true;
      } catch (e: any) {
        setError(e.message ?? "Failed to swap plane");
        return false;
      } finally {
        setSwapping(false);
      }
    },
    [],
  );

  return { swapPlane, swapping, error };
}
