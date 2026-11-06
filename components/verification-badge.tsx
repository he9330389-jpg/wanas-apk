import React from "react";
import { Image } from "react-native";

/**
 * شارة التوثيق — الدليل: «نجمة مضلّعة بحدّ أسود وعلامة صح بيضاء» وشكلها ثابت في الوضعين.
 * الألوان الستة: أحمر #E5484D · برتقالي #E8A25A · أخضر #5BC98A · أزرق #4F7DF0 · أصفر #E8C96A · بنفسجي #8B5CF6
 */
export type VerificationTone =
  | "red" | "orange" | "green" | "blue" | "yellow" | "purple"
  | "mint" | "sky" | "pink" | "black" | "white" | "rose"
  | "olive" | "teal" | "tan";

/** الشارات المعتمدة (١٥ لون) — صور بارزة ثلاثية الأبعاد بخلفية شفافة من assets/badges. */
export const BADGE_IMAGES: Record<VerificationTone, number> = {
  red: require("../assets/badges/red.png"),
  orange: require("../assets/badges/orange.png"),
  green: require("../assets/badges/green.png"),
  blue: require("../assets/badges/blue.png"),
  yellow: require("../assets/badges/yellow.png"),
  purple: require("../assets/badges/purple.png"),
  mint: require("../assets/badges/mint.png"),
  sky: require("../assets/badges/sky.png"),
  pink: require("../assets/badges/pink.png"),
  black: require("../assets/badges/black.png"),
  white: require("../assets/badges/white.png"),
  rose: require("../assets/badges/rose.png"),
  olive: require("../assets/badges/olive.png"),
  teal: require("../assets/badges/teal.png"),
  tan: require("../assets/badges/tan.png"),
};

/** أسماء عربية للألوان (للأدمن وللوصف الصوتي). */
export const BADGE_LABELS: Record<VerificationTone, string> = {
  red: "الأحمر", orange: "البرتقالي", green: "الأخضر", blue: "الأزرق الداكن", yellow: "الأصفر", purple: "البنفسجي",
  mint: "السكروز", sky: "اللبني", pink: "البينك", black: "الأسود", white: "الأبيض", rose: "الوردي",
  olive: "الزيتوني", teal: "البترولي", tan: "الجملي",
};
export const BADGE_TONES = Object.keys(BADGE_IMAGES) as VerificationTone[];

const ALIASES: Record<string, VerificationTone> = { lightblue: "sky", darkblue: "blue", gold: "yellow", brown: "tan", gray: "black", grey: "black" };

export const verificationColors: Record<VerificationTone, string> = {
  red: "#E5484D", orange: "#E8A25A", green: "#5BC98A", blue: "#4F7DF0", yellow: "#E8C96A", purple: "#8B5CF6",
  mint: "#7FBFA5", sky: "#7CC4EC", pink: "#E85C9D", black: "#2B2B31", white: "#F4F4F4", rose: "#E88FB4",
  olive: "#9AA02E", teal: "#13A59A", tan: "#D49A62",
};

export function resolveTone(tone?: string | null): VerificationTone {
  const t = (tone ?? "yellow").toLowerCase();
  return (BADGE_IMAGES as Record<string, number>)[t] !== undefined ? (t as VerificationTone) : ALIASES[t] ?? "yellow";
}


export function VerificationBadge({
  tone = "yellow",
  size = 16,
  small,
}: {
  tone?: VerificationTone | string | null;
  size?: number;
  small?: boolean;
  color?: string;
}) {
  const t = resolveTone(tone);
  const px = small ? Math.max(size, 16) : size;
  return (
    <Image
      source={BADGE_IMAGES[t]}
      style={{ width: px, height: px }}
      resizeMode="contain"
      accessibilityLabel={`حساب موثّق — ${BADGE_LABELS[t]}`}
    />
  );
}

