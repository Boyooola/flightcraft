/**
 * hooks/useCreateAirline.ts
 *
 * Creates a new airline row in Supabase and populates the store.
 * Routes to "welcome" phase so new players see the welcome screen.
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback } from "react";

interface CreateAirlineParams {
  name: string;
  color: string;
  difficulty: string;
  cash: number;
  loan: number;
}

export function useCreateAirline() {
  const { setAirline, setPhase } = useGameStore.getState();

  return useCallback(
    async (params: CreateAirlineParams): Promise<{ error: string | null }> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session)
        return { error: "No session found. Please restart the app." };

      const { data, error } = await supabase
        .from("airlines")
        .insert({
          user_id: session.user.id,
          name: params.name,
          color: params.color,
          icon: "plane",
          difficulty: params.difficulty,
          cash: params.cash,
          loan: params.loan,
          day: 1,
          speed: 1,
          reputation: 0,
          demand_score: 0,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return { error: "Airline already exists. Please restart the app." };
        }
        return { error: error.message };
      }

      setAirline({
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        difficulty: data.difficulty,
        cash: Number(data.cash),
        loan: Number(data.loan),
        day: data.day,
        speed: data.speed,
        reputation: data.reputation,
        demand_score: data.demand_score,
        loan_rate: data.loan_rate ?? 5,
      });

      // ← Route to welcome screen instead of playing
      setPhase("welcome");

      return { error: null };
    },
    [],
  );
}
