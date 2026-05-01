/**
 * hooks/useCreateAirline.ts
 *
 * Creates a new airline in Supabase on game setup.
 * Stores seed, AI config, and difficulty alongside core airline data.
 */

import { setDemandSeed } from "@/lib/demands";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback } from "react";

interface CreateAirlineParams {
  name: string;
  color: string;
  difficulty: string;
  cash: number;
  loan: number;
  seed: string;
  ai_count: number;
  ai_difficulty: string;
}

export function useCreateAirline() {
  const { setAirline, setPhase } = useGameStore.getState();

  return useCallback(
    async (params: CreateAirlineParams): Promise<{ error: string | null }> => {
      const {
        name,
        color,
        difficulty,
        cash,
        loan,
        seed,
        ai_count,
        ai_difficulty,
      } = params;

      if (!name.trim()) return { error: "Airline name is required" };

      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr || !user) return { error: "Not authenticated" };

        const loanRate =
          difficulty === "easy" ? 3 : difficulty === "hard" ? 9 : 5;

        const { data, error } = await supabase
          .from("airlines")
          .insert({
            user_id: user.id,
            name: name.trim(),
            color,
            difficulty,
            cash,
            loan,
            loan_rate: loanRate,
            seed: seed.toUpperCase(),
            ai_count,
            ai_difficulty,
            day: 1,
            speed: 1,
            reputation: 50,
            demand_score: 0,
          })
          .select()
          .single();

        if (error) return { error: error.message };

        // Wire the seed into the demand generation system
        setDemandSeed(seed.toUpperCase());

        setAirline({
          id: data.id,
          user_id: user.id,
          name: name.trim(),
          color,
          icon: "airplane",
          difficulty,
          cash,
          loan,
          loan_rate: loanRate,
          day: 1,
          speed: 1,
          reputation: 50,
          demand_score: 0,
          seed: seed.toUpperCase(),
          ai_count,
          ai_difficulty,
        });

        setPhase("tutorial");
        return { error: null };
      } catch (err: any) {
        return { error: err.message ?? "Failed to create airline" };
      }
    },
    [],
  );
}
