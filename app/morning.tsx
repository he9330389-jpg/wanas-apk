import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenShell, Header, Avatar } from "@/components/wanas-ui";
import { VoiceNote } from "@/components/voice-note";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickFile, type PickedMedia } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  answerMorning,
  getTodayQuestion,
  listAnswers,
  toggleCheer,
  type MorningAnswer,
  type MorningQuestion,
} from "@/lib/excellence";

/**
 * ونسة الصباح ☀ — القسم 34: سؤال يومي خفيف ترد عليه بصوتك وتشوف ردود أصحابك.
 * السؤال بيتغير كل يوم، والرد مرة واحدة في اليوم مع إمكانية التشجيع على ردود الآخرين.
 */
export default function MorningScreen() {
  useThemeContext();
  const [userId, setUserId] = useState<string | null>(null);
  const [question, setQuestion] = useState<MorningQuestion | null>(null);
  const [answers, setAnswers] = useState<MorningAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [audio, setAudio] = useState<PickedMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    try {
      const q = await getTodayQuestion();
      setQuestion(q);
      if (q) setAnswers(await listAnswers(q.id));
    } catch (error) {
      Alert.alert("مش قادر أحمّل سؤال النهارده", error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
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

  const myAnswer = answers.find((a) => a.user_id === userId);

  const attachVoice = async () => {
    const picked = await pickFile();
    if (!picked) return;
    if (!picked.mime.startsWith("audio")) {
      Alert.alert("اختار تسجيل صوتي", "الرد الصوتي بياخد mp3 أو m4a أو ogg.");
      return;
    }
    setAudio(picked);
  };

  const submit = async () => {
    if (!question || !userId) return;
    if (!body.trim() && !audio) {
      Alert.alert("اكتب أو سجّل ردك الأول", "سؤال النهارده مستنيك 🙂");
      return;
    }
    setSending(true);
    try {
      await answerMorning({ questionId: question.id, userId, body, audio, seconds: audio ? 30 : undefined });
      setEditing(false);
      setBody("");
      setAudio(null);
      await load();
    } catch (error) {
      Alert.alert("محصلش إرسال", error instanceof Error ? error.message : "");
    } finally {
      setSending(false);
    }
  };

  const cheer = async (answer: MorningAnswer) => {
    if (!userId) return;
    const hasCheered = (answer.cheers ?? []).some((c) => c.user_id === userId);
    try {
      await toggleCheer(answer.id, userId, hasCheered);
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answer.id
            ? {
                ...a,
                cheers: hasCheered
                  ? (a.cheers ?? []).filter((c) => c.user_id !== userId)
                  : [...(a.cheers ?? []), { user_id: userId }],
              }
            : a,
        ),
      );
    } catch (error) {
      Alert.alert("مش قادر أشجّع", error instanceof Error ? error.message : "");
    }
  };

  return (
    <ScreenShell>
      <Header title="ونسة الصباح" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>☀️</Text>
          <Text style={styles.heroTitle}>صباح الونس</Text>
          <Text style={styles.heroDate}>
            {new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} />
        ) : !question ? (
          <Text style={styles.empty}>مفيش سؤال النهارده لسه — جاي بكرة الصبح.</Text>
        ) : (
          <>
            <View style={styles.questionCard}>
              <Text style={styles.themeTag}>#{question.theme}</Text>
              <Text style={styles.question}>{question.question}</Text>
              <Text style={styles.questionHint}>ردّ بصوتك أو بكلمة — وخلي أصحابك يعرفوك أكتر.</Text>
            </View>

            {myAnswer && !editing ? (
              <View style={styles.myAnswer}>
                <View style={styles.myAnswerTop}>
                  <Text style={styles.myAnswerLabel}>ردّك النهارده</Text>
                  <Pressable onPress={() => setEditing(true)}>
                    <Text style={styles.editText}>عدّل</Text>
                  </Pressable>
                </View>
                {myAnswer.body ? <Text style={styles.myAnswerBody}>{myAnswer.body}</Text> : null}
                {myAnswer.audio_url ? <VoiceNote path={myAnswer.audio_url} label="ردّك الصوتي" /> : null}
              </View>
            ) : (
              <View style={styles.card}>
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  placeholder="اكتب ردك في سطر…"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  maxLength={300}
                  textAlign="right"
                />
                <View style={styles.row}>
                  <Pressable style={styles.voiceBtn} onPress={attachVoice}>
                    <Ionicons name={audio ? "checkmark-circle" : "mic"} size={16} color={colors.ink} />
                    <Text style={styles.voiceText}>{audio ? "الصوت جاهز" : "رد صوتي"}</Text>
                  </Pressable>
                  {audio && (
                    <Pressable onPress={() => setAudio(null)}>
                      <Text style={styles.remove}>شيل الصوت</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
                  {sending ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.sendText}>شارك ردّك</Text>}
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionTitle}>ردود أصحابك ({answers.length})</Text>
            {answers.length === 0 ? (
              <Text style={styles.empty}>كون أول واحد يردّ النهارده ☀️</Text>
            ) : (
              answers.map((a) => {
                const cheered = (a.cheers ?? []).some((c) => c.user_id === userId);
                return (
                  <View key={a.id} style={styles.answerCard}>
                    <View style={styles.answerTop}>
                      <Avatar initial={(a.profiles?.display_name ?? "و").slice(0, 1)} color={colors.surface3} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.answerName}>{a.profiles?.display_name ?? a.profiles?.username ?? "صاحبك"}</Text>
                        <Text style={styles.answerDate}>
                          {new Date(a.created_at).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" })}
                        </Text>
                      </View>
                    </View>
                    {a.body ? <Text style={styles.answerBody}>{a.body}</Text> : null}
                    {a.audio_url ? <VoiceNote path={a.audio_url} label="رد صوتي" /> : null}
                    <Pressable style={[styles.cheerBtn, cheered && styles.cheerBtnActive]} onPress={() => cheer(a)}>
                      <Text style={[styles.cheerText, cheered && { color: colors.ink }]}>
                        👏 {(a.cheers ?? []).length > 0 ? (a.cheers ?? []).length : ""} شجّعه
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  hero: { alignItems: "center", backgroundColor: "#E8C96A1A", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#E8C96A55" },
  heroEmoji: { fontSize: 34 },
  heroTitle: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold", marginTop: 4 },
  heroDate: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  questionCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  themeTag: { color: colors.goldText, fontSize: 11, textAlign: "right" },
  question: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", lineHeight: 27 },
  questionHint: { color: colors.muted, fontSize: 11.5, textAlign: "right" },
  myAnswer: { backgroundColor: colors.surface2, borderRadius: 16, padding: 12, gap: 8 },
  myAnswerTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  myAnswerLabel: { color: colors.goldText, fontSize: 11.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  editText: { color: colors.muted, fontSize: 11.5 },
  myAnswerBody: { color: colors.text, fontSize: 13.5, textAlign: "right", lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  input: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, color: colors.text, fontSize: 13.5 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  voiceBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  voiceText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 12 },
  remove: { color: colors.muted, fontSize: 12 },
  sendBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  sendText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 6 },
  empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 16, lineHeight: 20 },
  answerCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  answerTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  answerName: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  answerDate: { color: colors.muted, fontSize: 10, textAlign: "right" },
  answerBody: { color: colors.text, fontSize: 16, textAlign: "right", lineHeight: 20 },
  cheerBtn: { alignSelf: "flex-end", backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  cheerBtnActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  cheerText: { color: colors.text, fontSize: 11.5 },
})));
