import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { errorMessage } from "@/lib/errors";
import { friendIds, myId } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Highlight = { id: string; title: string };
type Friend = { id: string; name: string };

/** أفكار جديدة لونس — اللحظات المميزة · بطاقة ونس · الدائرة القريبة · الزوار · الإنجازات · الحالة المؤقتة. */
export default function IdeasScreen() {
  useThemeContext();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [circle, setCircle] = useState<Set<string>>(new Set());
  const [circleOpen, setCircleOpen] = useState(false);
  const [visits, setVisits] = useState(0);
  const [status, setStatus] = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [ach, setAch] = useState({ posts: 0, friends: 0, streak: 0 });

  const load = useCallback(async () => {
    const id = await myId();
    setUid(id);
    if (!id) return setLoading(false);
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const [h, c, v, p, fr, prof] = await Promise.all([
      supabase.from("story_highlights").select("id, title").eq("user_id", id).order("created_at"),
      supabase.from("close_circle").select("friend_id").eq("user_id", id),
      supabase.from("profile_visits").select("id", { count: "exact", head: true }).eq("profile_id", id).gte("visited_at", week),
      supabase.from("posts").select("created_at").eq("author_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(60),
      friendIds(id).catch(() => [] as string[]),
      supabase.from("profiles").select("status_text, status_expires_at").eq("id", id).maybeSingle(),
    ]);
    setHighlights((h.data ?? []) as Highlight[]);
    setCircle(new Set((c.data ?? []).map((r: { friend_id: string }) => r.friend_id)));
    setVisits(v.count ?? 0);
    // أيام متتالية بمنشورات
    const days = new Set((p.data ?? []).map((r: { created_at: string }) => r.created_at.slice(0, 10)));
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      if (days.has(d)) streak++;
      else if (i > 0) break;
    }
    setAch({ posts: (p.data ?? []).length, friends: fr.length, streak });
    const pr = prof.data as { status_text?: string | null; status_expires_at?: string | null } | null;
    setActiveStatus(pr?.status_text && (!pr.status_expires_at || new Date(pr.status_expires_at) > new Date()) ? pr.status_text : null);
    if (fr.length) {
      const { data } = await supabase.from("profiles").select("id, display_name, username").in("id", fr.slice(0, 200));
      setFriends((data ?? []).map((r: { id: string; display_name: string | null; username: string | null }) => ({ id: r.id, name: r.display_name ?? r.username ?? "صديق" })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addHighlight() {
    const title = newTitle.trim();
    if (!uid || !title) return;
    const { error } = await supabase.from("story_highlights").insert({ user_id: uid, title });
    if (error) return Alert.alert("مقدرناش نضيف", errorMessage(error, "شغّل ملف الـ SQL الجديد (story_highlights) في Supabase"));
    setNewTitle(""); setAddOpen(false); void load();
  }
  function removeHighlight(h: Highlight) {
    Alert.alert("حذف الدايرة", `تحذف «${h.title}»؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "احذف", style: "destructive", onPress: async () => { await supabase.from("story_highlights").delete().eq("id", h.id); void load(); } },
    ]);
  }
  async function toggleCircle(f: Friend) {
    if (!uid) return;
    const next = new Set(circle);
    if (next.has(f.id)) {
      next.delete(f.id);
      setCircle(next);
      await supabase.from("close_circle").delete().eq("user_id", uid).eq("friend_id", f.id);
    } else {
      next.add(f.id);
      setCircle(next);
      const { error } = await supabase.from("close_circle").insert({ user_id: uid, friend_id: f.id });
      if (error) { next.delete(f.id); setCircle(new Set(next)); Alert.alert("مقدرناش نضيفه", errorMessage(error)); }
    }
  }
  async function saveStatus(clear = false) {
    if (!uid) return;
    const text = clear ? null : status.trim() || null;
    const patch = { status_text: text, status_expires_at: text ? new Date(Date.now() + 86400000).toISOString() : null };
    let { error } = await supabase.from("profiles").update(patch).eq("id", uid);
    if (error && (error.code === "PGRST204" || error.code === "42703")) ({ error } = await supabase.from("profiles").update({ status_text: text }).eq("id", uid));
    if (error) return Alert.alert("مقدرناش نحفظ الحالة", errorMessage(error));
    setStatus(""); void load();
  }

  const badges = [
    { icon: "flame-outline", label: "أيام متتالية", on: ach.streak >= 2, sub: `${ach.streak} يوم` },
    { icon: "star-outline", label: "أول منشور", on: ach.posts >= 1, sub: ach.posts ? "تم" : "لسه" },
    { icon: "people-outline", label: "أول ١٠ أصدقاء", on: ach.friends >= 10, sub: `${ach.friends}/10` },
    { icon: "ribbon-outline", label: "نشيط", on: ach.posts >= 10, sub: `${ach.posts}/10 منشور` },
  ] as const;

  return (
    <ScreenShell>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>أفكار جديدة لونس</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
          <Card title="اللحظات المميزة" sub="قصصك تتحفظ في دوائر دائمة على ركنك بدل ما تختفي.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 14 }}>
              <Pressable style={styles.hl} onPress={() => setAddOpen(true)}>
                <View style={[styles.ring, { borderStyle: "dashed" }]}><Ionicons name="add" size={26} color={colors.goldText} /></View>
                <Text style={styles.hlText}>جديد+</Text>
              </Pressable>
              {highlights.map((h) => (
                <Pressable key={h.id} style={styles.hl} onPress={() => router.push("/story/new")} onLongPress={() => removeHighlight(h)}>
                  <View style={styles.ring}><Text style={styles.hlInitial}>{h.title[0]}</Text></View>
                  <Text style={styles.hlText} numberOfLines={1}>{h.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          <Card title="بطاقة ونس" sub="كود QR شخصي: تشاركه وأي حد يتابعك بمسحة." onPress={() => router.push("/my-card")} icon="qr-code-outline" />

          <Card title="الدائرة القريبة" sub="اختر أقرب ناسك: منشورات وقصص تظهر لهم بس." onPress={() => setCircleOpen(true)} icon="people-circle-outline">
            <Text style={styles.chipGold}>الأقربون · {circle.size}</Text>
          </Card>

          <Card title="زوار ركنك (خاص)" sub="تعرف مين زار ركنك. أنت بس اللي تشوفهم." onPress={() => router.push("/visitors")} icon="eye-outline">
            <Text style={styles.sub}>{visits} زاروا ركنك هذا الأسبوع</Text>
          </Card>

          <Card title="الإنجازات" sub="شارات على النشاط: أيام متتالية، أول منشور، أصدقاء.">
            <View style={styles.badgeRow}>
              {badges.map((b) => (
                <View key={b.label} style={[styles.badge, !b.on && { opacity: 0.45 }]}>
                  <Ionicons name={b.icon} size={22} color={colors.goldText} />
                  <Text style={styles.badgeText}>{b.label}</Text>
                  <Text style={styles.badgeSub}>{b.sub}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card title="الحالة المؤقتة" sub="جملة قصيرة تظهر بجانب صورتك ٢٤ ساعة.">
            {activeStatus ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{activeStatus} · تختفي بعد ٢٤ ساعة</Text>
                <Pressable onPress={() => void saveStatus(true)} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.ink} /></Pressable>
              </View>
            ) : (
              <View style={styles.statusEdit}>
                <TextInput style={styles.input} value={status} onChangeText={setStatus} placeholder="حالتك هنا" placeholderTextColor={colors.muted} maxLength={60} textAlign="right" />
                <Pressable style={styles.save} onPress={() => void saveStatus()}><Text style={styles.saveText}>انشر</Text></Pressable>
              </View>
            )}
          </Card>
        </ScrollView>
      )}

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => undefined}>
            <Text style={styles.cardTitle}>اسم الدايرة الجديدة</Text>
            <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="مثال: رحلاتي" placeholderTextColor={colors.muted} maxLength={24} textAlign="right" autoFocus />
            <Pressable style={styles.save} onPress={() => void addHighlight()}><Text style={styles.saveText}>إضافة</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={circleOpen} transparent animationType="slide" onRequestClose={() => setCircleOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCircleOpen(false)}>
          <Pressable style={[styles.dialog, { maxHeight: "75%" }]} onPress={() => undefined}>
            <Text style={styles.cardTitle}>الأقربون ({circle.size})</Text>
            <ScrollView>
              {friends.length === 0 && <Text style={styles.sub}>لسه مفيش أصدقاء تضيفهم.</Text>}
              {friends.map((f) => (
                <Pressable key={f.id} style={styles.friendRow} onPress={() => void toggleCircle(f)}>
                  <Ionicons name={circle.has(f.id) ? "checkmark-circle" : "ellipse-outline"} size={24} color={colors.goldText} />
                  <Text style={styles.friendName}>{f.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function Card({ title, sub, children, onPress, icon }: { title: string; sub: string; children?: React.ReactNode; onPress?: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"] }) {
  const body = (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {icon ? <Ionicons name={icon} size={20} color={colors.goldText} /> : null}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.sub}>{sub}</Text>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    top: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
    cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    cardTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    sub: { color: colors.muted, fontSize: 12, textAlign: "right", lineHeight: 18 },
    hl: { alignItems: "center", gap: 6, width: 64 },
    ring: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
    hlInitial: { color: colors.goldText, fontSize: 20, fontWeight: "bold" },
    hlText: { color: colors.text, fontSize: 11 },
    chipGold: { alignSelf: "flex-end", backgroundColor: colors.gold, color: colors.ink, fontSize: 12, fontWeight: "bold", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, overflow: "hidden" },
    badgeRow: { flexDirection: "row-reverse", gap: 8 },
    badge: { flex: 1, minHeight: 84, borderRadius: 14, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", gap: 3, padding: 6 },
    badgeText: { color: colors.text, fontSize: 10, textAlign: "center", fontWeight: "bold" },
    badgeSub: { color: colors.muted, fontSize: 9 },
    statusPill: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 16, minHeight: 44 },
    statusText: { color: colors.ink, fontSize: 13, fontWeight: "bold", flex: 1, textAlign: "right" },
    statusEdit: { flexDirection: "row-reverse", gap: 8 },
    input: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 14, color: colors.text, fontSize: 14 },
    save: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    saveText: { color: colors.ink, fontWeight: "bold" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
    dialog: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 12 },
    friendRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 48 },
    friendName: { color: colors.text, fontSize: 14 },
  }),
);
