export const AIRLINE_PALETTES = [
  {
    id: "aviation-blue",
    name: "Aviation blue",
    primary: "#075D82",
    secondary: "#8EC9DC",
  },
  {
    id: "deep-ocean",
    name: "Deep ocean",
    primary: "#0F4C5C",
    secondary: "#4EA5A8",
  },
  {
    id: "indigo-sky",
    name: "Indigo sky",
    primary: "#354A7D",
    secondary: "#8EA3D2",
  },
  {
    id: "teal-mint",
    name: "Teal mint",
    primary: "#176B75",
    secondary: "#73B9A2",
  },
  {
    id: "forest-sage",
    name: "Forest sage",
    primary: "#365E49",
    secondary: "#91A56D",
  },
  { id: "saffron", name: "Saffron", primary: "#8B4A16", secondary: "#E0A13B" },
  { id: "copper", name: "Copper", primary: "#8A3F2C", secondary: "#D47A3A" },
  { id: "coral", name: "Coral", primary: "#8C4C56", secondary: "#D28D86" },
  { id: "plum", name: "Plum", primary: "#65405F", secondary: "#B08BA7" },
  { id: "slate", name: "Slate", primary: "#4E5963", secondary: "#AEB7BD" },
  { id: "alpine", name: "Alpine", primary: "#315B70", secondary: "#8CAEB9" },
  {
    id: "olive-gold",
    name: "Olive gold",
    primary: "#66552C",
    secondary: "#C2A24B",
  },
  {
    id: "royal-blue",
    name: "Royal blue",
    primary: "#244C91",
    secondary: "#8CA9E8",
  },
  {
    id: "burgundy",
    name: "Burgundy",
    primary: "#743443",
    secondary: "#C9838F",
  },
  { id: "emerald", name: "Emerald", primary: "#24664D", secondary: "#77B997" },
  {
    id: "navy-amber",
    name: "Navy amber",
    primary: "#263B59",
    secondary: "#D4A34A",
  },
  { id: "violet", name: "Violet", primary: "#554478", secondary: "#A99CC7" },
  {
    id: "graphite-cyan",
    name: "Graphite cyan",
    primary: "#344A52",
    secondary: "#61B2BF",
  },
] as const;

export type AirlinePaletteId = (typeof AIRLINE_PALETTES)[number]["id"];
