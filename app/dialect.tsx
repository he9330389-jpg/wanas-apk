import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  DIALECT_LABELS,
  ARABIC_DIALECT_KEYS,
  WORLD_LANGUAGE_KEYS,
  getDialectPrefs,
  saveDialectPrefs,
  translateDialect,
  type DialectKey,
} from "@/lib/excellence";

const SAMPLES = [
  { label: "منشور فصحى", text: "أشعر اليوم بمزيج من الحماس والتعب، ولكنني ممتن لكل ما مررت به." },
  { label: "تعليق عامي", text: "والله أنا مبسوط قوي النهاردة وحاسس إن كل تعبي راح" },
  { label: "من إعلان", text: "نقدّم لكم تجربة فريدة تجمع بين الأصالة والحداثة في مكان واحد." },
];

/**
 * اللغات والترجمة — ترجمة النص بين الفصحى واللهجات العربية واللغات العالمية
 * عبر خدمة الخادم الآمنة، مع كشف تلقائي للغة المصدر واختيار لهجتك المفضلة.
 */
export default function DialectScreen() {
  useThemeContext();
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [target, setTarget] = useState<DialectKey>("masri");
  const [source, setSource] = useState<DialectKey | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [preferred, setPreferred] = useState<DialectKey>("masri");
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    try {
      const prefs = await getDialectPrefs(uid);
      setPreferred(prefs.preferred_dialect);
      setAuto(prefs.auto_translate);
      setTarget(prefs.preferred_dialect === "fusha" ? "masri" : prefs.preferred_dialect);
    } catch {
      // الإعدادات اختيارية — الشاشة تشتغل من غيرها
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

  const translate = async () => {
    if (!input.trim()) {
      Alert.alert("اكتب النص الأول", "الصق منشور أو تعليق وعايز تحوّله");
      return;
    }
    setBusy(true);
    try {
      const result = await translateDialect(input, target, source);
      setOutput(result);
    } catch (error) {
      Alert.alert("مش قادر أحوّل", error instanceof Error ? error.message : "حاول تاني");
    } finally {
      setBusy(false);
    }
  };

  const persist = async (dialect: DialectKey, autoTranslate: boolean) => {
    setPreferred(dialect);
    setAuto(autoTranslate);
    if (!userId) return;
    try {
      await saveDialectPrefs(userId, dialect, autoTranslate);
    } catch (error) {
      Alert.alert("محصلش حفظ التفضيل", error instanceof Error ? error.message : "");
    }
  };

  return (
    <ScreenShell>
      <Header title="اللغات والترجمة" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🌍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>كلامك يفهمه الكل</Text>
            <Text style={styles.heroSub}>
              ترجم أي نص بين العربي (فصحى ولهجاته) والإنجليزي والفرنسي ولغات تانية — واله يكتشف اللغة لوحده.
            </Text>
          </View>
        </View>

        <Text style={styles.label}>ترجم من</Text>
        <View style={styles.chipRow}>
          <Pressable onPress={() => setSource("auto")} style={[styles.chip, source === "auto" && styles.chipActive]}>
            <Text style={[styles.chipText, source === "auto" && { color: colors.ink }]}>اكتشف لوحدك ✨</Text>
          </Pressable>
          {(Object.keys(DIALECT_LABELS) as DialectKey[]).map((key) => (
            <Pressable key={key} onPress={() => setSource(key)} style={[styles.chip, source === key && styles.chipActive]}>
              <Text style={[styles.chipText, source === key && { color: colors.ink }]}>{DIALECT_LABELS[key]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>حوّل إلى — اللهجات</Text>
        <View style={styles.chipRow}>
          {ARABIC_DIALECT_KEYS.map((key) => (
            <Pressable key={key} onPress={() => setTarget(key)} style={[styles.chip, target === key && styles.chipActive]}>
              <Text style={[styles.chipText, target === key && { color: colors.ink }]}>{DIALECT_LABELS[key]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>حوّل إلى — لغات تانية</Text>
        <View style={styles.chipRow}>
          {WORLD_LANGUAGE_KEYS.map((key) => (
            <Pressable key={key} onPress={() => setTarget(key)} style={[styles.chip, target === key && styles.chipActive]}>
              <Text style={[styles.chipText, target === key && { color: colors.ink }]}>{DIALECT_LABELS[key]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inputBox}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="الصق النص هنا…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            textAlign="right"
            maxLength={1200}
          />
          <Text style={styles.counter}>{input.length}/1200</Text>
        </View>

        <View style={styles.samplesRow}>
          {SAMPLES.map((s) => (
            <Pressable key={s.label} style={styles.sampleChip} onPress={() => setInput(s.text)}>
              <Text style={styles.sampleText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.translateBtn, busy && { opacity: 0.6 }]} onPress={translate} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={18} color={colors.ink} />
              <Text style={styles.translateText}>حوّل لـ {DIALECT_LABELS[target]}</Text>
            </>
          )}
        </Pressable>

        {output ? (
          <View style={styles.resultBox}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>النتيجة ({DIALECT_LABELS[target]})</Text>
              <View style={styles.resultActions}>
                <Pressable onPress={() => Clipboard.setStringAsync(output)} hitSlop={8}>
                  <Ionicons name="copy-outline" size={18} color={colors.goldText} />
                </Pressable>
                <Pressable onPress={() => Share.share({ message: output })} hitSlop={8}>
                  <Ionicons name="share-outline" size={18} color={colors.goldText} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.resultText}>{output}</Text>
            <Pressable
              style={styles.swapBtn}
              onPress={() => {
                setInput(output);
                setOutput(input);
                setTarget(target === "fusha" ? preferred === "fusha" ? "masri" : preferred : "fusha");
              }}
            >
              <Ionicons name="repeat" size={14} color={colors.text} />
              <Text style={styles.swapText}>اعكس الاتجاه</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>إعداداتك</Text>
        <View style={styles.card}>
          <Text style={styles.cardHint}>اللهجة/اللغة اللي تحب تقرا بيها أغلب المحتوى:</Text>
          <View style={styles.chipRow}>
            {(Object.keys(DIALECT_LABELS) as DialectKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => persist(key, auto)}
                style={[styles.chip, preferred === key && styles.chipActive]}
              >
                <Text style={[styles.chipText, preferred === key && { color: colors.ink }]}>{DIALECT_LABELS[key]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Switch
              value={auto}
              onValueChange={(v) => persist(preferred, v)}
              trackColor={{ false: colors.surface3, true: colors.gold }}
              thumbColor={auto ? "#111" : "#eee"}
            />
            <Text style={styles.switchLabel}>اقترح الترجمة تلقائيًا على المنشورات اللي بلهجة مختلفة</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          التحويل بيتم على خدمة ونس الآمنة (بدون مشاركة المفتاح على الجهاز)، وبيحافظ على الإيموجي والمنشن والهاشتاق
          زي ما هي.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  hero: { flexDirection: "row-reverse", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 19, marginTop: 4 },
  label: { color: colors.muted, fontSize: 11.5, textAlign: "right", marginTop: 4 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.text, fontSize: 12.5 },
  inputBox: { backgroundColor: colors.surface, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: colors.border },
  input: { color: colors.text, fontSize: 14, minHeight: 120, textAlignVertical: "top", lineHeight: 22 },
  counter: { color: colors.muted, fontSize: 10, textAlign: "left" },
  samplesRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  sampleChip: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  sampleText: { color: colors.muted, fontSize: 11 },
  translateBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 13 },
  translateText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14 },
  resultBox: { backgroundColor: "#E8C96A0F", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#E8C96A55", gap: 8 },
  resultHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  resultLabel: { color: colors.goldText, fontSize: 11.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  resultActions: { flexDirection: "row-reverse", gap: 14 },
  resultText: { color: colors.text, fontSize: 14.5, lineHeight: 24, textAlign: "right" },
  swapBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-end" },
  swapText: { color: colors.muted, fontSize: 11.5 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  cardHint: { color: colors.muted, fontSize: 12, textAlign: "right" },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 4 },
  switchLabel: { color: colors.text, fontSize: 12, flex: 1, textAlign: "right", lineHeight: 18 },
  footer: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17, marginTop: 8 },
})));
