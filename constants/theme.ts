/**
 * Flightcraft visual foundation.
 *
 * Direction: a flat aviation operations interface. Structure comes from type,
 * spacing, and dividers. Blue identifies actions. Other colours are reserved
 * for operational status and are not used as decoration.
 */

export const Palette = {
  cloud: "#F2F4F3",
  paper: "#FFFFFF",
  white: "#FFFFFF",
  ink: "#111820",
  slate: "#52606B",
  mist: "#7D8790",
  line: "#CDD3D7",

  blue: "#075D82",
  blueDeep: "#063F58",
  blueSoft: "#E7EDF0",

  green: "#24734E",
  greenSoft: "#E8EEEA",
  orange: "#A55B00",
  orangeSoft: "#F1ECE4",
  red: "#B43A35",
  redSoft: "#F1E8E7",

  // Kept for compatibility. Purple UI decoration is intentionally removed.
  violet: "#405463",
  violetSoft: "#E9EDEF",
} as const;

export const Colors = {
  // Surfaces
  bg: Palette.cloud,
  surface: Palette.paper,
  panel: Palette.white,
  raised: Palette.white,
  inset: "#E9ECEB",

  // Structural lines and input focus
  border: Palette.line,
  borderSection: "#AEB7BD",
  borderHi: Palette.blue,

  // Primary action and semantic status
  sky: Palette.blue,
  skyDark: Palette.blueDeep,
  skyDim: Palette.blueSoft,
  green: Palette.green,
  amber: Palette.orange,
  red: Palette.red,
  purple: Palette.violet,
  orange: Palette.orange,

  // Text
  text: Palette.ink,
  muted: Palette.slate,
  dim: Palette.mist,
  textOnColor: Palette.white,

  // Aircraft families use the same restrained blue and neutral system.
  embraer: Palette.blue,
  bombardier: Palette.slate,
  boeing: Palette.blueDeep,
  airbus: Palette.ink,

  // Scrims are functional layers behind modal content.
  overlay: "rgba(17,24,32,0.52)",
  overlayLight: "rgba(17,24,32,0.18)",
} as const;

export const Typography = {
  // Headings use the native system face. SpaceMono is loaded in app/_layout.
  display: undefined as undefined,
  mono: "SpaceMono" as const,
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
    display: 30,
  },
  lineHeight: {
    caption: 15,
    label: 16,
    body: 22,
    title: 26,
    display: 34,
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
  sm: 3,
  md: 5,
  lg: 8,
  xl: 10,
  full: 9999,
} as const;

/**
 * Flat surfaces have no elevation. The floating token is intentionally subtle
 * and should be limited to temporary overlays and modal controls.
 */
export const Shadow = {
  card: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  floating: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

export const MIN_TOUCH = 44;

export const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? MAP_STYLE;
