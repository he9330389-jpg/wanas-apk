import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** ذكريات ونس — منشوراتك من نفس اليوم في سنين فاتت (دالة `wanas_memories`). */
type Memory = { id: string; body: string | null; media_type: string | null; created_at: string; years_ago: number };

export default function MemoriesScreen() {
  useThemeContext();
  const router = useRouter();
  const [rows, setRows] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("wanas_memories", { p_limit: 50 });
    if (err) setError(err.message);
    else setRows((data ?? []) as Memory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // تأجيل التحميل لما بعد أول رسم (بدون setState متزامن داخل الـeffect)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>ذكريات ونس</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ? `تعذّر تحميل الذكريات: ${error}` : "لسه مفيش ذكريات النهارده — أول ما تنشر في نفس اليوم من سنة، هتظهر هنا."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/post/${item.id}`)}>
              <Text style={styles.years}>من {item.years_ago} {item.years_ago === 1 ? "سنة" : "سنين"}</Text>
              <Text style={styles.body}>{item.body || "منشور وسائط"}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</Text>
            </Pressable>
          )}
        />
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 5, borderWidth: 1, borderColor: colors.border },
    years: { color: colors.goldText, fontSize: 11.5, textAlign: "right" },
    body: { color: colors.text, fontSize: 14, textAlign: "right", lineHeight: 21 },
    date: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
    empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 40, lineHeight: 20 },
  }),
);
