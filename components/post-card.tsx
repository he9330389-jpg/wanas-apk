import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Share, ActivityIndicator } from "react-native";
import * as ExpoLinking from "expo-linking";
import * as Sharing from "expo-sharing";
import { downloadPostMedia } from "@/lib/download";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, VerificationBadge } from "@/components/wanas-ui";
import { ReactionPicker, type Anchor } from "@/components/ReactionPicker";
import { colors, reactions, type ReactionType } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { areFriends } from "@/lib/social";
import { playReactionSound } from "@/lib/reactions";
import { translateText, targetLangLabel } from "@/lib/translate";
import { PostActionsSheet } from "@/components/post-actions";
import { ImageViewer, PostMedia } from "@/components/post-media";
import { FilterLayers } from "@/components/media-filters";
import { TextCard } from "@/components/text-cards";
import { MusicChip, type MusicMeta } from "@/components/music-chip";
import { themedStyles } from "@/lib/theme-runtime";
import { publicMediaUrl } from "@/lib/media";

export type FeedPost = {
  id: string;
  author_id: string;
  body: string | null;
  media_type: string | null;
  media_url?: string | null;
  music?: (MusicMeta & { filter?: string; strength?: number; card?: string; dl?: "all" | "friends" | "me" }) | null;
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
  profiles?: {
    username: string;
    display_name: string | null;
    is_verified: boolean | null;
    verification_tone: string | null;
  } | null;
};

type ReactionRow = { post_id: string; user_id: string; reaction: string };

/**
 * كارت المنشور: تفاعلات ونس التسعة حقيقية في قاعدة البيانات،
 * عدادات من `posts`، وترجمة فورية للنص باللغة اللي اختارها المستخدم.
 */
