import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, RecordingPresets } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { ScreenShell, Avatar, VerificationBadge } from "@/components/wanas-ui";
import { PostCard, type FeedPost } from "@/components/post-card";
import { StickerPicker } from "@/components/sticker-picker";
import { GifPicker } from "@/components/gif-picker";
import { VoiceNote } from "@/components/voice-note";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, pickVideo, publicMediaUrl, signedMediaUrl, type PickedMedia } from "@/lib/media";
import { uploadWithProgress } from "@/lib/upload";
import { sendGift } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body: string | null;
  audio_path: string | null;
  sticker_url: string | null;
  image_url: string | null;
  video_url: string | null;
  gif_url: string | null;
  created_at: string;
  profiles?: { username: string; display_name: string | null; is_verified: boolean | null } | null;
  stickerSrc?: string | null;
};

type MentionUser = { id: string; username: string; display_name: string | null };

const GIFTS = [1, 5, 10, 25, 50, 100];

function VideoComment({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.commentVideoBox}>
      <VideoView player={player} style={styles.commentVideo} contentFit="cover" nativeControls />
    </View>
  );
}

/**
 * المنشور وتعليقاته — صفحة التعليقات الكاملة:
 * نص · صوت بالمايك · ستيكر · صورة · فيديو · GIF · ردود متداخلة · منشن لأي مستخدم.
 * حقل الكتابة ملتصق بالكيبورد (KeyboardAvoidingView) وتعليقات صاحب المنشور
 * يتيمه من قائمة ⋯ بتقفل الكتابة فعلًا.
 */
