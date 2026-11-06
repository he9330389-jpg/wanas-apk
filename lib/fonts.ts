import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  Cairo_900Black,
} from "@expo-google-fonts/cairo";
import * as Font from "expo-font";
import { useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { cairoFonts, typography } from "@/constants/brand";

export { cairoFonts };

/** أقصى وقت ننتظر فيه تحميل الخط قبل ما نكمّل بالخط الافتراضي (عشان الشاشة ما تفضلش فاضية). */
const FONT_LOAD_TIMEOUT_MS = 4000;

export const cairoFontMap = {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  Cairo_900Black,
};

let loadPromise: Promise<boolean> | null = null;

/**
 * تحميل خط Cairo (خط هوية ونس) — الأوزان: 400 · 500 · 600 · 700 · 800 · 900.
 * التحميل يبدأ مرة واحدة فقط، وأي فشل (أو بطء في التنزيل) بيرجّع false بدل ما يعلّق التطبيق.
 */
export function loadWanasFonts(): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), FONT_LOAD_TIMEOUT_MS);
    Font.loadAsync(cairoFontMap)
      .then(() => {
        clearTimeout(timer);
        finish(true);
      })
      .catch((error) => {
        clearTimeout(timer);
        if (__DEV__) console.warn("[WANAS] فشل تحميل خط Cairo:", error);
        finish(false);
      });
  });
  return loadPromise;
}

/**
 * يحمّل الخطوط ويبلغك بحالة التحميل. `settled` معناها إن التحميل خلص (نجح أو فشل)
 * وإن التطبيق يقدر يعرض واجهته في الحالتين.
 */
export function useWanasFonts() {
  const [state, setState] = useState<{ loaded: boolean; settled: boolean }>({
    loaded: false,
    settled: false,
  });

  useEffect(() => {
    let active = true;
    // أي استثناء أو تأخير غير متوقع لازم يخلّي settled = true، وإلا شاشة البداية بتعلّق التطبيق
    loadWanasFonts()
      .then((ok) => {
        if (active) setState({ loaded: ok, settled: true });
      })
      .catch(() => {
        if (active) setState({ loaded: false, settled: true });
      });
    const failsafe = setTimeout(() => {
      if (active) setState((prev) => (prev.settled ? prev : { loaded: false, settled: true }));
    }, FONT_LOAD_TIMEOUT_MS + 1000);
    return () => {
      active = false;
      clearTimeout(failsafe);
    };
  }, []);

  return state;
}

/**
 * خط Cairo على الويب: نحقن نفس العائلة لكل عناصر النص.
 * (ملاحظة: تعديل Text.defaultProps اتشال لأنه مهجور في React 19 وبيسبب مشاكل على الأجهزة.)
 */
export function applyCairoGlobally() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.querySelector("style[data-wanas-fonts]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-wanas-fonts", "cairo");
  style.textContent = `
    @import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap");
    html, body, input, textarea, button, [dir="rtl"] { font-family: "Cairo", system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; }
  `;
  document.head.appendChild(style);
}

/** نمط جاهز للنصوص اللي محتاجة وزنًا محدد من Cairo. */
export const fontStyles = StyleSheet.create({
  title: typography.screenTitle,
  heading: typography.sectionTitle,
  semibold: { fontFamily: cairoFonts.semibold },
  medium: { fontFamily: cairoFonts.medium },
  body: typography.body,
  small: typography.small,
  comment: typography.comment,
  label: typography.label,
  button: typography.button,
});
