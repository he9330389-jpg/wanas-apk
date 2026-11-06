import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandMark } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * تأكيد البريد بكود 6 أرقام.
 * الرسالة بتوصل من WANAS-App، وساعات بتقع في «الرسائل غير المرغوب فيها» أو في تبويب
 * «العروض/التحديثات» في Gmail — عشان كده الشاشة بتوجّه المستخدم يدوّر فيها.
 */
export default function VerifyEmailScreen() {
  useThemeContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; username?: string }>();
  const email = (params.email ?? "").trim().toLowerCase();
  const username = (params.username ?? "").trim();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifiedButProfileFailed, setVerifiedButProfileFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error" | "success">("info");

  function say(text: string, tone: "info" | "error" | "success" = "info") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function verify() {
    if (!email) {
      say("ارجع لشاشة الدخول واكتب البريد اللي سجلت بيه.", "error");
      return;
    }
    if (code.trim().length !== 6) {
      say("اكتب كود التأكيد المكوّن من 6 أرقام.", "error");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      if (error) throw error;
      const user = data.user ?? data.session?.user;
      if (!user) throw new Error("الكود اتقبل لكن ماوصلناش لحسابك؛ سجّل دخولك وجرب تاني.");

      if (username) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ username })
          .eq("id", user.id);
        if (profileError) {
          setVerifiedButProfileFailed(true);
          say("بريدك اتأكد بنجاح، لكن اسم المستخدم ما اتحفظش: " + profileError.message, "error");
          return;
        }
      }
      router.replace("/(tabs)");
    } catch (error) {
      say(authErrorMessage(error, "ماقدرناش نأكد البريد. راجع الكود وجرب تاني."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email) {
      say("ارجع لشاشة الدخول واكتب البريد اللي سجلت بيه.", "error");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      say(
        "بعتنالك كود جديد على " + email + ". لو مش لاقيه في الوارد، دوّر في «الرسائل غير المرغوب فيها» وفي تبويب «العروض» أو «التحديثات».",
        "success",
      );
    } catch (error) {
      say(authErrorMessage(error, "ماقدرناش نعيد إرسال الكود دلوقتي."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <Text style={styles.title}>أكّد بريدك الإلكتروني</Text>
        <Text style={styles.subtitle}>
          {email
            ? `بعتنالك كود من 6 أرقام على ${email}. اكتبه هنا وخلاص.`
            : "اكتب كود التأكيد المكوّن من 6 أرقام اللي وصلك على بريدك."}
        </Text>
        <View style={styles.tips}>
          <Text style={styles.tipLine}>• الرسالة جاية من «WANAS-App» — مش من Gmail.</Text>
          <Text style={styles.tipLine}>• لو مش في الوارد: بص في «الرسائل غير المرغوب فيها» و«العروض» و«التحديثات».</Text>
          <Text style={styles.tipLine}>• الكود صالح لمدة ساعة، ولو طلبت كود جديد الأقدم بيتلغي.</Text>
        </View>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="كود التأكيد — 6 أرقام"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={styles.codeInput}
          editable={!busy}
        />
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[
              styles.message,
              messageTone === "error" && styles.messageError,
              messageTone === "success" && styles.messageSuccess,
            ]}
          >
            {message}
          </Text>
        ) : null}

        {verifiedButProfileFailed ? (
          <Pressable style={styles.button} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.buttonText}>كمّل للتطبيق</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={verify} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>تأكيد البريد</Text>}
          </Pressable>
        )}
        {!verifiedButProfileFailed ? (
          <Pressable onPress={resend} disabled={busy}>
            <Text style={styles.link}>ماوصلكش الكود؟ ابعت واحد جديد</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.replace("/auth")} disabled={busy}>
          <Text style={styles.switchText}>الرجوع لتسجيل الدخول</Text>
        </Pressable>
      </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 14 },
  title: { color: colors.text, fontSize: 24, fontFamily: "Cairo_900Black", fontWeight: "900", textAlign: "right", marginTop: 20 },
  subtitle: { color: colors.text, fontSize: 14, textAlign: "right", lineHeight: 23 },
  tips: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border },
  tipLine: { color: colors.muted, fontSize: 12, textAlign: "right", lineHeight: 19 },
  codeInput: { backgroundColor: colors.surface2, borderRadius: 16, padding: 16, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: "center", fontSize: 22, letterSpacing: 8 },
  button: { backgroundColor: colors.gold, minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.ink, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "center" },
  message: { color: colors.goldText, fontSize: 13, textAlign: "right", lineHeight: 21 },
  messageError: { color: colors.red },
  messageSuccess: { color: colors.green },
  link: { color: colors.goldText, fontSize: 13, textAlign: "center", marginTop: 4 },
  switchText: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 4 },
}));
