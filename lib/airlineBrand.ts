import {
  AIRLINE_LOGO_CATALOG,
  type AirlineLogoId,
} from "@/components/airline-identity/airlineLogoCatalog";
import {
  AIRLINE_PALETTES,
  type AirlinePaletteId,
} from "@/components/airline-identity/airlinePalettes";

export const DEFAULT_AIRLINE_LOGO_ID: AirlineLogoId = "compass-star";
export const DEFAULT_AIRLINE_PALETTE_ID: AirlinePaletteId = "aviation-blue";

const LOGO_IDS = new Set<string>(AIRLINE_LOGO_CATALOG.map((logo) => logo.id));

const PALETTE_IDS = new Set<string>(
  AIRLINE_PALETTES.map((palette) => palette.id),
);

export function normalizeAirlineLogoId(value: unknown): AirlineLogoId {
  const candidate = String(value ?? "").trim();
  return LOGO_IDS.has(candidate)
    ? (candidate as AirlineLogoId)
    : DEFAULT_AIRLINE_LOGO_ID;
}

export function normalizeAirlinePaletteId(value: unknown): AirlinePaletteId {
  const candidate = String(value ?? "").trim();
  return PALETTE_IDS.has(candidate)
    ? (candidate as AirlinePaletteId)
    : DEFAULT_AIRLINE_PALETTE_ID;
}

export function getAirlinePalette(value: unknown) {
  const id = normalizeAirlinePaletteId(value);
  return (
    AIRLINE_PALETTES.find((palette) => palette.id === id) ?? AIRLINE_PALETTES[0]
  );
}

export function getAirlinePaletteFromPrimary(primary: unknown) {
  const normalized = normalizeHexColor(primary, "").toUpperCase();
  return (
    AIRLINE_PALETTES.find(
      (palette) => palette.primary.toUpperCase() === normalized,
    ) ?? AIRLINE_PALETTES[0]
  );
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
}

export function suggestAirlineCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (word) =>
        !["AIR", "AIRLINE", "AIRLINES", "AIRWAYS", "JET", "FLY"].includes(word),
    );

  if (words.length >= 3) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("");
  }

  if (words.length === 2) {
    return `${words[0].slice(0, 2)}${words[1][0]}`.slice(0, 3);
  }

  const letters = (words[0] ?? name.toUpperCase()).replace(/[^A-Z]/g, "");
  return letters.slice(0, 3);
}

export function normalizeAirlineCode(value: unknown, name = "Airline"): string {
  const candidate = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return candidate.length === 3
    ? candidate
    : suggestAirlineCode(name).padEnd(3, "X").slice(0, 3);
}

export { AIRLINE_LOGO_CATALOG, AIRLINE_PALETTES };
export type { AirlineLogoId, AirlinePaletteId };
