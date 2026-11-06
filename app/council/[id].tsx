import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ExpoLinking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { JitsiRoom } from "@/components/jitsi-room";
type Room = {
  id: string;
  host_id: string;
  title: string;
  topic: string | null;
  description: string | null;
  kind: string;
  status: string;
  speak_policy: string;
  is_live: boolean;
  is_recorded: boolean;
  speaker_slots: number | null;
};

type Member = { user_id: string; role: string; left_at: string | null };
type Msg = {
  id: string;
  sender_id: string;
  body: string;
  pinned: boolean;
  applause_count: number;
  is_summary: boolean;
  created_at: string;
};
type Request = { user_id: string; status: string };

/**
 * جوّه المجلس — القسم 23.
 * المرسح (المتحدثون) / المدرّج (المستمعون)، كريس الكلام ⏱،
 * طلبات الدور، تصفيق صوتي، تعليق مثبت، ملخص نصي، وإبلاغ من جوّه.
 */
export default function CouncilRoom() {
  useThemeContext();
  const { id: roomId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [speakingSeconds, setSpeakingSeconds] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // المجالس صوت بس — الفيديو واللايف من النشر فقط (بند 7)
  const [inRoom, setInRoom] = useState<null | "audio">(null);
  const [mentionList, setMentionList] = useState<{ id: string; username: string | null; display_name: string | null }[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const insets = useSafeAreaInsets();
  const [names, setNames] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHost = !!me && room?.host_id === me;

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);

      const { data: r, error: rerr } = await supabase
        .from("majlis_rooms")
        .select("id, host_id, title, topic, description, kind, status, speak_policy, is_live, is_recorded, speaker_slots")
        .eq("id", roomId)
        .single();
      if (rerr) throw rerr;
      setRoom(r as Room);

      const { data: mem } = await supabase
        .from("majlis_members")
        .select("user_id, role, left_at")
        .eq("room_id", roomId)
        .is("left_at", null);
      setMembers((mem ?? []) as Member[]);
      const memberIds = Array.from(new Set((mem ?? []).map((m) => m.user_id as string)));
      if (memberIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, username, display_name").in("id", memberIds);
        setNames(Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name ?? p.username ?? "عضو") as string])));
      }

      const { data: msgs } = await supabase
        .from("majlis_messages")
        .select("id, sender_id, body, pinned, applause_count, is_summary, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((msgs ?? []) as Msg[]);

      const { data: reqs } = await supabase
        .from("majlis_requests")
        .select("user_id, status")
        .eq("room_id", roomId);
      setRequests((reqs ?? []) as Request[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل المجلس");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // join the room as listener (idempotent)
  useEffect(() => {
    if (!me || !room) return;
    let active = true;
    (async () => {
      const already = members.some((m) => m.user_id === me);
      if (already) return;
      await supabase.from("majlis_members").insert({
        room_id: room.id,
        user_id: me,
        role: isHost ? "host" : "listener",
      });
      if (active) await load();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, room?.id]);

  // speaking timer for the host / approved speaker
  useEffect(() => {
    const myRole = members.find((m) => m.user_id === me)?.role;
    const canSpeak = isHost || myRole === "speaker";
    if (canSpeak && room?.status === "live") {
      timerRef.current = setInterval(() => setSpeakingSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [me, members, isHost, room?.status]);

  async function raiseHand() {
    if (!me) return;
    const { error: err } = await supabase
      .from("majlis_requests")
      .upsert({ room_id: roomId, user_id: me, status: "pending" }, { onConflict: "room_id,user_id" });
    if (err) Alert.alert("تعذّر رفع اليد", err.message);
    else await load();
  }

  async function approve(userId: string, approve: boolean) {
    await supabase
      .from("majlis_requests")
      .update({ status: approve ? "approved" : "declined" })
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (approve) {
      await supabase
        .from("majlis_members")
        .update({ role: "speaker" })
        .eq("room_id", roomId)
        .eq("user_id", userId);
    }
    await load();
  }

  async function sendComment() {
    if (!me || draft.trim().length < 1) return;
    const body = draft.trim();
    setDraft("");
    const { error: err } = await supabase
      .from("majlis_messages")
      .insert({ room_id: roomId, sender_id: me, body });
    if (err) setDraft(body);
    else {
      // المنشن شغال لأي شخص (جوه الغرفة أو بره) — بنبعتله إشعار mention
      const handles = Array.from(body.matchAll(/@([A-Za-z0-9_]{3,30})/g)).map((m) => m[1]);
      if (handles.length) {
        const { data: users } = await supabase.from("profiles").select("id, username").in("username", handles);
        const rows = (users ?? []).filter((u: { id: string }) => u.id !== me).map((u: { id: string }) => ({
          recipient_id: u.id,
          actor_id: me,
          kind: "mention",
          payload: { council: roomId, title: room?.title ?? "", text: body.slice(0, 120) },
        }));
        if (rows.length) await supabase.from("notifications").insert(rows);
      }
      await load();
    }
  }

  function pickMention(u: { username: string | null }) {
    if (!u.username) return;
    setDraft((d) => `${d.replace(/@([A-Za-z0-9_]{0,30})$/, "")}@${u.username} `);
    setMentionList([]);
  }

  async function applause(msg: Msg) {
    await supabase
      .from("majlis_messages")
      .update({ applause_count: msg.applause_count + 1 })
      .eq("id", msg.id);
    await load();
  }

  async function pin(msg: Msg) {
    if (!isHost) return;
    await supabase.from("majlis_messages").update({ pinned: !msg.pinned }).eq("id", msg.id);
    await load();
  }

  async function endCouncil() {
    Alert.alert("اقفل المجلس؟", "هيتقفل المجلس للمستمعين وتقدر تنشر ملخص.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "اقفل",
        onPress: async () => {
          await supabase
            .from("majlis_rooms")
            .update({ status: "ended", is_live: false, ended_at: new Date().toISOString() })
            .eq("id", roomId);
          await load();
        },
      },
    ]);
  }

  /** حذف الغرفة نهائيًا (للمضيف) — بيقفل الجلسة ويمسح الغرفة وقوائمها. */
  async function deleteRoom() {
    if (!roomId || !isHost) return;
    Alert.alert("تحذف الغرفة؟", "هتقفل الجلسة وتتشال الغرفة من المجالس. الخطوة دي مش بترجع.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احذف",
        style: "destructive",
        onPress: async () => {
          const now = new Date().toISOString();
          const { error: endErr } = await supabase
            .from("majlis_rooms")
            .update({ status: "ended", is_live: false, ended_at: now })
            .eq("id", roomId);
          if (endErr) {
            Alert.alert("مش اتحذفت", endErr.message);
            return;
          }
          const { error: delErr } = await supabase
            .from("majlis_rooms")
            .update({ deleted_at: now })
            .eq("id", roomId)
            .eq("host_id", me);
          if (delErr) {
            // لو مفيش عمود deleted_at، بنمسح الصف نفسه (RLS بتسمح للمضيف بس)
            const { error: hardErr } = await supabase.from("majlis_rooms").delete().eq("id", roomId).eq("host_id", me);
            if (hardErr) {
              Alert.alert("اتقفلت بس مش اتمسحت", `اتقفلت الجلسة. الحذف النهائي: ${hardErr.message}`);
              await load();
              return;
            }
          }
          setInRoom(null);
          Alert.alert("اتمسحت الغرفة", "المجلس اتقفل والغرفة اتشالت.");
          router.replace("/(tabs)/councils");
        },
      },
    ]);
  }
  async function publishSummary() {
    if (!me || summaryText.trim().length < 5) return;
    const { error: err } = await supabase.from("majlis_messages").insert({
      room_id: roomId,
      sender_id: me,
      body: summaryText.trim(),
      is_summary: true,
    });
    if (err) {
      Alert.alert("تعذّر النشر", err.message);
      return;
    }
    await supabase.from("majlis_rooms").update({ summary: summaryText.trim() }).eq("id", roomId);
    setSummaryOpen(false);
    setSummaryText("");
    await load();
  }

  function report() {
    Alert.alert("إبلاغ عن المجلس", "هنراجع المجلس ونبلّغك بالنتيجة.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إبلاغ",
        onPress: async () => {
          if (!me) return;
          const { error: err } = await supabase.from("majlis_reports").insert({
            room_id: roomId,
            reporter_id: me,
            reason: "بلاغ من جوّه المجلس",
          });
          Alert.alert(err ? "تعذّر الإرسال" : "تم الإرسال", err?.message ?? "هنراجع البلاغ قريباً");
        },
      },
    ]);
  }

  const stage = members.filter((m) => m.role === "host" || m.role === "speaker");
  const audience = members.filter((m) => m.role === "listener");

  /** نسخ فعلي للرابط + رسالة «تم نسخ الرابط ✔» — من غير Alert ولا رابط خارجي. */
  async function copyLink() {
    if (!roomId) return;
    const url = ExpoLinking.createURL(`/council/${roomId}`);
    await Clipboard.setStringAsync(url);
    setToast("تم نسخ الرابط ✔");
    setTimeout(() => setToast(null), 2000);
  }
  const pinnedMsg = messages.find((m) => m.pinned);
  const pending = requests.filter((r) => r.status === "pending");
  const mm = String(Math.floor(speakingSeconds / 60)).padStart(2, "0");
  const ss = String(speakingSeconds % 60).padStart(2, "0");

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.goldText} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
      {/* Header — الشريط العلوي يبدأ تحت insets.top (Safe Area) وكل زر 48dp على الأقل */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6, minHeight: 56 + insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="رجوع">
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{room?.title ?? name}</Text>
          <Text style={styles.sub}>
            {room?.status === "live" ? "● مباشر" : room?.status === "scheduled" ? "مجدول" : "منتهي"}
            {room?.is_recorded ? " · بيتسجل" : ""}
            {` · ${members.length} حاضر`}
          </Text>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.iconBtn} accessibilityLabel="المزيد">
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 + insets.bottom }}>
        {/* الصوت جوه ونس — زر الدخول الكبير 56dp */}
        <Pressable style={styles.voiceBanner} onPress={() => roomId && setInRoom("audio")} accessibilityLabel="انضم بالصوت">
          <Ionicons name="mic" size={20} color={colors.ink} />
          <Text style={styles.voiceBannerText}>ادخل بالصوت</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={copyLink} accessibilityLabel="نسخ رابط المجلس">
          <Ionicons name="link-outline" size={18} color={colors.goldText} />
          <Text style={styles.voiceLink}>لينك المجلس — اضغط للنسخ</Text>
        </Pressable>

        {/* Stage */}
        <Text style={styles.sectionLabel}>المرسح</Text>
        <View style={styles.stage}>
          {stage.map((m) => (
            <View key={m.user_id} style={styles.speakerWrap}>
              <View style={styles.speakerRing}>
                <Avatar initial={(names[m.user_id] ?? "و").slice(0, 1)} color={colors.surface3} size={72} />
              </View>
              <Text style={styles.speakerRole} numberOfLines={1}>{names[m.user_id] ?? (m.role === "host" ? "المضيف" : "متحدث")}{m.role === "host" ? " 👑" : ""}</Text>
              {m.role !== "host" && (
                <Text style={styles.timer}>⏱ {mm}:{ss}</Text>
              )}
            </View>
          ))}
          {stage.length === 0 && <Text style={styles.empty}>مفيش متحدثين على المرسح لسه</Text>}
        </View>

        {/* Audience */}
        <Text style={styles.sectionLabel}>المدرّج ({audience.length})</Text>
        <View style={styles.audience}>
          {audience.slice(0, 24).map((m) => (
            <Avatar key={m.user_id} initial={(names[m.user_id] ?? "س").slice(0, 1)} color={colors.surface2} size={44} />
          ))}
          {audience.length === 0 && <Text style={styles.empty}>لسه محدش دخل المدرّج</Text>}
        </View>

        {/* Hand raise / host approvals */}
        {!isHost && (
          <Pressable style={styles.raiseBtn} onPress={raiseHand}>
            <Ionicons name="hand-left-outline" size={20} color={colors.ink} />
            <Text style={styles.raiseText}>ارفع إيدك للكلام</Text>
          </Pressable>
        )}

        {isHost && pending.length > 0 && (
          <View style={styles.requestsBox}>
            <Text style={styles.sectionLabel}>طلبات الكلام ({pending.length})</Text>
            {pending.map((r) => (
              <View key={r.user_id} style={styles.requestRow}>
                <Text style={styles.requestName}>عضو بيطلب الكلام</Text>
                <Pressable style={styles.approveBtn} onPress={() => approve(r.user_id, true)}>
                  <Text style={styles.approveText}>اسمح</Text>
                </Pressable>
                <Pressable style={styles.declineBtn} onPress={() => approve(r.user_id, false)}>
                  <Text style={styles.declineText}>اعتذر</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Pinned comment */}
        {pinnedMsg && (
          <View style={styles.pinnedBox}>
            <Text style={styles.pinnedLabel}>📌 مثبت</Text>
            <Text style={styles.pinnedBody}>{pinnedMsg.body}</Text>
          </View>
        )}

        {/* Comments */}
        <Text style={styles.sectionLabel}>التعليقات</Text>
        {messages.filter((m) => !m.is_summary).length === 0 && (
          <Text style={styles.empty}>ابدأ الكلام — أول تعليق بيفتح الونس</Text>
        )}
        {messages
          .filter((m) => !m.is_summary)
          .map((m) => (
            <Pressable key={m.id} onLongPress={() => pin(m)} style={styles.comment}>
              <Text style={styles.commentBody}>{m.body}</Text>
              <View style={styles.commentMeta}>
                <Pressable onPress={() => applause(m)} style={styles.applauseBtn}>
                  <Text style={styles.applauseText}>👏 {m.applause_count}</Text>
                </Pressable>
                {m.pinned && <Text style={styles.pinnedTag}>مثبت</Text>}
              </View>
            </Pressable>
          ))}

        {messages
          .filter((m) => m.is_summary)
          .map((m) => (
            <View key={m.id} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>ملخص المجلس</Text>
              <Text style={styles.summaryBody}>{m.body}</Text>
            </View>
          ))}

        {isHost && room?.status === "ended" && (
          <>
            <Pressable style={styles.summaryBtn} onPress={() => setSummaryOpen(true)}>
              <Ionicons name="document-text-outline" size={18} color={colors.ink} />
              <Text style={styles.summaryBtnText}>اكتب ملخص المجلس</Text>
            </Pressable>
            <Pressable style={styles.deleteBtn} onPress={deleteRoom}>
              <Ionicons name="trash-outline" size={17} color={colors.red} />
              <Text style={styles.deleteBtnText}>حذف الغرفة نهائيًا</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={[styles.toast, { bottom: 24 + insets.bottom }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { marginTop: insets.top + 56 }]}>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); void copyLink(); }}>
              <Ionicons name="link-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>نسخ الرابط</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); report(); }}>
              <Ionicons name="flag-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>إبلاغ</Text>
            </Pressable>
            {isHost && room?.status !== "ended" && (
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); endCouncil(); }}>
                <Ionicons name="stop-circle-outline" size={20} color={colors.red} />
                <Text style={[styles.menuText, { color: colors.red }]}>إنهاء الجلسة</Text>
              </Pressable>
            )}
            {isHost && (
              <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); deleteRoom(); }}>
                <Ionicons name="trash-outline" size={20} color={colors.red} />
                <Text style={[styles.menuText, { color: colors.red }]}>حذف الغرفة</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {inRoom && roomId && (
        <View style={styles.roomOverlay}>
          <JitsiRoom kind="council" id={roomId} displayName={room?.title} video={false} onClose={() => setInRoom(null)} />
        </View>
      )}
      {/* Composer */}
      {!!mentionList.length && (
        <View style={styles.mentionBox}>
          {mentionList.map((u) => (
            <Pressable key={u.id} style={styles.mentionRow} onPress={() => pickMention(u)}>
              <Text style={styles.mentionName}>{u.display_name ?? u.username}</Text>
              <Text style={styles.mentionHandle}>@{u.username}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            const m = t.match(/@([A-Za-z0-9_]{0,30})$/);
            if (!m) {
              setMentionList([]);
              return;
            }
            setTimeout(async () => {
              const { data } = await supabase
                .from("profiles")
                .select("id, username, display_name")
                .or(`username.ilike.${m[1]}%,display_name.ilike.${m[1]}%`)
                .limit(5);
              setMentionList((data ?? []) as { id: string; username: string | null; display_name: string | null }[]);
            }, 250);
          }}
          placeholder="اتكلم في المجلس… و @ لمنشن"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable onPress={sendComment} style={styles.sendBtn}>
          <Ionicons name="send" size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Summary modal */}
      {summaryOpen && (
        <View style={styles.summaryBackdrop}>
          <View style={styles.summarySheet}>
            <Text style={styles.sheetTitle}>ملخص المجلس</Text>
            <TextInput
              value={summaryText}
              onChangeText={setSummaryText}
              placeholder="أهم اللي اتقال في المجلس…"
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
              multiline
            />
            <Pressable style={styles.summaryBtn} onPress={publishSummary}>
              <Text style={styles.summaryBtnText}>انشر الملخص</Text>
            </Pressable>
            <Pressable onPress={() => setSummaryOpen(false)}>
              <Text style={styles.cancel}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  iconBtn: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  linkBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48 },
  toast: { position: "absolute", alignSelf: "center", backgroundColor: colors.gold, paddingHorizontal: 18, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", zIndex: 30 },
  toastText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "flex-start", paddingHorizontal: 16 },
  menu: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, minWidth: 220, paddingVertical: 6 },
  menuItem: { flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16 },
  menuText: { color: colors.text, fontSize: 15, fontFamily: "Cairo_600SemiBold", textAlign: "right", flex: 1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  sub: { color: colors.red, fontSize: 11, textAlign: "right" },
  sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right" },
  stage: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, minHeight: 100 },
  speakerWrap: { alignItems: "center", gap: 4 },
  speakerRing: { borderWidth: 2, borderColor: colors.goldText, borderRadius: 40, padding: 3 },
  speakerRole: { color: colors.text, fontSize: 10 },
  timer: { color: colors.goldText, fontSize: 10, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  audience: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, backgroundColor: colors.surface, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: colors.border },
  raiseBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, minHeight: 56, borderRadius: 16 },
  raiseText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14 },
  requestsBox: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  requestRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  requestName: { color: colors.text, fontSize: 12, flex: 1, textAlign: "right" },
  approveBtn: { backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  approveText: { color: colors.ink, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  declineBtn: { backgroundColor: colors.surface3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  declineText: { color: colors.muted, fontSize: 11 },
  pinnedBox: { backgroundColor: colors.surface2, borderRadius: 14, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.goldText, gap: 4 },
  pinnedLabel: { color: colors.goldText, fontSize: 11, textAlign: "right" },
  pinnedBody: { color: colors.text, fontSize: 13, textAlign: "right" },
  comment: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  commentBody: { color: colors.text, fontSize: 16, textAlign: "right" },
  commentMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  applauseBtn: { backgroundColor: colors.surface3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  applauseText: { color: colors.text, fontSize: 11 },
  pinnedTag: { color: colors.goldText, fontSize: 10 },
  summaryCard: { backgroundColor: "rgba(240,201,90,0.12)", borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.goldText },
  summaryLabel: { color: colors.goldText, fontSize: 12, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  summaryBody: { color: colors.text, fontSize: 16, textAlign: "right" },
  summaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, height: 48, borderRadius: 16 },
  summaryBtnText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  roomOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  composer: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, textAlign: "right" },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  summaryBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 24 },
  summarySheet: { backgroundColor: colors.surface2, borderRadius: 22, padding: 20, gap: 12 },
  sheetTitle: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  cancel: { color: colors.muted, textAlign: "center", fontSize: 13 },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", flex: 1 },
  error: { color: colors.red, fontSize: 12, textAlign: "center", padding: 8 },
  voiceBanner: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, borderRadius: 14, minHeight: 56 },
  voiceBannerText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  voiceLink: { color: colors.goldText, fontSize: 11.5, textAlign: "center" },
  deleteBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.red, paddingVertical: 10, marginTop: 8 },
  deleteBtnText: { color: colors.red, fontSize: 12.5, fontWeight: "800" },
  mentionBox: { backgroundColor: colors.surface, marginHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 4 },
  mentionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  mentionName: { color: colors.text, fontSize: 12.5, flex: 1, textAlign: "right" },
  mentionHandle: { color: colors.muted, fontSize: 11 },
})));

