import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, pickVideo, uploadMedia, type PickedMedia } from "@/lib/media";
import { errorMessage } from "@/lib/errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { StoryEditor, type StoryOverlay } from "@/components/story-editor";
import type { MentionUser } from "@/components/mention-suggest";
import { MusicPicker, type Track } from "@/components/music-picker";

type StoryDuration = 6 | 12 | 24 | 36 | 48;
const DURATIONS: StoryDuration[] = [6, 12, 24, 36, 48];
const AUDIENCES = [
  { key: "private", label: "لي أنا بس" },
  { key: "friends", label: "للأصدقاء" },
  { key: "friends_of_friends", label: "لأصدقاء الأصدقاء" },
  { key: "public", label: "للجميع" },
  { key: "except_friends", label: "للجميع ما عدا الأصدقاء" },
] as const;
type StoryAudience = (typeof AUDIENCES)[number]["key"];

/**
 * قصة جديدة — القسم 18 من دليل الهوية.
 * مدة البقاء 6/12/24/36/48 ساعة، فيديو بحد 90 ثانية، جمهور، ورفع حقيقي
 * لـ Supabase Storage ثم إدخال صف في `stories`. لا رسالة نجاح قبل نجاح الحفظ.
 */
export default function NewStoryScreen() {
  useThemeContext();
  const router = useRouter();
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState<StoryDuration>(24);
  const [audience, setAudience] = useState<StoryAudience>("friends");
  const [busy, setBusy] = useState(false);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [mentioned, setMentioned] = useState<MentionUser[]>([]);
  const [music, setMusic] = useState<Track | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  async function chooseImage() {
    const picked = await pickImage();
    if (picked) setMedia(picked);
  }

  async function chooseVideo() {
    const picked = await pickVideo();
    if (!picked) return;
    // حد المقطع في القصة: 90 ثانية
    if (picked.duration && picked.duration > 90) {
      Alert.alert("الفيديو طويل", "حد المقطع في القصة 90 ثانية. اختار مقطع أقصر.");
      return;
    }
    setMedia(picked);
  }

  async function publish() {
    if (busy) return;
    if (!media) {
      Alert.alert("محتاج محتوى", "اختار صورة أو فيديو للقصة الأول.");
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");

      const path = await uploadMedia(uid, media);
      const expires = new Date(Date.now() + duration * 3600 * 1000).toISOString();

      const isVideo = media.mime.startsWith("video");
      const baseRow = {
        user_id: uid,
        media_url: path,
        media_type: isVideo ? "video" : "image",
        caption: caption.trim(),
        audience,
        expires_at: expires,
      };
      const fullRow = {
        ...baseRow,
        // تبويب الفيديو بيعرض القصص العامة بس (بند 21 من الملاحظات)
        allow_in_video_tab: audience === "public",
        overlays: overlays as unknown as never,
        music: (music ? { ...music, filter } : filter ? { filter } : null) as unknown as never,
        mentions: mentioned.map((m) => ({ id: m.id, username: m.username, display_name: m.display_name })) as unknown as never,
      };
      let { data: story, error } = await supabase.from("stories").insert(fullRow).select("id").single();
      if (error && (error.code === "PGRST204" || error.code === "42703")) {
        // عمود ناقص في جدول stories على السيرفر — ننشر القصة بالأساسيات بدل ما النشر يفشل بالكامل
        ({ data: story, error } = await supabase.from("stories").insert(baseRow).select("id").single());
      }
      if (error) throw error;
      if (story?.id) {
        // المنشن في القصة: جدول story_mentions + إشعار لكل شخص
        const unique = Array.from(new Map(mentioned.map((m) => [m.id, m])).values());
        if (unique.length) {
          await supabase.from("story_mentions").insert(unique.map((m) => ({ story_id: story.id, mentioned_user_id: m.id })));
          await supabase.from("notifications").insert(
            unique
              .filter((m) => m.id !== uid)
              .map((m) => ({ recipient_id: m.id, actor_id: uid, kind: "mention", payload: { story: story.id, text: "ذكرك في قصة" } })),
          );
        }
      }

      Alert.alert("القصة اتنشرت", `هتفضل ظاهرة ${duration} ساعة.`);
      router.replace("/(tabs)/stories");
    } catch (e) {
      Alert.alert("النشر مش تم", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>قصة جديدة</Text>
          <Pressable onPress={publish} disabled={busy} hitSlop={10}>
            {busy ? (
              <ActivityIndicator color={colors.goldText} />
            ) : (
              <Text style={[styles.publish, !media && { opacity: 0.4 }]}>انشر</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 50 }}>
          <View style={styles.preview}>
            {media ? (
              <Image source={{ uri: media.uri }} style={styles.previewImg} resizeMode="cover" />
            ) : (
              <View style={styles.previewEmpty}>
                <Ionicons name="images-outline" size={40} color={colors.muted} />
                <Text style={styles.previewText}>اختار صورة أو مقطع</Text>
              </View>
            )}
          </View>

          <StoryEditor
            overlays={overlays}
            setOverlays={setOverlays}
            onMention={(u) => setMentioned((prev) => [...prev, u])}
            musicTitle={music?.title ?? null}
            filter={filter}
            setFilter={setFilter}
          />
          <View style={styles.mediaRow}>
            <Pressable style={styles.mediaBtn} onPress={chooseImage}>
              <Ionicons name="image-outline" size={20} color={colors.goldText} />
              <Text style={styles.mediaBtnText}>صورة</Text>
            </Pressable>
            <Pressable style={styles.mediaBtn} onPress={() => setMusicOpen(true)}>
              <Ionicons name="musical-notes-outline" size={20} color={colors.goldText} />
              <Text style={styles.mediaBtnText}>{music ? music.title.slice(0, 14) : "موسيقى"}</Text>
            </Pressable>
            <Pressable style={styles.mediaBtn} onPress={chooseVideo}>
              <Ionicons name="videocam-outline" size={20} color={colors.goldText} />
              <Text style={styles.mediaBtnText}>فيديو (٩٠ث)</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.caption}
            placeholder="اكتب حاجة على القصة…"
            placeholderTextColor={colors.muted}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={280}
          />

          <Text style={styles.label}>مدة البقاء</Text>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDuration(d)}
                style={[styles.chip, duration === d && styles.chipActive]}
              >
                <Text style={[styles.chipText, duration === d && styles.chipTextActive]}>
                  {d} ساعة
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>مين يشوفها</Text>
          <View style={styles.chips}>
            {AUDIENCES.map((a) => (
              <Pressable
                key={a.key}
                onPress={() => setAudience(a.key)}
                style={[styles.chip, audience === a.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, audience === a.key && styles.chipTextActive]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.hint}>
            القصة بتختفي لوحدها بعد المدة اللي اختارتها. عدد المشاهدين بيظهر ليك انت بس.
          </Text>
        </ScrollView>
        <MusicPicker visible={musicOpen} onClose={() => setMusicOpen(false)} onPick={(t) => { setMusic(t); setMusicOpen(false); }} />
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    publish: { color: colors.goldText, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    preview: { height: 320, borderRadius: 22, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    previewImg: { width: "100%", height: "100%" },
    previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    previewText: { color: colors.muted, fontSize: 13 },
    mediaRow: { flexDirection: "row-reverse", gap: 10 },
    mediaBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
    mediaBtnText: { color: colors.text, fontSize: 13 },
    caption: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, color: colors.text, fontSize: 15, minHeight: 70, textAlignVertical: "top", textAlign: "right", borderWidth: 1, borderColor: colors.border },
    label: { color: colors.muted, fontSize: 12, textAlign: "right" },
    chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
    chipText: { color: colors.text, fontSize: 13 },
    chipTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    hint: { color: colors.muted, fontSize: 11, textAlign: "right", lineHeight: 17 },
  }),
);
