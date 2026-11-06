import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { EXTRA_TONES, TONES, TONE_LABELS, getProfile, type PublicProfile } from "@/lib/social";
import { useThemeContext } from "@/lib/theme-provider";

type RequestRow = { id: string; status: string; created_at: string; reason: string | null };

/**
 * التوثيق وشارات ونس — الشارات الستة بتتحط من فريق المراجعة فقط،
 * والمستخدم بيبعت طلب بسبب واضح ورابط نشاط، وبيقدر يشوف حالة طلباته.
 */
export default function VerificationScreen() {
  useThemeContext();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    setUid(id);
    if (!id) {
      setLoading(false);
      return;
    }
    const [p, rows] = await Promise.all([
      getProfile(id),
      supabase.from("verification_requests").select("id, status, created_at, reason").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    ]);
    setProfile(p);
    setRequests((rows.data ?? []) as RequestRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const pending = requests.some((r) => r.status === "pending");

  async function send() {
    if (!uid) return;
    if (reason.trim().length < 10) {
      setError("اكتب سبب واضح (10 حروف على الأقل) عشان المراجعة.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("verification_requests")
        .insert({ user_id: uid, reason: reason.trim(), link_url: link.trim() || null });
      if (err) throw err;
      setSent(true);
      setReason("");
      setLink("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "مقدرناش نبعت الطلب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>التوثيق وشارات ونس</Text>
        <View style={{ width: 22 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              {profile?.is_verified ? <VerificationBadge tone={profile.verification_tone ?? "yellow"} size={26} /> : <Ionicons name="shield-outline" size={26} color={colors.muted} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {profile?.is_verified ? `ركنك موثّق · ${TONE_LABELS[profile.verification_tone ?? "yellow"] ?? "شارة ذهبية"}` : "ركنك لسه مش موثّق"}
                </Text>
                <Text style={styles.statusSub}>
                  {pending ? "طلبك تحت المراجعة — هنرد عليك بأول قرار." : "الشارة بتتحط بعد المراجعة فقط، ومفيش حد يقدر يزوّرها من التطبيق."}
                </Text>
              </View>
            </View>
            <View style={styles.toneRow}>
              {TONES.map((t) => (
                <View key={t} style={{ alignItems: "center", gap: 4 }}>
                  <VerificationBadge tone={t} size={30} />
                  <Text style={styles.toneText}>{TONE_LABELS[t].split(" · ")[1]}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.toneText, { textAlign: "right", marginTop: 10 }]}>ألوان ناعمة وترابية إضافية</Text>
            <View style={[styles.toneRow, { flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }]}>
              {EXTRA_TONES.map((t) => (
                <View key={t} style={{ alignItems: "center", gap: 4, minWidth: 52 }}>
                  <VerificationBadge tone={t} size={30} />
                  <Text style={styles.toneText}>{TONE_LABELS[t].split(" · ")[0].split(" ").pop()}</Text>
                </View>
              ))}
            </View>
          </View>

          {sent && (
            <View style={styles.success}>
              <Ionicons name="checkmark-circle" size={18} color={colors.green} />
              <Text style={styles.successText}>وصل طلبك ✅ هيراجعه الفريق وهنبلغك بالقرار.</Text>
            </View>
          )}

          <Text style={styles.section}>اطلب التوثيق</Text>
          <View style={styles.card}>
            <Text style={styles.label}>ليه محتاج التوثيق؟</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="مثال: منشئ محتوى معروف ولديّ حضور جماهيري موثّق…"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            />
            <Text style={styles.label}>رابط يوضح نشاطك (اختياري)</Text>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="https://"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={styles.input}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={send} disabled={busy || pending}>
              {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{pending ? "طلبك تحت المراجعة" : "ابعت الطلب"}</Text>}
            </Pressable>
          </View>

          <Text style={styles.section}>طلباتي</Text>
          {requests.length === 0 ? (
            <Text style={styles.empty}>مفيش طلبات لسه.</Text>
          ) : (
            requests.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <Ionicons
                  name={r.status === "approved" ? "checkmark-circle" : r.status === "rejected" ? "close-circle" : "time-outline"}
                  size={18}
                  color={r.status === "approved" ? colors.green : r.status === "rejected" ? colors.red : colors.goldText}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestTitle}>
                    {r.status === "approved" ? "تمت الموافقة" : r.status === "rejected" ? "مرفوض" : "تحت المراجعة"}
                  </Text>
                  <Text style={styles.requestSub} numberOfLines={2}>
                    {r.reason ?? "—"}
                  </Text>
                </View>
                <Text style={styles.requestDate}>{new Date(r.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</Text>
              </View>
            ))
          )}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 8 },
  topTitle: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold" },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  statusTitle: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", textAlign: "right" },
  statusSub: { color: colors.muted, fontSize: 11, textAlign: "right", lineHeight: 18, marginTop: 2 },
  toneRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingTop: 6 },
  toneText: { color: colors.muted, fontSize: 10 },
  section: { color: colors.text, fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right", marginTop: 6 },
  label: { color: colors.muted, fontSize: 12, textAlign: "right" },
  input: { backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, textAlign: "right" },
  primary: { backgroundColor: colors.gold, borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryText: { color: colors.ink, fontSize: 14, fontFamily: "Cairo_700Bold" },
  error: { color: colors.red, fontSize: 12, textAlign: "right" },
  success: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  successText: { color: colors.text, fontSize: 12, flex: 1, textAlign: "right" },
  empty: { color: colors.muted, fontSize: 12, textAlign: "right" },
  requestRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  requestTitle: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: "right" },
  requestSub: { color: colors.muted, fontSize: 11, textAlign: "right" },
  requestDate: { color: colors.muted, fontSize: 10 },
});
