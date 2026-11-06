import { brandPalette, categoryColors, surface2 } from "@/constants/brand";
import { getActiveWanasScheme } from "@/lib/theme-runtime";
import { Platform } from "react-native";

export type VerificationTone = "red" | "orange" | "green" | "blue" | "yellow" | "purple" | "mint" | "sky" | "pink" | "black" | "white" | "rose" | "olive" | "teal" | "tan";
export type ReactionType = "ونسّتني" | "ورود" | "أثر فيّ" | "مبهر" | "أحببته" | "أدعمه" | "أبكاني" | "سخسخني" | "لا أوافقك الرأي";

export const reactions: Array<{ type: ReactionType; emoji: string; color: string }> = [
  { type: "ونسّتني", emoji: "🫶", color: "#F0C95A" },
  { type: "ورود", emoji: "💐", color: "#F07BA8" },
  { type: "أثر فيّ", emoji: "🥹", color: "#4FC3C7" },
  { type: "مبهر", emoji: "🤩", color: "#9B6DE8" },
  { type: "أحببته", emoji: "❤️", color: "#ED5565" },
  { type: "أدعمه", emoji: "🫂", color: "#6FD593" },
  { type: "أبكاني", emoji: "😭", color: "#5B8DEF" },
  { type: "سخسخني", emoji: "🤣", color: "#F0A152" },
  { type: "لا أوافقك الرأي", emoji: "👎", color: "#9A9AA5" },
];

type WanasColors = {
  ink: string; background: string; surface: string; surface2: string; surface3: string; border: string;
  text: string; muted: string; yellow: string; goldText: string; gold: string; goldSoft: string; purple: string;
  green: string; blue: string; red: string; orange: string; pink: string; turquoise: string;
};

const webThemeVariables: Partial<Record<keyof WanasColors, string>> = {
  background: "--color-background",
  surface: "--color-surface",
  surface2: "--wanas-surface-2",
  surface3: "--color-border",
  border: "--color-border",
  text: "--color-foreground",
  muted: "--color-muted",
  yellow: "--wanas-gold-text",
  goldText: "--wanas-gold-text",
  gold: "--wanas-gold",
  goldSoft: "--wanas-gold-soft",
  red: "--wanas-red",
};

/** Values resolve against the active palette at access time. */
export const colors = new Proxy({} as WanasColors, {
  get(_target, property) {
    const scheme = getActiveWanasScheme();
    const palette = brandPalette[scheme];
    const fixed: WanasColors = {
      ink: "#14141A",
      background: palette.background,
      surface: palette.surface,
      surface2: surface2[scheme],
      surface3: palette.border,
      border: palette.border,
      text: palette.text,
      muted: palette.muted,
      yellow: palette.goldText,
      goldText: palette.goldText,
      gold: palette.gold,
      goldSoft: palette.goldSoft,
      purple: categoryColors.purple,
      green: categoryColors.green,
      blue: categoryColors.blue,
      red: palette.red,
      orange: categoryColors.orange,
      pink: categoryColors.pink,
      turquoise: categoryColors.turquoise,
    };
    const key = String(property) as keyof WanasColors;
    const cssVariable = webThemeVariables[key];
    if (Platform.OS === "web" && cssVariable) return `var(${cssVariable})`;
    return fixed[key];
  },
});
