import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Switch, Modal, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell, Avatar, VerificationBadge } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { loadMessageState, updateMessageState, withConversation, type ConversationPreference } from "@/lib/chat-preferences";
type Peer = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  verification_tone: string | null;
};

/**
 * ركن الونسة — القسم 20. الضغط على اسم الشخص بأعلى المحادثة يفتح هنا:
 * معلومات المحادثة، الوسائط المشتركة، كتم، حظر، إبلاغ، وتفاصيل الحساب.
 */
export default function ChatInfoScreen() {
  useThemeContext();
  const { id: peerId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [peer, setPeer] = useState<Peer | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [counts, setCounts] = useState({ messages: 0, media: 0, files: 0 });
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ConversationPreference>({});
  const [sharedType, setSharedType] = useState<"media" | "links" | "files" | null>(null);
  const [sharedRows, setSharedRows] = useState<{ id: string; body: string | null; media_type: string | null; media_url: string | null; created_at: string }[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        if (active) setMe(uid);
        if (uid) {
          const state = await loadMessageState(uid);
          if (active) setPreferences(state.conversations[peerId] ?? {});
        }

        const { data: p, error: perr } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, bio, is_verified, verification_tone")
          .eq("id", peerId)
          .single();
        if (perr) throw perr;
        if (active) setPeer(p as Peer);

        if (!uid) return;

        const { data: msgs } = await supabase
          .from("direct_messages")
          .select("id, media_type")
          .or(
            `and(sender_id.eq.${uid},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${uid})`
          )
          .limit(1000);

        const media = (msgs ?? []).filter((m) => !!m.media_type).length;
        const files = (msgs ?? []).filter((m) => m.media_type === "file").length;
        if (active) setCounts({ messages: msgs?.length ?? 0, media, files });

        const { data: pref } = await supabase
          .from("muted_users")
          .select("muter_id")
          .eq("muter_id", uid)
          .eq("muted_user_id", peerId)
          .maybeSingle();
        if (active) setMuted(!!pref);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تعذّر تحميل الركن");
      }
    })();
    return () => {
      active = false;
    };
  }, [peerId]);

  async function setConversationPreference(key: keyof ConversationPreference, value: boolean) {
    if (!me) return;
    try {
      const state = await updateMessageState(me, (current) => withConversation(current, peerId, { [key]: value }));
      setPreferences(state.conversations[peerId] ?? {});
    } catch {
      Alert.alert("تعذّر الحفظ", "ما قدرناش نحفظ إعداد المحادثة على الجهاز.");
    }
  }

  async function openShared(type: "media" | "links" | "files") {
    if (!me) return;
    setSharedType(type);
    setSharedLoading(true);
    try {
      const { data, error: queryError } = await supabase.from("direct_messages")
        .select("id, body, media_type, media_url, created_at")
        .or(`and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`)
        .order("created_at", { ascending: false }).limit(500);
      if (queryError) throw queryError;
      const all = data ?? [];
      const rows = type === "files"
        ? all.filter((row) => row.media_type === "file")
        : type === "media"
          ? all.filter((row) => !!row.media_type && (/^(image|video|audio)/.test(row.media_type) || row.media_type === "sticker"))
          : all.filter((row) => /https?:\/\/[^\s]+/i.test(row.body ?? ""));
      setSharedRows(rows);
    } catch (e) {
      setSharedRows([]);
      Alert.alert("تعذّر التحميل", e instanceof Error ? e.message : "حصلت مشكلة في جلب المحتوى");
    } finally {
      setSharedLoading(false);
    }
  }

  async function openSharedItem(row: (typeof sharedRows)[number]) {
    const raw = row.media_url ?? row.body?.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) {
      await Linking.openURL(raw);
      return;
    }
    const path = raw.startsWith("chat-media/") ? raw.slice("chat-media/".length) : raw;
    const { data, error: urlError } = await supabase.storage.from("chat-media").createSignedUrl(path, 1800);
    if (urlError || !data?.signedUrl) {
      Alert.alert("تعذّر فتح المرفق", urlError?.message ?? "الرابط المؤقت غير متاح");
      return;
    }
    await Linking.openURL(data.signedUrl);
  }

  async function toggleMute(next: boolean) {
    if (!me) return;
    setMuted(next);
    if (next) {
      const { error: err } = await supabase
        .from("muted_users")
        .insert({ muter_id: me, muted_user_id: peerId });
      if (err && !err.message.includes("duplicate")) {
        setMuted(false);
        Alert.alert("تعذّر الكتم", err.message);
      }
    } else {
      await supabase.from("muted_users").delete().eq("muter_id", me).eq("muted_user_id", peerId);
    }
  }

  function block() {
    Alert.alert("حظر الحساب", "هيتم منع الرسائل والتفاعل بينكم في الاتجاهين. متأكد؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احظر",
        style: "destructive",
        onPress: async () => {
          if (!me) return;
          const { error: err } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: peerId });
          if (err) Alert.alert("تعذّر الحظر", err.message);
          else router.back();
        },
      },
    ]);
  }

  function report() {
    Alert.alert("الإبلاغ", "هنراجع البلاغ ونبلّغك بالنتيجة.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إبلاغ",
        style: "destructive",
        onPress: async () => {
          if (!me) return;
          const { error: err } = await supabase.from("content_reports").insert({
            reporter_id: me,
            reported_user_id: peerId,
            reason: "بلاغ من ركن الونسة",
          });
          Alert.alert(err ? "تعذّر الإرسال" : "تم الإرسال", err?.message ?? "هنراجع البلاغ قريباً");
        },
      },
    ]);
  }

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>ركن الونسة</Text>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.profileCard}>
          <Avatar initial={(peer?.display_name ?? name ?? "؟")[0]} color={colors.surface3} size={80} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{peer?.display_name ?? name ?? "—"}</Text>
              {peer?.is_verified && <VerificationBadge tone={(peer.verification_tone as "yellow") ?? "yellow"} small />}
            </View>
            <Text style={styles.username}>@{peer?.username ?? "—"}</Text>
            {!!peer?.bio && <Text style={styles.bio}>{peer.bio}</Text>}
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat label="رسالة" value={counts.messages} />
          <Stat label="مرفق" value={counts.media} />
          <Stat label="ملف" value={counts.files} />
        </View>

        <Text style={styles.sectionTitle}>المحتوى</Text>
        <Row icon="images-outline" label="الوسائط المشتركة" onPress={() => void openShared("media")} />
        <Row icon="link-outline" label="الروابط" onPress={() => void openShared("links")} />
        <Row icon="document-text-outline" label="الملفات" onPress={() => void openShared("files")} />

        <Text style={styles.sectionTitle}>الخصوصية</Text>
        <PreferenceRow label="إخفاء حالة النشاط" hint="لن يعرف الطرف الآخر إن كنت نشطًا الآن" value={preferences.hideActivity ?? false} onChange={(value) => void setConversationPreference("hideActivity", value)} />
        <PreferenceRow label="إخفاء الكتابة" hint="لن يظهر أنك تكتب" value={preferences.hideTyping ?? false} onChange={(value) => void setConversationPreference("hideTyping", value)} />
        <PreferenceRow label="حفظ الصور تلقائيًا" hint="الصور الواردة من الونسة دي تتحفظ في معرض الهاتف" value={preferences.autoSaveMedia ?? false} onChange={(value) => void setConversationPreference("autoSaveMedia", value)} />
        <PreferenceRow label="إشعار القراءة" hint="عند الإيقاف سيظهر التسليم فقط" value={preferences.readReceipts ?? true} onChange={(value) => void setConversationPreference("readReceipts", value)} />

        <View style={styles.switchRow}>
          <Switch
            value={muted}
            onValueChange={toggleMute}
            trackColor={{ true: colors.gold, false: colors.surface3 }}
            thumbColor={colors.text}
          />
          <Text style={styles.switchLabel}>اكتم التنبيهات</Text>
        </View>

        <Row icon="notifications-off-outline" label="كتم هذه الونسة" onPress={() => toggleMute(!muted)} />
        <PreferenceRow label="قفل المحادثة بالبصمة" hint="بتحتاج تحقق الجهاز قبل فتح الرسائل" value={preferences.locked ?? false} onChange={(value) => void setConversationPreference("locked", value)} />
        <Row icon="flag-outline" label="بلّغ عن الحساب" onPress={report} danger />
        <Row icon="ban-outline" label="احظر الحساب" onPress={block} danger />
      </ScrollView>
      <Modal visible={!!sharedType} transparent animationType="slide" onRequestClose={() => setSharedType(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSharedType(null)}>
          <Pressable style={styles.sharedSheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sharedTitle}>{sharedType === "media" ? "الوسائط المشتركة" : sharedType === "files" ? "الملفات" : "الروابط"}</Text>
            {sharedLoading ? <Text style={styles.sharedEmpty}>بنحمّل المحتوى…</Text> : sharedRows.length === 0 ? <Text style={styles.sharedEmpty}>مفيش محتوى من النوع ده في المحادثة لحد دلوقتي.</Text> : (
              <ScrollView>
                {sharedRows.map((item) => (
                  <Pressable key={item.id} style={styles.sharedItem} onPress={() => void openSharedItem(item)}>
                    <Text style={styles.sharedItemText} numberOfLines={2}>{item.body || item.media_type || "مرفق"}</Text>
                    <Text style={styles.sharedDate}>{new Date(item.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PreferenceRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.preferenceRow}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.gold, false: colors.surface3 }} thumbColor={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.preferenceHint}>{hint}</Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.red : colors.text} />
      <Text style={[styles.rowLabel, danger && { color: colors.red }]}>{label}</Text>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  profileCard: { flexDirection: "row-reverse", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  name: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  username: { color: colors.muted, fontSize: 12, textAlign: "right" },
  bio: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 4 },
  statsRow: { flexDirection: "row-reverse", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.goldText, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  statLabel: { color: colors.muted, fontSize: 11 },
  sectionTitle: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 4 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  rowLabel: { color: colors.text, fontSize: 14, flex: 1, textAlign: "right" },
  preferenceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.border },
  preferenceHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  switchLabel: { color: colors.text, fontSize: 14 },
  error: { color: colors.red, fontSize: 12, textAlign: "right" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sharedSheet: { backgroundColor: colors.surface, maxHeight: "75%", minHeight: "35%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 28 },
  sharedTitle: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  sharedEmpty: { color: colors.muted, textAlign: "center", paddingVertical: 32 },
  sharedItem: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  sharedItemText: { color: colors.text, flex: 1, textAlign: "right" },
  sharedDate: { color: colors.muted, fontSize: 11, marginHorizontal: 10 },
})));
