import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";

/** قوالب الكتابة كبطاقات ملونة — الخط بيصغر/يكبر تلقائيًا (١٤–٣٤) حسب طول النص. */
export type CardStyle = { key: string; label: string; bg: string; top: string; fg: string };
export const CARD_STYLES: CardStyle[] = [
  { key: "gold", label: "ذهبي", bg: "#1A1405", top: "#3A2C07", fg: "#E8C96A" },
  { key: "night", label: "ليلي", bg: "#0B0B1A", top: "#1F1B4D", fg: "#FFFFFF" },
  { key: "sunset", label: "غروب", bg: "#FF6B35", top: "#7B2FF7", fg: "#FFFFFF" },
  { key: "ocean", label: "محيط", bg: "#00D4AA", top: "#0093E9", fg: "#FFFFFF" },
  { key: "rose", label: "وردي", bg: "#FF8FB1", top: "#ED5565", fg: "#FFFFFF" },
  { key: "paper", label: "ورقي", bg: "#F5EEDC", top: "#FFF9EC", fg: "#3A2C07" },
];

export function cardStyleByKey(key?: string | null): CardStyle | undefined {
  return CARD_STYLES.find((c) => c.key === key);
}

/** حجم الخط التلقائي: نص قصير = كبير، نص طويل = أصغر (حد أدنى ١٤ وأقصى ٣٤). */
export function autoFontSize(text: string): number {
  const len = text.trim().length;
  if (len <= 20) return 34;
  if (len >= 400) return 14;
  return Math.max(14, Math.round(34 - ((len - 20) / 380) * 20));
}

export function TextCard({ text, styleKey, compact }: { text: string; styleKey: string; compact?: boolean }) {
  const st = cardStyleByKey(styleKey) ?? CARD_STYLES[0];
  const size = autoFontSize(text || "اكتب هنا…");
  return (
    <View style={[styles.card, { backgroundColor: st.bg, minHeight: compact ? 160 : 240 }]}>
      <View style={[styles.topHalf, { backgroundColor: st.top }]} />
      <Text style={[styles.text, { color: st.fg, fontSize: size, lineHeight: size * 1.5 }]}>{text.trim() || "اكتب هنا…"}</Text>
    </View>
  );
}

export function CardStylePicker({ value, onChange }: { value: string | null; onChange: (k: string | null) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.title}>بطاقة ملونة للنص</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 10 }}>
        <Pressable onPress={() => onChange(null)} style={[styles.sw, !value && styles.swOn, { backgroundColor: colors.surface3 }]}>
          <Text style={styles.swText}>بدون</Text>
        </Pressable>
        {CARD_STYLES.map((c) => (
          <Pressable key={c.key} onPress={() => onChange(c.key)} style={[styles.sw, value === c.key && styles.swOn, { backgroundColor: c.bg }]}>
            <Text style={[styles.swText, { color: c.fg }]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { borderRadius: 20, overflow: "hidden", justifyContent: "center", padding: 22 },
    topHalf: { position: "absolute", top: 0, left: 0, right: 0, height: "50%", opacity: 0.85 },
    text: { textAlign: "center", fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    title: { color: colors.muted, fontSize: 12, textAlign: "right" },
    sw: { width: 64, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.border },
    swOn: { borderColor: colors.goldText },
    swText: { color: colors.text, fontSize: 12, fontWeight: "bold" },
  }),
);
