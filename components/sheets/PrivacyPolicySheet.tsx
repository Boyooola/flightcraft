/**
 * Flightcraft privacy policy presented as a readable in-game document.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LAST_UPDATED = "September 2026";

function PolicySection({
  number,
  icon,
  title,
  children,
}: {
  number: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={sectionStyles.card}>
      <View style={sectionStyles.header}>
        <View style={sectionStyles.numberBox}>
          <Text style={sectionStyles.number}>{number}</Text>
        </View>
        <View style={sectionStyles.icon}>
          <Ionicons name={icon} size={17} color={Colors.sky} />
        </View>
        <Text style={sectionStyles.title}>{title}</Text>
      </View>

      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={sectionStyles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={sectionStyles.bulletRow}>
      <View style={sectionStyles.bullet} />
      <Text style={sectionStyles.bulletText}>{children}</Text>
    </View>
  );
}

function ServiceRow({ name, purpose }: { name: string; purpose: string }) {
  return (
    <View style={serviceStyles.row}>
      <Ionicons
        name="checkmark-circle-outline"
        size={15}
        color={Colors.green}
      />
      <View style={serviceStyles.copy}>
        <Text style={serviceStyles.name}>{name}</Text>
        <Text style={serviceStyles.purpose}>{purpose}</Text>
      </View>
    </View>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  color,
  surface,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  surface: string;
}) {
  return (
    <View style={summaryStyles.item}>
      <View style={[summaryStyles.icon, { backgroundColor: surface }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}

export default function PrivacyPolicySheet() {
  const closeSheet = useGameStore((state) => state.closeSheet);
  const tabBarHeight = useTabBarHeight();

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerMark}>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={Colors.green}
          />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>YOUR DATA</Text>
          <Text style={styles.screenTitle}>Privacy Policy</Text>
          <Text style={styles.subtitle}>Flightcraft mobile game</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close privacy policy"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.introCard}>
        <View style={styles.introTop}>
          <View style={styles.introCopy}>
            <Text style={styles.introLabel}>PLAIN-LANGUAGE SUMMARY</Text>
            <Text style={styles.introTitle}>
              Your game data powers your airline.
            </Text>
          </View>
          <View style={styles.updatedPill}>
            <Text style={styles.updatedLabel}>UPDATED</Text>
            <Text style={styles.updatedValue}>{LAST_UPDATED}</Text>
          </View>
        </View>

        <Text style={styles.introText}>
          This policy explains what Flightcraft collects, why it is needed, who
          helps provide the game, and the choices available to you.
        </Text>

        <View style={summaryStyles.row}>
          <SummaryItem
            icon="save-outline"
            label="GAME DATA"
            value="Saved progress"
            color={Colors.sky}
            surface={Palette.blueSoft}
          />
          <SummaryItem
            icon="game-controller-outline"
            label="IDENTITY"
            value="Play Games ID"
            color={Colors.purple}
            surface={Palette.violetSoft}
          />
          <SummaryItem
            icon="eye-off-outline"
            label="REWARDED ADS"
            value="Optional only"
            color={Colors.amber}
            surface={Palette.orangeSoft}
          />
        </View>

        <View style={styles.noSaleBanner}>
          <Ionicons name="hand-left-outline" size={16} color={Colors.green} />
          <Text style={styles.noSaleText}>
            Flightcraft does not sell your personal data.
          </Text>
        </View>
      </View>

      <View style={styles.documentLabelRow}>
        <Text style={styles.documentLabel}>FULL POLICY</Text>
        <Text style={styles.documentHint}>Read each section below</Text>
      </View>

      <PolicySection number="01" icon="business-outline" title="Who We Are">
        <Paragraph>
          Flightcraft is a mobile airline tycoon game. This privacy policy
          applies to the Flightcraft mobile app and related game services.
        </Paragraph>
      </PolicySection>

      <PolicySection number="02" icon="server-outline" title="Data We Collect">
        <Paragraph>
          We collect game-related data needed to operate the game, including:
        </Paragraph>
        <Bullet>Airline name, cash, game day, and saved progress</Bullet>
        <Bullet>Routes, hubs, aircraft fleet, and operational records</Bullet>
        <Bullet>Achievements and leaderboard scores</Bullet>
        <Bullet>Google Play Games player ID and display name</Bullet>
        <Bullet>Device type, OS version, and basic crash diagnostics</Bullet>
        <Paragraph>
          We do not collect your email address, phone number, or precise
          location.
        </Paragraph>
      </PolicySection>

      <PolicySection
        number="03"
        icon="game-controller-outline"
        title="How We Use Data"
      >
        <Paragraph>We use this data to:</Paragraph>
        <Bullet>Save and restore your airline progress</Bullet>
        <Bullet>Operate achievements and leaderboard features</Bullet>
        <Bullet>Deliver optional rewarded ads that you choose to watch</Bullet>
        <Bullet>Diagnose crashes and maintain app stability</Bullet>
      </PolicySection>

      <PolicySection number="04" icon="trophy-outline" title="Leaderboard">
        <Paragraph>
          If you use leaderboard features, your chosen airline name and score
          may be visible to other players. Your airline name does not need to be
          your real name.
        </Paragraph>
      </PolicySection>

      <PolicySection
        number="05"
        icon="cloud-outline"
        title="Storage and Security"
      >
        <Paragraph>
          Game data is stored on your device and in Supabase. Your account is
          identified by your Google Play Games player ID. Flightcraft does not
          store a password for your game account.
        </Paragraph>
        <Paragraph>
          We use reasonable technical measures intended to protect your data. No
          storage or transmission method can be guaranteed completely secure.
        </Paragraph>
      </PolicySection>

      <PolicySection number="06" icon="videocam-outline" title="Advertising">
        <Paragraph>
          Flightcraft may offer rewarded video ads powered by Google AdMob.
          These ads appear only after you choose to watch one in exchange for an
          in-game reward.
        </Paragraph>
        <Paragraph>
          Flightcraft requests non-personalized rewarded ads. Google AdMob may
          still process device or advertising identifiers under Google&apos;s
          own privacy terms. Advertising preferences can be managed in your
          device or Google account settings.
        </Paragraph>
      </PolicySection>

      <PolicySection
        number="07"
        icon="notifications-outline"
        title="Notifications"
      >
        <Paragraph>
          Flightcraft may schedule local notifications on your device to remind
          you about game progress or rewards. The current app does not upload a
          push-notification token. Notifications can be disabled in your device
          settings.
        </Paragraph>
      </PolicySection>

      <PolicySection
        number="08"
        icon="link-outline"
        title="Third-Party Services"
      >
        <Paragraph>
          Flightcraft uses service providers for authentication, cloud storage,
          crash reporting, advertising, and app distribution:
        </Paragraph>
        <View style={serviceStyles.list}>
          <ServiceRow
            name="Google Play Games Services"
            purpose="Player identity, achievements, and leaderboards"
          />
          <ServiceRow
            name="Supabase"
            purpose="Cloud database and saved game progress"
          />
          <ServiceRow
            name="Google AdMob"
            purpose="Optional non-personalized rewarded ads"
          />
          <ServiceRow
            name="Sentry"
            purpose="Crash diagnostics with default personal data disabled"
          />
          <ServiceRow
            name="Expo / EAS"
            purpose="Application building and distribution"
          />
        </View>
        <Paragraph>
          Each provider processes data under its own terms and privacy policy.
        </Paragraph>
      </PolicySection>

      <PolicySection number="09" icon="people-outline" title="Children">
        <Paragraph>
          Flightcraft is intended for a general audience. We do not knowingly
          collect personal information from children under 13. If you believe a
          child has provided personal information, contact us so we can review
          and delete it when appropriate.
        </Paragraph>
      </PolicySection>

      <PolicySection
        number="10"
        icon="person-circle-outline"
        title="Your Choices and Rights"
      >
        <Paragraph>
          You may use Delete airline data in Settings to permanently remove your
          Flightcraft airline and saved progress from our servers.
        </Paragraph>
        <Bullet>Disable local notifications in device settings</Bullet>
        <Bullet>
          Manage advertising preferences in device or Google settings
        </Bullet>
        <Bullet>
          Use an airline name that does not identify you personally
        </Bullet>
        <Paragraph>
          Google Play Games achievements and leaderboard records are managed by
          Google and are not deleted with your Flightcraft airline data.
        </Paragraph>
      </PolicySection>

      <PolicySection number="11" icon="refresh-outline" title="Policy Updates">
        <Paragraph>
          We may update this privacy policy from time to time. Important changes
          will be reflected in the Last updated date and may also be
          communicated through the app or its store listing.
        </Paragraph>
      </PolicySection>

      <PolicySection number="12" icon="mail-outline" title="Contact">
        <Paragraph>
          For privacy questions or data requests, contact us through the
          Flightcraft page on the Google Play Store.
        </Paragraph>
      </PolicySection>

      <View style={styles.footer}>
        <View style={styles.footerMark}>
          <Ionicons name="shield-checkmark" size={17} color={Colors.green} />
        </View>
        <View>
          <Text style={styles.footerTitle}>Flightcraft Privacy Policy</Text>
          <Text style={styles.footerText}>Last updated {LAST_UPDATED}</Text>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Palette.cloud,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  label: {
    color: Colors.dim,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.6,
    textAlign: "center",
  },
  value: {
    color: Colors.text,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: Typography.weight.bold,
    textAlign: "center",
    marginTop: Spacing.xxs,
  },
});

const serviceStyles = StyleSheet.create({
  list: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Palette.cloud,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: Colors.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: Typography.weight.bold,
  },
  purpose: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
});

const sectionStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  numberBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.md,
    backgroundColor: Colors.inset,
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Palette.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: Typography.weight.bold,
  },
  body: {
    gap: Spacing.sm,
  },
  paragraph: {
    color: Colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.sky,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    color: Colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: Palette.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: Colors.green,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  screenTitle: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  introCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    borderLeftColor: Colors.green,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.card,
  },
  introTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  introCopy: {
    flex: 1,
  },
  introLabel: {
    color: Colors.green,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.1,
  },
  introTitle: {
    color: Colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xs,
  },
  updatedPill: {
    alignItems: "flex-end",
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  updatedLabel: {
    color: Colors.green,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.7,
  },
  updatedValue: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xxs,
  },
  introText: {
    color: Colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  noSaleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  noSaleText: {
    flex: 1,
    color: Colors.green,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: Typography.weight.bold,
  },
  documentLabelRow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  documentLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  documentHint: {
    color: Colors.dim,
    fontSize: 9,
  },
  footer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerMark: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Palette.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  footerTitle: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: Typography.weight.bold,
  },
  footerText: {
    color: Colors.dim,
    fontSize: 9,
    marginTop: Spacing.xxs,
  },
});
