/**
 * hooks/useAdMob.ts
 *
 * Rewarded ad hook for FlightCraft.
 * Used for: "Watch ad to double away earnings"
 *
 * Install: expo install react-native-google-mobile-ads
 * Docs: https://docs.page/invertase/react-native-google-mobile-ads
 */

import { useCallback, useEffect, useRef, useState } from "react";

let MobileAds: any = null;
let RewardedAd: any = null;
let AdEventType: any = null;
let RewardedAdEventType: any = null;

try {
  const pkg = require("react-native-google-mobile-ads");
  MobileAds = pkg.default;
  RewardedAd = pkg.RewardedAd;
  AdEventType = pkg.AdEventType;
  RewardedAdEventType = pkg.RewardedAdEventType;
} catch {}

export type AdState = "idle" | "loading" | "ready" | "showing" | "unavailable";

export function useRewardedAd(onRewarded: () => void, adUnit: string) {
  const [state, setState] = useState<AdState>("idle");
  const adRef = useRef<any>(null);
  const subs = useRef<(() => void)[]>([]);

  const cleanup = () => {
    subs.current.forEach((unsub) => unsub());
    subs.current = [];
    adRef.current = null;
  };

  const load = useCallback(() => {
    if (!RewardedAd) {
      setState("unavailable");
      return;
    }
    setState("loading");

    const ad = RewardedAd.createForAdRequest(adUnit, {
      requestNonPersonalizedAdsOnly: true,
    });

    adRef.current = ad;

    subs.current.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        setState("ready");
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        onRewarded();
        setState("idle");
        cleanup();
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        setState("unavailable");
        cleanup();
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        // User closed without completing — reset
        setState("idle");
        cleanup();
      }),
    );

    ad.load();
  }, [onRewarded]);

  const show = useCallback(() => {
    if (state !== "ready" || !adRef.current) return;
    setState("showing");
    adRef.current.show();
  }, [state]);

  useEffect(() => () => cleanup(), []);

  return { state, load, show };
}

// Initialise AdMob once at app startup
export async function initAdMob() {
  if (!MobileAds) return;
  try {
    await MobileAds().initialize();
  } catch {}
}
