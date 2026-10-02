import React from "react";
import { SvgXml } from "react-native-svg";
import type { AirlineLogoId } from "./airlineLogoCatalog";

const PRIMARY_TOKEN = "__PRIMARY__";
const SECONDARY_TOKEN = "__SECONDARY__";

const AIRLINE_LOGO_XML: Record<AirlineLogoId, string> = {
  "compass-star": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 10L58 40L88 50L58 60L50 90L42 60L12 50L42 40L50 10Z" fill="__PRIMARY__"/><circle cx="50" cy="50" r="8" fill="__SECONDARY__"/></svg>`,
  "wing-chevron": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M10 64L42 30H57L36 64H10Z" fill="__PRIMARY__"/><path d="M38 64L63 38H76L61 64H38Z" fill="__SECONDARY__"/><path d="M66 64L80 49H91L84 64H66Z" fill="__PRIMARY__"/></svg>`,
  runway: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M33 12H67L78 88H22L33 12Z" fill="__PRIMARY__"/><path d="M50 19V33M50 43V57M50 67V81" stroke="__SECONDARY__" stroke-width="8" stroke-linecap="round"/></svg>`,
  propeller: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="10" fill="__SECONDARY__"/><path d="M45 41C31 31 29 14 39 10C50 6 56 24 52 40L45 41Z" fill="__PRIMARY__"/><path d="M59 47C70 34 87 36 90 46C93 58 74 62 59 54V47Z" fill="__PRIMARY__"/><path d="M48 60C52 75 41 90 31 86C20 82 27 64 41 56L48 60Z" fill="__PRIMARY__"/></svg>`,
  "flight-path": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M13 68C29 69 35 54 45 46C57 36 69 35 84 36" stroke="__PRIMARY__" stroke-width="8" stroke-linecap="round"/><circle cx="15" cy="68" r="9" fill="__SECONDARY__"/><path d="M75 24L91 36L73 45L75 24Z" fill="__SECONDARY__"/></svg>`,
  "tail-fin": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M25 77L41 20H61L76 77H25Z" fill="__PRIMARY__"/><path d="M42 55L66 38L70 54L48 66L42 55Z" fill="__SECONDARY__"/></svg>`,
  "paper-plane": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M12 47L88 16L66 84L47 60L30 72L32 55L12 47Z" fill="__PRIMARY__"/><path d="M32 55L68 33L47 60" stroke="__SECONDARY__" stroke-width="6" stroke-linejoin="round"/></svg>`,
  "twin-wings": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M48 45C37 28 22 23 9 25C18 43 32 54 48 56V45Z" fill="__PRIMARY__"/><path d="M52 45C63 28 78 23 91 25C82 43 68 54 52 56V45Z" fill="__PRIMARY__"/><path d="M42 67H58L50 82L42 67Z" fill="__SECONDARY__"/></svg>`,
  "globe-meridian": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="33" stroke="__PRIMARY__" stroke-width="8"/><path d="M17 50H83M50 17C39 29 35 41 35 50C35 60 39 72 50 83M50 17C61 29 65 41 65 50C65 60 61 72 50 83" stroke="__SECONDARY__" stroke-width="6" stroke-linecap="round"/></svg>`,
  "mountain-peak": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M8 78L42 22L58 47L69 34L92 78H8Z" fill="__PRIMARY__"/><path d="M34 48L42 34L51 49L46 46L42 53L38 46L34 48Z" fill="__SECONDARY__"/></svg>`,
  "island-chain": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M15 69C32 65 38 45 51 41C65 37 72 43 86 29" stroke="__PRIMARY__" stroke-width="7" stroke-linecap="round"/><circle cx="24" cy="59" r="10" fill="__SECONDARY__"/><circle cx="52" cy="42" r="8" fill="__PRIMARY__"/><circle cx="80" cy="33" r="6" fill="__SECONDARY__"/></svg>`,
  "horizon-sun": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M17 61H83" stroke="__PRIMARY__" stroke-width="8" stroke-linecap="round"/><path d="M30 60C30 41 39 29 50 29C61 29 70 41 70 60" fill="__SECONDARY__"/><path d="M50 12V21M23 25L31 33M77 25L69 33" stroke="__PRIMARY__" stroke-width="6" stroke-linecap="round"/><path d="M24 76H76" stroke="__SECONDARY__" stroke-width="7" stroke-linecap="round"/></svg>`,
  "polar-star": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 8L59 38L86 24L62 47L91 56L60 57L73 86L53 62L38 90L43 60L12 69L39 52L14 32L44 43L50 8Z" fill="__PRIMARY__"/><circle cx="50" cy="51" r="9" fill="__SECONDARY__"/></svg>`,
  "coastal-wave": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M12 40C27 21 42 25 51 41C61 57 72 59 89 38" stroke="__PRIMARY__" stroke-width="10" stroke-linecap="round"/><path d="M12 64C28 47 42 49 52 64C62 78 74 79 89 61" stroke="__SECONDARY__" stroke-width="10" stroke-linecap="round"/></svg>`,
  "location-wings": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 15C37 15 27 25 27 38C27 56 50 80 50 80C50 80 73 56 73 38C73 25 63 15 50 15Z" fill="__PRIMARY__"/><circle cx="50" cy="38" r="10" fill="__SECONDARY__"/><path d="M26 47L7 39L18 58L34 61M74 47L93 39L82 58L66 61" stroke="__SECONDARY__" stroke-width="7" stroke-linejoin="round"/></svg>`,
  "route-nodes": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M19 70C31 43 49 60 59 34C65 21 75 21 84 24" stroke="__PRIMARY__" stroke-width="8" stroke-linecap="round"/><circle cx="18" cy="71" r="10" fill="__SECONDARY__"/><circle cx="56" cy="42" r="8" fill="__SECONDARY__"/><circle cx="84" cy="24" r="9" fill="__PRIMARY__"/></svg>`,
  "cedar-leaf": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M78 16C42 21 21 41 24 68C44 77 71 60 78 16Z" fill="__PRIMARY__"/><path d="M27 78C39 56 52 42 72 25M40 57L31 44M52 45L49 30M51 46L68 49" stroke="__SECONDARY__" stroke-width="6" stroke-linecap="round"/></svg>`,
  feather: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M79 15C47 17 27 37 23 70C39 76 63 64 74 44C82 29 82 20 79 15Z" fill="__PRIMARY__"/><path d="M18 84C34 61 49 45 72 25M37 62L27 54M48 50L39 40M51 47L67 49M60 36L55 28" stroke="__SECONDARY__" stroke-width="6" stroke-linecap="round"/></svg>`,
  falcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M9 55C26 32 39 26 50 42C61 26 74 32 91 55C75 51 65 56 57 68L50 83L43 68C35 56 25 51 9 55Z" fill="__PRIMARY__"/><path d="M38 50L50 58L62 50L50 69L38 50Z" fill="__SECONDARY__"/></svg>`,
  albatross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M5 54C23 29 40 28 50 43C60 28 77 29 95 54C77 46 64 49 50 65C36 49 23 46 5 54Z" fill="__PRIMARY__"/><path d="M44 65H56L50 80L44 65Z" fill="__SECONDARY__"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M52 10C59 30 78 38 76 60C75 78 61 89 47 89C28 89 16 74 21 56C25 40 41 34 44 19C50 25 53 32 53 39C60 32 58 21 52 10Z" fill="__PRIMARY__"/><path d="M49 47C55 56 63 61 59 71C57 78 51 81 45 79C37 77 34 68 38 61C41 56 46 52 49 47Z" fill="__SECONDARY__"/></svg>`,
  thunderbolt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M55 8L20 56H44L38 92L81 40H56L55 8Z" fill="__PRIMARY__"/><path d="M47 47L61 28L59 43H70L53 64L56 47H47Z" fill="__SECONDARY__"/></svg>`,
  lotus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 77C34 65 30 48 50 23C70 48 66 65 50 77Z" fill="__PRIMARY__"/><path d="M45 77C27 76 16 63 18 43C38 49 46 62 45 77ZM55 77C73 76 84 63 82 43C62 49 54 62 55 77Z" fill="__SECONDARY__"/><path d="M19 80H81" stroke="__PRIMARY__" stroke-width="7" stroke-linecap="round"/></svg>`,
  "coral-branch": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 85V56M50 62L31 44M50 50L67 31M31 44V26M31 44L17 52M67 31L82 23M67 31L74 50" stroke="__PRIMARY__" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="31" cy="23" r="7" fill="__SECONDARY__"/><circle cx="15" cy="54" r="7" fill="__SECONDARY__"/><circle cx="84" cy="21" r="7" fill="__SECONDARY__"/><circle cx="76" cy="53" r="7" fill="__SECONDARY__"/></svg>`,
  orbit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="15" fill="__PRIMARY__"/><ellipse cx="50" cy="50" rx="39" ry="19" transform="rotate(-25 50 50)" stroke="__SECONDARY__" stroke-width="7"/><circle cx="82" cy="31" r="8" fill="__PRIMARY__"/></svg>`,
  ribbon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M19 27C43 14 71 26 77 48C82 68 65 84 46 78C32 74 27 60 37 50C47 41 61 48 59 59" stroke="__PRIMARY__" stroke-width="11" stroke-linecap="round"/><path d="M23 72L45 50" stroke="__SECONDARY__" stroke-width="9" stroke-linecap="round"/></svg>`,
  prism: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 10L91 77H9L50 10Z" fill="__PRIMARY__"/><path d="M50 28L73 66H27L50 28Z" fill="__SECONDARY__"/><path d="M50 28V66M27 66L50 52L73 66" stroke="__PRIMARY__" stroke-width="5"/></svg>`,
  "hex-wing": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 9L86 29V71L50 91L14 71V29L50 9Z" fill="__PRIMARY__"/><path d="M23 51L45 31L50 46L55 31L77 51L57 57L50 75L43 57L23 51Z" fill="__SECONDARY__"/></svg>`,
  "twin-arcs": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M17 65C28 31 51 22 82 31" stroke="__PRIMARY__" stroke-width="11" stroke-linecap="round"/><path d="M18 79C35 54 58 48 84 52" stroke="__SECONDARY__" stroke-width="11" stroke-linecap="round"/></svg>`,
  "crossing-routes": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M16 24C40 24 41 76 84 76" stroke="__PRIMARY__" stroke-width="9" stroke-linecap="round"/><path d="M16 76C40 76 41 24 84 24" stroke="__SECONDARY__" stroke-width="9" stroke-linecap="round"/><circle cx="16" cy="24" r="7" fill="__PRIMARY__"/><circle cx="84" cy="76" r="7" fill="__PRIMARY__"/></svg>`,
  "rising-bars": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><rect x="15" y="60" width="15" height="25" rx="4" fill="__PRIMARY__"/><rect x="37" y="45" width="15" height="40" rx="4" fill="__SECONDARY__"/><rect x="59" y="28" width="15" height="57" rx="4" fill="__PRIMARY__"/><path d="M16 45L46 26L68 16L85 18" stroke="__SECONDARY__" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "diamond-flight": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M50 8L90 50L50 92L10 50L50 8Z" fill="__PRIMARY__"/><path d="M24 54L70 29L61 52L76 61L45 71L48 57L24 54Z" fill="__SECONDARY__"/></svg>`,
  "linked-rings": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="37" cy="50" r="24" stroke="__PRIMARY__" stroke-width="10"/><circle cx="63" cy="50" r="24" stroke="__SECONDARY__" stroke-width="10"/><path d="M50 30C57 34 61 41 61 50C61 59 57 66 50 70C43 66 39 59 39 50C39 41 43 34 50 30Z" fill="#F2F4F3"/></svg>`,
  comet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="68" cy="35" r="18" fill="__PRIMARY__"/><path d="M56 48L18 81M51 39L11 55M63 53L37 90" stroke="__SECONDARY__" stroke-width="8" stroke-linecap="round"/></svg>`,
  eclipse: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="48" cy="50" r="35" fill="__PRIMARY__"/><circle cx="62" cy="39" r="31" fill="__SECONDARY__"/><circle cx="69" cy="34" r="24" fill="#F2F4F3"/></svg>`,
  beacon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M39 83L46 37H54L61 83H39Z" fill="__PRIMARY__"/><rect x="35" y="79" width="30" height="9" rx="4" fill="__SECONDARY__"/><circle cx="50" cy="27" r="10" fill="__PRIMARY__"/><path d="M29 18L17 9M71 18L83 9M25 35L10 39M75 35L90 39" stroke="__SECONDARY__" stroke-width="7" stroke-linecap="round"/></svg>`,
};

type AirlineLogoProps = {
  id: AirlineLogoId;
  primary: string;
  secondary: string;
  size?: number;
  accessibilityLabel?: string;
};

export function AirlineLogo({
  id,
  primary,
  secondary,
  size = 64,
  accessibilityLabel = "Airline logo",
}: AirlineLogoProps) {
  const xml = AIRLINE_LOGO_XML[id]
    .replaceAll(PRIMARY_TOKEN, primary)
    .replaceAll(SECONDARY_TOKEN, secondary);

  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
