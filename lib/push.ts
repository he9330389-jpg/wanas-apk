import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { loadMessageState } from "@/lib/chat-preferences";

let handlerInstalled = false;

/**
 * تثبيت معالج عرض الإشعارات. بيتنادى من داخل دالة (مش على مستوى الموديول)
 * عشان أي مشكلة في expo-notifications ما توقعش التطبيق وقت الإقلاع.
 */
export function installNotificationHandler() {
  if (handlerInstalled || Platform.OS === "web") return;
  handlerInstalled = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const preferences = user ? await loadMessageState(user.id) : null;
          const notifications = preferences?.global.notifications ?? true;
          return {
            shouldShowBanner: notifications,
            shouldShowList: notifications,
            shouldPlaySound: notifications && (preferences?.global.sounds ?? true),
            shouldSetBadge: false,
          };
        } catch {
          return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
        }
      },
    });
  } catch (error) {
    if (__DEV__) console.warn("[WANAS] تعذّر تثبيت معالج الإشعارات:", error);
  }
}

/**
 * Registers the current device for push notifications and stores the token
 * in the user's own row in public.push_tokens (RLS protected).
 * Returns the token, or null when permission is denied / running on web /
 * push isn't configured for this build.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    installNotificationHandler();
    if (!Device.isDevice) {
      if (__DEV__) console.warn("Push notifications require a physical device.");
      return null;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("wanas", {
        name: "ونس",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        lightColor: "#E8C96A",
        vibrationPattern: [0, 200, 120, 200],
        enableLights: true,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResponse.data;

    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        device_id: Device.modelName ?? null,
        app_version: Constants.expoConfig?.version ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) {
      if (__DEV__) console.warn("Could not save push token:", error.message);
      return null;
    }
    return token;
  } catch (error) {
    // بناء من غير Firebase (google-services.json) بيرمي ERR_NOTIFICATIONS_* — التطبيق يكمل عادي.
    if (__DEV__) console.warn("[WANAS] تسجيل الإشعارات اتخطى:", error);
    return null;
  }
}

/** Removes this device token, e.g. on sign-out. */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // best effort
  }
}

/** Quiet mode: suppresses alerts while the user browses undisturbed. */
export async function setQuietMode(userId: string, enabled: boolean): Promise<void> {
  try {
    await supabase.from("push_tokens").update({ quiet_mode: enabled }).eq("user_id", userId);
  } catch {
    // best effort
  }
}
