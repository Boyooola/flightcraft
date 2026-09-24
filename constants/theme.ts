/**
 * Flightcraft visual foundation
 *
 * Direction: modern airport operations — bright, practical, and tactile.
 * Warm paper surfaces keep the interface out of "generic dark dashboard"
 * territory, while aviation blue and safety colours make actions readable.
 */

export const Palette = {
  cloud: "#F5F2EA",
  paper: "#FFFDF8",
  white: "#FFFFFF",
  ink: "#182532",
  slate: "#68737D",
  mist: "#A5ADB3",
  line: "#D9D7CF",
  blue: "#1769AA",
  blueDeep: "#0E4F82",
  blueSoft: "#DCECF6",
  green: "#2E8B65",
  greenSoft: "#DDEFE6",
  orange: "#E98A2E",
  orangeSoft: "#F8E8D5",
  red: "#D94841",
  redSoft: "#F8DEDC",
  violet: "#7458A6",
  violetSoft: "#EAE3F3",
} as const;

export const Colors = {
  // Canvas and surfaces
  bg: Palette.cloud,
  surface: Palette.paper,
  panel: Palette.white,
  raised: Palette.white,
  inset: "#ECE9E1",

  // Dividers and focus states
  border: "rgba(24,37,50,0.13)",
  borderSection: "rgba(24,37,50,0.20)",
  borderHi: "rgba(23,105,170,0.55)",

  // Primary and operational accents
  sky: Palette.blue,
  skyDark: Palette.blueDeep,
  skyDim: Palette.blueSoft,
  green: Palette.green,
  amber: Palette.orange,
  red: Palette.red,
  purple: Palette.violet,
  orange: Palette.orange,

  // Text hierarchy
  text: Palette.ink,
  muted: Palette.slate,
  dim: Palette.mist,
  textOnColor: Palette.white,

  // Aircraft-family identification
  embraer: Palette.green,
  bombardier: Palette.blue,
  boeing: Palette.orange,
  airbus: Palette.violet,

  // Scrims used behind dialogs and temporary overlays
  overlay: "rgba(24,37,50,0.48)",
  overlayLight: "rgba(24,37,50,0.18)",
} as const;

export const Typography = {
  // Display is reserved for large airline/airport-style headings.
  display: "BebasNeue" as const,
  // Mono is for flight numbers, money, time, and compact operational data.
  mono: "SpaceMono" as const,
  // Body uses the native platform font for comfortable reading.
  body: undefined as undefined,
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
  size: {
    caption: 11,
    label: 12,
    body: 15,
    title: 20,
    display: 32,
  },
  lineHeight: {
    caption: 15,
    label: 16,
    body: 22,
    title: 26,
    display: 36,
  },
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

/** Subtle elevation for paper-like cards; avoid floating glass panels. */
export const Shadow = {
  card: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

// Minimum comfortable touch target (Apple HIG and Material guidance).
export const MIN_TOUCH = 44;

// A daylight basemap keeps geography legible beneath the operational UI.
export const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

// A custom Mapbox Studio style can still be supplied without changing code.
export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? MAP_STYLE;