export function PostCard({ post, onPressAuthor }: { post: FeedPost; onPressAuthor?: () => void }) {
  const router = useRouter();
  const [viewerOpen, setViewerOpen] = useState(false);
  const author = post.profiles;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>(null);
  const reactBtn = useRef<View>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(post.likes_count ?? 0);
  const [busy, setBusy] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  /** مشاركة المنشور برا ونس (قائمة المشاركة بتاعة النظام). */
  async function sharePost() {
    const link = ExpoLinking.createURL(`/post/${post.id}`);
    const snippet = post.body ? `${post.body.slice(0, 120)}${post.body.length > 120 ? "…" : ""}\n` : "";
    try {
      await Share.share({ message: `${snippet}${link}` });
    } catch {
      /* المستخدم قفل القائمة */
    }
  }

  /** تنزيل ميديا المنشور — بعد فحص الخصوصية والحظر، وبعدها قائمة النظام للحفظ في الجهاز. */
  async function downloadMedia() {
    if (!post.media_url) {
      Alert.alert("مفيش حاجة تتنزّل", "المنشور ده مفيهوش صورة أو فيديو أو ملف.");
      return;
    }
    const scope = post.music?.dl;
    const mineP = !!meId && meId === post.author_id;
    if (!mineP && scope === "me") {
      Alert.alert("التنزيل مقفول", "صاحب المنشور مش سامح بتنزيل المحتوى ده.");
      return;
    }
    if (!mineP && scope === "friends") {
      const ok = meId ? await areFriends(meId, post.author_id).catch(() => false) : false;
      if (!ok) {
        Alert.alert("للأصدقاء بس", "التنزيل متاح لأصدقاء صاحب المنشور فقط.");
        return;
      }
    }
    setDownloading(true);
    try {
      const name = post.media_url.split("/").pop() ?? `wanas-${post.id}`;
      const res = await downloadPostMedia(post.id, post.media_url, name);
      if (!res.ok || !res.uri) {
        Alert.alert("التنزيل مش تم", res.message ?? "جرّب تاني");
        return;
      }
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
      else Alert.alert("اتنزّل", "اتحفظ الملف على الجهاز.");
    } catch (e) {
      Alert.alert("التنزيل مش تم", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setDownloading(false);
    }
  }

  const loadReactions = useCallback(async () => {
    const { data } = await supabase
      .from("post_reactions")
      .select("post_id, user_id, reaction")
      .eq("post_id", post.id)
      .limit(500);
    const rows = (data ?? []) as ReactionRow[];
    const next: Record<string, number> = {};
    rows.forEach((r) => {
      next[r.reaction] = (next[r.reaction] ?? 0) + 1;
    });
    setCounts(next);
    const { data: auth } = await supabase.auth.getUser();
    const me = rows.find((r) => r.user_id === auth.user?.id);
    setMine(me?.reaction ?? null);
  }, [post.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadReactions();
    })();
    return () => {
      active = false;
    };
  }, [loadReactions]);

  async function react(type: ReactionType) {
    setPickerOpen(false);
    if (busy) return;
    setBusy(true);
    playReactionSound(type);
    const previous = mine;
    // تحديث متفائل، ويرجع لو الخادم رفض
    setMine(type);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error } = await supabase
        .from("post_reactions")
        .upsert({ post_id: post.id, user_id: uid, reaction: type }, { onConflict: "post_id,user_id" });
      if (error) throw error;
      await loadReactions();
      const { data: fresh } = await supabase.from("posts").select("likes_count").eq("id", post.id).maybeSingle();
      if (typeof fresh?.likes_count === "number") setTotal(fresh.likes_count);
    } catch (e) {
      setMine(previous);
      Alert.alert("التفاعل مش اتحفظ", e instanceof Error ? e.message : "جرّب تاني بعد شوية");
    } finally {
      setBusy(false);
    }
  }

  async function unreact() {
    if (busy) return;
    setBusy(true);
    const previous = mine;
    setMine(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("الجلسة انتهت — سجّل دخولك تاني");
      const { error } = await supabase.from("post_reactions").delete().eq("post_id", post.id).eq("user_id", uid);
      if (error) throw error;
      await loadReactions();
    } catch (e) {
      setMine(previous);
      Alert.alert("مقدرناش نشيل التفاعل", e instanceof Error ? e.message : "جرّب تاني بعد شوية");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTranslate() {
    if (!post.body) return;
    if (translated) {
      setTranslated(null);
      return;
    }
    setTranslating(true);
    try {
      const out = await translateText(post.body);
      if (out) setTranslated(out);
      else Alert.alert("الترجمة مش متاحة دلوقتي", "اتأكد من الإنترنت وجرّب تاني.");
    } finally {
      setTranslating(false);
    }
  }

  const mineMeta = reactions.find((r) => r.type === mine);
  const chips = reactions.filter((r) => (counts[r.type] ?? 0) > 0);

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => (onPressAuthor ? onPressAuthor() : router.push({ pathname: "/user/[id]", params: { id: post.author_id } }))}>
        <Avatar initial={(author?.display_name ?? author?.username ?? "و")[0]} color={colors.surface3} size={42} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName}>{author?.display_name ?? author?.username ?? "مستخدم ونس"}</Text>
            {author?.is_verified && <VerificationBadge tone={(author.verification_tone as "yellow") ?? "yellow"} small />}
          </View>
          <Text style={styles.time}>{new Date(post.created_at).toLocaleString("ar-EG-u-nu-latn")}</Text>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityLabel="خيارات المنشور">
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </Pressable>

      {!!post.body && (
        <Pressable onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}>
          {post.music?.card && !post.media_url ? <TextCard text={post.body} styleKey={post.music.card} compact /> : <Text style={styles.body}>{post.body}</Text>}
        </Pressable>
      )}
      {!!translated && <Text style={styles.translated}>🌐 {translated}</Text>}
      {!!post.media_url && (
        <View>
        <PostMedia
          path={post.media_url}
          type={post.media_type}
          onPress={() => {
            if ((post.media_type ?? "").toLowerCase() === "image") setViewerOpen(true);
            else router.push({ pathname: "/post/[id]", params: { id: post.id } });
          }}
        />
        <FilterLayers filter={post.music?.filter} strength={post.music?.strength} />
        </View>
      )}
      <ImageViewer
        visible={viewerOpen}
        url={publicMediaUrl(post.media_url)}
        onClose={() => setViewerOpen(false)}
        onComments={() => {
          setViewerOpen(false);
          router.push({ pathname: "/post/[id]", params: { id: post.id } });
        }}
      />
      {!!post.music?.title && <MusicChip music={post.music} />}

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((c) => (
            <Text key={c.type} style={styles.chip}>
              {c.emoji} {counts[c.type]}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          ref={reactBtn}
          onPress={() => (mine ? void unreact() : void react("أحببته"))}
          onLongPress={() => {
            reactBtn.current?.measureInWindow((x, y, width, height) => {
              setAnchor({ x, y, width, height });
              setPickerOpen(true);
            });
          }}
          delayLongPress={280}
          hitSlop={8}
          style={styles.actionBtn}
          accessibilityHint="اضغط مطولًا لاختيار تفاعل"
        >
          <Text style={[styles.action, mine ? { color: mineMeta?.color ?? colors.goldText } : null]}>
            {mineMeta ? `${mineMeta.emoji} ${mineMeta.type}` : "🫶 تفاعل"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })} hitSlop={8}>
          <Text style={styles.action}>💬 {post.comments_count ?? 0}</Text>
        </Pressable>
        {!!post.body && (
          <Pressable onPress={toggleTranslate} hitSlop={8}>
            <Text style={styles.action}>{translating ? "بينقّل…" : translated ? "الأصل" : `🌐 ${targetLangLabel()}`}</Text>
          </Pressable>
        )}
        <Pressable onPress={sharePost} hitSlop={8} accessibilityLabel="مشاركة المنشور">
          <Text style={styles.action}>↗ شارك</Text>
        </Pressable>
        {!!post.media_url && !(post.music?.dl === "me" && meId !== post.author_id) && (
        <Pressable onPress={downloadMedia} disabled={downloading} hitSlop={8} accessibilityLabel="تنزيل ميديا المنشور">
          {downloading ? <ActivityIndicator size="small" color={colors.goldText} /> : <Text style={styles.action}>⬇ تنزيل</Text>}
        </Pressable>
        )}
      </View>

      <ReactionPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={react} anchor={anchor} current={mine as ReactionType | null} />
      <PostActionsSheet
        visible={menuOpen}
        post={{ id: post.id, author_id: post.author_id, body: post.body, allow_comments: (post as { allow_comments?: boolean | null }).allow_comments }}
        isMine={!!meId && meId === post.author_id}
        onClose={() => setMenuOpen(false)}
      />
      <Text style={styles.total}>{total} تفاعل</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
    header: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    authorName: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    time: { color: colors.muted, fontSize: 10, textAlign: "right" },
    body: { color: colors.text, fontSize: 16, textAlign: "right", lineHeight: 23 },
    translated: { color: colors.goldText, fontSize: 13.5, textAlign: "right", lineHeight: 21 },
    media: { color: colors.muted, fontSize: 11, textAlign: "right" },
    chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
    chip: { color: colors.text, backgroundColor: colors.surface3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11 },
    actions: { flexDirection: "row-reverse", gap: 14, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10, flexWrap: "wrap" },
    actionBtn: { minWidth: 60 },
    action: { color: colors.muted, fontSize: 12 },
    total: { color: colors.muted, fontSize: 10, textAlign: "right" },
  }),
);
