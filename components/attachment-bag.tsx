import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { colors } from "@/constants/wanas";
import { pickImage, pickVideo, pickFile, validateMedia, type PickedMedia, type BagKind } from "@/lib/media";
import { targetLangLabel, translateText } from "@/lib/translate";

import { themedStyles } from "@/lib/theme-runtime";
export type BagPayload = {
  kind: BagKind;
  body: string;
  media?: PickedMedia;
  location?: { latitude: number; longitude: number; label?: string };
  contact?: { name: string; phone?: string };
  poll?: { question: string; options: string[] };
  onceView?: boolean;
  scheduledAt?: string;
  disappearAfter?: string;
  translateBeforeSend?: boolean;
};

type Option = { kind: BagKind; label: string; emoji: string };

const OPTIONS: Option[] = [
  { kind: "image", label: "صورة", emoji: "🖼" },
  { kind: "camera", label: "كاميرا", emoji: "📷" },
  { kind: "video", label: "فيديو", emoji: "🎬" },
  { kind: "file", label: "ملف", emoji: "📄" },
  { kind: "location", label: "موقعي", emoji: "📍" },
  { kind: "contact", label: "جهة اتصال", emoji: "👤" },
  { kind: "scheduled", label: "رسالة مجدولة", emoji: "🕒" },
  { kind: "temporary", label: "رسالة مؤقتة", emoji: "⏱" },
  { kind: "translate", label: "ترجمة قبل الإرسال", emoji: "🌐" },
];

function wallClockMs() {
  return Date.now();
}

/**
 * الحقيبة 🎒 — تُفتح بالسحب لأعلى على شريط الكتابة أو بالضغط عليه.
 * تختار نوع المرفق، ثم تعاينه (مع تعليق نصي) قبل الإرسال، مع زر «1» لمرة واحدة.
 */
