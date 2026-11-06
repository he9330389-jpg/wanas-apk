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
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell, Header, Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickFile, type PickedMedia } from "@/lib/media";
import { VoiceNote } from "@/components/voice-note";
import { listThankCardsReceived, sendThankCard, type ThankCard } from "@/lib/excellence";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
type PostMeta = { id: string; author_id: string; body: string | null; author_name: string | null };

/**
 * بطاقة شكر 💌 — القسم 34: بدل التفاعل العادي، كرت شكر صوتي قصير لصاحب المنشور،
 * مع صندوق «بطاقات الشكر اللي وصلتك».
 */
export default function ThankCardScreen() {
  useThemeContext();
  const { postId, recipientId } = useLocalSearchParams<{ postId?: string; recipientId?: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [post, setPost] = useState<PostMeta | null>(null);
  const [message, setMessage] = useState("");
  const [audio, setAudio] = useState<PickedMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [inbox, setInbox] = useState<ThankCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      if (postId) {
        const { data } = await supabase
          .from("posts")
          .select("id, author_id, body, profiles:author_id(display_name, username)")
          .eq("id", postId)
          .maybeSingle();
        if (data) {
          const author = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
          setPost({
            id: data.id,
            author_id: data.author_id,
            body: data.body,
            author_name: author?.display_name ?? author?.username ?? null,
          });
        }
      }
      const received = await listThankCardsReceived(uid);
      setInbox(received);
    } catch (error) {
      Alert.alert("مشكلة في التحميل", error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const attachVoice = async () => {
    const picked = await pickFile();
    if (!picked) return;
    if (!picked.mime.startsWith("audio")) {
      Alert.alert("اختار ملف صوتي", "الكرت الصوتي بياخد تسجيل صوتي (mp3/m4a/ogg).");
      return;
    }
    setAudio(picked);
  };

  const send = async () => {
    if (!userId || !post) return;
    if (!message.trim() && !audio) {
      Alert.alert("الكرت فاضي", "اكتب كلمة شكر أو سجّل صوتك");
      return;
    }
    if (userId === post.author_id) {
      Alert.alert("ده منشورك 😄", "بطاقة الشكر لصاحب منشور تاني");
      return;
    }
    setSending(true);
    try {
      await sendThankCard({
        senderId: userId,
        recipientId: post.author_id,
        postId: post.id,
        message,
        audio,
        seconds: audio ? 30 : undefined,
      });
      setMessage("");
      setAudio(null);
      Alert.alert("وصلت بطاقتك 💌", `${post.author_name ?? "صاحب المنشور"} هيشوف شكرك على المنشور.`);
      router.back();
    } catch (error) {
      Alert.alert("محصلش إرسال", error instanceof Error ? error.message : "");
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenShell>
      <Header title="بطاقة شكر" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {postId && post ? (
          <>
            <View style={styles.postPreview}>
              <Text style={styles.previewLabel}>لكرت شكر لـ</Text>
              <Text style={styles.previewAuthor}>{post.author_name ?? "صاحب المنشور"}</Text>
              {post.body ? (
                <Text style={styles.previewBody} numberOfLines={3}>
                  {post.body}
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>💌 اكتب شكرك</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="شكرًا على الكلام الجميل ده…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                multiline
                maxLength={200}
                textAlign="right"
              />
              <View style={styles.row}>
                <Pressable style={styles.voiceBtn} onPress={attachVoice}>
                  <Ionicons name={audio ? "checkmark-circle" : "mic"} size={16} color={colors.ink} />
                  <Text style={styles.voiceText}>{audio ? "صوت جاهز" : "شكر صوتي قصير"}</Text>
                </Pressable>
                {audio && (
                  <Pressable onPress={() => setAudio(null)}>
                    <Text style={styles.remove}>شيل الصوت</Text>
                  </Pressable>
                )}
              </View>
              <Pressable style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.sendText}>ابعت البطاقة</Text>}
              </Pressable>
            </View>
          </>
        ) : postId && !loading ? (
          <Text style={styles.empty}>المنشور ده مش متاح أو اتحذف.</Text>
        ) : null}

        {!postId && recipientId ? <Text style={styles.empty}>اختار منشور من الموجز عشان تبعت بطاقة شكر.</Text> : null}

        <Text style={styles.sectionTitle}>بطاقات وصلتك 💌 ({inbox.length})</Text>
        {loading ? (
          <ActivityIndicator color={colors.goldText} />
        ) : inbox.length === 0 ? (
          <Text style={styles.empty}>لسه مفيش بطاقات. لما حد يشكرك هتلاقيها هنا.</Text>
        ) : (
          inbox.map((card) => (
            <View key={card.id} style={styles.receivedCard}>
              <View style={styles.receivedTop}>
                <Avatar initial={(card.profiles?.display_name ?? "و").slice(0, 1)} color={colors.surface3} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.receivedName}>{card.profiles?.display_name ?? card.profiles?.username ?? "صاحبك"}</Text>
                  <Text style={styles.receivedDate}>{new Date(card.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</Text>
                </View>
                <Text style={{ fontSize: 18 }}>💌</Text>
              </View>
              {card.message ? <Text style={styles.receivedMessage}>{card.message}</Text> : null}
              {card.audio_url ? <VoiceNote path={card.audio_url} label="شكر صوتي" /> : null}
            </View>
          ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  postPreview: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 4 },
  previewLabel: { color: colors.muted, fontSize: 11, textAlign: "right" },
  previewAuthor: { color: colors.goldText, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  previewBody: { color: colors.text, fontSize: 12.5, textAlign: "right", lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  input: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, color: colors.text, fontSize: 13, minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  voiceBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  voiceText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 12 },
  remove: { color: colors.muted, fontSize: 12 },
  sendBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  sendText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 8 },
  empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 12, lineHeight: 20 },
  receivedCard: { backgroundColor: "#E8C96A0D", borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: "#E8C96A44" },
  receivedTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  receivedName: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  receivedDate: { color: colors.muted, fontSize: 10, textAlign: "right" },
  receivedMessage: { color: colors.text, fontSize: 16, textAlign: "right", lineHeight: 20 },
})));
