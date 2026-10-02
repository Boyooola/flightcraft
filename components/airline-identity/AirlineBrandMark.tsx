import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { AirlineLogo } from "./AirlineLogo";
import type { AirlineLogoId } from "./airlineLogoCatalog";

type AirlineBrandMarkProps = {
  logoId: AirlineLogoId;
  primary: string;
  secondary: string;
  variant: "emblem" | "leaderboard" | "tail" | "map-marker";
  size?: number;
  accessibilityLabel?: string;
};

export function AirlineBrandMark({
  logoId,
  primary,
  secondary,
  variant,
  size = 64,
  accessibilityLabel = "Airline identity",
}: AirlineBrandMarkProps) {
  if (variant === "map-marker") {
    const markerHeight = size * 1.25;

    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={{ width: size, height: markerHeight }}
      >
        <Svg
          width={size}
          height={markerHeight}
          viewBox="0 0 64 80"
          style={StyleSheet.absoluteFill}
        >
          <Path
            d="M32 3C16.5 3 4 15.5 4 31C4 52 32 77 32 77C32 77 60 52 60 31C60 15.5 47.5 3 32 3Z"
            fill={primary}
            stroke="#FFFFFF"
            strokeWidth={4}
          />
          <Circle cx={32} cy={31} r={18} fill="#FFFFFF" />
        </Svg>

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: size * 0.31,
            top: size * 0.3,
          }}
        >
          <AirlineLogo
            id={logoId}
            primary={primary}
            secondary={secondary}
            size={size * 0.38}
            accessibilityLabel=""
          />
        </View>
      </View>
    );
  }

  const isLeaderboard = variant === "leaderboard";
  const isTail = variant === "tail";
  const logoSize = size * (isLeaderboard ? 0.58 : 0.62);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: isTail ? Math.max(4, size * 0.06) : size / 2,
          backgroundColor: primary,
          borderWidth: isLeaderboard ? 1 : 0,
          borderColor: "#CDD3D7",
        },
      ]}
    >
      <AirlineLogo
        id={logoId}
        primary="#FFFFFF"
        secondary={secondary}
        size={logoSize}
        accessibilityLabel=""
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
