import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  WELLBEING_DEFAULTS,
  getWellbeing,
  saveWellbeing,
  todayMinutes,
  type WellbeingSettings,
} from "@/lib/excellence";

const LIMITS = [30, 60, 90, 120, 180, 240];
const BREAKS = [20, 30, 45, 60, 90];
const QUIET_PRESETS = [
  { from: "22:00", to: "07:00", label: "٢٢:٠٠ – ٧:٠٠" },
  { from: "23:00", to: "08:00", label: "٢٣:٠٠ – ٨:٠٠" },
  { from: "00:00", to: "06:00", label: "١٢:٠٠ – ٦:٠٠" },
];

/**
 * حدود صحية 🌿 — القسم 34: تذكير لطيف بوقت الاستخدام و«ارتاح شوية».
 * كل الإعدادات محفوظة في حسابك ومحسوبة على وقتك فعليًا (ساعات الونس).
 */
export default function WellbeingScreen() {
  useThemeContext();
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WellbeingSettings>(WELLBEING_DEFAULTS);
  const [used, setUsed] = useState(0);
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
      const [s, minutes] = await Promise.all([getWellbeing(uid), todayMinutes(uid)]);
      setSettings(s);
      setUsed(minutes);
    } catch (error) {
      Alert.alert("مشكلة في التحميل", error instanceof Error ? error.message : "");
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

  const persist = async (patch: Partial<WellbeingSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (!userId) return;
    try {
      await saveWellbeing(userId, next);
    } catch (error) {
      setSettings(settings);
      Alert.alert("محصلش حفظ", error instanceof Error ? error.message : "");
    }
  };

  const progress = Math.min(1, settings.daily_limit_minutes ? used / settings.daily_limit_minutes : 0);

  return (
    <ScreenShell>
      <Header title="حدود صحية" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🌿</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>خد بالك من نفسك</Text>
            <Text style={styles.heroSub}>
              ونس مش عايز ياخد وقتك كله — هيقولهالك بلطف: «ارتاح شوية» ويرجعلك لما تكون مستعد.
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(v) => persist({ enabled: v })}
            trackColor={{ false: colors.surface3, true: colors.gold }}
            thumbColor={settings.enabled ? "#111" : "#eee"}
          />
        </View>

        <View style={styles.usageCard}>
          <Text style={styles.usageLabel}>وقت الونس النهارده</Text>
          <Text style={styles.usageValue}>
            {Math.floor(used / 60)} س {used % 60} د
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: progress > 0.9 ? colors.red : colors.yellow }]} />
          </View>
          <Text style={styles.usageHint}>
            من حد {settings.daily_limit_minutes} دقيقة{progress > 0.9 ? " — خد بريك واشرب ميه 💧" : ""}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.goldText} style={{ marginTop: 20 }} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>الحد اليومي</Text>
            <View style={styles.card}>
              <View style={styles.chipRow}>
                {LIMITS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => persist({ daily_limit_minutes: m })}
                    style={[styles.chip, settings.daily_limit_minutes === m && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, settings.daily_limit_minutes === m && { color: colors.ink }]}>
                      {m >= 60 ? `${m / 60} ساعة` : `${m} د`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle}>«ارتاح شوية» بعد</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>هنبعتلك تذكير لطيف بعد ما تقضي المدة دي متواصلة:</Text>
              <View style={styles.chipRow}>
                {BREAKS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => persist({ break_after_minutes: m })}
                    style={[styles.chip, settings.break_after_minutes === m && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, settings.break_after_minutes === m && { color: colors.ink }]}>{m} دقيقة</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle}>ساعات هادئة</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>مفيش إشعارات في الوقت ده — الرسائل تستناك الصبح:</Text>
              <View style={styles.chipRow}>
                {QUIET_PRESETS.map((p) => {
                  const active = settings.quiet_from === p.from && settings.quiet_to === p.to;
                  return (
                    <Pressable
                      key={p.label}
                      onPress={() => persist({ quiet_from: p.from, quiet_to: p.to })}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && { color: colors.ink }]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => persist({ quiet_from: null, quiet_to: null })}
                  style={[styles.chip, !settings.quiet_from && styles.chipActive]}
                >
                  <Text style={[styles.chipText, !settings.quiet_from && { color: colors.ink }]}>من غير هدوء</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.sectionTitle}>نبرة التذكير</Text>
            <View style={styles.card}>
              <Pressable
                onPress={() => persist({ reminder_tone: "gentle" })}
                style={[styles.toneRow, settings.reminder_tone === "gentle" && styles.toneActive]}
              >
                <Ionicons name="leaf" size={18} color={settings.reminder_tone === "gentle" ? colors.yellow : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toneTitle}>لطيف</Text>
                  <Text style={styles.toneSub}>«ونس كان معاك ساعتين… تحب تاخد بريك وتشرب حاجة؟»</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => persist({ reminder_tone: "firm" })}
                style={[styles.toneRow, settings.reminder_tone === "firm" && styles.toneActive]}
              >
                <Ionicons name="hand-left" size={18} color={settings.reminder_tone === "firm" ? colors.yellow : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toneTitle}>واضح</Text>
                  <Text style={styles.toneSub}>«وصلت للحد اللي حددته لنفسك. قفل ونس شوية، ونرجع بعدين.»</Text>
                </View>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.footer}>
          التذكير بيتحسب على وقت الاستخدام الفعلي المسجّل في حسابك، وبيتم إيقافه تلقائيًا لو قفلت الخيار من فوق.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 19, marginTop: 4 },
  usageCard: { backgroundColor: "#E8C96A14", borderRadius: 18, padding: 14, gap: 6, borderWidth: 1, borderColor: "#E8C96A44" },
  usageLabel: { color: colors.goldText, fontSize: 11.5, textAlign: "right" },
  usageValue: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  usageHint: { color: colors.muted, fontSize: 11, textAlign: "right" },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.muted, fontSize: 11.5, textAlign: "right", lineHeight: 18 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.text, fontSize: 12 },
  toneRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  toneActive: { borderColor: colors.goldText, backgroundColor: "#E8C96A0F" },
  toneTitle: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  toneSub: { color: colors.muted, fontSize: 11, textAlign: "right", lineHeight: 17, marginTop: 2 },
  footer: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17, marginTop: 8 },
})));
