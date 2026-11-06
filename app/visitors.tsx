import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { myId } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Visit = { id: string; visitor_id: string; visited_at: string; profiles: { username: string | null; display_name: string | null } | null };

/** زوار ركنك — آخر ٧ أيام. صاحب الركن بس هو اللي يشوف القايمة. */
export default function VisitorsScreen() {
  useThemeContext();
  const router = useRouter();
  const [rows, setRows] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = await myId();
    if (!uid) return;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error: e } = await supabase
      .from("profile_visits")
      .select("id, visitor_id, visited_at, profiles!profile_visits_visitor_id_fkey(username, display_name)")
      .eq("profile_id", uid)
      .gte("visited_at", since)
      .order("visited_at", { ascending: false })
      .limit(100);
    if (e) {
      setError("ميزة الزوار محتاجة تشغيل ملف الـ SQL الجديد (profile_visits) في Supabase.");
      setRows([]);
      return;
    }
    setRows((data ?? []) as unknown as Visit[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unique = rows ? new Set(rows.map((r) => r.visitor_id)).size : 0;

  return (
    <ScreenShell>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>زوار ركنك</Text>
      </View>
      {rows === null ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.big}>{unique}</Text>
              <Text style={styles.muted}>زائر مختلف آخر ٧ أيام · {rows.length} زيارة</Text>
              {!!error && <Text style={[styles.muted, { color: colors.red, marginTop: 6 }]}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={!error ? <Text style={[styles.muted, { textAlign: "center", marginTop: 24 }]}>لسه محدش زار ركنك الأسبوع ده.</Text> : null}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/user/${item.visitor_id}`)}>
              <Ionicons name="person-circle-outline" size={30} color={colors.goldText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.profiles?.display_name ?? item.profiles?.username ?? "مستخدم"}</Text>
                <Text style={styles.muted}>{new Date(item.visited_at).toLocaleString("ar-EG-u-nu-latn")}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    top: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    summary: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, alignItems: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
    big: { color: colors.goldText, fontSize: 34, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    muted: { color: colors.muted, fontSize: 12, textAlign: "right" },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 56, backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
    name: { color: colors.text, fontSize: 14, textAlign: "right" },
  }),
);
