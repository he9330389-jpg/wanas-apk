import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { createPage, myId } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** إنشاء صفحة — بيكتب فعليًا في جدول `pages` بعد التحقق، وبيرجّع لصفحة الصفحة. */
const CATEGORIES = ["شخصية عامة", "منشئ محتوى", "مؤسسة", "علامة تجارية", "مجتمع", "تعليم"];

export default function NewPageScreen() {
  useThemeContext();
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const uid = await myId();
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const page = await createPage({ ownerId: uid, name, handle, category, about });
      Alert.alert("الصفحة اتعملت", `صفحة «${page.name}» جاهزة على @${page.handle}`);
      router.replace(`/page/${page.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "مقدرناش ننشئ الصفحة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>صفحة جديدة</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>اسم الصفحة</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="مثال: ونسة الكتب" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>اسم المستخدم (إنجليزي/أرقام)</Text>
          <TextInput
            value={handle}
            onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_.]/g, "").toLowerCase())}
            style={styles.input}
            placeholder="wanas_books"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <Text style={styles.label}>التصنيف</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>نبذة (اختياري)</Text>
          <TextInput value={about} onChangeText={setAbout} style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} multiline placeholder="الصفحة دي عن إيه؟" placeholderTextColor={colors.muted} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={create} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>أنشئ الصفحة</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    label: { color: colors.muted, fontSize: 12, textAlign: "right" },
    input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 12, textAlign: "right", fontSize: 14 },
    chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    chipText: { color: colors.muted, fontSize: 12 },
    chipTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    error: { color: colors.red, fontSize: 12, textAlign: "right" },
    primary: { backgroundColor: colors.gold, borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center" },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  }),
);
