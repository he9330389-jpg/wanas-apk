import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { myId, myMedals, MEDAL_LABELS, type Medal } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * أوسمة ونس الأسبوعية — من جدول `medals` اللي بيتحدّث كل جمعة:
 * نجم الأسبوع · المجلس الذهبي · الونيس. بتعرض أوسمتك وتوب الأسبوع الحالي.
 */
const KINDS = [
  { key: "star_of_week", emoji: "⭐", desc: "أكتر واحد بوستات وتفاعلات" },
  { key: "golden_council", emoji: "🏛", desc: "صاحب أكتر مجلس فيه حضور" },
  { key: "friendly", emoji: "🫂", desc: "أكتر واحد بيتكلم مع ناس جديدة" },
];

export default function MedalsScreen() {
  useThemeContext();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Medal[]>([]);
  const [top, setTop] = useState<{ kind: string; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const uid = await myId();
      if (uid) setMine(await myMedals(uid));
      const { data } = await supabase
        .from("medals")
        .select("medal, week_start, user_id, profiles!medals_user_id_fkey(display_name, username)")
        .order("week_start", { ascending: false })
        .limit(30);
      setTop(
        ((data ?? []) as unknown as { medal: string; profiles: { display_name: string | null; username: string | null } | null }[]).map((m) => ({
          kind: m.medal,
          name: m.profiles?.display_name ?? m.profiles?.username ?? "ونس",
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>أوسمة ونس</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          {KINDS.map((k) => {
            const winners = top.filter((t) => t.kind === k.key);
            const mineCount = mine.filter((m) => m.medal === k.key).length;
            return (
              <View key={k.key} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.emoji}>{k.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{MEDAL_LABELS[k.key]}</Text>
                    <Text style={styles.cardDesc}>{k.desc}</Text>
                  </View>
                  {mineCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>كسبته {mineCount}×</Text>
                    </View>
                  )}
                </View>
                {winners.length > 0 ? (
                  winners.slice(0, 3).map((w, i) => (
                    <Text key={`${w.name}-${i}`} style={styles.winner}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {w.name}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.noWinner}>الوسام ده لسه ما اتحددش الأسبوع ده — التحديث كل جمعة.</Text>
                )}
              </View>
            );
          })}
          <Text style={styles.note}>الأوسمة بتتحدد تلقائيًا كل جمعة 12 بالليل من النشاط الحقيقي.</Text>
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
    cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    emoji: { fontSize: 26 },
    cardTitle: { color: colors.text, fontSize: 14.5, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    cardDesc: { color: colors.muted, fontSize: 11, textAlign: "right" },
    badge: { backgroundColor: colors.goldSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { color: colors.goldText, fontSize: 10.5 },
    winner: { color: colors.text, fontSize: 12.5, textAlign: "right" },
    noWinner: { color: colors.muted, fontSize: 11.5, textAlign: "right" },
    note: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 8 },
  }),
);
