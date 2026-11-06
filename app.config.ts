// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "space.manus.wanas.t236350328582319";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "WANAS — مساحة الونس",
  appSlug: "wanasapp",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // أيقونة WANAS المولّدة من الهوية (W أبيض + نقطة صفراء على خلفية فحمية)
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519664005840352/vXWwSIBEevHMzMCd.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

// Expo serializes this browser-safe subset into native and web bundles. The server-only
// MANUS_API_KEY and MANUS_JWT_SECRET must never enter this object.
const publicRuntime = {
  oauthPortalUrl:
    process.env.MANUS_OAUTH_PORTAL_URL ??
    process.env.VITE_OAUTH_PORTAL_URL ??
    process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ??
    "",
  oauthServerUrl:
    process.env.MANUS_OAUTH_API_URL ??
    process.env.OAUTH_SERVER_URL ??
    process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ??
    "",
  appId:
    process.env.MANUS_PROJECT_ID ??
    process.env.VITE_APP_ID ??
    process.env.EXPO_PUBLIC_APP_ID ??
    "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  // بيانات Supabase العامة (URL + مفتاح anon). المفتاح anon عام بطبيعته وبيتحمي بـ RLS،
  // وضمّه هنا ضروري لأن .env مستثنى من git فبناء EAS ماكانش هيوصله.
  owner: "abdallahzohair1",
  extra: {
    ...publicRuntime,
    eas: { projectId: "9f0f4719-1795-4014-85bb-96b52a634191" },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://ycqvqcbejzzbxsnkqkxk.supabase.co",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcXZxY2Jlanp6Ynhzbmtxa3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNTAyNDYsImV4cCI6MjEwODYyNjI0Nn0.bUgNd4KHdxxa8kEkJw4hgN_-t9BYUCS21AGpe7EB02M",
    // Giphy public client key for GIF search in messages and comments.
    giphyApiKey: process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? "2FYRGZ6RTUhoQFCT6YSiHcdiuZbU4ZUF",
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  // Keep native launch and system appearance light; dark mode is chosen inside WANAS settings.
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#000000",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "CAMERA", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_MEDIA_AUDIO", "VIBRATE"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    lang: "ar",
    themeColor: "#000000",
    description: "ونس — مساحة الونس: شبكة اجتماعية عربية دافئة",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-asset",
    [
      "expo-font",
      {
        fonts: [
          "./node_modules/@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf",
          "./node_modules/@expo-google-fonts/cairo/500Medium/Cairo_500Medium.ttf",
          "./node_modules/@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf",
          "./node_modules/@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf",
          "./node_modules/@expo-google-fonts/cairo/800ExtraBold/Cairo_800ExtraBold.ttf",
          "./node_modules/@expo-google-fonts/cairo/900Black/Cairo_900Black.ttf"
        ],
        android: { fonts: [] },
        ios: { fonts: [] }
      }
    ],
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        color: "#E8C96A",
        icon: "./assets/images/notification-icon.png",
        defaultChannel: "wanas",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "ونس محتاج مكتبة الصور عشان تشارك صورك في الونسة.",
        cameraPermission: "ونس محتاج الكاميرا عشان تصوّر وتبعت.",
      },
    ],
    "expo-document-picker",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "ونس بيستخدم موقعك عشان تبعت موقعك في الونسة.",
      },
    ],
    [
      "expo-contacts",
      {
        contactsPermission: "ونس محتاج جهات الاتصال عشان تشارك جهة اتصال.",
      },
    ],
    "expo-sharing",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
        dark: {
          backgroundColor: "#FFFFFF",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    // React Compiler اتقفل: تركيبه مع NativeWind في بناء release على أندرويد
    // كان من الأسباب المحتملة للكراش بعد شاشة البداية.
    reactCompiler: false,
  },
};

export default config;
