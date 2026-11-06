import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { AlertSeal } from "@/components/alert-seals";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
type Release = {
  version: string;
  size_mb: number;
  notes: string[];
  apk_url: string | null;
  mandatory: boolean;
};

/**
 * جديد ونس — القسم 32.
 * خانة في الإعدادات برقم الإصدار ونقطة ذهبية لو فيه تحديث.
 * حالات الزر: دوّر على تحديث ← إنت على آخر إصدار ← تحديث متاح ←
 * جاري التنزيل (نسبة) ← جاهز للتثبيت.
 * نوعان: اختياري (يتنبه ويقدر يأجّل) وإجباري (ثغرة أو تغيير في الخدمة).
 */
export default function WhatsNewScreen() {
  useThemeContext();
  const router = useRouter();
  const current = Constants.expoConfig?.version ?? "1.0";
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "uptodate" | "available" | "downloading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setState("checking");
      try {
        const { data, error: err } = await supabase
          .from("app_releases")
          .select("version, size_mb, notes, apk_url, mandatory")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (err) throw err;
        if (!active) return;

        if (!data) {
          setState("uptodate");
          return;
        }
        const remote = data as Release;
        setRelease(remote);
        setState(remote.version !== current ? "available" : "uptodate");
      } catch {
        // A missing release table must not look like "up to date" without explanation
        if (active) {
          setError("تعذّر التحقق من التحديث الآن — هنجرّب تاني لما النت يرجع.");
          setState("idle");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [current]);

  useEffect(() => {
    if (state !== "downloading") return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(t);
          setState("ready");
          return 100;
        }
        return p + 8;
      });
    }, 220);
    return () => clearInterval(t);
  }, [state]);

  function primaryAction() {
    if (state === "available") setState("downloading");
    else if (state === "ready" && release?.apk_url) Linking.openURL(release.apk_url);
    else setState("checking");
  }

  const label =
    state === "checking" ? "بدوّر على تحديث…"
    : state === "uptodate" ? "إنت على آخر إصدار ✓"
    : state === "available" ? "حدّث دلوقيت"
    : state === "downloading" ? `جاري التنزيل… ${progress}%`
    : state === "ready" ? "جاهز للتثبيت"
    : "دوّر على تحديث";

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 50 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>جديد ونس</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <AlertSeal kind="new_version" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>الإصدار {release?.version ?? current}</Text>
              <Text style={styles.heroSub}>
                {state === "available" || state === "downloading" || state === "ready"
                  ? `إنت على ${current} · حجم التحديث ${release?.size_mb ?? 0} ميجا`
                  : `إنت على آخر إصدار (${current})`}
              </Text>
            </View>
          </View>

          {!!release?.mandatory && (
            <Text style={styles.mandatory}>تحديث إجباري — فيه تحسين أمان لازم</Text>
          )}

          <Pressable
            style={[styles.primaryBtn, state === "checking" && { opacity: 0.6 }]}
            onPress={primaryAction}
            disabled={state === "checking" || state === "downloading"}
          >
            {state === "checking" || state === "downloading" ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.primaryText}>{label}</Text>
            )}
          </Pressable>

          {state === "downloading" && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}

          {(state === "available" || state === "downloading") && !release?.mandatory && (
            <Pressable onPress={() => setState("uptodate")}>
              <Text style={styles.later}>بعدين</Text>
            </Pressable>
          )}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.sectionLabel}>إيه الجديد</Text>
        {(release?.notes ?? ["إصلاح مشاكل وتحسين الرسعة 🐞"]).map((n, i) => (
          <View key={i} style={styles.noteRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.goldText} />
            <Text style={styles.noteText}>{n}</Text>
          </View>
        ))}

        <Text style={styles.footnote}>
          رقم الإصدار بيتسجل مع تقارير الأخطاء عشان التتبع.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  title: { color: colors.text, fontSize: 22, fontFamily: "Cairo_900Black", fontWeight: "900" },
  heroCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 14, borderWidth: 1, borderColor: colors.border },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  heroTitle: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12, textAlign: "right" },
  mandatory: { color: colors.red, fontSize: 12, textAlign: "right", fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  primaryBtn: { backgroundColor: colors.gold, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 15 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.gold },
  later: { color: colors.muted, textAlign: "center", fontSize: 13 },
  sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right" },
  noteRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  noteText: { color: colors.text, fontSize: 13, flex: 1, textAlign: "right" },
  footnote: { color: colors.muted, fontSize: 10, textAlign: "center" },
  error: { color: colors.red, fontSize: 12, textAlign: "right" },
})));