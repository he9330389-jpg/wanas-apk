import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId, myEarnings } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * لوحة معلومات المنشئ — أرقام حقيقية من قاعدة البيانات:
 * المنشورات · التفاعلات · التعليقات · المشاهدات · المتابعين · أرباح الهدايا.
 */
type Row = { id: string; body: string; likes_count: number | null; comments_count: number | null; created_at: string };

export default function CreatorScreen() {
  useThemeContext();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState({ posts: 0, reactions: 0, comments: 0, views: 0, followers: 0, earnings: 0 });
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    try {
      const uid = await myId();
      if (!uid) return;
      const [posts, stories, views, followers, money] = await Promise.all([
        supabase
          .from("posts")
          .select("id, body, likes_count, comments_count, created_at")
          .eq("author_id", uid)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("stories").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("story_views").select("story_id", { count: "exact", head: true }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", uid),
        myEarnings(uid),
      ]);
      const list = (posts.data ?? []) as Row[];
      setRows(list);
      setCards({
        posts: list.length,
        reactions: list.reduce((s, p) => s + (p.likes_count ?? 0), 0),
        comments: list.reduce((s, p) => s + (p.comments_count ?? 0), 0),
        views: views.count ?? 0,
        followers: followers.count ?? 0,
        earnings: money.total,
      });
      void stories;
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
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)/profile"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>لوحة معلومات المنشئ</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <View style={styles.grid}>
            <Card icon="document-text-outline" label="منشورات" value={cards.posts} />
            <Card icon="heart-outline" label="تفاعلات" value={cards.reactions} />
            <Card icon="chatbubble-outline" label="تعليقات" value={cards.comments} />
            <Card icon="eye-outline" label="مشاهدات القصص" value={cards.views} />
            <Card icon="people-outline" label="متابعين" value={cards.followers} />
            <Card icon="cash-outline" label="أرباح (جنيه)" value={Number(cards.earnings.toFixed(2))} />
          </View>
          <Text style={styles.section}>أحدث منشوراتك</Text>
          {rows.length === 0 && <Text style={styles.empty}>لسه مفيش منشورات — انشر أول حاجة وارجع هنا تشوف الأرقام.</Text>}
          {rows.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => router.push(`/post/${r.id}`)}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={styles.rowBody}>{r.body || "منشور وسائط"}</Text>
                <Text style={styles.rowMeta}>
                  {r.likes_count ?? 0} تفاعل · {r.comments_count ?? 0} تعليق · {new Date(r.created_at).toLocaleDateString("ar-EG-u-nu-latn")}
                </Text>
              </View>
              <Ionicons name="chevron-back" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

function Card({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: number }) {
  return (
    <View style={styles.card}>
      <Ionicons name={icon} size={20} color={colors.goldText} />
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_900Black", fontWeight: "900" },
    grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
    card: { width: "31%", minWidth: 100, flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 4, alignItems: "flex-end", borderWidth: 1, borderColor: colors.border },
    cardValue: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    cardLabel: { color: colors.muted, fontSize: 11 },
    section: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 8 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    rowBody: { color: colors.text, fontSize: 13, textAlign: "right" },
    rowMeta: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 3 },
    empty: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 20 },
  }),
);
