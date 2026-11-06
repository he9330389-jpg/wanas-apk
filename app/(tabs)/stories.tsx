import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Image,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { StoryOverlayView, filterOverlay } from "@/components/story-overlay-view";
import { MusicChip } from "@/components/music-chip";

type Story = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  overlays?: unknown;
  music?: { title: string; artist?: string; preview: string; filter?: string | null } | null;
  created_at: string;
  expires_at: string;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

/**
 * القصص — القسم 18. بتقرأ من جدول `stories` الحقيقي (RLS بتفلتر حسب الجمهور والحظر)،
 * بتعرض اللي لسه ما خلصش وقته، وبتفتح المشاهد مع تسجيل مشاهدة في `story_views`
 * (من غير تسجيل لمشاهدة صاحب القصة نفسه).
 */
export default function StoriesScreen() {
  useThemeContext();
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [open, setOpen] = useState<Story | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      const { data, error: err } = await supabase
        .from("stories")
        .select("id, user_id, media_url, media_type, caption, overlays, music, created_at, expires_at, profiles!stories_user_id_fkey(username, display_name, avatar_url)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(40);
      if (err) throw err;
      setStories((data ?? []) as unknown as Story[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل القصص");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function viewStory(story: Story) {
    setOpen(story);
    if (!me || story.user_id === me) return;
    // تسجيل المشاهدة — لو اتسجلت قبل كده الخادم بيمنع التكرار
    await supabase
      .from("story_views")
      .insert({ story_id: story.id, viewer_id: me })
      .then(() => undefined, () => undefined);
  }

  const mine = stories.filter((s) => s.user_id === me);
  const others = stories.filter((s) => s.user_id !== me);

  return (
    <ScreenShell>
      <Header title="القصص" />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.goldText}
          />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Pressable style={styles.addStory} onPress={() => router.push("/story/new")}>
            <View style={styles.addCircle}>
              <Ionicons name="add" size={30} color={colors.ink} />
            </View>
            <Text style={styles.storyLabel}>قصتك</Text>
          </Pressable>
          {[...mine, ...others].map((s) => (
            <Pressable key={s.id} style={styles.storyItem} onPress={() => viewStory(s)}>
              <View style={[styles.storyRing, s.user_id === me && styles.storyRingMine]}>
                <View style={styles.storyInner}>
                  {s.media_type === "image" ? (
                    <Image source={{ uri: s.media_url }} style={styles.thumb} />
                  ) : (
                    <Ionicons name="play" size={22} color={colors.goldText} />
                  )}
                </View>
              </View>
              <Text numberOfLines={1} style={styles.storyLabel}>
                {s.user_id === me ? "قصتك" : s.profiles?.display_name ?? s.profiles?.username ?? "ونس"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!loading && stories.length === 0 && !error && (
          <Text style={styles.empty}>مفيش قصص دلوقتي — شارك أول قصة ونتك.</Text>
        )}
      </ScrollView>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setOpen(null)}>
          {!!open && (
            <View style={styles.viewer}>
              {open.media_type === "image" ? (
                <Image source={{ uri: open.media_url }} style={styles.viewerMedia} resizeMode="contain" />
              ) : (
                <View style={styles.viewerFallback}>
                  <Ionicons name="videocam" size={40} color={colors.goldText} />
                  <Text style={styles.viewerHint}>قصة فيديو — بتتفتح من الرابط الأصلي</Text>
                </View>
              )}
              {!!open.music?.filter && (
                <View pointerEvents="none" style={[styles.filterLayer, { backgroundColor: filterOverlay(open.music.filter) }]} />
              )}
              <StoryOverlayView overlays={open.overlays} />
              {!!open.music?.preview && (
                <View style={styles.viewerMusic}>
                  <MusicChip music={open.music} compact />
                </View>
              )}
              {!!open.caption && <Text style={styles.viewerCaption}>{open.caption}</Text>}
              <Text style={styles.viewerMeta}>
                {open.profiles?.display_name ?? open.profiles?.username ?? "ونس"} ·{" "}
                {new Date(open.created_at).toLocaleString("ar-EG-u-nu-latn")}
              </Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    row: { flexDirection: "row-reverse", gap: 14, paddingVertical: 4 },
    addStory: { alignItems: "center", gap: 8, width: 70 },
    addCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.border },
    storyItem: { alignItems: "center", gap: 8, width: 70 },
    storyRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
    storyRingMine: { borderColor: colors.muted },
    storyInner: { width: 54, height: 54, borderRadius: 27, overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
    thumb: { width: "100%", height: "100%" },
    storyLabel: { color: colors.text, fontSize: 11, textAlign: "center", fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
    empty: { color: colors.muted, textAlign: "center", marginTop: 40, fontSize: 13 },
    error: { color: colors.red, textAlign: "center", padding: 10, fontSize: 12 },
    viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: 20 },
    viewer: { width: "100%", alignItems: "center", gap: 12 },
    viewerMedia: { width: "100%", height: "72%" },
    viewerFallback: { height: 320, alignItems: "center", justifyContent: "center", gap: 10 },
    viewerHint: { color: colors.muted, fontSize: 12 },
    viewerCaption: { color: colors.text, fontSize: 15, textAlign: "center" },
    viewerMeta: { color: colors.muted, fontSize: 11 },
    filterLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    viewerMusic: { position: "absolute", bottom: 54, right: 12, left: 12, alignItems: "flex-end" },
  }),
);
