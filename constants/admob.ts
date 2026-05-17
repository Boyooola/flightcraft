/**
 * constants/admob.ts
 *
 * AdMob + RevenueCat configuration for FlightCraft.
 *
 * Real ad unit IDs — only used in production builds.
 * Test IDs are used automatically in __DEV__ mode.
 */

// ── AdMob ─────────────────────────────────────────────────────────
export const ADMOB_APP_ID = "ca-app-pub-3374708302627509~3697789196";
export const REWARDED_AD_UNIT = "ca-app-pub-3374708302627509/2359217409";

// Google's official test ad unit — safe to use in dev builds
export const TEST_REWARDED_AD_UNIT = "ca-app-pub-3419561124831112/5975613600";

// ── RevenueCat ────────────────────────────────────────────────────
export const REVENUECAT_API_KEY = "goog_VUHVSzLXwBUPkjRBtKiwzOyGjTc";

// ── IAP product IDs — must match Play Console exactly ─────────────
export const IAP_REMOVE_ADS = "flightcraft.remove_ads";
export const IAP_STARTER_PACK = "flightcraft.starter_pack";
export const IAP_FLEET_EXPANSION = "flightcraft.fleet_expansion";
export const IAP_SPEED_BOOST = "flightcraft.speed_boost";

// ── RevenueCat entitlement IDs ────────────────────────────────────
export const ENTITLEMENT_REMOVE_ADS = "remove_ads";
export const ENTITLEMENT_STARTER_PACK = "starter_pack";
export const ENTITLEMENT_FLEET_EXPANSION = "fleet_expansion";
