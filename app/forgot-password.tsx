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
} from "react-native";
import { useRouter } from "expo-router";
import { BrandMark } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type RecoveryStep = "email" | "code" | "password";

export default function ForgotPasswordScreen() {
  useThemeContext();
  const router = useRouter();
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage("اكتب البريد الإلكتروني الأول.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
      if (error) throw error;
      setEmail(normalizedEmail);
      setStep("code");
      setMessage("لو البريد مرتبط بحساب، اتقبل طلب استعادة كلمة المرور. وصول كود البريد لسه مش مؤكد؛ راجع الوارد والرسائل غير المرغوب فيها.");
    } catch (error) {
      setMessage(authErrorMessage(error, "ماقدرناش نطلب كود الاستعادة دلوقتي."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length !== 6) {
      setMessage("اكتب كود الاستعادة المكوّن من 6 أرقام.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "recovery",
      });
      if (error) throw error;
      if (!data.session) throw new Error("الكود ما أنشأش جلسة استعادة صالحة. اطلب كود جديد وجرب تاني.");
      setStep("password");
      setMessage("الكود اتأكد. اختار كلمة مرور جديدة.");
    } catch (error) {
      setMessage(authErrorMessage(error, "الكود غير صحيح أو انتهت صلاحيته."));
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword() {
    if (!password || password !== confirmPassword) {
      setMessage(password ? "كلمتا المرور مش متطابقتين." : "اكتب كلمة المرور الجديدة.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (error) {
      setMessage(authErrorMessage(error, "ماقدرناش نغيّر كلمة المرور."));
    } finally {
      setBusy(false);
    }
  }

  const submit = step === "email" ? sendCode : step === "code" ? verifyCode : updatePassword;
  const buttonLabel = step === "email" ? "طلب كود الاستعادة" : step === "code" ? "تأكيد الكود" : "حفظ كلمة المرور الجديدة";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <Text style={styles.title}>استعادة كلمة المرور</Text>
        <Text style={styles.subtitle}>
          {step === "email" ? "اكتب البريد المرتبط بحسابك عشان نطلب كود الاستعادة." :
            step === "code" ? `اكتب كود الاستعادة لو وصلك على ${email}. لو ماوصلش، راجع إعدادات البريد والرسائل غير المرغوب فيها.` :
              "اختار كلمة مرور جديدة بعد ما اتأكدنا من الكود."}
        </Text>

        {step === "email" ? (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
            editable={!busy}
          />
        ) : null}
        {step === "code" ? (
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            placeholder="كود الاستعادة — 6 أرقام"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            style={styles.codeInput}
            editable={!busy}
          />
        ) : null}
        {step === "password" ? (
          <>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="كلمة المرور الجديدة"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              style={styles.input}
              editable={!busy}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="تأكيد كلمة المرور الجديدة"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              style={styles.input}
              editable={!busy}
            />
          </>
        ) : null}

        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>{buttonLabel}</Text>}
        </Pressable>
        {step === "code" ? (
          <Pressable onPress={sendCode} disabled={busy}>
            <Text style={styles.link}>ماوصلكش الكود؟ ابعته تاني</Text>
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
  subtitle: { color: colors.muted, fontSize: 14, textAlign: "right", lineHeight: 23 },
  input: { backgroundColor: colors.surface2, borderRadius: 16, padding: 16, color: colors.text, textAlign: "right", borderWidth: 1, borderColor: colors.border },
  codeInput: { backgroundColor: colors.surface2, borderRadius: 16, padding: 16, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: "center", fontSize: 22, letterSpacing: 8 },
  button: { backgroundColor: colors.gold, minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.ink, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "center" },
  message: { color: colors.goldText, fontSize: 13, textAlign: "right", lineHeight: 21 },
  link: { color: colors.goldText, fontSize: 13, textAlign: "center", marginTop: 4 },
  switchText: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 4 },
}));
