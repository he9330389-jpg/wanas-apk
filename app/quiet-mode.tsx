import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId } from "@/lib/social";
import { setQuietMode } from "@/lib/push";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * الوضع الهادئ — بيوقف التنبيهات وبيتخزن في `push_tokens.quiet_mode` عشان الخادم
 * ما يبعتش إشعارات في الفترة. الإشعارات اللي جت أثناء الوضع بتتجمع في شاشة الإشعارات
 * وتظهر مجمّعة «إشعارات وقت الهدوء».
 */
type Prefs = { quiet_from: string; quiet_to: string; schedule_enabled: boolean };

const KEY = "wanas.quiet.schedule";

function parseTime(v: string, fallback: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return fallback;
  const h = Math.min(23, Number(m[1]));
  const mm = Math.min(59, Number(m[2]));
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default function QuietModeScreen() {
  useThemeContext();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ quiet_from: "23:00", quiet_to: "07:00", schedule_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(0);

  const load = useCallback(async () => {
    try {
      const me = await myId();
      setUid(me);
      if (me) {
        const { data } = await supabase.from("push_tokens").select("quiet_mode").eq("user_id", me).limit(1);
        setEnabled(!!data?.[0]?.quiet_mode);
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", me)
          .gte("created_at", since);
        setGrouped(count ?? 0);
      }
      const stored = await import("expo-secure-store").then((m) => m.getItemAsync(KEY)).catch(() => null);
      if (stored) setPrefs(JSON.parse(stored) as Prefs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    if (!uid) {
      setError("محتاج تسجيل دخول عشان تظبط الوضع الهادئ.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await setQuietMode(uid, next);
      const { error: err } = await supabase.from("push_tokens").update({ quiet_mode: next }).eq("user_id", uid);
      if (err) throw err;
      setEnabled(next);
      setMessage(next ? "الوضع الهادئ اتشغّل — التنبيهات هتتوقف لحد ما تقفله." : "الوضع الهادئ اتقفل — التنبيهات رجعت.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "مقدرناش نحفظ الإعداد");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    const next = { ...prefs, quiet_from: parseTime(prefs.quiet_from, "23:00"), quiet_to: parseTime(prefs.quiet_to, "07:00") };
    setPrefs(next);
    try {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(KEY, JSON.stringify(next));
      setMessage("جدول الهدوء اتحدّث على الجهاز ده.");
    } catch {
      setMessage("اتحفظ مؤقتًا في الشاشة بس — الجهاز مش بيسمح بالتخزين الآمن.");
    }
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>الوضع الهادئ</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 50 }}>
          <View style={styles.hero}>
            <Ionicons name="moon" size={34} color={colors.goldText} />
            <Text style={styles.heroTitle}>هدوء من غير ما تسيب ونس</Text>
            <Text style={styles.heroSub}>التنبيهات بتقف، والتصفح بيكمل عادي. اللي ييجي في الفترة بيتجمعلك.</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>تشغيل الوضع الهادئ</Text>
            {saving ? <ActivityIndicator color={colors.goldText} /> : <Switch value={enabled} onValueChange={toggle} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={enabled ? colors.ink : colors.text} />}
          </View>
          <View style={styles.card}>
            <View style={styles.rowInner}>
              <Text style={styles.rowLabel}>جدول تلقائي كل يوم</Text>
              <Switch
                value={prefs.schedule_enabled}
                onValueChange={(v) => setPrefs((p) => ({ ...p, schedule_enabled: v }))}
                trackColor={{ true: colors.gold, false: colors.border }}
                thumbColor={prefs.schedule_enabled ? colors.ink : colors.text}
              />
            </View>
            {prefs.schedule_enabled && (
              <View style={styles.timesRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.small}>من</Text>
                  <TextInput value={prefs.quiet_from} onChangeText={(v) => setPrefs((p) => ({ ...p, quiet_from: v }))} style={styles.input} keyboardType="numbers-and-punctuation" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.small}>لحد</Text>
                  <TextInput value={prefs.quiet_to} onChangeText={(v) => setPrefs((p) => ({ ...p, quiet_to: v }))} style={styles.input} keyboardType="numbers-and-punctuation" />
                </View>
                <Pressable style={styles.save} onPress={saveSchedule}>
                  <Text style={styles.saveText}>حفظ</Text>
                </Pressable>
              </View>
            )}
          </View>
          <View style={styles.row}>
            <Ionicons name="albums-outline" size={20} color={colors.text} />
            <Text style={styles.rowLabel}>إشعارات آخر 24 ساعة (هتظهر مجمّعة)</Text>
            <Text style={styles.count}>{grouped}</Text>
          </View>
          {!!message && <Text style={styles.ok}>{message}</Text>}
          {!!error && <Text style={styles.err}>{error}</Text>}
          <Text style={styles.note}>الإشعارات بتتحفظ في قاعدة البيانات، ولما تفتح شاشة الإشعارات هتلاقيها مرتّبة — الوضع الهادئ بيوقف التنبيه بس مش بيمنع وصول الإشعار.</Text>
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    hero: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 6, alignItems: "flex-end", borderWidth: 1, borderColor: colors.border },
    heroTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    heroSub: { color: colors.muted, fontSize: 12, textAlign: "right", lineHeight: 19 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border },
    rowInner: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
    rowLabel: { color: colors.text, fontSize: 13.5, flex: 1, textAlign: "right" },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, gap: 12, borderWidth: 1, borderColor: colors.border },
    timesRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 10 },
    small: { color: colors.muted, fontSize: 11, textAlign: "right" },
    input: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 10, textAlign: "center" },
    save: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 14, height: 42, justifyContent: "center" },
    saveText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 12.5 },
    count: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    ok: { color: colors.green, fontSize: 12, textAlign: "right" },
    err: { color: colors.red, fontSize: 12, textAlign: "right" },
    note: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17 },
  }),
);
