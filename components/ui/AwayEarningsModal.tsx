/**
 * components/ui/AwayEarningsModal.tsx
 *
 * Full-screen modal shown when player returns after being away.
 * Pauses the game while visible.
 * Offers 2× income via rewarded ad.
 */

import { REWARDED_AD_UNIT, TEST_REWARDED_AD_UNIT } from "@/constants/admob";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useRewardedAd } from "@/hooks/useAdMob";
import { fmtCash } from "@/lib/revenue";
import { useAwayEarnings, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AwayEarningsModal() {
  const awayEarnings = useAwayEarnings();
  const updateAirline = useGameStore((s) => s.updateAirline);
  const earnCash = useGameStore((s) => s.earnCash);
  const setAwayEarnings = useGameStore((s) => s.setAwayEarnings);
  const prevSpeed = useRef<number>(1);
  const adUnit = __DEV__ ? TEST_REWARDED_AD_UNIT : REWARDED_AD_UNIT;

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacAnim = useRef(new Animated.Value(0)).current;

  // Pause game when shown, restore on dismiss
  useEffect(() => {
    if (awayEarnings) {
      const current = useGameStore.getState().airline?.speed ?? 1;
      if (current > 0) prevSpeed.current = current;
      updateAirline({ speed: 0 });

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [!!awayEarnings]);

  const dismiss = () => {
    // Base earnings already credited by applyAwayEarnings — just dismiss
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAwayEarnings(null);
      updateAirline({ speed: prevSpeed.current as any });
    });
  };

  const handleRewarded = () => {
    // Base already credited by applyAwayEarnings — only add the bonus (1× more)
    earnCash(awayEarnings!.amount);
    setAwayEarnings(null);
    updateAirline({ speed: prevSpeed.current as any });
  };

  const {
    state: adState,
    load: loadAd,
    show: showAd,
  } = useRewardedAd(handleRewarded, adUnit);

  const handleWatchAd = () => {
    if (adState === "ready") {
      showAd();
      return;
    }
    if (adState === "idle") {
      loadAd();
    }
  };

  if (!awayEarnings) return null;

  const { days, amount } = awayEarnings;
  const isGain = amount >= 0;
  const perDay = Math.round(Math.abs(amount) / Math.max(1, days));
  const doubled = amount * 2;
  const accent = "#f59e0b";

  return (
    <Animated.View style={[s.overlay, { opacity: opacAnim }]}>
      <Animated.View style={[s.modal, { transform: [{ scale: scaleAnim }] }]}>
        {/* Hero image */}
        <Image
          source={require("@/assets/images/away_earnings_hero.png")}
          style={s.hero}
          resizeMode="cover"
        />

        {/* Close button */}
        <TouchableOpacity style={s.closeBtn} onPress={dismiss} hitSlop={12}>
          <Ionicons name="close" size={16} color={Colors.dim} />
        </TouchableOpacity>

        {/* Gold top badge */}
        <View style={s.badgeWrap}>
          <View style={s.badge}>
            <Text style={s.badgeTxt}>
              ✈ {days} DAY{days !== 1 ? "S" : ""} AWAY
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={s.body}>
          <Text style={s.title}>
            {isGain
              ? "Your airline kept flying! ✨"
              : "Your airline had some drag..."}
          </Text>

          {/* Earnings amount */}
          <View style={[s.amountBox, { borderColor: accent + "44" }]}>
            <Text style={s.amountLabel}>INCOME WHILE AWAY</Text>
            <Text style={[s.amount, { color: isGain ? accent : Colors.red }]}>
              {isGain ? "+" : "-"}
              {fmtCash(Math.abs(amount))}
            </Text>
            <Text style={s.perDay}>{fmtCash(perDay)} / day</Text>
          </View>

          {/* 2× ad button */}
          {isGain && (
            <TouchableOpacity
              style={s.adBtn}
              onPress={handleWatchAd}
              activeOpacity={0.88}
            >
              <View style={s.adBtnInner}>
                <Ionicons
                  name={
                    adState === "ready" ? "play-circle" : "videocam-outline"
                  }
                  size={20}
                  color="#04090f"
                />
                <View>
                  <Text style={s.adBtnTitle}>Watch Ad · Double It</Text>
                  <Text style={s.adBtnSub}>
                    Collect {fmtCash(doubled)} instead
                  </Text>
                </View>
              </View>
              {adState === "loading" && (
                <Text style={s.adLoading}>Loading ad...</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Collect normally */}
          <TouchableOpacity
            style={s.collectBtn}
            onPress={dismiss}
            activeOpacity={0.82}
          >
            <Text style={s.collectTxt}>
              Collect {fmtCash(Math.abs(amount))}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,5,15,0.88)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: Spacing.lg,
  },
  modal: {
    width: "100%",
    backgroundColor: "#080f1e",
    borderRadius: Radius.xl + 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f59e0b33",
  },
  hero: {
    width: "100%",
    height: 200,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    backgroundColor: "rgba(4,9,15,0.75)",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  badgeWrap: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(4,9,15,0.85)",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#f59e0b55",
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: "#f59e0b",
    letterSpacing: 1,
  },
  body: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.text,
    textAlign: "center",
  },
  amountBox: {
    backgroundColor: "rgba(245,158,11,0.06)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: "center",
    gap: 2,
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Colors.dim,
    letterSpacing: 1.2,
  },
  amount: {
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
  },
  perDay: {
    fontSize: 11,
    color: Colors.muted,
    marginTop: 2,
  },
  adBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: Radius.xl,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  adBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  adBtnTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#04090f",
  },
  adBtnSub: {
    fontSize: 11,
    color: "#04090f",
    opacity: 0.7,
  },
  adLoading: {
    fontSize: 10,
    color: "#04090f",
    textAlign: "center",
    marginTop: 4,
    opacity: 0.6,
  },
  collectBtn: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  collectTxt: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.muted,
  },
});
