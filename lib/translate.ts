import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * الترجمة الحقيقية داخل ونس.
 * تستخدم نقطة ترجمة عامة مجانية (MyMemory) عبر fetch، بدون مفاتيح في التطبيق.
 * لو الشبكة وقعت أو الخدمة رجّعت خطأ، ترجع null والتطبيق يقول للمستخدم إن الترجمة مش متاحة.
 */

const LANG_KEY = "wanas.translate.lang";
export const LANG_OPTIONS: { code: string; label: string }[] = [
  { code: "en", label: "الإنجليزي" },
  { code: "ar", label: "العربي" },
  { code: "fr", label: "الفرنسي" },
  { code: "es", label: "الإسباني" },
  { code: "de", label: "الألماني" },
  { code: "tr", label: "التركي" },
  { code: "ur", label: "الأوردو" },
  { code: "hi", label: "الهندي" },
  { code: "ru", label: "الروسي" },
  { code: "id", label: "الإندونيسي" },
];

let cachedLang: string | null = null;
export function setTargetLang(code: string) {
  cachedLang = code;
  AsyncStorage.setItem(LANG_KEY, code).catch(() => {});
}
export async function getTargetLang(): Promise<string> {
  if (cachedLang) return cachedLang;
  const stored = await AsyncStorage.getItem(LANG_KEY).catch(() => null);
  cachedLang = stored || "en";
  return cachedLang;
}
export function targetLangLabel(): string {
  const code = cachedLang || "en";
  return LANG_OPTIONS.find((l) => l.code === code)?.label ?? "الإنجليزي";
}

function detectLang(text: string): string {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return arabic > text.replace(/\s/g, "").length * 0.3 ? "ar" : "en";
}

const cache = new Map<string, string>();

/** المسار الأول: خدمة الترجمة الآمنة على الخادم (جودة أعلى وتفهم العامية). */
async function viaServer(text: string, to: string): Promise<string | null> {
  try {
    const res = await fetch("/api/dialect/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: to, source: "auto" }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; text?: string };
    const out = json.text?.trim();
    return json.ok && out ? out : null;
  } catch {
    return null;
  }
}

/** المسار الثاني: ترجمة مجانية مباشرة (تحتاج إنترنت) لو الخادم مش متاح. */
async function viaFreeApi(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${from}|${to}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: { responseData?: { translatedText?: string } } = await res.json();
    const out = json.responseData?.translatedText;
    if (!out || /MYMEMORY WARNING|INVALID/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

export async function translateText(text: string, to?: string): Promise<string | null> {
  const clean = text.trim();
  if (!clean) return null;
  const target = to || (await getTargetLang());
  const source = detectLang(clean);
  if (source === target) return clean;
  const key = `${source}|${target}|${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = (await viaServer(clean, target)) ?? (await viaFreeApi(clean, source, target));
  if (out) cache.set(key, out);
  return out;
}
