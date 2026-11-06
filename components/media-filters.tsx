import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";

/** فلتر = طبقتين لون (أعلى/أسفل) بتترسم فوق الصورة أو الفيديو مباشرة — معاينة حية وبتتشاف عند كل المشاهدين. */
export type MediaFilter = { key: string; label: string; swatch: string; top: string; bottom: string };

// الألوان بدون alpha ( #RRGGBB ) — الشدة بتتحسب وقت الرسم
export const MEDIA_FILTERS: MediaFilter[] = [
  { key: "none", label: "أصلي", swatch: "transparent", top: "", bottom: "" },
  { key: "warm", label: "دافي", swatch: "#FF9F43", top: "#FF9F43", bottom: "#FF9F43" },
  { key: "cool", label: "بارد", swatch: "#5AA9FF", top: "#5AA9FF", bottom: "#5AA9FF" },
  { key: "mono", label: "أبيض وأسود", swatch: "#9E9E9E", top: "#000000", bottom: "#000000" },
  { key: "gold", label: "ذهبي", swatch: "#E8C96A", top: "#E8C96A", bottom: "#E8C96A" },
  { key: "rose", label: "وردي", swatch: "#ED5565", top: "#ED5565", bottom: "#ED5565" },
  { key: "night", label: "ليلي", swatch: "#1A1A2E", top: "#0B0B1A", bottom: "#0B0B1A" },
  { key: "sunset", label: "غروب", swatch: "#FF6B35", top: "#7B2FF7", bottom: "#FF6B35" },
  { key: "ocean", label: "محيط", swatch: "#0093E9", top: "#0093E9", bottom: "#00D4AA" },
  { key: "forest", label: "غابة", swatch: "#2E8B57", top: "#2E8B57", bottom: "#C9B458" },
  { key: "dream", label: "حلم", swatch: "#B388FF", top: "#B388FF", bottom: "#FF8FB1" },
  { key: "neon", label: "نيون", swatch: "#00F5D4", top: "#F72585", bottom: "#00F5D4" },
  { key: "vintage", label: "قديم", swatch: "#B08D57", top: "#8B6B3E", bottom: "#D9B77E" },
  { key: "cinema", label: "سينما", swatch: "#1F6F8B", top: "#1F6F8B", bottom: "#E8A33D" },
  { key: "fade", label: "باهت", swatch: "#CFCFCF", top: "#FFFFFF", bottom: "#DADADA" },
  { key: "noir", label: "نوار", swatch: "#111111", top: "#000000", bottom: "#222222" },
  { key: "vivid", label: "حيوي", swatch: "#FF2E63", top: "#FF2E63", bottom: "#08D9D6" },
  { key: "mint", label: "نعناع", swatch: "#7FFFD4", top: "#7FFFD4", bottom: "#A8E6CF" },
];

export type FilterStrength = 1 | 2 | 3;
export const STRENGTHS: { key: FilterStrength; label: string; alpha: number }[] = [
  { key: 1, label: "خفيف", alpha: 0.16 },
  { key: 2, label: "متوسط", alpha: 0.3 },
  { key: 3, label: "قوي", alpha: 0.46 },
];

function withAlpha(hex: string, a: number): string {
  if (!hex) return "transparent";
  return `${hex}${Math.round(Math.min(1, a) * 255).toString(16).padStart(2, "0")}`;
}

export function filterByKey(key?: string | null): MediaFilter | undefined {
  return MEDIA_FILTERS.find((f) => f.key === key);
}

/** طبقة الفلتر — حطها جوه View ليه position relative وحجم الميديا. */
export function FilterLayers({ filter, strength = 2 }: { filter?: string | null; strength?: number | null }) {
  const f = filterByKey(filter);
  if (!f || f.key === "none") return null;
  const alpha = (STRENGTHS.find((s) => s.key === strength) ?? STRENGTHS[1]).alpha;
  const dark = f.key === "mono" || f.key === "noir" || f.key === "night";
  const a = dark ? alpha * 1.1 : alpha;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, backgroundColor: withAlpha(f.top, a) }} />
      <View style={{ flex: 1, backgroundColor: withAlpha(f.bottom, a) }} />
    </View>
  );
}

/** شريط اختيار الفلتر + الشدة. */
export function FilterPicker({
  value,
  strength,
  onChange,
  onStrength,
}: {
  value: string | null;
  strength: FilterStrength;
  onChange: (key: string | null) => void;
  onStrength: (s: FilterStrength) => void;
}) {
  const current = value ?? "none";
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>فلاتر حية</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {MEDIA_FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => onChange(f.key === "none" ? null : f.key)} style={styles.item} accessibilityRole="button" accessibilityLabel={`فلتر ${f.label}`}>
            <View style={[styles.swatch, current === f.key && styles.swatchOn]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: f.swatch === "transparent" ? colors.surface3 : f.swatch, opacity: 0.85 }]} />
            </View>
            <Text style={[styles.label, current === f.key && { color: colors.goldText }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {current !== "none" && (
        <View style={styles.strengths}>
          {STRENGTHS.map((s) => (
            <Pressable key={s.key} onPress={() => onStrength(s.key)} style={[styles.sChip, strength === s.key && styles.sChipOn]}>
              <Text style={[styles.sText, strength === s.key && { color: colors.ink, fontWeight: "bold" }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: 8 },
    title: { color: colors.muted, fontSize: 12, textAlign: "right" },
    row: { flexDirection: "row-reverse", gap: 10, paddingVertical: 2 },
    item: { alignItems: "center", gap: 4, minWidth: 56 },
    swatch: { width: 56, height: 56, borderRadius: 14, overflow: "hidden", borderWidth: 2, borderColor: colors.border },
    swatchOn: { borderColor: colors.goldText },
    label: { color: colors.text, fontSize: 11 },
    strengths: { flexDirection: "row-reverse", gap: 8 },
    sChip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
    sChipOn: { backgroundColor: colors.gold, borderColor: colors.goldText },
    sText: { color: colors.text, fontSize: 12 },
  }),
);
