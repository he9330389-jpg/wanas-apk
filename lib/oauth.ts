import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

/** المخطط اللي التطبيق بيرجع بيه من المتصفح بعد تسجيل الدخول بجوجل. */
const RETURN_SCHEME = "space.manus.wanas.t236350328582319";

/**
 * تسجيل الدخول/إنشاء الحساب بجوجل عبر Supabase OAuth.
 * على الهاتف بنفتح صفحة جوجل في متصفح آمن ونرجع للتطبيق بالكود،
 * وعلى الويب بنحوّل لنفس الصفحة (redirect) وSupabase بيتعامل مع الجلسة.
 *
 * لازم في لوحة Supabase: Authentication → Providers → Google مفعّل بمفاتيح Google Cloud،
 * وRedirect URLs فيها <RETURN_SCHEME>://auth-callback.
 */
export async function signInWithGoogle(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const redirectTo =
      Platform.OS === "web"
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/oauth/callback`
        : AuthSession.makeRedirectUri({ scheme: RETURN_SCHEME, path: "auth-callback" });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== "web",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;

    if (Platform.OS === "web") {
      // المتصفح بيتحوّل بنفسه لصفحة جوجل
      return { ok: true };
    }
    if (!data?.url) throw new Error("مقدرناش نفتح صفحة جوجل");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      return { ok: false, cancelled: result.type !== "success" };
    }

    const params = new URL(result.url).searchParams;
    const code = params.get("code");
    const errorDescription = params.get("error_description") ?? params.get("error");
    if (errorDescription) throw new Error(errorDescription);
    if (!code) throw new Error("جوجل مرجّعش كود الدخول");

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تسجيل الدخول بجوجل فشل";
    // رسالة واضحة لو المزوّد لسه متفعّلش في لوحة Supabase
    if (/provider is not enabled|Unsupported provider|validation_failed/i.test(message)) {
      return { ok: false, error: "الدخول بجوجل لسه متفعّلش في إعدادات ونس — استخدم البريد وكلمة المرور دلوقتي." };
    }
    return { ok: false, error: message };
  }
}
