import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, pickVideo, signedMediaUrl, type PickedMedia } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  capsuleCountdown,
  createCapsule,
  deleteCapsule,
  listMyCapsules,
  listOpenedCapsules,
  openCapsule,
  type Capsule,
} from "@/lib/excellence";

type Tab = "mine" | "friends";

const PRESETS = [
  { label: "بعد سنة", months: 12 },
  { label: "بعد ٦ شهور", months: 6 },
  { label: "بعد ٣ شهور", months: 3 },
  { label: "بعد شهر", months: 1 },
];

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function CapsuleMedia({ path, type }: { path: string; type: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const signed = await signedMediaUrl(path);
      if (active) setUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [path]);
  if (!url) return <ActivityIndicator color={colors.goldText} />;
  if (type === "image") return <Image source={{ uri: url }} style={styles.media} resizeMode="cover" />;
  return (
    <View style={styles.mediaFile}>
      <Ionicons name={type === "video" ? "videocam" : "mic"} size={18} color={colors.goldText} />
      <Text style={styles.mediaFileText}>{type === "video" ? "مقطع في الكبسولة" : "صوت في الكبسولة"}</Text>
    </View>
  );
}

/**
 * كبسولة الذكرى — القسم 34: رسالة/منشور/صورة بتترجع لك بعد سنة (أو أي مدة تختارها)،
 * مع اختيار الجمهور (خاص لك، أصحابك، أو للجميع بعد الفتح).
 */
