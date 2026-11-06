import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * بلّغ عن مشكلة / تواصل معنا — البلاغ بيدخل `content_reports` (نوع support/bug)
 * عشان فريق ونس يشوفه في نفس مركز البلاغات. مفيش رسالة «تم الإرسال» قبل نجاح الحفظ.
 */
export default function SupportScreen() {
  useThemeContext();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isBug = mode !== "contact";
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (message.trim().length < 8) {
      setError("اكتب تفاصيل واضحة (8 حروف على الأقل) عشان نقدر نساعدك.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uid = await myId();
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error: err } = await supabase.from("content_reports").insert({
        reporter_id: uid,
        reason: `${isBug ? "[مشكلة]" : "[تواصل]"} ${message.trim()}${email.trim() ? ` · للتواصل: ${email.trim()}` : ""}`,
        reported_user_id: uid,
        status: "open",
        kind: isBug ? "bug" : "contact",
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "مقدرناش نبعت الرسالة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{isBug ? "بلّغ عن مشكلة" : "تواصل معنا"}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {sent ? (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-circle" size={46} color={colors.green} />
              <Text style={styles.doneTitle}>وصلتنا رسالتك</Text>
              <Text style={styles.doneSub}>فريق ونس هيراجعها ويرد عليك في أقرب وقت.</Text>
              <Pressable style={styles.primary} onPress={() => router.back()}>
                <Text style={styles.primaryText}>تمام</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.hint}>
                {isBug
                  ? "قولنا إيه اللي حصل، وإيه الشاشة اللي كنت فيها. لو المشكلة في الرفع أو الإشعارات قولنا نوع الموبايل."
                  : "لو عندك سؤال أو اقتراح أو حاجة محتاج تخلصها معانا (زي سحب الأرباح)، اكتبها هنا."}
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                style={[styles.input, { minHeight: 130, textAlignVertical: "top" }]}
                placeholder={isBug ? "إيه اللي حصل؟" : "اكتب رسالتك"}
                placeholderTextColor={colors.muted}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                placeholder="إيميل للرد (اختياري)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={send} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>ابعت</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    hint: { color: colors.muted, fontSize: 12, textAlign: "right", lineHeight: 19 },
    input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 12, textAlign: "right", fontSize: 13.5 },
    error: { color: colors.red, fontSize: 12, textAlign: "right" },
    primary: { backgroundColor: colors.gold, borderRadius: 16, height: 50, alignItems: "center", justifyContent: "center" },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    doneBox: { alignItems: "center", gap: 10, marginTop: 40 },
    doneTitle: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    doneSub: { color: colors.muted, fontSize: 12.5, textAlign: "center" },
  }),
);