export default function PostDetailScreen() {
  useThemeContext();
  const { id, comment: targetComment, reply: replyFlag } = useLocalSearchParams<{ id: string; comment?: string; reply?: string }>();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const commentY = useRef<Record<string, number>>({});
  const didJump = useRef(false);
  const router = useRouter();
  const [post, setPost] = useState<(FeedPost & { allow_comments?: boolean | null }) | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftBusy, setGiftBusy] = useState<number | null>(null);
  const [gifts, setGifts] = useState<{ id: string; amount: number; note: string | null }[]>([]);
  const [recording, setRecording] = useState(false);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [pickedMedia, setPickedMedia] = useState<PickedMedia | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (!id) return;
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);

      const { data: p, error: pe } = await supabase
        .from("posts")
        .select("id, author_id, body, media_type, media_url, music, created_at, likes_count, comments_count, allow_comments, profiles!posts_author_id_fkey(username, display_name, is_verified, verification_tone)")
        .eq("id", id)
        .maybeSingle();
      if (pe) throw pe;
      setPost((p ?? null) as unknown as FeedPost);

      const { data: c, error: ce } = await supabase
        .from("comments")
        .select("id, post_id, parent_id, author_id, body, audio_path, sticker_url, image_url, video_url, gif_url, created_at, profiles!comments_author_id_fkey(username, display_name, is_verified)")
        .eq("post_id", id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (ce) throw ce;
      const rows = (c ?? []) as unknown as Comment[];
      setComments(
        await Promise.all(
          rows.map(async (row) => ({
            ...row,
            stickerSrc: row.sticker_url ? (row.sticker_url.startsWith("http") ? row.sticker_url : await signedMediaUrl(row.sticker_url, 3600)) : null,
          })),
        ),
      );

      const { data: g } = await supabase.from("gifts").select("id, amount, note").eq("post_id", id).limit(50);
      setGifts((g ?? []) as { id: string; amount: number; note: string | null }[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل المنشور");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  /** منشن: أول ما تكتب @ بنجيب مستخدمين حقيقيين من قاعدة البيانات. */
  useEffect(() => {
    const m = draft.match(/@([\p{L}\p{N}_]{0,20})$/u);
    if (!m) {
      const clear = setTimeout(() => setMentions([]), 0);
      return () => clearTimeout(clear);
    }
    const term = m[1];
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .or(`username.ilike.${term}%,display_name.ilike.${term}%`)
        .limit(6);
      setMentions((data ?? []) as MentionUser[]);
    }, 250);
    return () => clearTimeout(t);
  }, [draft]);

  function insertMention(u: MentionUser) {
    setDraft((d) => d.replace(/@([\p{L}\p{N}_]{0,20})$/u, `@${u.username} `));
    setMentions([]);
  }

  async function saveMentionRows(commentId: string, text: string) {
    const handles = Array.from(text.matchAll(/@([A-Za-z0-9_]{3,30})/g)).map((m) => m[1]);
    if (!handles.length) return;
    const { data: users } = await supabase.from("profiles").select("id, username").in("username", Array.from(new Set(handles)));
    if (!users?.length) return;
    await supabase.from("comment_mentions").upsert(
      users.map((u) => ({ comment_id: commentId, mentioned_user_id: u.id as string })),
      { onConflict: "comment_id,mentioned_user_id" },
    );
    const uid = me;
    if (uid) {
      await supabase.from("notifications").insert(
        users
          .filter((u) => u.id !== uid)
          .map((u) => ({
            recipient_id: u.id,
            actor_id: uid,
            kind: "mention",
            payload: { post_id: id, comment_id: commentId, text: text.slice(0, 120) },
          })),
      );
    }
  }

  async function insertComment(payload: Partial<Comment>) {
    if (!me || !id) return;
    setSending(true);
    try {
      const { data: inserted, error: err } = await supabase
        .from("comments")
        .insert({ post_id: id, author_id: me, parent_id: replyTo?.id ?? null, ...payload })
        .select("id")
        .single();
      if (err) throw err;
      if (inserted?.id && payload.body) await saveMentionRows(inserted.id as string, payload.body);
      setDraft("");
      setPickedMedia(null);
      setReplyTo(null);
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
    } catch (e) {
      Alert.alert("التعليق مش اتحفظ", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !pickedMedia) || sending) return;
    if (pickedMedia) {
      setSending(true);
      try {
        const path = await uploadWithProgress(me!, pickedMedia);
        const isVideo = pickedMedia.mime.startsWith("video");
        const isImage = pickedMedia.mime.startsWith("image");
        await insertComment({
          body: body || null,
          image_url: isImage ? path : null,
          video_url: isVideo ? path : null,
        });
      } catch (e) {
        Alert.alert("المرفق مش اتبعت", e instanceof Error ? e.message : "جرّب تاني");
      } finally {
        setSending(false);
      }
      return;
    }
    await insertComment({ body });
  }

  async function attach(kind: "image" | "video") {
    const picked = kind === "image" ? await pickImage() : await pickVideo();
    if (!picked) return;
    if (kind === "video" && picked.duration && picked.duration > 90) {
      Alert.alert("الفيديو طويل", "حد مقطع التعليق 90 ثانية.");
      return;
    }
    setPickedMedia(picked);
  }

  async function startRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الميكروفون مقفول", "اسمح بالوصول للميكروفون عشان تبعت تعليق صوتي.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  async function stopRecording(sendIt: boolean) {
    await recorder.stop();
    setRecording(false);
    const uri = recorder.uri;
    if (!sendIt || !uri || !me) return;
    setSending(true);
    try {
      const path = await uploadWithProgress(me, { uri, name: `comment-${Date.now()}.m4a`, mime: "audio/mp4", kind: "audio" });
      await insertComment({ audio_path: path });
    } catch (e) {
      Alert.alert("التعليق الصوتي مش اتبعت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setSending(false);
    }
  }

  async function giveGift(amount: number) {
    if (!post || !me) return;
    setGiftBusy(amount);
    try {
      await sendGift({ senderId: me, recipientId: post.author_id, postId: post.id, amount, note: `هدية ونس على منشور` });
      setGiftOpen(false);
      Alert.alert("اتبعتت الهدية 🎁", `${amount} نقطة ونس وصلت لصاحب المنشور.`);
      await load();
    } catch (e) {
      Alert.alert("الهدية مش اتبعتت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setGiftBusy(null);
    }
  }

  function remove(c: Comment) {
    Alert.alert("حذف التعليق", "متأكد؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احذف",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await supabase.from("comments").delete().eq("id", c.id);
          if (err) return Alert.alert("مش تم", err.message);
          setComments((prev) => prev.filter((x) => x.id !== c.id));
        },
      },
    ]);
  }

  const locked = post?.allow_comments === false;
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
        <View style={styles.topBar}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)"))} hitSlop={12} accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>المنشور والتعليقات</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {loading && <ActivityIndicator color={colors.goldText} />}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!post && <PostCard post={post} />}

          {!!post && post.author_id !== me && (
            <Pressable style={styles.giftBtn} onPress={() => setGiftOpen(true)}>
              <Text style={styles.giftEmoji}>🎁</Text>
              <Text style={styles.giftText}>ابعت هدية نقاط ونس لصاحب المنشور</Text>
            </Pressable>
          )}
          {gifts.length > 0 && (
            <Text style={styles.giftsLine}>
              🎁 {gifts.length} هدية · {gifts.reduce((s, g) => s + Number(g.amount), 0)} نقطة ونس
            </Text>
          )}

          <Text style={styles.section}>التعليقات ({comments.length})</Text>
          {locked && <Text style={styles.locked}>صاحب المنشور قفل التعليقات.</Text>}
          {comments.length === 0 && !loading && <Text style={styles.empty}>مفيش تعليقات — كن أول واحد.</Text>}

          {roots.map((c) => (
            <View
              key={c.id}
              style={{ gap: 6 }}
              onLayout={(e) => {
                commentY.current[c.id] = e.nativeEvent.layout.y;
                for (const r of repliesOf(c.id)) commentY.current[r.id] = e.nativeEvent.layout.y;
                if (targetComment && !didJump.current && commentY.current[targetComment] !== undefined) {
                  didJump.current = true;
                  const y = commentY.current[targetComment];
                  setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: true }), 120);
                  setHighlightId(targetComment);
                  setTimeout(() => setHighlightId(null), 3000);
                  if (replyFlag === "1") {
                    const root = comments.find((x) => x.id === targetComment);
                    if (root) setReplyTo(roots.find((rt) => rt.id === root.id || rt.id === (root as { parent_id?: string | null }).parent_id) ?? root);
                  }
                }
              }}
            >
              <CommentRow
                c={c}
                highlight={highlightId === c.id}
                mine={me}
                onReply={() => setReplyTo(c)}
                onLongPress={() => c.author_id === me && remove(c)}
                onAuthor={() => router.push({ pathname: "/user/[id]", params: { id: c.author_id } })}
              />
              {repliesOf(c.id).map((r) => (
                <View key={r.id} style={{ marginRight: 26 }}>
                  <CommentRow
                    c={r}
                    highlight={highlightId === r.id}
                    mine={me}
                    onReply={() => setReplyTo(c)}
                    onLongPress={() => r.author_id === me && remove(r)}
                    onAuthor={() => router.push({ pathname: "/user/[id]", params: { id: r.author_id } })}
                  />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        {!locked && (
          <View style={styles.composerWrap}>
            {!!replyTo && (
              <View style={styles.replyBar}>
                <Text style={styles.replyText} numberOfLines={1}>
                  بترد على {replyTo.profiles?.display_name ?? replyTo.profiles?.username ?? "تعليق"}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
            )}
            {!!mentions.length && (
              <View style={styles.mentionBox}>
                {mentions.map((u) => (
                  <Pressable key={u.id} style={styles.mentionRow} onPress={() => insertMention(u)}>
                    <Avatar initial={(u.display_name ?? u.username)[0]} color={colors.surface3} size={24} />
                    <Text style={styles.mentionName}>{u.display_name ?? u.username}</Text>
                    <Text style={styles.mentionHandle}>@{u.username}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {!!pickedMedia && (
              <View style={styles.pickedRow}>
                {pickedMedia.mime.startsWith("image") ? (
                  <Image source={{ uri: pickedMedia.uri }} style={styles.pickedThumb} />
                ) : (
                  <Ionicons name="videocam" size={20} color={colors.goldText} />
                )}
                <Text style={styles.pickedName} numberOfLines={1}>{pickedMedia.name}</Text>
                <Pressable onPress={() => setPickedMedia(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
            )}
            {recording ? (
              <View style={styles.recordingBar}>
                <Text style={styles.recText}>بتسجل… {Math.floor((recState.durationMillis ?? 0) / 1000)} ث</Text>
                <Pressable style={styles.cancelRec} onPress={() => stopRecording(false)} accessibilityLabel="إلغاء التسجيل">
                  <Ionicons name="trash" size={16} color={colors.red} />
                </Pressable>
                <Pressable style={styles.send} onPress={() => stopRecording(true)} accessibilityLabel="ابعت الصوت">
                  <Ionicons name="send" size={18} color={colors.ink} />
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.toolsRow}>
                  <Pressable style={styles.toolBtn} onPress={() => setStickerOpen(true)} accessibilityLabel="ستيكر">
                    <Ionicons name="happy-outline" size={20} color={colors.goldText} />
                    <Text style={styles.toolText}>ستيكر</Text>
                  </Pressable>
                  <Pressable style={styles.toolBtn} onPress={() => setGifOpen(true)} accessibilityLabel="GIF">
                    <Ionicons name="images-outline" size={20} color={colors.goldText} />
                    <Text style={styles.toolText}>GIF</Text>
                  </Pressable>
                  <Pressable style={styles.toolBtn} onPress={() => attach("image")} accessibilityLabel="صورة">
                    <Ionicons name="image-outline" size={20} color={colors.goldText} />
                    <Text style={styles.toolText}>صورة</Text>
                  </Pressable>
                  <Pressable style={styles.toolBtn} onPress={() => attach("video")} accessibilityLabel="فيديو">
                    <Ionicons name="videocam-outline" size={20} color={colors.goldText} />
                    <Text style={styles.toolText}>فيديو</Text>
                  </Pressable>
                  <Pressable style={styles.toolBtn} onPress={startRecording} accessibilityLabel="تعليق صوتي">
                    <Ionicons name="mic-outline" size={20} color={colors.goldText} />
                    <Text style={styles.toolText}>صوت</Text>
                  </Pressable>
                </View>
                <View style={styles.composer}>
                  <TextInput
                    style={styles.input}
                    placeholder="اكتب تعليقك… و @ لمنشن"
                    placeholderTextColor={colors.muted}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={1000}
                    textAlign="right"
                  />
                  <Pressable style={[styles.send, (!draft.trim() && !pickedMedia) || sending ? { opacity: 0.5 } : null]} onPress={send} disabled={sending} accessibilityLabel="إرسال">
                    {sending ? <ActivityIndicator color={colors.ink} size="small" /> : <Ionicons name="send" size={18} color={colors.ink} />}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <StickerPicker
        visible={stickerOpen}
        onClose={() => setStickerOpen(false)}
        onPick={(s) => {
          setStickerOpen(false);
          void insertComment({ sticker_url: s.image_path });
        }}
      />
      <GifPicker visible={gifOpen} onClose={() => setGifOpen(false)} onPick={(url) => void insertComment({ gif_url: url })} />

      <Modal visible={giftOpen} transparent animationType="fade" onRequestClose={() => setGiftOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGiftOpen(false)}>
          <View style={styles.giftSheet}>
            <Text style={styles.giftTitle}>اختار قيمة الهدية</Text>
            <View style={styles.giftGrid}>
              {GIFTS.map((g) => (
                <Pressable key={g} style={styles.giftCell} onPress={() => giveGift(g)} disabled={giftBusy !== null}>
                  {giftBusy === g ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.giftCellText}>{g}</Text>}
                </Pressable>
              ))}
            </View>
            <Text style={styles.giftHint}>1 نقطة = 0.05 جنيه تتحسب لصاحب المنشور فورًا في نظام الربح.</Text>
          </View>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function CommentRow({
  c,
  onReply,
  onLongPress,
  onAuthor,
  highlight,
}: {
  highlight?: boolean;
  c: Comment;
  mine: string | null;
  onReply: () => void;
  onLongPress: () => void;
  onAuthor: () => void;
}) {
  const imageUrl = c.image_url ? publicMediaUrl(c.image_url) : null;
  const videoUrl = c.video_url ? publicMediaUrl(c.video_url) : null;
  return (
    <Pressable style={[styles.comment, highlight && { borderColor: colors.goldText, backgroundColor: colors.goldSoft }]} onLongPress={onLongPress}>
      <Pressable onPress={onAuthor} hitSlop={6}>
        <Avatar initial={(c.profiles?.display_name ?? c.profiles?.username ?? "و")[0]} color={colors.surface3} size={34} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.author} onPress={onAuthor}>
            {c.profiles?.display_name ?? c.profiles?.username ?? "مستخدم"}
          </Text>
          {c.profiles?.is_verified && <VerificationBadge tone="yellow" small />}
          <Text style={styles.time}>{new Date(c.created_at).toLocaleString("ar-EG-u-nu-latn")}</Text>
        </View>
        {!!c.body && <MentionText text={c.body} />}
        {!!c.stickerSrc && <Image source={{ uri: c.stickerSrc }} style={styles.sticker} resizeMode="contain" />}
        {!!imageUrl && <Image source={{ uri: imageUrl }} style={styles.commentImage} resizeMode="cover" />}
        {!!videoUrl && <VideoComment url={videoUrl} />}
        {!!c.gif_url && <Image source={{ uri: c.gif_url }} style={styles.commentGif} resizeMode="cover" />}
        {!!c.audio_path && (
          <View style={{ marginTop: 6 }}>
            <VoiceNote path={c.audio_path} label="تعليق صوتي" />
          </View>
        )}
        <Pressable onPress={onReply} hitSlop={6} style={{ marginTop: 4 }}>
          <Text style={styles.replyAction}>رد</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** بيعرض @الاسم بلون ذهبي ويدوس عليه يفتح الملف الشخصي. */
function MentionText({ text }: { text: string }) {
  const router = useRouter();
  const parts = text.split(/(@[A-Za-z0-9_]{3,30})/g);
  return (
    <Text style={styles.body}>
      {parts.map((part, i) =>
        /^@[A-Za-z0-9_]{3,30}$/.test(part) ? (
          <Text
            key={`${part}-${i}`}
            style={styles.mention}
            onPress={async () => {
              const { data } = await supabase.from("profiles").select("id").eq("username", part.slice(1)).maybeSingle();
              if (data?.id) router.push({ pathname: "/user/[id]", params: { id: data.id as string } });
            }}
          >
            {part}
          </Text>
        ) : (
          <Text key={`t-${i}`}>{part}</Text>
        ),
      )}
    </Text>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    section: { color: colors.muted, fontSize: 12, textAlign: "right" },
    locked: { color: colors.muted, fontSize: 12, textAlign: "center" },
    comment: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" },
    author: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    time: { color: colors.muted, fontSize: 9.5 },
    body: { color: colors.text, fontSize: 13.5, textAlign: "right", marginTop: 3, lineHeight: 20 },
    mention: { color: colors.goldText, fontFamily: "Cairo_700Bold" },
    sticker: { width: 96, height: 96, marginTop: 6, alignSelf: "flex-end" },
    commentImage: { width: "100%", height: 180, borderRadius: 12, marginTop: 6 },
    commentGif: { width: 200, height: 150, borderRadius: 12, marginTop: 6, alignSelf: "flex-end" },
    commentVideoBox: { width: "100%", aspectRatio: 16 / 10, borderRadius: 12, overflow: "hidden", marginTop: 6, backgroundColor: "#000" },
    commentVideo: { width: "100%", height: "100%" },
    replyAction: { color: colors.goldText, fontSize: 11 },
    empty: { color: colors.muted, fontSize: 12, textAlign: "center" },
    error: { color: colors.red, fontSize: 12, textAlign: "center" },
    composerWrap: { borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background },
    toolsRow: { flexDirection: "row-reverse", gap: 6, paddingHorizontal: 10, paddingTop: 8, flexWrap: "wrap" },
    toolBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    toolText: { color: colors.text, fontSize: 11 },
    composer: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 6, padding: 10 },
    input: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 14, maxHeight: 110, textAlign: "right", borderWidth: 1, borderColor: colors.border },
    send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    replyBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 8 },
    replyText: { color: colors.muted, fontSize: 11.5, flex: 1, textAlign: "right" },
    mentionBox: { backgroundColor: colors.surface, marginHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    mentionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
    mentionName: { color: colors.text, fontSize: 12.5, flex: 1, textAlign: "right" },
    mentionHandle: { color: colors.muted, fontSize: 11 },
    pickedRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginHorizontal: 10, marginTop: 8, padding: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    pickedThumb: { width: 36, height: 36, borderRadius: 8 },
    pickedName: { color: colors.text, fontSize: 11.5, flex: 1, textAlign: "right" },
    recordingBar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12 },
    recText: { color: colors.red, fontSize: 13, flex: 1, textAlign: "right" },
    cancelRec: { padding: 10 },
    giftBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.goldSoft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.gold },
    giftEmoji: { fontSize: 18 },
    giftText: { color: colors.goldText, fontSize: 12.5, flex: 1, textAlign: "right" },
    giftsLine: { color: colors.muted, fontSize: 11, textAlign: "right" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 24 },
    giftSheet: { backgroundColor: colors.background, borderRadius: 22, padding: 18, gap: 12, width: "100%" },
    giftTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    giftGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
    giftCell: { width: 60, height: 52, borderRadius: 14, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    giftCellText: { color: colors.ink, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    giftHint: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
  }),
);