export default function CapsuleScreen() {
  useThemeContext();
  const [tab, setTab] = useState<Tab>("mine");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Capsule[]>([]);
  const [friends, setFriends] = useState<Capsule[]>([]);
  const [composing, setComposing] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [months, setMonths] = useState(12);
  const [audience, setAudience] = useState<"private" | "friends" | "public">("private");
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const [m, f] = await Promise.all([listMyCapsules(uid), listOpenedCapsules(uid)]);
      setMine(m);
      setFriends(f);
    } catch (error) {
      Alert.alert("مشكلة في التحميل", error instanceof Error ? error.message : "حاول تاني");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
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

  const openAt = useMemo(() => addMonths(new Date(clock), months), [months, clock]);

  const reset = () => {
    setTitle("");
    setBody("");
    setMedia(null);
    setMonths(12);
    setAudience("private");
    setRemind(true);
    setComposing(false);
  };

  const submit = async () => {
    if (!userId) return;
    if (!title.trim()) {
      Alert.alert("اكتب عنوان للكبسولة", "مثلًا: رسالة ليك بعد سنة");
      return;
    }
    setSaving(true);
    try {
      await createCapsule(userId, {
        title,
        body,
        media,
        audience,
        openAt,
        remindBeforeHours: remind ? 24 : undefined,
      });
      reset();
      await load();
      Alert.alert("اتقفلت الكبسولة 🎁", `هتفتح ${capsuleCountdown(openAt.toISOString())} — يوم ${openAt.toLocaleDateString("ar-EG-u-nu-latn")}`);
    } catch (error) {
      Alert.alert("محصلش حفظ", error instanceof Error ? error.message : "حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const openNow = async (capsule: Capsule) => {
    try {
      if (capsule.owner_id === userId) await openCapsule(capsule.id);
      setMine((prev) => prev.map((c) => (c.id === capsule.id ? { ...c, opened_at: c.opened_at ?? new Date().toISOString() } : c)));
    } catch (error) {
      Alert.alert("مش قادر أفتحها", error instanceof Error ? error.message : "");
    }
  };

  const remove = (capsule: Capsule) => {
    Alert.alert("تحذف الكبسولة؟", "مش هتقدر ترجّعها تاني.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCapsule(capsule.id);
            setMine((prev) => prev.filter((c) => c.id !== capsule.id));
          } catch (error) {
            Alert.alert("مش قادر أحذف", error instanceof Error ? error.message : "");
          }
        },
      },
    ]);
  };

  const renderCapsule = (capsule: Capsule, isMine: boolean) => {
    const ready = new Date(capsule.open_at).getTime() <= clock;
    const opened = !!capsule.opened_at;
    return (
      <View key={capsule.id} style={styles.capsuleCard}>
        <View style={styles.capsuleTop}>
          <Text style={styles.capsuleGift}>{ready ? (opened ? "📖" : "🎁") : "🔒"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.capsuleTitle}>{capsule.title}</Text>
            <Text style={styles.capsuleMeta}>
              {isMine
                ? `${capsuleCountdown(capsule.open_at)} · ${new Date(capsule.open_at).toLocaleDateString("ar-EG-u-nu-latn")}`
                : `من ${capsule.profiles?.display_name ?? capsule.profiles?.username ?? "صاحبك"}`}
            </Text>
          </View>
          {isMine && !ready && (
            <Pressable onPress={() => remove(capsule)} hitSlop={10}>
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {ready && (opened || !isMine) ? (
          <>
            {capsule.body ? <Text style={styles.capsuleBody}>{capsule.body}</Text> : null}
            {capsule.media_url ? <CapsuleMedia path={capsule.media_url} type={capsule.media_type} /> : null}
            {isMine && !opened && (
              <Pressable style={styles.openBtn} onPress={() => openNow(capsule)}>
                <Text style={styles.openBtnText}>افتح الكبسولة</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed" size={14} color={colors.goldText} />
            <Text style={styles.lockedText}>
              {ready ? "الكبسولة جاهزة — اضغط «افتح الكبسولة»" : `هتفتح ${capsuleCountdown(capsule.open_at)}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenShell>
      <Header title="كبسولة الذكرى" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🎁</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>كبسولة ذكرى ترجع لك بعد سنة</Text>
            <Text style={styles.heroSub}>
              اكتب رسالة لنفسك أو لأصحابك، حط صورة أو صوت، وسيبها تتقفل. هتفتح في يوم تحدده — وتحسّ وقتها إنك
              كنت فاكر نفسك.
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {[
            { key: "mine" as Tab, label: `كبسولاتي (${mine.length})` },
            { key: "friends" as Tab, label: "كبسولات فتحت" },
          ].map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "mine" && !composing && (
          <Pressable style={styles.newBtn} onPress={() => setComposing(true)}>
            <Ionicons name="add-circle" size={20} color={colors.ink} />
            <Text style={styles.newBtnText}>اعمل كبسولة جديدة</Text>
          </Pressable>
        )}

        {tab === "mine" && composing && (
          <View style={styles.composer}>
            <Text style={styles.fieldLabel}>العنوان</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="رسالة لنفسي بعد سنة…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              textAlign="right"
              maxLength={120}
            />
            <Text style={styles.fieldLabel}>الرسالة (اختياري)</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="اكتب اللي في قلبك…"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.textarea]}
              textAlign="right"
              multiline
              maxLength={3000}
            />

            <View style={styles.row}>
              <Pressable style={styles.attachBtn} onPress={async () => setMedia(await pickImage())}>
                <Ionicons name="image-outline" size={16} color={colors.text} />
                <Text style={styles.attachText}>صورة</Text>
              </Pressable>
              <Pressable style={styles.attachBtn} onPress={async () => setMedia(await pickVideo())}>
                <Ionicons name="videocam-outline" size={16} color={colors.text} />
                <Text style={styles.attachText}>فيديو</Text>
              </Pressable>
              {media && (
                <Pressable style={styles.removeMedia} onPress={() => setMedia(null)}>
                  <Ionicons name="close" size={14} color={colors.ink} />
                  <Text style={styles.removeMediaText}>شيل المرفق</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.fieldLabel}>تفتح إمتى؟</Text>
            <View style={styles.chipRow}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => setMonths(p.months)}
                  style={[styles.chip, months === p.months && styles.chipActive]}
                >
                  <Text style={[styles.chipText, months === p.months && { color: colors.ink }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.openDate}>هتفتح: {openAt.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })}</Text>

            <Text style={styles.fieldLabel}>مين يشوفها لما تفتح؟</Text>
            <View style={styles.chipRow}>
              {[
                { key: "private" as const, label: "أنا بس" },
                { key: "friends" as const, label: "أصحابي" },
                { key: "public" as const, label: "الجميع" },
              ].map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => setAudience(a.key)}
                  style={[styles.chip, audience === a.key && styles.chipActive]}
                >
                  <Text style={[styles.chipText, audience === a.key && { color: colors.ink }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.remindRow} onPress={() => setRemind((v) => !v)}>
              <Ionicons name={remind ? "checkbox" : "square-outline"} size={20} color={colors.goldText} />
              <Text style={styles.remindText}>فكرني قبلها بيوم</Text>
            </Pressable>

            <View style={styles.row}>
              <Pressable style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitText}>اقفل الكبسولة 🎁</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={reset}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} />
        ) : tab === "mine" ? (
          mine.length === 0 ? (
            <Text style={styles.empty}>لسه مفيش كبسولات. ابدأ بواحدة دلوقتي — هتفرق معاك بعد سنة.</Text>
          ) : (
            mine.map((c) => renderCapsule(c, true))
          )
        ) : friends.length === 0 ? (
          <Text style={styles.empty}>لسه محدش من أصحابك فتح كبسولة. لما تفتح هتلاقيها هنا.</Text>
        ) : (
          friends.map((c) => renderCapsule(c, false))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  hero: { flexDirection: "row-reverse", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 19, marginTop: 4 },
  tabs: { flexDirection: "row-reverse", gap: 8 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  tabText: { color: colors.text, fontSize: 12.5 },
  tabTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  newBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 12 },
  newBtnText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  composer: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { color: colors.muted, fontSize: 11.5, textAlign: "right", marginTop: 4 },
  input: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13 },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  row: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, alignItems: "center" },
  attachBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  attachText: { color: colors.text, fontSize: 12 },
  removeMedia: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.muted, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  removeMediaText: { color: colors.ink, fontSize: 11 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.text, fontSize: 12 },
  openDate: { color: colors.goldText, fontSize: 11.5, textAlign: "right" },
  remindRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6 },
  remindText: { color: colors.text, fontSize: 12.5 },
  submitBtn: { flex: 1, backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  submitText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  cancelText: { color: colors.muted, fontSize: 13 },
  capsuleCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  capsuleTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  capsuleGift: { fontSize: 24 },
  capsuleTitle: { color: colors.text, fontSize: 14.5, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  capsuleMeta: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 },
  capsuleBody: { color: colors.text, fontSize: 16, textAlign: "right", lineHeight: 21 },
  media: { width: "100%", height: 200, borderRadius: 14 },
  mediaFile: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.surface2, borderRadius: 12, padding: 10 },
  mediaFileText: { color: colors.text, fontSize: 12 },
  lockedRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#E8C96A14", borderRadius: 12, padding: 10 },
  lockedText: { color: colors.goldText, fontSize: 12, flex: 1, textAlign: "right" },
  openBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  openBtnText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 24, lineHeight: 20 },
})));
