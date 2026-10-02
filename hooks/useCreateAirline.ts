/**
 * hooks/useCreateAirline.ts
 *
 * Creates a new airline in Supabase on game setup.
 * Stores seed, AI config, and difficulty alongside core airline data.
 */

import { getPlayerId } from "@/hooks/useAuth";
import type { AirlineLogoId, AirlinePaletteId } from "@/lib/airlineBrand";
import { setDemandSeed } from "@/lib/demands";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback } from "react";

interface CreateAirlineParams {
  name: string;
  airline_code: string;
  color: string;
  secondary_color: string;
  logo_id: AirlineLogoId;
  palette_id: AirlinePaletteId;
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
        airline_code,
        color,
        secondary_color,
        logo_id,
        palette_id,
        difficulty,
        cash,
        loan,
        seed,
        ai_count,
        ai_difficulty,
      } = params;

      if (!name.trim()) return { error: "Airline name is required" };
      if (!/^[A-Z]{3}$/.test(airline_code)) {
        return { error: "Airline code must contain three letters" };
      }

      try {
        const loanRate =
          difficulty === "easy" ? 3 : difficulty === "hard" ? 9 : 5;

        const { data, error } = await supabase
          .from("airlines")
          .insert({
            player_id: getPlayerId(),
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
        console.log("Supabase insert response:", { data, error });
        if (error) return { error: error.message };

        // Wire the seed into the demand generation system
        setDemandSeed(seed.toUpperCase());

        console.log("Created airline with ID:", data.id);

        // Persist the complete brand when the brand columns are available.
        // Older databases can still create and load the airline with its
        // primary color; the migration persists the complete identity.
        const { error: brandError } = await supabase
          .from("airlines")
          .update({
            airline_code,
            logo_id,
            palette_id,
            secondary_color,
          })
          .eq("id", data.id);

        if (brandError) {
          console.warn(
            "Airline created with legacy brand fields. Apply the airline-brand migration to persist every customization.",
            brandError.message,
          );
        }

        setAirline({
          id: data.id,
          player_id: getPlayerId()!,
          name: name.trim(),
          airline_code,
          color,
          secondary_color,
          logo_id,
          palette_id,
          icon: logo_id,
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
        console.error("Error creating airline:", err);
        return { error: err.message ?? "Failed to create airline" };
      }
    },
    [],
  );
}
