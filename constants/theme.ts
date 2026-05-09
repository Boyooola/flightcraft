export const Colors = {
  // Backgrounds
  bg: "#04090f",
  surface: "#080f1c",
  panel: "#0a1525",

  // Borders
  border: "rgba(255,255,255,0.10)",
  borderSection: "rgba(255,255,255,0.14)",
  borderHi: "rgba(56,189,248,0.4)",

  // Brand accents
  sky: "#38BDF8",
  skyDim: "rgba(56,189,248,0.1)",
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f87171",
  purple: "#a78bfa",
  orange: "#f97316",

  // Text
  text: "#dde6f0",
  muted: "rgba(148,163,184,0.75)",
  dim: "rgba(148,163,184,0.50)",

  // Families
  embraer: "#4ade80",
  bombardier: "#38BDF8",
  boeing: "#fbbf24",
  airbus: "#f97316",

  // Transparent overlays
  overlay: "rgba(4,9,15,0.85)",
  overlayLight: "rgba(4,9,15,0.5)",
} as const;

export const Typography = {
  // We use system mono for data/labels (closest to DM Mono on device)
  // and a bold weight for display text (closest to Bebas Neue)
  mono: "SpaceMono" as const, // loaded via expo-font
  display: "BebasNeue" as const, // loaded via expo-font
  body: undefined as undefined, // system default
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

// Minimum touch target (Apple HIG + Material)
export const MIN_TOUCH = 44;

// Map style — Mapbox dark custom style
// Replace with your own Mapbox Studio style URL if you have one
export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

// Custom dark style that matches our bg colours more closely
// Set CUSTOM_STYLE_URL in .env to override
export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? MAP_STYLE;
