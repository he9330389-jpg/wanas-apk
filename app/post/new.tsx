import React, { useEffect, useState } from "react";
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
import { ScreenShell, Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickAudio, pickFile, pickImage, pickVideo, type PickedMedia } from "@/lib/media";
import { MentionSuggest, type MentionUser } from "@/components/mention-suggest";
import { MusicPicker, type Track } from "@/components/music-picker";
import { uploadWithProgress } from "@/lib/upload";
import { setUploadStatus } from "@/lib/upload-status";
import * as Notifications from "expo-notifications";
import { FilterLayers, FilterPicker, type FilterStrength } from "@/components/media-filters";
import { CardStylePicker, TextCard } from "@/components/text-cards";
import { FeelingsSheet } from "@/components/feelings-sheet";
import { errorMessage } from "@/lib/errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** الجمهور — الدليل: الكل · المتابعين · الأصدقاء · أصدقاء الأصدقاء · الجميع ما عدا الأصدقاء · أنا بس. */
const AUDIENCES = [
  { key: "public", label: "الكل", icon: "earth-outline" },
  { key: "followers", label: "المتابعين", icon: "people-outline" },
  { key: "friends", label: "الأصدقاء", icon: "people-circle-outline" },
  { key: "friends_of_friends", label: "أصدقاء الأصدقاء", icon: "git-network-outline" },
  { key: "except_friends", label: "الجميع ما عدا الأصدقاء", icon: "person-remove-outline" },
  { key: "private", label: "أنا بس", icon: "lock-closed-outline" },
] as const;
type AudienceKey = (typeof AUDIENCES)[number]["key"];

const MAX_CHARS = 5000;
const MAX_AUDIO_SECONDS = 300;

type Stage = "idle" | "uploading" | "saving" | "done";

function mediaKind(mime: string): string {
  if (mime.startsWith("video")) return "video";
  if (mime.startsWith("audio")) return "audio";
  if (mime.startsWith("image")) return "image";
  return "file";
}

/**
 * منشور جديد — القسم 17: نص لحد 5000 حرف، صورة/فيديو/PDF/صوت (رفع من الموبايل أو تسجيل مباشر)،
 * جمهور كامل، وتعليقات مفتوحة/مقفولة. الرفع بيوري نسبة مئوية فعلية، ورسالة «تم النشر» مش
 * بتظهر غير بعد ما الملف يتّرفع فعلًا والصف يتحفظ في `posts`.
 */
