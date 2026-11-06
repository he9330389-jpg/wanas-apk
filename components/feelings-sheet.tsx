import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";

type Feeling = { label: string; emoji: string };
type Group = { title: string; items: Feeling[] };

/** قائمة المشاعر الكاملة (Seed Data — دليل التنفيذ v1.1 صفحة ٩): إيجابية · سلبية · حالات. */
export const FEELING_GROUPS: Group[] = [
  {
    title: "إيجابية",
    items: [
      ["سعيد", "😄"], ["مبسوط", "🤩"], ["مرتاح", "😌"], ["متحمس", "🤗"], ["ممتن", "🙏"], ["يشعر بالفرح", "🥳"],
      ["يشعر بالحب", "🥰"], ["متفائل", "🌈"], ["فخور", "😎"], ["مسترخي", "🧘"], ["محظوظ", "🍀"], ["مبسوط جدًا", "😁"],
      ["مليان طاقة", "⚡"], ["يشعر بالأمان", "🛡️"], ["يشعر بالإلهام", "💡"], ["راضي", "😊"], ["يشعر بالبركة", "✨"], ["يشعر بالنشاط", "💪"],
    ].map(([label, emoji]) => ({ label, emoji })),
  },
  {
    title: "سلبية",
    items: [
      ["حزين", "😔"], ["متوتر", "😰"], ["قلقان", "😟"], ["يشعر بالضيق", "😣"], ["غاضب", "😠"], ["محبط", "😞"],
      ["مرهق", "😩"], ["زعلان", "😢"], ["يشعر بالتوتر", "😬"], ["يشعر بالمرض", "🤒"], ["وحيد", "🥺"], ["خايف", "😨"],
      ["مشتاق", "💭"], ["يشعر بالملل", "😑"], ["يشعر بالذنب", "😓"], ["محرج", "😳"], ["مصدوم", "😱"], ["مضغوط", "😤"], ["يشعر بالحنين", "🕰️"],
    ].map(([label, emoji]) => ({ label, emoji })),
  },
  {
    title: "حالات",
    items: [
      ["نعسان", "😴"], ["جعان", "🍽️"], ["مفكر", "🤔"], ["مشوّش", "😵"], ["مستغرب", "🤨"], ["مستعد", "🚀"],
      ["يشعر بالحيرة", "😕"], ["يشعر بالتعب", "🥱"], ["في مزاج رايق", "☕"], ["يشعر بالدهشة", "😲"],
    ].map(([label, emoji]) => ({ label, emoji })),
  },
];

const USAGE_KEY = "wanas.feelings.usage";

function norm(s: string): string {
  return s.replace(/[ً-ٰٟ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
}

/**
 * ورقة سفلية بارتفاع ٨٥٪ من الشاشة: حقل بحث «إيه شعورك؟» + «الأكثر استخدامًا» + الأقسام.
 * الاختيار بيرجع نص زي «سعيد 😄» وبيتسجل في عدّاد الاستخدام.
 */
export function FeelingsSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (value: string) => void }) {
  const [q, setQ] = useState("");
  const [usage, setUsage] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!visible) return;
    setQ("");
    AsyncStorage.getItem(USAGE_KEY)
      .then((raw) => setUsage(raw ? (JSON.parse(raw) as Record<string, number>) : {}))
      .catch(() => undefined);
  }, [visible]);

  const all = useMemo(() => FEELING_GROUPS.flatMap((g) => g.items), []);
  const top = useMemo(
    () => all.filter((f) => (usage[f.label] ?? 0) > 0).sort((a, b) => (usage[b.label] ?? 0) - (usage[a.label] ?? 0)).slice(0, 6),
    [all, usage],
  );
  const needle = norm(q.trim());
  const groups = FEELING_GROUPS.map((g) => ({ ...g, items: g.items.filter((f) => !needle || norm(f.label).includes(needle)) })).filter((g) => g.items.length);

  function pick(f: Feeling) {
    const next = { ...usage, [f.label]: (usage[f.label] ?? 0) + 1 };
    setUsage(next);
    AsyncStorage.setItem(USAGE_KEY, JSON.stringify(next)).catch(() => undefined);
    onSelect(`${f.label} ${f.emoji}`);
    onClose();
  }

  const row = (f: Feeling) => (
    <Pressable key={f.label} style={styles.row} onPress={() => pick(f)} accessibilityRole="button" accessibilityLabel={f.label}>
      <Text style={styles.emoji}>{f.emoji}</Text>
      <Text style={styles.label}>{f.label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>إيه شعورك؟</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.goldText} />
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن شعور" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            {!needle && top.length > 0 && (
              <>
                <Text style={styles.section}>الأكثر استخدامًا</Text>
                <View style={styles.grid}>{top.map(row)}</View>
              </>
            )}
            {groups.map((g) => (
              <View key={g.title}>
                <Text style={styles.section}>{g.title}</Text>
                <View style={styles.grid}>{g.items.map(row)}</View>
              </View>
            ))}
            {!groups.length && <Text style={styles.empty}>مفيش شعور بالاسم ده</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet: { height: "85%", backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8 },
    handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 10 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginBottom: 10 },
    search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, backgroundColor: colors.background },
    input: { flex: 1, color: colors.text, fontSize: 15, fontFamily: "Cairo_400Regular" },
    section: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 16, marginBottom: 8 },
    grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    emoji: { fontSize: 18 },
    label: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_600SemiBold" },
    empty: { color: colors.muted, textAlign: "center", marginTop: 30 },
  }),
);
