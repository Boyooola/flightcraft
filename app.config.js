export default {
  expo: {
    name: "Flightcraft",
    slug: "flightcraft",
    version: "0.4.2",
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
      bundleIdentifier: "com.stratoslabs.flightcraft",
      buildNumber: "1",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Used to show your position on the map.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    android: {
      package: "com.stratoslabs.flightcraft",
      versionCode: 16,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#04090f",
      },
      googleServicesFile: "./google-services.json",
      permissions: ["com.android.vending.BILLING"],
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
      config: {
        googleMobileAdsAppId: "ca-app-pub-3374708302627509~3697789196",
      },
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
      // react-native-game-services — pass the Play Games app ID
      // [
      //   "react-native-game-services",
      //   {
      //     android_app_id: "482109260344",
      //   },
      // ],
      "@sentry/react-native",
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#0ea5e9",
          androidMode: "default",
        },
      ],
      // AdMob — commented out until 0.4.1 when billing APK is uploaded
      // [
      //   "react-native-google-mobile-ads",
      //   {
      //     android_app_id: "ca-app-pub-3374708302627509~3697789196",
      //   },
      // ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      eas: {
        projectId: "60965f1d-19cd-45fb-a5f1-fd3ad63766a1",
      },
    },
    owner: "stratoslabs",
  },
  // "react-native-game-services": {
  //   android_app_id: "482109260344",
  // },
  // "react-native-google-mobile-ads": {
  //   android_app_id: "ca-app-pub-3374708302627509~3697789196",
  // },
};
