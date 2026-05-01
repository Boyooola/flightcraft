/**
 * lib/seed.ts
 *
 * Universal deterministic hash for FlightCraft.
 * All seeded systems use seedHash() so the same game seed
 * always produces the same world — demands, AI, events, challenges.
 *
 * Usage:
 *   seedHash("ALPHA7", "MNL", "SIN")       → demand variance
 *   seedHash("ALPHA7", "ai", "0", "hub")   → AI hub selection
 *   seedHash("ALPHA7", "event", "47")      → day 47 event
 *   seedHash("ALPHA7", "week", "12")       → week 12 challenge
 *
 * Algorithm: djb2-style, produces 0–99999 integer.
 * Normalise to 0–1 range as needed.
 */

export function seedHash(...parts: (string | number)[]): number {
  const key = parts.join("|");
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return hash % 100_000;
}

/**
 * Returns a float in [min, max] deterministically.
 */
export function seedFloat(
  min: number,
  max: number,
  ...parts: (string | number)[]
): number {
  return min + (seedHash(...parts) / 100_000) * (max - min);
}

/**
 * Picks a deterministic item from an array.
 */
export function seedPick<T>(arr: T[], ...parts: (string | number)[]): T {
  return arr[seedHash(...parts) % arr.length];
}

/**
 * Returns a deterministic boolean with given probability (0–1).
 */
export function seedBool(
  probability: number,
  ...parts: (string | number)[]
): boolean {
  return seedHash(...parts) / 100_000 < probability;
}

/**
 * Generates a cryptographically random seed string.
 * 16 hex chars = 64 bits of entropy.
 * Format: "3F8A91BC4D2E7C01"
 * Practically impossible to collide across all players.
 */
export function generateSeed(): string {
  const bytes = new Uint8Array(8);
  // Use crypto.getRandomValues if available (browser/React Native)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}
