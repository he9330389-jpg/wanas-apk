import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell, Avatar, VerificationBadge } from "@/components/wanas-ui";
import { PostCard, type FeedPost } from "@/components/post-card";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean | null;
  city: string | null;
  work: string | null;
  link_url: string | null;
  status_text: string | null;
  created_at: string;
};

/**
 * ملف المستخدم — القسم 16.
 * بروفايل حقيقي من `profiles`، متابعة/إلغاء متابعة من `follows`،
 * بدء محادثة، حظر وكتم حقيقيان، ومنشوراته العامة.
 */
export default function UserProfileScreen() {
  useThemeContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (!id) return;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMe(uid);

      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, cover_url, is_verified, city, work, link_url, status_text, created_at")
        .eq("id", id)
        .maybeSingle();
      if (pe) throw pe;
      if (!p) {
        setError("الملف ده مش موجود");
        return;
      }
      setProfile(p as Profile);

      const { data: userPosts } = await supabase
        .from("posts")
        .select("id, author_id, body, media_type, created_at, likes_count, comments_count, profiles!posts_author_id_fkey(username, display_name, is_verified, verification_tone)")
        .eq("author_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      setPosts((userPosts ?? []) as unknown as FeedPost[]);

      const [f1, f2] = await Promise.all([
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", id),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", id),
      ]);
      setFollowers(f1.count ?? 0);
      setFollowingCount(f2.count ?? 0);

      if (uid && uid !== id) {
        const [fl, bl, mu] = await Promise.all([
          supabase.from("follows").select("follower_id").eq("follower_id", uid).eq("followed_id", id).maybeSingle(),
          supabase.from("blocks").select("blocker_id").eq("blocker_id", uid).eq("blocked_id", id).maybeSingle(),
          supabase.from("muted_users").select("muter_id").eq("muter_id", uid).eq("muted_user_id", id).maybeSingle(),
        ]);
        setFollowing(!!fl.data);
        setBlocked(!!bl.data);
        setMuted(!!mu.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الملف");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  // تسجيل زيارة الركن (مرة لكل فتح شاشة) — الفشل صامت لو جدول profile_visits لسه مش متعمل
  useEffect(() => {
    if (!me || !id || me === id) return;
    void supabase.from("profile_visits").insert({ profile_id: id, visitor_id: me }).then(() => undefined, () => undefined);
  }, [me, id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function toggleFollow() {
    if (!me || !id) return;
    const was = following;
    setFollowing(!was);
    setFollowers((c) => Math.max(0, c + (was ? -1 : 1)));
    const { error: err } = was
      ? await supabase.from("follows").delete().eq("follower_id", me).eq("followed_id", id)
      : await supabase.from("follows").insert({ follower_id: me, followed_id: id });
    if (err) {
      setFollowing(was);
      setFollowers((c) => Math.max(0, c + (was ? 1 : -1)));
      Alert.alert("مش تم", err.message);
    }
  }

  async function toggleMute() {
    if (!me || !id) return;
    if (muted) {
      const { error: err } = await supabase.from("muted_users").delete().eq("muter_id", me).eq("muted_user_id", id);
      if (err) return Alert.alert("مش تم", err.message);
      setMuted(false);
    } else {
      const { error: err } = await supabase.from("muted_users").insert({ muter_id: me, muted_user_id: id });
      if (err) return Alert.alert("مش تم", err.message);
      setMuted(true);
    }
  }

  function toggleBlock() {
    if (!me || !id) return;
    if (blocked) {
      Alert.alert("إلغاء الحظر", "هيرجع يشوف محتواك ويتفاعل معاك.", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "الغِ",
          onPress: async () => {
            const { error: err } = await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", id);
            if (err) return Alert.alert("مش تم", err.message);
            setBlocked(false);
            await load();
          },
        },
      ]);
      return;
    }
    Alert.alert("حظر", "مش هيشوف منشوراتك ولا هتقدر تراسله. الحظر بيشتغل في الاتجاهين.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احظر",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: id });
          if (err) return Alert.alert("مش تم", err.message);
          if (following) await supabase.from("follows").delete().eq("follower_id", me).eq("followed_id", id);
          setBlocked(true);
          setFollowing(false);
          setPosts([]);
        },
      },
    ]);
  }

  function message() {
    if (!id || !profile) return;
    router.push({
      pathname: "/chat/[id]",
      params: { id, name: profile.display_name ?? profile.username },
    });
  }

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.goldText} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 50 }}
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
        <View style={styles.cover}>
          {!!profile?.cover_url && <Image source={{ uri: profile.cover_url }} style={styles.coverImg} resizeMode="cover" />}
          <Pressable style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)"))} hitSlop={10}>
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.head}>
          <View style={styles.avatarWrap}>
            <Avatar initial={(profile?.display_name ?? profile?.username ?? "و")[0]} color={colors.surface3} size={84} />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.display_name ?? profile?.username ?? "—"}</Text>
            {profile?.is_verified && <VerificationBadge tone="yellow" small />}
          </View>
          <Text style={styles.handle}>@{profile?.username ?? "—"}</Text>
          {!!profile?.status_text && <Text style={styles.status}>{profile.status_text}</Text>}
          {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.metaRow}>
            {!!profile?.city && <Text style={styles.meta}>📍 {profile.city}</Text>}
            {!!profile?.work && <Text style={styles.meta}>💼 {profile.work}</Text>}
            {!!profile?.link_url && <Text style={styles.meta} numberOfLines={1}>🔗 {profile.link_url}</Text>}
            <Text style={styles.meta}>📅 عضو من {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("ar-EG-u-nu-latn") : "—"}</Text>
          </View>

          <View style={styles.counts}>
            <Text style={styles.count}><Text style={styles.countNum}>{followingCount}</Text> يتابع</Text>
            <Text style={styles.count}><Text style={styles.countNum}>{followers}</Text> متابع</Text>
            <Text style={styles.count}><Text style={styles.countNum}>{posts.length}</Text> منشور</Text>
          </View>

          {me !== id && (
            <View style={styles.actions}>
              <Pressable style={[styles.primary, following && styles.secondary]} onPress={toggleFollow}>
                <Text style={[styles.primaryText, following && { color: colors.text }]}>
                  {following ? "بتتابعه" : "متابعة"}
                </Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={message} accessibilityLabel="ابعت رسالة">
                <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={toggleMute} accessibilityLabel={muted ? "إلغاء الكتم" : "اكتم"}>
                <Ionicons name={muted ? "volume-mute" : "volume-high-outline"} size={20} color={muted ? colors.goldText : colors.text} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={toggleBlock} accessibilityLabel={blocked ? "إلغاء الحظر" : "احظر"}>
                <Ionicons name={blocked ? "lock-open-outline" : "ban-outline"} size={20} color={blocked ? colors.red : colors.text} />
              </Pressable>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
          {blocked && <Text style={styles.blockNote}>انت حاظر الحساب ده — مش بيظهر لك محتواه.</Text>}
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <Text style={styles.section}>منشوراته</Text>
          {posts.length === 0 && <Text style={styles.empty}>مفيش منشورات ظاهرة.</Text>}
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    cover: { height: 150, backgroundColor: colors.surface2 },
    coverImg: { width: "100%", height: "100%" },
    back: { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16, padding: 6 },
    head: { paddingHorizontal: 16, marginTop: -42, gap: 6 },
    avatarWrap: { borderWidth: 3, borderColor: colors.background, borderRadius: 46, alignSelf: "flex-start" },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6 },
    name: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    handle: { color: colors.muted, fontSize: 12, textAlign: "right" },
    status: { color: colors.goldText, fontSize: 12.5, textAlign: "right" },
    bio: { color: colors.text, fontSize: 13.5, textAlign: "right", lineHeight: 20 },
    metaRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginTop: 4 },
    meta: { color: colors.muted, fontSize: 11 },
    counts: { flexDirection: "row-reverse", gap: 18, marginTop: 8 },
    count: { color: colors.muted, fontSize: 12 },
    countNum: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    actions: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
    primary: { flex: 1, backgroundColor: colors.gold, borderRadius: 14, height: 42, alignItems: "center", justifyContent: "center" },
    secondary: { backgroundColor: colors.surface3 },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14 },
    iconBtn: { width: 44, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    section: { color: colors.muted, fontSize: 12, textAlign: "right" },
    empty: { color: colors.muted, fontSize: 12, textAlign: "right" },
    error: { color: colors.red, fontSize: 12, textAlign: "right" },
    blockNote: { color: colors.red, fontSize: 11.5, textAlign: "right" },
  }),
);
