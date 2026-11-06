import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/components/wanas-ui";
import { PostCard, type FeedPost } from "@/components/post-card";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { useUploadStatus } from "@/lib/upload-status";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { useLang } from "@/lib/i18n";

/**
 * الرئيسية — بار علوي (البحث · الأختام · الإشعارات · ☰) · القصص تحت الأزرار ·
 * ثلاث دوال سريعة (ونسة الصباح · كبسولة · الوضع الهادئ) · شريط «جاري تحميل منشورك»
 * بنسبة مئوية فعلية · وموجز حقيقي من `posts`.
 */
type Story = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  created_at: string;
  profiles?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

export default function HomeScreen() {
  const { t } = useLang();
  useThemeContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const upload = useUploadStatus();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [me, setMe] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const [subs, setSubs] = useState<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMe(uid);
      // الاشتراكات/المتابَعين — بيظهروا أفقيًا بعد أول منشور زي ستوريز إنستجرام (بند 14)
      if (uid) {
        const { data: follows } = await supabase
          .from("follows")
          .select("following_id, profiles!follows_following_id_fkey(id, username, display_name, avatar_url)")
          .eq("follower_id", uid)
          .limit(20);
        type SubRow = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
        const raw = (follows ?? []) as unknown as { profiles: SubRow | SubRow[] | null }[];
        const rows: SubRow[] = [];
        for (const f of raw) {
          const p = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
          if (p?.id) rows.push(p);
        }
        setSubs(rows);
      }
      const [feed, storyRows] = await Promise.all([
        supabase
          .from("posts")
          .select("id, author_id, body, media_type, media_url, music, created_at, likes_count, comments_count, allow_comments, archived_at, profiles!posts_author_id_fkey(username, display_name, is_verified, verification_tone)")
          .is("deleted_at", null)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("stories")
          .select("id, user_id, media_url, media_type, created_at, profiles!stories_user_id_fkey(username, display_name, avatar_url)")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (feed.error) throw feed.error;
      setPosts((feed.data ?? []) as unknown as FeedPost[]);
      setStories((storyRows.data ?? []) as unknown as Story[]);
      if (uid) {
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", uid).is("read_at", null);
        setUnread(count ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الموجز");
    } finally {
      setLoading(false);
      setRefreshing(false);
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    // تأجيل التحميل لما بعد أول رسم (بدون setState متزامن داخل الـeffect)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // أول ما ترجع من النشر، المنشور الجديد لازم يظهر أول حاجة
  useFocusEffect(
    useCallback(() => {
      if (!firstLoad.current) void load();
    }, [load]),
  );

  const storiesRow = (
    <View style={{ gap: 12 }}>
      {upload.state === "uploading" || upload.state === "saving" ? (
        <View style={styles.uploadBanner}>
          <View style={styles.uploadHead}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.goldText} />
            <Text style={styles.uploadText}>
              {upload.state === "uploading" ? `جاري تحميل منشورك… ${upload.percent}%` : "بنسجل منشورك…"}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${upload.state === "saving" ? 100 : upload.percent}%` }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.quickRow}>
        <Quick label="ونسة الصباح" icon="sunny-outline" onPress={() => router.push("/morning")} />
        <Quick label="كبسولة" icon="gift-outline" onPress={() => router.push("/capsule")} />
        <Quick label="الوضع الهادئ" icon="moon-outline" onPress={() => router.push("/quiet-mode")} />
      </View>

      <View style={styles.storiesBlock}>
        <View style={styles.storiesHead}>
          <Text style={styles.storiesTitle}>{t("home.stories")}</Text>
          <Pressable onPress={() => router.push("/(tabs)/stories")} hitSlop={8}>
            <Text style={styles.storiesMore}>{t("home.allStories")}</Text>
          </Pressable>
        </View>
        <FlatList
          horizontal
          inverted
          showsHorizontalScrollIndicator={false}
          data={stories}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.storiesRow}
          ListHeaderComponent={
            <Pressable style={styles.storyItem} onPress={() => router.push("/story/new")}>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={26} color={colors.ink} />
              </View>
              <Text numberOfLines={1} style={styles.storyLabel}>{t("home.yourStory")}</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.storyItem} onPress={() => router.push("/(tabs)/stories")}>
              <View style={[styles.storyRing, item.user_id === me && styles.storyRingMine]}>
                <View style={styles.storyInner}>
                  {item.media_type === "image" ? (
                    <Image source={{ uri: item.media_url }} style={styles.thumb} />
                  ) : (
                    <Ionicons name="play" size={20} color={colors.goldText} />
                  )}
                </View>
              </View>
              <Text numberOfLines={1} style={styles.storyLabel}>
                {item.user_id === me ? "قصتك" : item.profiles?.display_name ?? item.profiles?.username ?? "ونس"}
              </Text>
            </Pressable>
          )}
        />
      </View>
      {/* قالب النشر — الضغط عليه أو على أيقونة الصورة بيفتح المنشئ (بند 15) */}
      <Pressable style={styles.composerBar} onPress={() => router.push("/post/new")}>
        <View style={styles.composerAvatar}>
          <Ionicons name="person" size={16} color={colors.muted} />
        </View>
        <Text style={styles.composerHint}>{t("home.composerHint")}</Text>
        <Pressable style={styles.composerIcon} onPress={() => router.push("/post/new?media=image")} hitSlop={6} accessibilityLabel="إضافة صورة">
          <Ionicons name="image-outline" size={22} color={colors.goldText} />
          <View style={styles.plusDot}><Ionicons name="add" size={11} color={colors.ink} /></View>
        </Pressable>
      </Pressable>
      <View style={styles.composerRow}>
        <Pressable style={styles.composerChip} onPress={() => router.push("/post/new?mode=live")}>
          <Ionicons name="radio-outline" size={15} color={colors.red} />
          <Text style={styles.chipText}>{t("home.live")}</Text>
        </Pressable>
        <Pressable style={styles.composerChip} onPress={() => router.push("/post/new?focus=mention")}>
          <Ionicons name="at" size={15} color={colors.goldText} />
          <Text style={styles.chipText}>{t("home.mentionFriends")}</Text>
        </Pressable>
        <Pressable style={styles.composerChip} onPress={() => router.push("/post/new?focus=feeling")}>
          <Ionicons name="happy-outline" size={15} color={colors.goldText} />
          <Text style={styles.chipText}>{t("home.feeling")}</Text>
        </Pressable>
      </View>
      <Text style={styles.feedTitle}>{t("home.feed")}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BrandMark compact />
        <Text style={styles.hello}>{t("home.hello")}</Text>
        <Pressable onPress={() => router.push("/discover")} hitSlop={6} style={styles.headerAction}>
          <Ionicons name="search" size={26} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push("/stamps")} hitSlop={6} style={styles.headerAction}>
          <Text style={{ fontSize: 22 }}>🏷</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/notifications")} hitSlop={6} style={styles.headerAction}>
          <Ionicons name="notifications-outline" size={26} color={colors.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => router.push("/guide")} hitSlop={6} style={styles.headerAction}>
          <Ionicons name="menu" size={26} color={colors.text} />
        </Pressable>
      </View>

      {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={storiesRow}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}
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
        ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>مفيش منشورات لسه — ابدأ أول منشور واجمع الونس.</Text> : null}
        renderItem={({ item, index }) => (
          <>
            <PostCard post={item} />
            {index === 0 && subs.length > 0 && (
              <View style={styles.subsBlock}>
                <Text style={styles.subsTitle}>{t("home.subs")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subsRow}>
                  {subs.map((u) => (
                    <Pressable key={u.id} style={styles.subItem} onPress={() => router.push(`/user/${u.id}`)}>
                      <View style={styles.subRing}>
                        {u.avatar_url ? (
                          <Image source={{ uri: u.avatar_url }} style={styles.subAvatar} />
                        ) : (
                          <View style={[styles.subAvatar, { alignItems: "center", justifyContent: "center" }]}>
                            <Ionicons name="person" size={20} color={colors.muted} />
                          </View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={styles.subName}>{u.display_name ?? u.username ?? "ونس"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      />

      <Pressable style={[styles.fab, { bottom: 24 }]} onPress={() => router.push("/post/new")} accessibilityLabel="منشور جديد">
        <Ionicons name="add" size={30} color={colors.ink} />
      </Pressable>
    </View>
  );
}

function Quick({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void }) {
  return (
    <Pressable style={styles.quick} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.goldText} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    headerAction: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
    hello: { color: colors.text, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", flex: 1 },
    quickRow: { flexDirection: "row-reverse", gap: 8 },
    quick: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, flexGrow: 1, justifyContent: "center" },
    quickLabel: { color: colors.text, fontSize: 11.5 },
    uploadBanner: { backgroundColor: colors.goldSoft, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.gold },
    uploadHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    uploadText: { color: colors.goldText, fontSize: 12.5 },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
    fill: { height: "100%", backgroundColor: colors.gold, borderRadius: 3 },
    storiesBlock: { gap: 8 },
    storiesHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
    storiesTitle: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    storiesMore: { color: colors.muted, fontSize: 11.5 },
    storiesRow: { gap: 12, paddingVertical: 2 },
    storyItem: { alignItems: "center", gap: 6, width: 68 },
    addCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    storyRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
    storyRingMine: { borderColor: colors.muted },
    storyInner: { width: 50, height: 50, borderRadius: 25, overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
    thumb: { width: "100%", height: "100%" },
    storyLabel: { color: colors.text, fontSize: 10.5, textAlign: "center" },
    composerBar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  composerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  composerHint: { flex: 1, color: colors.muted, fontSize: 13, textAlign: "right" },
  composerIcon: { padding: 4 },
  plusDot: { position: "absolute", bottom: -1, left: -3, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  composerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 8 },
  composerChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.text, fontSize: 11.5 },
  subsBlock: { marginTop: 6, gap: 8 },
  subsTitle: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  subsRow: { gap: 12, flexDirection: "row-reverse", paddingVertical: 2 },
  subItem: { alignItems: "center", width: 64, gap: 4 },
  subRing: { width: 58, height: 58, borderRadius: 29, padding: 2, borderWidth: 2, borderColor: colors.goldText },
  subAvatar: { width: "100%", height: "100%", borderRadius: 25, backgroundColor: colors.surface },
  subName: { color: colors.muted, fontSize: 10.5, maxWidth: 62, textAlign: "center" },
  feedTitle: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 4 },
    empty: { color: colors.muted, textAlign: "center", marginTop: 30 },
    error: { color: colors.red, textAlign: "center", padding: 10 },
    badge: { position: "absolute", top: -2, right: -4, backgroundColor: colors.red, borderRadius: 9, minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
    badgeText: { color: "#fff", fontSize: 9.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    fab: { position: "absolute", left: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", elevation: 6 },
  }),
);
