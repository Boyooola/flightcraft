// app.config.js

export default {
  expo: {
    name: "Flightcraft",
    slug: "flightcraft",
    version: "0.1.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "flightcraft",
    userInterfaceStyle: "dark",

    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#04090f",
    },

    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.flightcraft.app",
      buildNumber: "1",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Used to show your position on the map.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    android: {
      package: "com.stratoslabs.flightcraft",
      versionCode: 10,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#04090f",
      },
      permissions: [],
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },

    web: {
      bundler: "metro",
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-audio",
      "expo-web-browser",
      "expo-asset",
      "expo-splash-screen",
      "@rnmapbox/maps",
      [
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          project: "flightcraft",
          organization: "flightcraft",
        },
      ],
      "@react-native-google-signin/google-signin",
      "@sentry/react-native",
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#0ea5e9",
          androidMode: "default",
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    // Fill in after: eas build:configure
    extra: {
      eas: {
        projectId: "60965f1d-19cd-45fb-a5f1-fd3ad63766a1",
      },
    },
    owner: "stratoslabs",
  },
};
