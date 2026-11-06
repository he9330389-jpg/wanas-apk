import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * بلاغات الأخطاء البسيطة: بنبعت نص الخطأ لجدول client_error_reports في Supabase
 * (INSERT مسموح للـanon، والقراءة للمشرفين فقط) عشان نقدر نشوف سبب أي كراش
 * على جهاز حقيقي من غير ما نحتاج adb أو لوجكات.
 */
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  ((Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl ?? "");
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ((Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined)?.supabaseAnonKey ?? "");

export type CrashReportInput = {
  message: string;
  stack?: string | null;
  phase: "js-error" | "render-error" | "unhandled" | "launch";
  extra?: Record<string, unknown>;
};

const sent = new Set<string>();

export async function reportCrash(input: CrashReportInput): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const fingerprint = `${input.phase}:${input.message}`.slice(0, 300);
  if (sent.has(fingerprint)) return;
  sent.add(fingerprint);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/client_error_reports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        phase: input.phase,
        message: String(input.message).slice(0, 4000),
        stack: input.stack ? String(input.stack).slice(0, 8000) : null,
        platform: Platform.OS,
        os_version: String(Platform.Version),
        app_version: Constants.expoConfig?.version ?? null,
        extra: {
          ...(input.extra ?? {}),
          device: Constants.deviceName ?? null,
        },
      }),
    });
  } catch {
    // لو الشبكة مش متاحة، مفيش حاجة نعملها — الكراش نفسه الأهم.
  }
}

/** بيربط معالج الأخطاء العام في React Native عشان أي خطأ JS يتسجل قبل ما التطبيق يقفل. */
export function installGlobalCrashHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: { setGlobalHandler?: (fn: (e: Error, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (e: Error, isFatal?: boolean) => void } }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void reportCrash({
      message: error?.message ?? "Unknown JS error",
      stack: error?.stack ?? null,
      phase: "js-error",
      extra: { isFatal: !!isFatal },
    });
    if (previous) previous(error, isFatal);
  });
}
