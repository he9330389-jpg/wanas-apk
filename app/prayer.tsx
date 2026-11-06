import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  CITIES,
  METHODS,
  PRAYERS,
  formatClock,
  hijriDate,
  isQuietNow,
  cityTzOffset,
  displayClock,
  cityWallClock,
  methodForCountry,
  nextPrayer,
  prayerTimes,
  type MethodKey,
  type PrayerKey,
} from "@/lib/prayer";

type PrayerSettings = {
  enabled: boolean;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  method: number;
  asr_madhab: number;
  quiet_minutes: number;
  prayers: Record<PrayerKey, boolean>;
  show_hijri: boolean;
};

const DEFAULTS: PrayerSettings = {
  enabled: false,
  city: "القاهرة",
  country: "مصر",
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: "Africa/Cairo",
  method: 5,
  asr_madhab: 0,
  quiet_minutes: 15,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  show_hijri: true,
};

/** رقم الطريقة في جدول settings ↔ مفتاح الطريقة في الحساب المحلي. */
const METHOD_BY_ID: Record<number, MethodKey> = {
  5: "egyptian",
  3: "mwl",
  4: "umm_al_qura",
  2: "isna",
  1: "karachi",
  16: "dubai",
};
const ID_BY_METHOD: Record<MethodKey, number> = {
  egyptian: 5,
  mwl: 3,
  umm_al_qura: 4,
  isna: 2,
  karachi: 1,
  dubai: 16,
};

/** توقيت المدينة بالساعات مقارنةً بـ UTC. */
function cityOffset(city: string | null, country?: string | null): number {
  const found = CITIES.find((c) => c.name === city);
  // بنحسب التوقيت الفعلي (مع الصيفي) من منطقة IANA للبلد، مش رقم ثابت
  const offset = cityTzOffset(country ?? found?.country ?? "", new Date());
  return Number.isFinite(offset) ? offset : (found?.tz ?? 2);
}

/**
 * هدوء الصلاة — القسم 34: وضع اختياري يتفعّل تلقائيًا وقت الصلاة حسب موقعك،
 * مع مواقيت اليوم والتقويم الهجري واختيار المدينة أو تحديد الموقع.
 */
