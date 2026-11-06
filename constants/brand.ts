/**
 * هوية WANAS — مأخوذة حرفيًا من دليل الهوية (صفحات ٣٥ و٣٨ من ملف المواصفات النهائي).
 *
 * جدول ألوان الوضعين (فاتح / داكن):
 *  العنصر                    فاتح        داكن
 *  (محدّث حسب دليل الهوية v1.0 نوفمبر 2026 — القيم الفعلية في brandPalette تحت)
 *  الخلفية                   #FAF8F3     #000000
 *  الكارت والقوائم            #FFFFFF     #121216
 *  الحدود والفواصل            #E4E4EB     #26262E
 *  النص الأساسي               #0A0A0F     #FFFFFF
 *  النص الثانوي               #6B6B77     #9A9AA5
 *  الذهبي (أزرار وتمييز)       #F0C95A     #F0C95A   (نفسه)
 *  الذهبي للنص والأيقونة       #8A6500     #F0C95A
 *  الذهبي الناعم (تبويب نشط)   #FFF2C9     #2B2616
 *  الأحمر (حظر وخطر)          #E04555     #ED5565
 *
 * الخط: Cairo — عنوان شاشة 900 · عنوان قسم 700 / 22 · نص أساسي 400 / 16 · نص صغير 12 · تعليق 10
 * ألوان التصنيف (الأفاتار والأختام والفئات): تركواز #4FC3C7 · وردي #F07BA8 · أزرق #5B8DEF
 *                                            أخضر #6FD593 · برتقالي #F0A152 · بنفسجي #9B6DE8
 */

export type Scheme = "dark" | "light";

export type BrandPalette = {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  gold: string;
  goldText: string;
  goldSoft: string;
  red: string;
};

export const brandPalette: Record<Scheme, BrandPalette> = {
  dark: {
    background: "#000000",
    surface: "#111116",
    border: "#2A2A33",
    text: "#FFFFFF",
    muted: "#9A9AA6",
    gold: "#E8C96A",
    goldText: "#E8C96A",
    goldSoft: "#2B2616",
    red: "#E5484D",
  },
  light: {
    background: "#FAF8F3",
    surface: "#FFFFFF",
    border: "#E2DCCB",
    text: "#14141A",
    muted: "#6B6B76",
    gold: "#E8C96A",
    goldText: "#8A6A12",
    goldSoft: "#F1EDE2",
    red: "#D93B3B",
  },
};

/** سطح ثانٍ (شرائح/حقول) وألوان الشارات — من دليل الهوية v1.0 نوفمبر 2026. */
export const surface2 = { dark: "#1B1B22", light: "#F1EDE2" } as const;
export const onPrimary = "#14141A";
export const badgeColors = {
  official: "#E5484D",
  creator: "#E8A25A",
  public: "#5BC98A",
  org: "#4F7DF0",
  premium: "#E8C96A",
  partner: "#8B5CF6",
} as const;

/** ألوان التصنيف — نفسها في الوضعين (أفاتار · أختام · فئات). */
export const categoryColors = {
  turquoise: "#4FC3C7",
  pink: "#F07BA8",
  blue: "#5B8DEF",
  green: "#6FD593",
  orange: "#F0A152",
  purple: "#9B6DE8",
} as const;

export const categoryOrder = ["turquoise", "pink", "blue", "green", "orange", "purple"] as const;

/** مقاسات الخط من الدليل — Cairo. */
export const typography = {
  screenTitle: { fontFamily: "Cairo_900Black", fontSize: 26 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  body: { fontFamily: "Cairo_400Regular", fontSize: 16 },
  small: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  comment: { fontFamily: "Cairo_400Regular", fontSize: 10 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  button: { fontFamily: "Cairo_700Bold", fontSize: 15 },
} as const;

/** أسماء عائلات Cairo المحمّلة عبر @expo-google-fonts/cairo. */
export const cairoFonts = {
  regular: "Cairo_400Regular",
  medium: "Cairo_500Medium",
  semibold: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extraBold: "Cairo_800ExtraBold",
  black: "Cairo_900Black",
} as const;
