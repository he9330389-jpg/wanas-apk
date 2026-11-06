import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/wanas";

/**
 * اقتراحات المنشن زي إنستجرام/فيسبوك:
 * - أول ما تكتب `@` بيظهرلك حروف (A–Z + أ–ي) تقدر تدوس على أي حرف.
 * - اختيار حرف بيجيب كل الأسماء اللي بتبدأ بالحرف ده (اليوزر نيم أو الاسم الظاهر).
 * - لو كتبت بعد @ كام حرف، النتائج بتتفلتر فورًا.
 * الأسماء الحقيقية بتيجي من `profiles` (اليوزر نيم @ + الاسم الظاهر).
 */
export type MentionUser = { id: string; username: string; display_name: string | null };

const AR_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
const EN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function MentionSuggest({
  query,
  visible,
  onPick,
  limit = 8,
  title = "المنشن",
}: {
  /** النص المكتوب بعد @ (فاضي = بنعرض الحروف) */
  query: string;
  visible: boolean;
  onPick: (u: MentionUser) => void;
  limit?: number;
  title?: string;
}) {
  const [letter, setLetter] = useState<string | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const term = useMemo(() => (query ?? "").trim(), [query]);

  useEffect(() => {
    if (!visible) {
      const clear = setTimeout(() => {
        setUsers([]);
        setLetter(null);
      }, 0);
      return () => clearTimeout(clear);
    }
    const activeLetter = term.length ? null : letter;
    if (!term.length && !activeLetter) {
      const clear = setTimeout(() => setUsers([]), 0);
      return () => clearTimeout(clear);
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const needle = activeLetter ?? term;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .or(`username.ilike.${needle}%,display_name.ilike.${needle}%`)
        .limit(limit);
      setUsers((data ?? []) as MentionUser[]);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [term, letter, visible, limit]);

  if (!visible) return null;

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="at" size={14} color={colors.goldText} />
        <Text style={styles.headText}>{title}</Text>
        {!!letter && (
          <Pressable onPress={() => setLetter(null)} hitSlop={8} style={styles.backChip}>
            <Ionicons name="close" size={12} color={colors.muted} />
            <Text style={styles.backText}>{letter}</Text>
          </Pressable>
        )}
      </View>
      {!term.length && !letter && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lettersRow}>
          {AR_LETTERS.map((l) => (
            <Pressable key={`ar-${l}`} style={styles.letter} onPress={() => setLetter(l)}>
              <Text style={styles.letterText}>{l}</Text>
            </Pressable>
          ))}
          {EN_LETTERS.map((l) => (
            <Pressable key={`en-${l}`} style={styles.letter} onPress={() => setLetter(l)}>
              <Text style={styles.letterText}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {loading && <ActivityIndicator size="small" color={colors.goldText} style={{ marginVertical: 6 }} />}
      {!loading && (term.length > 0 || !!letter) && users.length === 0 && (
        <Text style={styles.empty}>مفيش حد بالاسم ده</Text>
      )}
      {users.map((u) => (
        <Pressable key={u.id} style={styles.row} onPress={() => onPick(u)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(u.display_name ?? u.username).slice(0, 1)}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {u.display_name ?? u.username}
          </Text>
          <Text style={styles.handle}>@{u.username}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** بيرجع نص الـ mention المطلوب إدخاله في مكان المؤشر. */
export function mentionToken(u: MentionUser): string {
  return `@${u.username} `;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    maxHeight: 260,
  },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingTop: 8 },
  headText: { color: colors.muted, fontSize: 11, flex: 1, textAlign: "right" },
  backChip: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  backText: { color: colors.muted, fontSize: 11 },
  lettersRow: { flexDirection: "row-reverse", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  letter: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  letterText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.goldText, fontSize: 12, fontWeight: "800" },
  name: { color: colors.text, fontSize: 12.5, flex: 1, textAlign: "right" },
  handle: { color: colors.muted, fontSize: 11 },
  empty: { color: colors.muted, fontSize: 11.5, textAlign: "center", paddingVertical: 8 },
});