export default function PrayerScreen() {
  useThemeContext();
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [locating, setLocating] = useState(false);
  const [cityQuery, setCityQuery] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("prayer_settings").select("*").eq("user_id", uid).maybeSingle();
    if (error) {
      Alert.alert("مشكلة في التحميل", error.message);
    } else if (data) {
      setSettings({ ...DEFAULTS, ...data, prayers: { ...DEFAULTS.prayers, ...(data.prayers ?? {}) } });
    }
    setLoading(false);
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

  const save = async (patch: Partial<PrayerSettings>) => {
    if (!userId) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    const { error } = await supabase.from("prayer_settings").upsert(
      {
        user_id: userId,
        enabled: next.enabled,
        city: next.city,
        country: next.country,
        latitude: next.latitude,
        longitude: next.longitude,
        timezone: next.timezone,
        method: next.method,
        asr_madhab: next.asr_madhab,
        quiet_minutes: next.quiet_minutes,
        prayers: next.prayers,
        show_hijri: next.show_hijri,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      setSettings(settings);
      Alert.alert("محصلش حفظ", error.message);
    }
  };

  const times = useMemo(() => {
    const tz = cityOffset(settings.city, settings.country);
    return prayerTimes(
      now,
      settings.latitude ?? 30.0444,
      settings.longitude ?? 31.2357,
      METHOD_BY_ID[settings.method] ?? "egyptian",
      settings.asr_madhab === 1,
      tz,
    );
  }, [now, settings.latitude, settings.longitude, settings.method, settings.asr_madhab, settings.city]);

  const upcoming = nextPrayer(times, settings.prayers, now);
  const quiet = isQuietNow(times, settings.prayers, settings.quiet_minutes, now);
  const hijri = hijriDate(now);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("محتاج إذن الموقع", "من غير إذن الموقع هنستخدم المدينة اللي تختارها بنفسك.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await save({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        city: "موقعك الحالي",
        country: null,
      });
    } catch {
      Alert.alert("مش قادر أحدد موقعك", "اختار مدينتك من القائمة وهنحسب المواقيت بدقة.");
    } finally {
      setLocating(false);
    }
  };

  const filteredCities = CITIES.filter(
    (c) => !cityQuery.trim() || c.name.includes(cityQuery.trim()) || c.country.includes(cityQuery.trim()),
  ).slice(0, 12);

  return (
    <ScreenShell>
      <Header title="هدوء الصلاة" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🕌</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>هدوء الصلاة</Text>
            <Text style={styles.heroSub}>
              لما يدخل وقت الصلاة، ونس بيسكت شوية — بدون ما يخسرك أي رسالة. اختياري بالكامل.
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(v) => save({ enabled: v })}
            trackColor={{ false: colors.surface3, true: colors.gold }}
            thumbColor={settings.enabled ? "#111" : "#eee"}
          />
        </View>

        <View style={styles.clockCard}>
          <Text style={styles.clockLabel}>الساعة الآن — {settings.city}</Text>
          <Text style={styles.clockValue}>
            {(() => {
              const { h, m } = displayClock(now, cityOffset(settings.city, settings.country));
              const sec = cityWallClock(now, cityOffset(settings.city, settings.country)).getUTCSeconds().toString().padStart(2, "0");
              const suffix = h < 12 ? "ص" : "م";
              const h12 = h % 12 === 0 ? 12 : h % 12;
              return `${h12}:${m.toString().padStart(2, "0")}:${sec} ${suffix}`;
            })()}
          </Text>
        </View>
        <View style={styles.hijriCard}>
          <Text style={styles.hijriLabel}>التاريخ الهجري</Text>
          <Text style={styles.hijriValue}>{hijri.label}</Text>
          <Text style={styles.hijriGreg}>
            {now.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </View>

        {quiet.active && (
          <View style={styles.quietBanner}>
            <Text style={styles.quietTitle}>🌙 ونس في هدوء دلوقتي</Text>
            <Text style={styles.quietSub}>
              هدوء صلاة {PRAYERS.find((p) => p.key === quiet.key)?.label} — ينتهي{" "}
              {quiet.endsAt ? formatClock(quiet.endsAt, cityOffset(settings.city, settings.country)) : ""}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>مواقيت اليوم</Text>
        <View style={styles.timesCard}>
          {loading ? (
            <ActivityIndicator color={colors.goldText} style={{ paddingVertical: 20 }} />
          ) : (
            PRAYERS.map((p) => {
              const active = upcoming?.key === p.key;
              return (
                <View key={p.key} style={[styles.timeRow, active && styles.timeRowActive]}>
                  <Text style={styles.timeEmoji}>{p.emoji}</Text>
                  <Text style={[styles.timeName, active && { color: colors.goldText }]}>{p.label}</Text>
                  {active && <Text style={styles.nextTag}>الجاية</Text>}
                  <Text style={[styles.timeValue, active && { color: colors.goldText }]}>
                    {formatClock(times[p.key], cityOffset(settings.city, settings.country))}
                  </Text>
                </View>
              );
            })
          )}
          <Text style={styles.note}>
            {settings.city} · {METHODS.find((m) => ID_BY_METHOD[m.key] === settings.method)?.label ?? "الهيئة المصرية"}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>مدينتك</Text>
        <View style={styles.card}>
          <Pressable style={styles.locationBtn} onPress={useMyLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Ionicons name="navigate" size={16} color={colors.ink} />
                <Text style={styles.locationBtnText}>حدد موقعي تلقائيًا</Text>
              </>
            )}
          </Pressable>
          <TextInput
            value={cityQuery}
            onChangeText={setCityQuery}
            placeholder="دوّر على مدينتك…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textAlign="right"
          />
          <View style={styles.cityGrid}>
            {filteredCities.map((c) => {
              const active = settings.city === c.name;
              return (
                <Pressable
                  key={`${c.name}-${c.country}`}
                  style={[styles.cityChip, active && styles.cityChipActive]}
                  onPress={() =>
                    save({ city: c.name, country: c.country, latitude: c.lat, longitude: c.lng, timezone: `UTC${c.tz >= 0 ? "+" : ""}${c.tz}`, method: ID_BY_METHOD[methodForCountry(c.country)] })
                  }
                >
                  <Text style={[styles.cityChipText, active && { color: colors.ink }]}>
                    {c.name}
                    <Text style={styles.cityCountry}> · {c.country}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionTitle}>مدة الهدوء</Text>
        <View style={styles.card}>
          <Text style={styles.cardHint}>بعد الأذان، ونس يهدأ لمدة:</Text>
          <View style={styles.chipRow}>
            {[5, 10, 15, 20, 30, 45].map((m) => (
              <Pressable
                key={m}
                onPress={() => save({ quiet_minutes: m })}
                style={[styles.chip, settings.quiet_minutes === m && styles.chipActive]}
              >
                <Text style={[styles.chipText, settings.quiet_minutes === m && { color: colors.ink }]}>{m} د</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>الصلوات اللي تهدأ فيها</Text>
        <View style={styles.card}>
          {PRAYERS.map((p) => (
            <View key={p.key} style={styles.switchRow}>
              <Switch
                value={settings.prayers[p.key]}
                onValueChange={(v) => save({ prayers: { ...settings.prayers, [p.key]: v } })}
                trackColor={{ false: colors.surface3, true: colors.gold }}
                thumbColor={settings.prayers[p.key] ? "#111" : "#eee"}
              />
              <Text style={styles.switchLabel}>
                {p.emoji} {p.label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>طريقة الحساب</Text>
        <View style={styles.card}>
          {METHODS.map((m) => {
            const active = settings.method === ID_BY_METHOD[m.key];
            return (
              <Pressable key={m.key} onPress={() => save({ method: ID_BY_METHOD[m.key] })} style={styles.optionRow}>
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={active ? colors.yellow : colors.muted}
                />
                <Text style={[styles.optionText, active && { color: colors.goldText }]}>{m.label}</Text>
              </Pressable>
            );
          })}
          <View style={styles.sep} />
          <View style={styles.switchRow}>
            <Switch
              value={settings.asr_madhab === 1}
              onValueChange={(v) => save({ asr_madhab: v ? 1 : 0 })}
              trackColor={{ false: colors.surface3, true: colors.gold }}
              thumbColor={settings.asr_madhab === 1 ? "#111" : "#eee"}
            />
            <Text style={styles.switchLabel}>العصر على المذهب الحنفي</Text>
          </View>
        </View>

        {saving && <Text style={styles.saving}>بيسجّل…</Text>}
        <Text style={styles.footer}>
          المواقيت محسوبة على جهازك بالخوارزمية الفلكية (بدون إرسال موقعك لأي جهة)، والتاريخ الهجري تقديري — قد يختلف
          يومًا حسب رؤية الهلال.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 19, marginTop: 4 },
  hijriCard: { backgroundColor: "#E8C96A1A", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#E8C96A55" },
  hijriLabel: { color: colors.goldText, fontSize: 11, textAlign: "right" },
  hijriValue: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 2 },
  hijriGreg: { color: colors.muted, fontSize: 11.5, textAlign: "right", marginTop: 2 },
  quietBanner: { backgroundColor: colors.surface2, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.goldText },
  quietTitle: { color: colors.goldText, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", fontSize: 14 },
  quietSub: { color: colors.text, fontSize: 12, textAlign: "right", marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 8 },
  timesCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 10, borderWidth: 1, borderColor: colors.border },
  timeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12 },
  timeRowActive: { backgroundColor: "#E8C96A1F" },
  timeEmoji: { fontSize: 16 },
  timeName: { color: colors.text, fontSize: 14, flex: 1, textAlign: "right" },
  nextTag: { color: colors.ink, backgroundColor: colors.gold, fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  timeValue: { color: colors.text, fontSize: 14, fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
  note: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 6, paddingHorizontal: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardHint: { color: colors.muted, fontSize: 12, textAlign: "right" },
  locationBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 10 },
  locationBtnText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  input: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: colors.text, fontSize: 13 },
  cityGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  cityChip: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  cityChipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  cityChipText: { color: colors.text, fontSize: 12 },
  cityCountry: { color: colors.muted, fontSize: 10 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.text, fontSize: 12 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  switchLabel: { color: colors.text, fontSize: 13, textAlign: "right" },
  optionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 7 },
  optionText: { color: colors.text, fontSize: 12.5, flex: 1, textAlign: "right" },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  saving: { color: colors.muted, fontSize: 11, textAlign: "center" },
  footer: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17, marginTop: 8 },
  clockCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center", gap: 4 },
  clockLabel: { color: colors.muted, fontSize: 11.5 },
  clockValue: { color: colors.goldText, fontSize: 26, fontWeight: "900", fontFamily: "Cairo_900Black" },
})));

