import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || "";

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const noopStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};

const ExpoSecureStoreAdapter =
  !isBrowser && Platform.OS !== "web"
    ? {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      }
    : isBrowser
      ? {
          getItem: async (key: string) => window.localStorage.getItem(key),
          setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
          removeItem: async (key: string) => window.localStorage.removeItem(key),
        }
      : noopStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    // لازم autoRefreshToken شغال على الموبايل كمان، وإلا الجلسة بتنتهي بصمت بعد ساعة
    // والمستخدم بيتهيّأله إن التطبيق قفل/اتصرف غلط.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase بيوصي بتشغيل/إيقاف تجديد التوكن مع حالة التطبيق على React Native.
if (Platform.OS !== "web" && typeof AppState !== "undefined") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh().catch(() => {});
    } else {
      void supabase.auth.stopAutoRefresh().catch(() => {});
    }
  });
}

/** رابط المشروع (من .env أو من app.config.ts) — استخدمه بدل process.env مباشرة عشان يشتغل في نسخة الـ APK. */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const supabaseConfigStatus = {
  hasUrl: !!supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
};
