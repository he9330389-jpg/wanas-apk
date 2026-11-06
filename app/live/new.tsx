import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { createCouncil, type CouncilRoom } from "@/lib/councils";
import { errorMessage } from "@/lib/errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

const VIS: { key: CouncilRoom["visibility"]; label: string }[] = [
  { key: "public", label: "للجميع" },
  { key: "followers", label: "للأصدقاء/المتابعين" },
  { key: "private", label: "لي أنا بس (تجربة)" },
];

/** إعدادات البث المباشر — بتفتح غرفة جوه التطبيق (Jitsi داخل WebView) وبتبدأها فورًا. */
export default function LiveSettingsScreen() {
  useThemeContext();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [visibility, setVisibility] = useState<CouncilRoom["visibility"]>("public");
  const [record, setRecord] = useState(false);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    if (!title.trim()) return Alert.alert("اكتب عنوان", "العنوان بيظهر للناس قبل ما يدخلوا.");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("الجلسة انتهت — سجّل دخولك تاني");
      const room = await createCouncil({ hostId: uid, title, description: desc, visibility, isRecorded: record });
      await supabase.from("majlis_rooms").update({ is_live: true }).eq("id", room.id);
      router.replace(`/council/${room.id}`);
    } catch (e) {
      Alert.alert("مقدرناش نبدأ البث", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>إعدادات البث المباشر</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="عنوان البث" placeholderTextColor={colors.muted} maxLength={80} textAlign="right" />
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} placeholder="وصف (اختياري)" placeholderTextColor={colors.muted} multiline textAlign="right" />
        <Text style={styles.label}>مين يشوف البث</Text>
        <View style={styles.chips}>
          {VIS.map((v) => (
            <Pressable key={v.key} onPress={() => setVisibility(v.key)} style={[styles.chip, visibility === v.key && styles.chipOn]}>
              <Text style={[styles.chipText, visibility === v.key && styles.chipTextOn]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Switch value={record} onValueChange={setRecord} />
          <Text style={styles.rowText}>تسجيل البث</Text>
        </View>
        <Pressable style={[styles.go, busy && { opacity: 0.6 }]} onPress={start} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.goText}>ابدأ البث الآن</Text>}
        </Pressable>
        <Text style={styles.hint}>البث بيشتغل جوه ونس بالصوت. الميكروفون هيتطلب مرة واحدة.</Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    top: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    input: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
    label: { color: colors.muted, fontSize: 12, textAlign: "right" },
    chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
    chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.goldText },
    chipText: { color: colors.text, fontSize: 13 },
    chipTextOn: { color: colors.ink, fontWeight: "bold" },
    row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 52, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
    rowText: { color: colors.text, fontSize: 15 },
    go: { minHeight: 56, borderRadius: 18, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    goText: { color: colors.ink, fontSize: 16, fontWeight: "bold", fontFamily: "Cairo_700Bold" },
    hint: { color: colors.muted, fontSize: 11, textAlign: "right" },
  }),
);
