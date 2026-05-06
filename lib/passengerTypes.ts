export interface PassengerMix {
  businessPct: number;
  leisurePct: number;
}

export function passengerMixFromDistance(distNm: number): PassengerMix {
  if (distNm < 800) return { businessPct: 0.18, leisurePct: 0.82 };
  if (distNm < 3000) return { businessPct: 0.28, leisurePct: 0.72 };
  return { businessPct: 0.38, leisurePct: 0.62 };
}

export function passengerTypeBreakdown(mix?: Partial<PassengerMix>) {
  const business = mix?.businessPct ?? 0.25;
  const leisure = mix?.leisurePct ?? 0.75;

  return {
    businessPct: Math.round(business * 100),
    leisurePct: Math.round(leisure * 100),
    label:
      business >= 0.35
        ? "Business-heavy"
        : leisure >= 0.8
          ? "Leisure-heavy"
          : "Mixed demand",
  };
}

export function passengerFareMultiplier(mix?: Partial<PassengerMix>): number {
  const b = mix?.businessPct ?? 0.25;
  const l = mix?.leisurePct ?? 0.75;
  return b * 1.35 + l * 0.92;
}

export function passengerElasticityMultiplier(
  mix?: Partial<PassengerMix>,
): number {
  const b = mix?.businessPct ?? 0.25;
  const l = mix?.leisurePct ?? 0.75;
  return b * 0.65 + l * 1.18;
}
