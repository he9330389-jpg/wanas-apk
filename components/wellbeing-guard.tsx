import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { WELLBEING_DEFAULTS, getWellbeing, logWellbeingMinutes, type WellbeingSettings } from "@/lib/excellence";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
const TICK_MS = 60_000;

const GENTLE = [
  "ونس كان معاك شوية… تحب تاخد بريك وتشرب حاجة؟ 💧",
  "خد نفس عميق، وارجع لنا بعد خمس دقايق — ونس هيفضل مستنيك.",
  "عينك تعبت؟ بص بعيد عن الشاشة ٢٠ ثانية، وريّح إيدك.",
];
const FIRM = [
  "وصلت للحد اللي حددته لنفسك. قفل ونس شوية، ونرجع بعدين.",
  "خد بريك حقيقي — الوصلات والونس مش هيهربوا.",
];

/**
 * حدود صحية — يراقب وقت الاستخدام الفعلي، يسجّل الدقايق في حساب المستخدم،
 * ويطلع تذكير لطيف «ارتاح شوية» حسب الإعدادات (مدة البريك، النبرة، ساعات الهدوء).
 */
export function WellbeingGuard({ children }: { children: React.ReactNode }) {
  useThemeContext();
  const [settings, setSettings] = useState<WellbeingSettings>(WELLBEING_DEFAULTS);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const minutesRef = useRef(0);
  const lastPromptRef = useRef(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!active || !uid) return;
      setUserId(uid);
      try {
        setSettings(await getWellbeing(uid));
      } catch {
        setSettings(WELLBEING_DEFAULTS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const flush = useCallback(async () => {
    if (!userId || minutesRef.current <= 0) return;
    const minutes = minutesRef.current;
    minutesRef.current = 0;
    try {
      await logWellbeingMinutes(userId, minutes);
    } catch {
      // لو فشل التسجيل مش هنوقف الاستخدام
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !settings.enabled) return;
    const timer = setInterval(() => {
      minutesRef.current += 1;
      const elapsed = minutesRef.current;
      if (elapsed >= settings.break_after_minutes && elapsed - lastPromptRef.current >= settings.break_after_minutes) {
        const pool = settings.reminder_tone === "firm" ? FIRM : GENTLE;
        setPrompt(pool[Math.floor(Math.random() * pool.length)]);
        lastPromptRef.current = elapsed;
        flush();
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [userId, settings.enabled, settings.break_after_minutes, settings.reminder_tone, flush]);

  return (
    <>
      {children}
      <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => setPrompt(null)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Ionicons name="leaf" size={28} color={colors.goldText} />
            <Text style={styles.title}>ارتاح شوية 🌿</Text>
            <Text style={styles.message}>{prompt}</Text>
            <Pressable style={styles.primary} onPress={() => setPrompt(null)}>
              <Text style={styles.primaryText}>هاخد بريك</Text>
            </Pressable>
            <Pressable onPress={() => setPrompt(null)} style={styles.secondary}>
              <Text style={styles.secondaryText}>لسه شوية وكمل</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000B0", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 22, alignItems: "center", gap: 10, width: "100%", borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  message: { color: colors.muted, fontSize: 16, textAlign: "center", lineHeight: 21 },
  primary: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginTop: 6 },
  primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13.5 },
  secondary: { paddingVertical: 6 },
  secondaryText: { color: colors.muted, fontSize: 12 },
})));