/** قوالب كتابة جاهزة للمنشورات (زي إنستجرام/فيسبوك) — المستخدم يقدر يعدّلها قبل النشر. */
const POST_TEMPLATES: { key: string; title: string; body: string }[] = [
  { key: "greet", title: "سلام الصبح", body: "صباح الونس ☀️\nالنهارده يوم جديد، ابدأه بضحكة." },
  { key: "ask", title: "سؤال للناس", body: "سؤال للونسة: إيه أحلى حاجة حصلتلك النهارده؟ 👇" },
  { key: "quote", title: "اقتباس", body: "«الونس مش كلام… الونس إن حد يسمعك.»" },
  { key: "celebrate", title: "مناسبة", body: "النهارده مناسبة حلوة 🎉 — شاركوني الفرحة بالدعاء." },
  { key: "thanks", title: "شكر", body: "شكرًا لكل واحد كان سبب في يوم أحسن 🤍" },
  { key: "idea", title: "فكرة", body: "عندي فكرة جديدة وعايز رأيكم فيها…" },
];
export default function NewPostScreen() {
  useThemeContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ media?: string; mode?: string; focus?: string }>();
  const [dlScope, setDlScope] = useState<"all" | "friends" | "me">("all");
  const [cardStyle, setCardStyle] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<string | null>(null);
  const [filterStrength, setFilterStrength] = useState<FilterStrength>(2);
  const [feelingsOpen, setFeelingsOpen] = useState(false);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<MentionUser[]>([]);
  const [music, setMusic] = useState<Track | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [audience, setAudience] = useState<AudienceKey>("public");
  const [allowComments, setAllowComments] = useState(true);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [recOpen, setRecOpen] = useState(false);

  const mentionQuery = (body.match(/@([\p{L}\p{N}_]{0,20})$/u) ?? [])[1] ?? "";
  const showMentions = /@[\p{L}\p{N}_]{0,20}$/u.test(body) && stage === "idle";
  function pickMention(u: MentionUser) {
    setBody((b) => b.replace(/@([\p{L}\p{N}_]{0,20})$/u, `@${u.username} `));
    setMentioned((prev) => (prev.some((m) => m.id === u.id) ? prev : [...prev, u]));
  }
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: p } = await supabase.from("profiles").select("username, display_name, default_audience").eq("id", uid).maybeSingle();
      setMe({ id: uid, name: p?.display_name ?? p?.username ?? "أنت" });
      const pref = p?.default_audience as AudienceKey | undefined;
      if (pref && AUDIENCES.some((a) => a.key === pref)) setAudience(pref);
    })();
  }, []);

  useEffect(() => {
    // الأزرار اللي جاية من الرئيسية: صورة (+) / لايف / منشن / شعور (بند 15)
    const t = setTimeout(() => {
      if (params.media === "image") void attach("image");
      if (params.mode === "live") {
        router.replace("/live/new" as never);
      }
      if (params.focus === "mention") setBody((b) => (b ? `${b} @` : "@"));
      if (params.focus === "feeling") {
        setFeelingsOpen(true);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.media, params.mode, params.focus]);
  async function attach(kind: "image" | "video" | "file" | "audio") {
    const picked =
      kind === "image" ? await pickImage()
      : kind === "video" ? await pickVideo()
      : kind === "audio" ? await pickAudio()
      : await pickFile();
    if (!picked) return;
    if (kind === "file" && !/pdf|word|text/.test(picked.mime)) {
      Alert.alert("نوع الملف مش مدعوم", "الملفات المدعومة: PDF و Word ونصوص. للصوت استخدم «صوت من الجهاز».");
      return;
    }
    if (kind === "audio" && !picked.mime.startsWith("audio/")) {
      Alert.alert("مش ملف صوتي", "اختار ملف صوتي (mp3 أو m4a أو wav أو aac).");
      return;
    }
    setError(null);
    setMedia(picked);
  }

  async function startRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الميكروفون مقفول", "لازم تسمح بالوصول للميكروفون عشان تسجل صوتك.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording() {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setMedia({ uri, name: `voice-${Date.now()}.m4a`, mime: "audio/mp4", kind: "audio" });
    setRecOpen(false);
  }

  const publish = async () => {
    if (stage !== "idle" && stage !== "done") return;
    if (!body.trim() && !media) {
      Alert.alert("المنشور فاضي", "اكتب حاجة أو ضيف مرفق الأول.");
      return;
    }
    if (!me) {
      Alert.alert("محتاج تسجيل دخول", "سجّل دخولك الأول عشان تنشر.");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      if (media) {
        setStage("uploading");
        setUploadStatus({ state: "uploading", percent: 0, kind: mediaKind(media.mime) });
        mediaUrl = await uploadWithProgress(me.id, media, (p) => {
          setProgress(p);
          setUploadStatus({ percent: p });
        });
        mediaType = mediaKind(media.mime);
      }
      setStage("saving");
      setUploadStatus({ state: "saving", percent: 100 });
      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert({
          author_id: me.id,
          body: feeling ? `— بيحس إنه ${feeling} —\n${body.trim()}`.trim() : body.trim(),
          media_url: mediaUrl,
          media_type: mediaType,
          audience,
          allow_comments: allowComments,
          music: (music || mediaFilter || (cardStyle && !media) || (media && dlScope !== "all") ? { ...(music ?? {}), ...(media && dlScope !== "all" ? { dl: dlScope } : {}), ...(mediaFilter ? { filter: mediaFilter, strength: filterStrength } : {}), ...(cardStyle && !media ? { card: cardStyle } : {}) } : null) as unknown as never,
          mentions: mentioned.map((m) => ({ id: m.id, username: m.username, display_name: m.display_name })) as unknown as never,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (!inserted?.id) throw new Error("المنشور مش اتسجل");
      if (mentioned.length) {
        // إشعار لكل شخص اتعمله منشن في العنوان
        await supabase.from("notifications").insert(
          mentioned
            .filter((m) => m.id !== me.id)
            .map((m) => ({ recipient_id: m.id, actor_id: me.id, kind: "mention", payload: { post: inserted.id, text: body.slice(0, 120) } })),
        );
      }
      setStage("done");
      setUploadStatus({ state: "done", percent: 100 });
      // إشعار على الموبايل بعد النشر الفعلي (مش قبل الحفظ)
      void Notifications.scheduleNotificationAsync({
        content: {
          title: "تم النشر ✅",
          body: media
            ? media.mime.startsWith("video")
              ? "الفيديو اترفع وظهر أول حاجة في آخر الأخبار."
              : media.mime.startsWith("audio")
                ? "المنشور الصوتي اترفع وظهر أول حاجة في آخر الأخبار."
                : media.mime.startsWith("image")
                  ? "الصورة اترفعت وظهرت أول حاجة في آخر الأخبار."
                  : "الملف اترفع وظهر أول حاجة في آخر الأخبار."
            : "منشورك ظهر أول حاجة في آخر الأخبار.",
        },
        trigger: null,
      }).catch(() => undefined);
    } catch (e) {
      setStage("idle");
      setUploadStatus({ state: "idle", percent: 0 });
      setError(errorMessage(e, "النشر مش تم — جرّب تاني"));
    }
  };

  const remaining = MAX_CHARS - body.length;
  const audienceLabel = AUDIENCES.find((a) => a.key === audience)?.label ?? "الكل";
  const busy = stage === "uploading" || stage === "saving";

  if (stage === "done") {
    return (
      <ScreenShell>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={colors.ink} />
          </View>
          <Text style={styles.successTitle}>تم النشر</Text>
          <Text style={styles.successSub}>
            {media
              ? media.mime.startsWith("video")
                ? "الفيديو اترفع وظهر أول حاجة في آخر الأخبار."
                : media.mime.startsWith("audio")
                  ? "المنشور الصوتي اترفع وظهر أول حاجة في آخر الأخبار."
                  : media.mime.startsWith("image")
                    ? "الصورة اترفعت وظهرت أول حاجة في آخر الأخبار."
                    : "الملف اترفع وظهر أول حاجة في آخر الأخبار."
              : "المنشور ظهر أول حاجة في آخر الأخبار."}
          </Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.primaryText}>روح للأخبار</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} disabled={busy}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>منشور جديد</Text>
          <Pressable onPress={publish} disabled={busy} style={[styles.publishBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.publishText}>انشر</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={styles.authorRow}>
            <Avatar initial={(me?.name ?? "و")[0]} color={colors.surface3} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>{me?.name ?? "—"}</Text>
              <Pressable style={styles.audienceBtn} onPress={() => setAudienceOpen(true)}>
                <Ionicons name="earth-outline" size={13} color={colors.goldText} />
                <Text style={styles.audienceBtnText}>{audienceLabel}</Text>
                <Ionicons name="chevron-down" size={13} color={colors.goldText} />
              </Pressable>
            </View>
          </View>

          {!!feeling && (
            <View style={styles.feelingChip}>
              <Text style={styles.feelingText}>بيحس إنه {feeling}</Text>
              <Pressable onPress={() => setFeeling(null)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.muted} />
              </Pressable>
            </View>
          )}
          {showMentions && (
            <MentionSuggest query={mentionQuery} visible title="منشن لحد في العنوان" onPick={pickMention} />
          )}
          <TextInput
            style={styles.input}
            placeholder="هتونسنا النهارده بإيه؟"
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={MAX_CHARS}
            textAlignVertical="top"
            editable={!busy}
          />
          <Text style={[styles.counter, remaining < 200 && { color: colors.red }]}>{remaining} حرف متبقي</Text>
          <View style={styles.extraRow}>
            <Pressable style={styles.extraChip} onPress={() => setTemplatesOpen((v) => !v)}>
              <Ionicons name="albums-outline" size={15} color={colors.goldText} />
              <Text style={styles.extraText}>قوالب كتابة</Text>
            </Pressable>
            <Pressable style={styles.extraChip} onPress={() => setMusicOpen(true)}>
              <Ionicons name="musical-notes-outline" size={15} color={colors.goldText} />
              <Text style={styles.extraText}>{music ? music.title.slice(0, 16) : "موسيقى للمنشور"}</Text>
            </Pressable>
            {!!music && (
              <Pressable style={styles.extraChip} onPress={() => setMusic(null)}>
                <Ionicons name="close" size={14} color={colors.muted} />
                <Text style={styles.extraText}>شيل الموسيقى</Text>
              </Pressable>
            )}
          </View>
          {templatesOpen && (
            <View style={styles.templatesBox}>
              {POST_TEMPLATES.map((tp) => (
                <Pressable
                  key={tp.key}
                  style={styles.templateCard}
                  onPress={() => {
                    setBody((b) => (b.trim() ? `${b}\n\n${tp.body}` : tp.body));
                    setTemplatesOpen(false);
                  }}
                >
                  <Text style={styles.templateTitle}>{tp.title}</Text>
                  <Text numberOfLines={2} style={styles.templatePreview}>{tp.body}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {!media && (
            <View style={{ gap: 10 }}>
              <CardStylePicker value={cardStyle} onChange={setCardStyle} />
              {!!cardStyle && <TextCard text={body} styleKey={cardStyle} compact />}
            </View>
          )}

          {!!media && (
            <View style={styles.mediaCard}>
              {media.mime.startsWith("image") ? (
                <View>
                  <Image source={{ uri: media.uri }} style={styles.mediaImg} resizeMode="cover" />
                  <FilterLayers filter={mediaFilter} strength={filterStrength} />
                </View>
              ) : (
                <View style={styles.fileRow}>
                  <Ionicons
                    name={media.mime.startsWith("video") ? "videocam" : media.mime.startsWith("audio") ? "mic" : "document-text"}
                    size={26}
                    color={colors.goldText}
                  />
                  <Text numberOfLines={1} style={styles.fileName}>{media.name}</Text>
                </View>
              )}
              <View style={{ paddingHorizontal: 10, paddingTop: 10, gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "right" }}>مين يقدر ينزّل المحتوى ده؟</Text>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {([["all", "الجميع"], ["friends", "الأصدقاء"], ["me", "أنا بس"]] as const).map(([k, label]) => (
                    <Pressable key={k} onPress={() => setDlScope(k)} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: dlScope === k ? colors.goldText : colors.border, backgroundColor: dlScope === k ? colors.gold : colors.surface3 }}>
                      <Text style={{ color: dlScope === k ? colors.ink : colors.text, fontSize: 12, fontWeight: dlScope === k ? "bold" : "normal" }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {(media.mime.startsWith("image") || media.mime.startsWith("video")) && (
                <View style={{ padding: 10 }}>
                  <FilterPicker value={mediaFilter} strength={filterStrength} onChange={setMediaFilter} onStrength={setFilterStrength} />
                </View>
              )}
              {!busy && (
                <Pressable style={styles.removeMedia} onPress={() => setMedia(null)}>
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              )}
            </View>
          )}

          {busy && (
            <View style={styles.progressCard}>
              <View style={styles.progressHead}>
                <Text style={styles.progressLabel}>
                  {stage === "uploading" ? `جاري تحميل منشورك… ${progress}%` : "بنسجل المنشور…"}
                </Text>
                <ActivityIndicator size="small" color={colors.goldText} />
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${stage === "saving" ? 100 : progress}%` }]} />
              </View>
            </View>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.tools}>
            <Tool icon="image-outline" label="صورة" onPress={() => attach("image")} disabled={busy} />
            <Tool icon="videocam-outline" label="فيديو" onPress={() => attach("video")} disabled={busy} />
            <Tool icon="document-outline" label="PDF/ملف" onPress={() => attach("file")} disabled={busy} />
            <Tool icon="mic-outline" label="سجّل صوت" onPress={() => setRecOpen(true)} disabled={busy} />
            <Tool icon="musical-notes-outline" label="صوت من الجهاز" onPress={() => attach("audio")} disabled={busy} />
            <Tool
              icon={allowComments ? "chatbubbles-outline" : "chatbubble-ellipses-outline"}
              label={allowComments ? "التعليقات مفتوحة" : "التعليقات مقفولة"}
              onPress={() => setAllowComments((v) => !v)}
              disabled={busy}
              active={allowComments}
            />
          </View>

          <Text style={styles.hint}>
            المرفق بيتّرفع فعليًا على التخزين الخاص قبل النشر، ورسالة النجاح بتظهر بس بعد حفظ المنشور.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* اختيار الجمهور */}
      <MusicPicker visible={musicOpen} onClose={() => setMusicOpen(false)} onPick={(t) => { setMusic(t); setMusicOpen(false); }} />
      <Modal visible={audienceOpen} transparent animationType="fade" onRequestClose={() => setAudienceOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAudienceOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>مين يشوف المنشور؟</Text>
            {AUDIENCES.map((a) => (
              <Pressable
                key={a.key}
                style={[styles.audienceRow, audience === a.key && styles.audienceRowActive]}
                onPress={() => {
                  setAudience(a.key);
                  setAudienceOpen(false);
                }}
              >
                <Ionicons name={a.icon} size={20} color={audience === a.key ? colors.ink : colors.text} />
                <Text style={[styles.audienceRowText, audience === a.key && { color: colors.ink }]}>{a.label}</Text>
                {audience === a.key && <Ionicons name="checkmark" size={18} color={colors.ink} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* تسجيل صوتي مباشر */}
      <Modal visible={recOpen} transparent animationType="slide" onRequestClose={() => setRecOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>تسجيل صوتي</Text>
            <Text style={styles.recTimer}>
              {Math.floor((recState.durationMillis ?? 0) / 60000)}:
              {String(Math.floor(((recState.durationMillis ?? 0) % 60000) / 1000)).padStart(2, "0")}
              {" / 5:00"}
            </Text>
            <View style={styles.recRow}>
              {recState.isRecording ? (
                <Pressable style={styles.recStop} onPress={stopRecording}>
                  <Ionicons name="stop" size={30} color="#fff" />
                </Pressable>
              ) : (
                <Pressable style={styles.recStart} onPress={startRecording}>
                  <Ionicons name="mic" size={30} color={colors.ink} />
                </Pressable>
              )}
            </View>
            <Text style={styles.hint}>
              {recState.isRecording ? "بتسجل دلوقتي… دوس لإيقاف التسجيل" : `اضغط للميكروفون · أقصى مدة ${MAX_AUDIO_SECONDS / 60} دقايق`}
            </Text>
            <Pressable onPress={() => setRecOpen(false)}>
              <Text style={styles.cancel}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <FeelingsSheet visible={feelingsOpen} onClose={() => setFeelingsOpen(false)} onSelect={setFeeling} />
    </ScreenShell>
  );
}

function Tool({
  icon,
  label,
  onPress,
  disabled,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable style={[styles.tool, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={20} color={active === false ? colors.muted : colors.goldText} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    publishBtn: { backgroundColor: colors.gold, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 72, alignItems: "center" },
    publishText: { color: colors.ink, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    authorRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    authorName: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    audienceBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
    audienceBtnText: { color: colors.goldText, fontSize: 11 },
    input: { color: colors.text, fontSize: 17, lineHeight: 26, minHeight: 140, textAlign: "right" },
    counter: { color: colors.muted, fontSize: 10.5, textAlign: "left" },
    mediaCard: { borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface2, minHeight: 120, justifyContent: "center" },
    mediaImg: { width: "100%", height: 220 },
    fileRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 16 },
    fileName: { color: colors.text, fontSize: 13, flex: 1, textAlign: "right" },
    removeMedia: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, padding: 5 },
    progressCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
    progressHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
    progressLabel: { color: colors.text, fontSize: 12.5 },
    progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden" },
    progressFill: { height: "100%", backgroundColor: colors.gold, borderRadius: 4 },
    error: { color: colors.red, fontSize: 12.5, textAlign: "right" },
    tools: { flexDirection: "row-reverse", gap: 8, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 14, flexWrap: "wrap" },
    tool: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
    toolText: { color: colors.text, fontSize: 12 },
    hint: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 16 },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10 },
    sheetTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    audienceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 13, borderRadius: 12, backgroundColor: colors.surface },
    audienceRowActive: { backgroundColor: colors.gold },
    audienceRowText: { color: colors.text, fontSize: 13.5, flex: 1, textAlign: "right" },
    recTimer: { color: colors.text, fontSize: 22, textAlign: "center", fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    recRow: { alignItems: "center" },
    recStart: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    recStop: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
    cancel: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 6 },
    successWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 },
    successIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    successTitle: { color: colors.text, fontSize: 24, fontFamily: "Cairo_900Black", fontWeight: "900" },
    successSub: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 21 },
    primary: { backgroundColor: colors.gold, borderRadius: 16, height: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center", marginTop: 8 },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    feelingChip: { flexDirection: "row-reverse", alignItems: "center", gap: 8, alignSelf: "flex-end", backgroundColor: colors.background, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
    feelingText: { color: colors.goldText, fontSize: 12 },
    extraRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 },
    extraChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5 },
    extraText: { color: colors.text, fontSize: 11.5 },
    templatesBox: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 8 },
    templateCard: { width: "47%", backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 9, gap: 3 },
    templateTitle: { color: colors.goldText, fontSize: 12, fontWeight: "800", textAlign: "right" },
    templatePreview: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 15 },
  }),
);
