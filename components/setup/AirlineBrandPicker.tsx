import {
  AIRLINE_LOGO_CATALOG,
  AIRLINE_PALETTES,
  AirlineBrandMark,
  AirlineLogo,
  type AirlineLogoCategory,
  type AirlineLogoId,
  type AirlinePaletteId,
} from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const CATEGORIES: AirlineLogoCategory[] = [
  "Flight",
  "Navigation",
  "Places",
  "Nature",
  "Abstract",
];

interface AirlineBrandPickerProps {
  airlineName: string;
  airlineCode: string;
  logoId: AirlineLogoId;
  paletteId: AirlinePaletteId;
  onLogoChange: (logoId: AirlineLogoId) => void;
  onPaletteChange: (paletteId: AirlinePaletteId) => void;
}

export function AirlineBrandPicker({
  airlineName,
  airlineCode,
  logoId,
  paletteId,
  onLogoChange,
  onPaletteChange,
}: AirlineBrandPickerProps) {
  const selectedLogo =
    AIRLINE_LOGO_CATALOG.find((logo) => logo.id === logoId) ??
    AIRLINE_LOGO_CATALOG[0];
  const [category, setCategory] = useState<AirlineLogoCategory>(
    selectedLogo.category,
  );
  const palette =
    AIRLINE_PALETTES.find((item) => item.id === paletteId) ??
    AIRLINE_PALETTES[0];

  const visibleLogos = useMemo(
    () => AIRLINE_LOGO_CATALOG.filter((logo) => logo.category === category),
    [category],
  );

  const randomize = () => {
    const nextLogo =
      AIRLINE_LOGO_CATALOG[
        Math.floor(Math.random() * AIRLINE_LOGO_CATALOG.length)
      ];
    const nextPalette =
      AIRLINE_PALETTES[Math.floor(Math.random() * AIRLINE_PALETTES.length)];
    setCategory(nextLogo.category);
    onLogoChange(nextLogo.id);
    onPaletteChange(nextPalette.id);
  };

  return (
    <View>
      <View style={styles.preview}>
        <AirlineBrandMark
          accessibilityLabel={`${airlineName || "Your airline"} emblem`}
          logoId={logoId}
          primary={palette.primary}
          secondary={palette.secondary}
          size={72}
          variant="emblem"
        />

        <View style={styles.previewCopy}>
          <Text numberOfLines={1} style={styles.previewName}>
            {airlineName.trim() || "Your airline"}
          </Text>
          <Text style={styles.previewCode}>
            {airlineCode || "---"} · {selectedLogo.name}
          </Text>
        </View>

        <View style={styles.previewAssets}>
          <AirlineBrandMark
            accessibilityLabel="Aircraft tail preview"
            logoId={logoId}
            primary={palette.primary}
            secondary={palette.secondary}
            size={42}
            variant="tail"
          />
          <AirlineBrandMark
            accessibilityLabel="Map marker preview"
            logoId={logoId}
            primary={palette.primary}
            secondary={palette.secondary}
            size={34}
            variant="map-marker"
          />
        </View>
      </View>

      <View style={styles.pickerHeading}>
        <Text style={styles.pickerLabel}>Logo</Text>
        <Pressable
          accessibilityRole="button"
          onPress={randomize}
          style={({ pressed }) => [
            styles.randomButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="shuffle" size={16} color={Colors.sky} />
          <Text style={styles.randomLabel}>Randomize</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.categoryContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {CATEGORIES.map((item) => {
          const selected = item === category;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item}
              onPress={() => setCategory(item)}
              style={({ pressed }) => [
                styles.categoryButton,
                selected && styles.categoryButtonSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  selected && styles.categoryLabelSelected,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View accessibilityRole="radiogroup" style={styles.logoGrid}>
        {visibleLogos.map((logo) => {
          const selected = logo.id === logoId;
          return (
            <View key={logo.id} style={styles.logoCell}>
              <Pressable
                accessibilityLabel={logo.name}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => onLogoChange(logo.id)}
                style={({ pressed }) => [
                  styles.logoButton,
                  selected && styles.logoButtonSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.logoDisc,
                    { backgroundColor: palette.primary },
                  ]}
                >
                  <AirlineLogo
                    accessibilityLabel=""
                    id={logo.id}
                    primary={Colors.textOnColor}
                    secondary={palette.secondary}
                    size={34}
                  />
                </View>
                <Text numberOfLines={2} style={styles.logoLabel}>
                  {logo.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Text style={styles.pickerLabel}>Colors</Text>
      <ScrollView
        contentContainerStyle={styles.paletteContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {AIRLINE_PALETTES.map((item) => {
          const selected = item.id === paletteId;
          return (
            <Pressable
              accessibilityLabel={`${item.name} color palette`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={item.id}
              onPress={() => onPaletteChange(item.id)}
              style={({ pressed }) => [
                styles.paletteButton,
                selected && styles.paletteButtonSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.paletteSwatch}>
                <View
                  style={[
                    styles.paletteHalf,
                    { backgroundColor: item.primary },
                  ]}
                />
                <View
                  style={[
                    styles.paletteHalf,
                    { backgroundColor: item.secondary },
                  ]}
                />
              </View>
              {selected ? (
                <View style={styles.selectedCheck}>
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color={Colors.textOnColor}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.paletteName}>{palette.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewName: {
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  previewCode: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  previewAssets: {
    minWidth: 50,
    alignItems: "center",
    gap: Spacing.sm,
  },
  pickerHeading: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
  },
  pickerLabel: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  randomButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  randomLabel: {
    color: Colors.sky,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  categoryContent: {
    minHeight: MIN_TOUCH,
    alignItems: "stretch",
    gap: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryButton: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  categoryButtonSelected: {
    borderBottomColor: Colors.sky,
  },
  categoryLabel: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.medium,
  },
  categoryLabelSelected: {
    color: Colors.skyDark,
    fontWeight: Typography.weight.bold,
  },
  logoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -Spacing.xs,
    marginVertical: Spacing.md,
  },
  logoCell: {
    width: "25%",
    padding: Spacing.xs,
  },
  logoButton: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: Radius.md,
  },
  logoButtonSelected: {
    backgroundColor: Colors.skyDim,
    borderColor: Colors.borderHi,
  },
  logoDisc: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  logoLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
  },
  paletteContent: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  paletteButton: {
    width: 60,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: Radius.md,
  },
  paletteButtonSelected: {
    borderColor: Colors.borderHi,
  },
  paletteSwatch: {
    width: 48,
    height: 32,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: Radius.sm,
  },
  paletteHalf: {
    flex: 1,
  },
  selectedCheck: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.sky,
    borderRadius: Radius.full,
  },
  paletteName: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  pressed: {
    opacity: 0.68,
  },
});