export function AttachmentBag({
  visible,
  onClose,
  onSend,
  sending,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (payload: BagPayload) => Promise<void>;
  sending?: boolean;
}) {
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [kind, setKind] = useState<BagKind | null>(null);
  const [caption, setCaption] = useState("");
  const [onceView, setOnceView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [location, setLocation] = useState<BagPayload["location"]>(undefined);
  const [contact, setContact] = useState<BagPayload["contact"]>(undefined);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [disappearAfter, setDisappearAfter] = useState("01:00:00");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);

  function reset() {
    setPicked(null);
    setKind(null);
    setCaption("");
    setOnceView(false);
    setError(null);
    setLocation(undefined);
    setContact(undefined);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setScheduledAt(null);
    setDisappearAfter("01:00:00");
    setTranslation("");
    setTranslating(false);
  }

  async function choose(option: Option) {
    setError(null);
    setKind(option.kind);
    try {
      setBusy(true);
      if (option.kind === "image" || option.kind === "camera") {
        const m = await pickImage(option.kind === "camera");
        if (m) {
          const problem = validateMedia(m);
          if (problem) throw new Error(problem);
          setPicked(m);
        } else setKind(null);
      } else if (option.kind === "video") {
        const m = await pickVideo();
        if (m) {
          const problem = validateMedia(m);
          if (problem) throw new Error(problem);
          setPicked(m);
        } else setKind(null);
      } else if (option.kind === "file" || option.kind === "audio") {
        const m = await pickFile();
        if (m) {
          if (option.kind === "audio" && !m.mime.startsWith("audio")) {
            throw new Error("اختار ملف صوتي");
          }
          const problem = validateMedia(m);
          if (problem) throw new Error(problem);
          setPicked({ ...m, kind: option.kind });
        } else setKind(null);
      } else if (option.kind === "scheduled") {
        setScheduledAt(new Date(wallClockMs() + 10 * 60_000).toISOString());
      } else if (option.kind === "temporary" || option.kind === "translate") {
        // اختيار نص فقط، ثم يحدد المستخدم المدة أو يطلب المعاينة المترجمة.
      } else if (option.kind === "location") {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) throw new Error("محتاجين إذن الموقع");
        const pos = await Location.getCurrentPositionAsync({});
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } else if (option.kind === "contact") {
        const perm = await Contacts.requestPermissionsAsync();
        if (!perm.granted) throw new Error("محتاجين إذن جهات الاتصال");
        const res = await Contacts.getContactsAsync({ pageSize: 1, fields: [Contacts.Fields.PhoneNumbers] });
        const c = res.data?.[0];
        if (!c) throw new Error("مفيش جهات اتصال");
        setContact({ name: c.name ?? "بدون اسم", phone: c.phoneNumbers?.[0]?.number });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصلت مشكلة");
      setKind(null);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!kind) return;
    if (kind === "scheduled") {
      if (!caption.trim() || !scheduledAt) {
        setError("اكتب الرسالة وحدد موعد إرسالها");
        return;
      }
      await onSend({ kind, body: caption.trim(), scheduledAt });
      reset();
      onClose();
      return;
    }
    if (kind === "temporary") {
      if (!caption.trim()) {
        setError("اكتب محتوى الرسالة المؤقتة الأول");
        return;
      }
      await onSend({ kind, body: caption.trim(), disappearAfter });
      reset();
      onClose();
      return;
    }
    if (kind === "translate") {
      if (!translation) {
        setError("اطلب الترجمة الأول وشوفها قبل الإرسال");
        return;
      }
      await onSend({ kind, body: translation, translateBeforeSend: true });
      reset();
      onClose();
      return;
    }
    if (kind === "poll") {
      const options = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (pollQuestion.trim().length < 3 || options.length < 2) {
        setError("الاستفتاء محتاج سؤال وخيارين على الأقل");
        return;
      }
      await onSend({ kind, body: caption, poll: { question: pollQuestion.trim(), options }, onceView });
      reset();
      onClose();
      return;
    }
    await onSend({ kind, body: caption, media: picked ?? undefined, location, contact, onceView });
    reset();
    onClose();
  }

  const canSubmit =
    (kind === "image" || kind === "camera" || kind === "video" || kind === "file" || kind === "audio") ? !!picked
    : kind === "location" ? !!location
    : kind === "contact" ? !!contact
    : kind === "scheduled" ? !!caption.trim() && !!scheduledAt
    : kind === "temporary" ? !!caption.trim()
    : kind === "translate" ? !!translation
    : false;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={styles.backdrop} onPress={() => { reset(); onClose(); }}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          {!kind ? (
            <>
              <Text style={styles.title}>الحقيبة 🎒</Text>
              <Text style={styles.hint}>اختار اللي عايز تبعته</Text>
              <View style={styles.grid}>
                {OPTIONS.map((o) => (
                  <Pressable key={o.kind} style={styles.option} onPress={() => choose(o)} disabled={busy}>
                    <Text style={styles.optionEmoji}>{o.emoji}</Text>
                    <Text style={styles.optionLabel}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              {busy && <ActivityIndicator color={colors.goldText} />}
              {error && <Text style={styles.error}>{error}</Text>}
            </>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <View style={styles.previewHeader}>
                <Text style={styles.title}>معاينة قبل الإرسال</Text>
                <Pressable onPress={() => { setPicked(null); setKind(null); }}>
                  <Text style={styles.change}>تغيير</Text>
                </Pressable>
              </View>

              {picked && picked.mime.startsWith("image") && (
                <Image source={{ uri: picked.uri }} style={styles.previewImage} resizeMode="cover" />
              )}
              {picked && picked.mime.startsWith("video") && (
                <View style={styles.fileCard}>
                  <Ionicons name="videocam" size={28} color={colors.goldText} />
                  <Text style={styles.fileName}>{picked.name}</Text>
                </View>
              )}
              {picked && (picked.mime.startsWith("audio") || kind === "audio") && (
                <View style={styles.fileCard}>
                  <Ionicons name="mic" size={28} color={colors.goldText} />
                  <Text style={styles.fileName}>{picked.name}</Text>
                </View>
              )}
              {picked && kind === "file" && (
                <View style={styles.fileCard}>
                  <Ionicons name="document-text" size={28} color={colors.goldText} />
                  <Text style={styles.fileName}>{picked.name}</Text>
                </View>
              )}
              {location && (
                <View style={styles.fileCard}>
                  <Ionicons name="location" size={28} color={colors.goldText} />
                  <Text style={styles.fileName}>
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </Text>
                </View>
              )}
              {contact && (
                <View style={styles.fileCard}>
                  <Ionicons name="person" size={28} color={colors.goldText} />
                  <Text style={styles.fileName}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</Text>
                </View>
              )}
              {kind === "scheduled" && (
                <View style={{ gap: 10 }}>
                  <Text style={styles.hint}>موعد الإرسال — هتتبعت أول ما تفتح ونس بعد الموعد لو التطبيق كان مقفول.</Text>
                  <View style={styles.grid}>
                    {[1, 10, 60, 1440].map((minutes) => (
                      <Pressable key={minutes} style={styles.option} onPress={() => setScheduledAt(new Date(wallClockMs() + minutes * 60_000).toISOString())}>
                        <Text style={styles.optionLabel}>{minutes === 1440 ? "بكرة" : minutes < 60 ? `بعد ${minutes} د` : "بعد ساعة"}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {kind === "temporary" && (
                <View style={styles.grid}>
                  {[{ value: "01:00:00", label: "تختفي بعد ساعة" }, { value: "24:00:00", label: "تختفي بعد يوم" }].map((x) => (
                    <Pressable key={x.value} style={[styles.option, disappearAfter === x.value && styles.onceToggleActive]} onPress={() => setDisappearAfter(x.value)}>
                      <Text style={styles.optionLabel}>{x.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {kind === "translate" && (
                <View style={{ gap: 8 }}>
                  <Pressable
                    style={styles.onceToggle}
                    disabled={translating || !caption.trim()}
                    onPress={async () => {
                      setTranslating(true);
                      setError(null);
                      try {
                        const result = await translateText(caption.trim());
                        if (!result) throw new Error("الترجمة مش متاحة دلوقتي");
                        setTranslation(result);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "الترجمة مش متاحة دلوقتي");
                      } finally {
                        setTranslating(false);
                      }
                    }}
                  >
                    <Text style={styles.onceText}>{translating ? "بنترجم…" : `ترجم قبل الإرسال إلى ${targetLangLabel()}`}</Text>
                  </Pressable>
                  {!!translation && <Text style={styles.hint}>المعاينة: {translation}</Text>}
                </View>
              )}
              {kind === "poll" && (
                <View style={{ gap: 8 }}>
                  <TextInput
                    value={pollQuestion}
                    onChangeText={setPollQuestion}
                    placeholder="سؤال الاستفتاء"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  {pollOptions.map((o, i) => (
                    <TextInput
                      key={i}
                      value={o}
                      onChangeText={(v) => setPollOptions((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
                      placeholder={`الخيار ${i + 1}`}
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                    />
                  ))}
                  <Pressable onPress={() => setPollOptions((p) => [...p, ""])}>
                    <Text style={styles.change}>+ خيار تاني</Text>
                  </Pressable>
                </View>
              )}
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder={kind === "scheduled" ? "اكتب الرسالة اللي هتتبعت بعدين…" : kind === "temporary" ? "محتوى الرسالة المؤقتة…" : kind === "translate" ? "اكتب الرسالة الأصلية…" : "أضف تعليق…"}
                placeholderTextColor={colors.muted}
                style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                multiline
              />

              {kind !== "scheduled" && kind !== "temporary" && kind !== "translate" && <Pressable
                style={[styles.onceToggle, onceView && styles.onceToggleActive]}
                onPress={() => setOnceView((v) => !v)}
              >
                <Text style={[styles.onceText, onceView && { color: colors.ink }]}>
                  1 · تفتح لمرة واحدة
                </Text>
              </Pressable>}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.sendBtn, (!canSubmit || sending) && { opacity: 0.5 }]}
                onPress={submit}
                disabled={!canSubmit || sending}
              >
                {sending ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.sendText}>ابعت</Text>}
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36, maxHeight: "88%" },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 14 },
  title: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 4, marginBottom: 12 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  option: { width: "30%", alignItems: "center", backgroundColor: colors.surface3, borderRadius: 18, paddingVertical: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  optionEmoji: { fontSize: 24 },
  optionLabel: { color: colors.text, fontSize: 12 },
  previewHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  change: { color: colors.goldText, fontSize: 13 },
  previewImage: { width: "100%", height: 220, borderRadius: 16 },
  fileCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface3, borderRadius: 16, padding: 16 },
  fileName: { color: colors.text, fontSize: 13, flex: 1, textAlign: "right" },
  input: { backgroundColor: colors.surface3, borderRadius: 14, padding: 14, color: colors.text, textAlign: "right", borderWidth: 1, borderColor: colors.border },
  onceToggle: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.goldText },
  onceToggleActive: { backgroundColor: colors.gold },
  onceText: { color: colors.goldText, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  sendBtn: { backgroundColor: colors.gold, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 16 },
  error: { color: colors.red, fontSize: 12, textAlign: "right" },
})));
