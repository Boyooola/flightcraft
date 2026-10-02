/**
 * FlightCraft privacy policy presented as a readable in-game document.
 */

import {
  Colors,
  MIN_TOUCH,
  Radius,
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
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.policySection}>
      <View style={styles.policyHeading}>
        <Text style={styles.policyNumber}>{number}</Text>
        <Text accessibilityRole="header" style={styles.policyTitle}>
          {title}
        </Text>
      </View>
      <View style={styles.policyBody}>{children}</View>
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text accessibilityElementsHidden style={styles.bulletMark}>
        •
      </Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, last && styles.lastRow]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ServiceRow({
  name,
  purpose,
  last = false,
}: {
  name: string;
  purpose: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.serviceRow, last && styles.lastRow]}>
      <Text style={styles.serviceName}>{name}</Text>
      <Text style={styles.servicePurpose}>{purpose}</Text>
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
        <View style={styles.headerIcon}>
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color={Colors.skyDark}
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.screenTitle}>Privacy policy</Text>
          <Text style={styles.subtitle}>Last updated {LAST_UPDATED}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close privacy policy"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.introduction}>
        <Text accessibilityRole="header" style={styles.introductionTitle}>
          How FlightCraft handles game data
        </Text>
        <Text style={styles.introductionText}>
          This policy explains what FlightCraft collects, why it is needed, who
          helps provide the game, and the choices available to you.
        </Text>
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Summary</Text>
        <View style={styles.summaryTable}>
          <SummaryRow
            label="Game progress"
            value="Stored on device and in Supabase"
          />
          <SummaryRow
            label="Player identity"
            value="Play Games ID and display name"
          />
          <SummaryRow label="Rewarded ads" value="Optional only" />
          <SummaryRow label="Personal data sale" value="Not sold" last />
        </View>
      </View>

      <View style={styles.documentHeading}>
        <Text accessibilityRole="header" style={styles.documentTitle}>
          Full policy
        </Text>
        <Text style={styles.documentHint}>12 sections</Text>
      </View>

      <PolicySection number="01" title="Who we are">
        <Paragraph>
          FlightCraft is a mobile airline tycoon game. This privacy policy
          applies to the FlightCraft mobile app and related game services.
        </Paragraph>
      </PolicySection>

      <PolicySection number="02" title="Data we collect">
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

      <PolicySection number="03" title="How we use data">
        <Paragraph>We use this data to:</Paragraph>
        <Bullet>Save and restore your airline progress</Bullet>
        <Bullet>Operate achievements and leaderboard features</Bullet>
        <Bullet>Deliver optional rewarded ads that you choose to watch</Bullet>
        <Bullet>Diagnose crashes and maintain app stability</Bullet>
      </PolicySection>

      <PolicySection number="04" title="Leaderboard">
        <Paragraph>
          If you use leaderboard features, your chosen airline name and score
          may be visible to other players. Your airline name does not need to be
          your real name.
        </Paragraph>
      </PolicySection>

      <PolicySection number="05" title="Storage and security">
        <Paragraph>
          Game data is stored on your device and in Supabase. Your account is
          identified by your Google Play Games player ID. FlightCraft does not
          store a password for your game account.
        </Paragraph>
        <Paragraph>
          We use reasonable technical measures intended to protect your data. No
          storage or transmission method can be guaranteed completely secure.
        </Paragraph>
      </PolicySection>

      <PolicySection number="06" title="Advertising">
        <Paragraph>
          FlightCraft may offer rewarded video ads powered by Google AdMob.
          These ads appear only after you choose to watch one in exchange for an
          in-game reward.
        </Paragraph>
        <Paragraph>
          FlightCraft requests non-personalized rewarded ads. Google AdMob may
          still process device or advertising identifiers under Google&apos;s
          own privacy terms. Advertising preferences can be managed in your
          device or Google account settings.
        </Paragraph>
      </PolicySection>

      <PolicySection number="07" title="Notifications">
        <Paragraph>
          FlightCraft may schedule local notifications on your device to remind
          you about game progress or rewards. The current app does not upload a
          push-notification token. Notifications can be disabled in your device
          settings.
        </Paragraph>
      </PolicySection>

      <PolicySection number="08" title="Third-party services">
        <Paragraph>
          FlightCraft uses service providers for authentication, cloud storage,
          crash reporting, advertising, and app distribution:
        </Paragraph>
        <View style={styles.serviceTable}>
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
            last
          />
        </View>
        <Paragraph>
          Each provider processes data under its own terms and privacy policy.
        </Paragraph>
      </PolicySection>

      <PolicySection number="09" title="Children">
        <Paragraph>
          FlightCraft is intended for a general audience. We do not knowingly
          collect personal information from children under 13. If you believe a
          child has provided personal information, contact us so we can review
          and delete it when appropriate.
        </Paragraph>
      </PolicySection>

      <PolicySection number="10" title="Your choices and rights">
        <Paragraph>
          You may use Delete airline data in Settings to permanently remove your
          FlightCraft airline and saved progress from our servers.
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
          Google and are not deleted with your FlightCraft airline data.
        </Paragraph>
      </PolicySection>

      <PolicySection number="11" title="Policy updates">
        <Paragraph>
          We may update this privacy policy from time to time. Important changes
          will be reflected in the Last updated date and may also be
          communicated through the app or its store listing.
        </Paragraph>
      </PolicySection>

      <PolicySection number="12" title="Contact">
        <Paragraph>
          For privacy questions or data requests, contact us through the
          FlightCraft page on the Google Play Store.
        </Paragraph>
      </PolicySection>

      <View style={styles.footer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={18}
          color={Colors.skyDark}
        />
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>FlightCraft privacy policy</Text>
          <Text style={styles.footerText}>Last updated {LAST_UPDATED}</Text>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    backgroundColor: Colors.surface,
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  introduction: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  introductionTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: Typography.weight.bold,
  },
  introductionText: {
    marginTop: Spacing.sm,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  summarySection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  summaryTitle: {
    minHeight: 36,
    color: Colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
  },
  summaryTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  summaryRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    width: "35%",
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  summaryValue: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
    textAlign: "right",
  },
  documentHeading: {
    minHeight: 62,
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  documentTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: Typography.weight.bold,
  },
  documentHint: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  policySection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  policyHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.md,
  },
  policyNumber: {
    width: 28,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  policyTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
  },
  policyBody: {
    marginTop: Spacing.md,
    paddingLeft: 28 + Spacing.md,
    gap: Spacing.sm,
  },
  paragraph: {
    color: Colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  bulletMark: {
    width: 10,
    color: Colors.skyDark,
    fontSize: 15,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    color: Colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  serviceTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  serviceRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  serviceName: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  servicePurpose: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  footer: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  footerCopy: {
    flex: 1,
  },
  footerTitle: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  footerText: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
});
