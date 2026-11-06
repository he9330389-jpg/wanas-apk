import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { publicMediaUrl } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { useLang } from "@/lib/i18n";
import { MusicChip } from "@/components/music-chip";
import { ClipPlayer } from "@/components/clip-player";

/**
 * تبويب الفيديو — بيجيب منشورات الفيديو الحقيقية من `posts` (media_type = video)
 * وبيعرضها في عمود رأسي بمشغّل حقيقي. القصص مكانها في الرئيسية تحت الأزرار.
 */
type PublicStory = {
  id: string;
  media_url: string;
  media_type: string | null;
  user_id: string;
  profiles?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};
type VideoPost = {
  id: string;
  body: string;
  media_url: string | null;
  music?: { title: string; artist?: string; preview: string } | null;
  created_at: string;
  likes_count: number | null;
  profiles?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

function VideoCard({ post, onOpen }: { post: VideoPost; onOpen?: (url: string) => void }) {
  useThemeContext();
  const [url, setUrl] = useState<string | null>(post.media_url?.startsWith("http") ? post.media_url : null);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    // الرابط العام بيتحسب مرة واحدة بعد التركيب (بدون setState متزامن جوه الـ effect)
    const t = setTimeout(() => {
      const resolved = publicMediaUrl(post.media_url);
      if (resolved) setUrl(resolved);
      else setFailed(true);
    }, 0);
    return () => clearTimeout(t);
  }, [post.media_url]);

  return (
    <View style={styles.card}>
      <View style={styles.playerBox}>
        {url && !failed ? (
          <>
            <VideoView player={player} style={styles.player} nativeControls contentFit="contain" />
            <Pressable onPress={() => onOpen?.(url)} hitSlop={8} style={styles.fullBtn} accessibilityLabel="فتح في مشغّل اللقطات">
              <Ionicons name="expand-outline" size={18} color="#fff" />
            </Pressable>
          </>
        ) : (
          <View style={styles.playerFallback}>
            {failed ? <Text style={styles.fallbackText}>الفيديو مش متاح دلوقتي</Text> : <ActivityIndicator color={colors.goldText} />}
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.author}>{post.profiles?.display_name ?? post.profiles?.username ?? "ونس"}</Text>
        <Text numberOfLines={3} style={styles.body}>{post.body}</Text>
        {!!post.music && <MusicChip music={post.music} compact />}
        <View style={styles.statsRow}>
          <Ionicons name="heart-outline" size={15} color={colors.muted} />
          <Text style={styles.stats}>{post.likes_count ?? 0}</Text>
        </View>
      </View>
    </View>
  );
}

export default function VideoScreen() {
  useThemeContext();
  const { t } = useLang();
  const router = useRouter();
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stories, setStories] = useState<PublicStory[]>([]);
  const [clip, setClip] = useState<{ uri: string; id: string; label: string } | null>(null);

  // بند 21: قصص تبويب الفيديو للعامة فقط (allow_in_video_tab = true ولسه ماخلصتش)
  const loadStories = useCallback(async () => {
    const { data } = await supabase
      .from("stories")
      .select("id, media_url, media_type, user_id, profiles!stories_user_id_fkey(username, display_name, avatar_url)")
      .eq("allow_in_video_tab", true)
      .eq("audience", "public")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    setStories((data ?? []) as unknown as PublicStory[]);
  }, []);

  const load = useCallback(async () => {
    void loadStories();
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from("posts")
        .select("id, body, media_url, media_type, music, created_at, likes_count, profiles!posts_author_id_fkey(username, display_name, avatar_url)")
        .eq("media_type", "video")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (err) throw err;
      setPosts((data ?? []) as unknown as VideoPost[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الفيديوهات");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadStories]);

  useEffect(() => {
    // تأجيل التحميل لما بعد أول رسم (بدون setState متزامن داخل الـeffect)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>{t("video.title")}</Text>
        <Pressable onPress={() => router.push("/(tabs)/stories")} style={styles.storiesBtn}>
          <Ionicons name="albums-outline" size={18} color={colors.goldText} />
          <Text style={styles.storiesText}>{t("video.stories")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/post/new")} style={styles.uploadBtn}>
          <Ionicons name="videocam-outline" size={18} color={colors.ink} />
          <Text style={styles.uploadText}>{t("video.upload")}</Text>
        </Pressable>
      </View>
      {!!stories.length && (
        <View style={styles.storyRail}>
          <Text style={styles.railTitle}>{t("video.publicStories")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 14, flexDirection: "row-reverse" }}>
            {stories.map((st) => {
              const uri = publicMediaUrl(st.media_url);
              return (
                <Pressable key={st.id} onPress={() => router.push("/(tabs)/stories")} style={styles.storyItem}>
                  <View style={styles.storyRing}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.storyThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.storyThumb, { alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="videocam" size={18} color={colors.goldText} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.storyName}>{st.profiles?.username ?? "ونس"}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 24 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.goldText}
          />
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyBox}>
              <Ionicons name="videocam-off-outline" size={40} color={colors.muted} />
              <Text style={styles.empty}>مفيش فيديوهات لسه — ارفع أول فيديو وخلّي الناس تتفرج.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <VideoCard post={item} onOpen={(uri) => setClip({ uri, id: item.id, label: item.body })} />}
      />
      {clip && <ClipPlayer uri={clip.uri} visible postId={clip.id} label={clip.label} onClose={() => setClip(null)} />}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900", flex: 1, textAlign: "right" },
    storiesBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    storiesText: { color: colors.goldText, fontSize: 12 },
    storyRail: { paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    railTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800", textAlign: "right", paddingHorizontal: 16, marginBottom: 8 },
    storyItem: { alignItems: "center", width: 68, gap: 5 },
    storyRing: { width: 62, height: 62, borderRadius: 31, padding: 2.5, borderWidth: 2, borderColor: colors.goldText },
    storyThumb: { width: "100%", height: "100%", borderRadius: 28, backgroundColor: colors.surface },
    storyName: { color: colors.muted, fontSize: 10.5, maxWidth: 64, textAlign: "center" },
    uploadBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    uploadText: { color: colors.ink, fontSize: 12, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    fullBtn: { position: "absolute", top: 10, left: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
    card: { backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
    playerBox: { height: 240, backgroundColor: "#000" },
    player: { flex: 1 },
    playerFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
    fallbackText: { color: colors.muted, fontSize: 12 },
    meta: { padding: 12, gap: 4 },
    author: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    body: { color: colors.text, fontSize: 13, textAlign: "right", lineHeight: 20 },
    statsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
    stats: { color: colors.muted, fontSize: 11 },
    error: { color: colors.red, textAlign: "center", padding: 12 },
    emptyBox: { alignItems: "center", gap: 10, marginTop: 40 },
    empty: { color: colors.muted, textAlign: "center", fontSize: 13, paddingHorizontal: 30 },
  }),
);
