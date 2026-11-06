import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { PostCard, type FeedPost } from "@/components/post-card";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** المحفوظات — منشورات حقيقية اتخزنت في `saves` وبتُعرض بنفس كارت المنشور. */
export default function SavedScreen() {
  useThemeContext();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const uid = await myId();
      if (!uid) return;
      const { data: saves } = await supabase
        .from("saves")
        .select("post_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(100);
      const ids = (saves ?? []).map((s: { post_id: string }) => s.post_id);
      if (ids.length === 0) {
        setPosts([]);
        return;
      }
      const { data } = await supabase
        .from("posts")
        .select("id, author_id, body, media_type, media_url, created_at, likes_count, comments_count, allow_comments, profiles!posts_author_id_fkey(username, display_name, is_verified, verification_tone)")
        .in("id", ids)
        .is("deleted_at", null);
      const order = new Map(ids.map((id: string, i: number) => [id, i]));
      setPosts(((data ?? []) as unknown as FeedPost[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        <Text style={styles.title}>المحفوظات</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.goldText} />}
          ListEmptyComponent={<Text style={styles.empty}>مفيش محفوظات — احفظ أي منشور من قائمة ⋯ هيظهر هنا.</Text>}
          renderItem={({ item }) => <PostCard post={item} />}
        />
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 40 },
  }),
);
