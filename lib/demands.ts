/**
 * lib/demands.ts
 *
 * Demand generation logic.
 * Pure TypeScript — no React, no RN.
 * Identical to the web version.
 */

import type { Airport, Demand, HaulClass } from "@/types";

// ── Haversine distance (nautical miles) ───────────────────────────
export function distanceNm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Haul classification ───────────────────────────────────────────
export function haulClass(distNm: number): HaulClass {
  if (distNm < 1000) return "short";
  if (distNm < 3500) return "medium";
  return "long";
}

// ── Major hub weighting ───────────────────────────────────────────
export const MAJOR_HUBS = new Set([
  "LHR",
  "CDG",
  "FRA",
  "AMS",
  "DXB",
  "SIN",
  "HKG",
  "NRT",
  "JFK",
  "LAX",
  "ORD",
  "ATL",
  "PEK",
  "PVG",
  "SYD",
  "GRU",
  "MEX",
  "DUB",
  "MAD",
  "FCO",
  "BKK",
  "KUL",
  "ICN",
  "DEL",
  "BOM",
  "CGK",
  "DOH",
  "ZRH",
  "VIE",
  "CPH",
  "MNL",
  "NBO",
  "JNB",
  "CAI",
  "LOS",
  "ADD",
  "CMN",
  "DAR",
  "ACC",
]);

// ── Generate demands for a hub ────────────────────────────────────
export function generateDemands(
  hub: Airport,
  allAirports: Airport[],
  count: number = 3,
): Omit<Demand, "id" | "airline_id">[] {
  const candidates = allAirports.filter(
    (a) =>
      a.iata !== hub.iata && (a.tier === "major" || MAJOR_HUBS.has(a.iata)),
  );

  // Build weighted pool
  const pool: Airport[] = [];
  candidates.forEach((a) => {
    const w = Math.ceil(
      (MAJOR_HUBS.has(a.iata) ? 3 : 1) *
        (a.continent === hub.continent ? 1.5 : 1),
    );
    for (let i = 0; i < w; i++) pool.push(a);
  });

  const used = new Set<string>();
  const demands: Omit<Demand, "id" | "airline_id">[] = [];
  let tries = 0;

  while (demands.length < count && tries < 300) {
    tries++;
    const dest = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(dest.iata)) continue;
    used.add(dest.iata);

    const dist = Math.round(distanceNm(hub.lat, hub.lng, dest.lat, dest.lng));
    const haul = haulClass(dist);
    const base = haul === "short" ? 180 : haul === "medium" ? 260 : 340;
    const paxDay = Math.round(base * (0.8 + Math.random() * 0.4));

    demands.push({
      hub_iata: hub.iata,
      origin: hub,
      dest,
      dist_nm: dist,
      haul,
      pax_day: paxDay,
      status: "pending",
    });
  }

  return demands;
}
