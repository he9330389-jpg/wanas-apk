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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { signInWithGoogle } from "@/lib/oauth";
import { colors } from "@/constants/wanas";
import { BrandMark } from "@/components/wanas-ui";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

export default function AuthScreen() {
  useThemeContext();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setMessage("اكتب البريد الإلكتروني وكلمة المرور الأول.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { username: username.trim(), display_name: username.trim() } },
        });
        if (error) throw error;
        if (!data.user) throw new Error("ماقدرناش ننشئ الحساب؛ جرّب تاني.");
        // الاسم اللي المستخدم كتبه بيبقى هو الظاهر (لو الـtrigger اتخطى لأي سبب)
        if (username.trim() && data.session) {
          await supabase.from("profiles").update({ display_name: username.trim() }).eq("id", data.user.id);
        }

        router.push({
          pathname: "/verify-email",
          params: { email: normalizedEmail, username: username.trim() },
        });
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (/email[_ ]not confirmed/i.test(error.message)) {
          router.push({ pathname: "/verify-email", params: { email: normalizedEmail } });
          return;
        }
        throw error;
      }

      if (data.user?.email && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        router.push({ pathname: "/verify-email", params: { email: normalizedEmail } });
        return;
      }
      // AuthGate listens to the Supabase session and performs the single
      // protected-route transition. Do not race it with a second replace.
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signInWithGoogle();
      if (!result.ok && !result.cancelled) setMessage(result.error ?? "تسجيل الدخول بجوجل فشل");
    } finally {
      setBusy(false);
    }
  }
  const toggleMode = () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setMessage(null);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandMark />
        <Text style={styles.title}>{mode === "signin" ? "أهلاً بيك تاني" : "خد مكانك في الونس"}</Text>
        <Text style={styles.subtitle}>
          {mode === "signin" ? "سجّل دخولك وكمّل الونس مع أصحابك" : "اعمل حساب جديد واطلب كود تأكيد البريد؛ وصول الرسالة يعتمد على إعدادات البريد."}
        </Text>

        {mode === "signup" && (
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="اسم المستخدم (حروف إنجليزي وأرقام)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.input}
            editable={!busy}
          />
        )}
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
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="كلمة المرور"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          textContentType={mode === "signup" ? "newPassword" : "password"}
          style={styles.input}
          editable={!busy}
        />

        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}

        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : (
            <Text style={styles.buttonText}>{mode === "signin" ? "دخول" : "إنشاء الحساب وطلب كود التأكيد"}</Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>أو</Text>
          <View style={styles.dividerLine} />
        </View>
        <Pressable style={[styles.googleBtn, busy && styles.disabled]} onPress={continueWithGoogle} disabled={busy}>
          <Ionicons name="logo-google" size={20} color={colors.text} />
          <Text style={styles.googleText}>{mode === "signin" ? "دخول بحساب جوجل" : "إنشاء حساب بحساب جوجل"}</Text>
        </Pressable>
        {mode === "signin" && (
          <Pressable onPress={() => router.push("/forgot-password")} disabled={busy}>
            <Text style={styles.link}>نسيت كلمة المرور؟</Text>
          </Pressable>
        )}
        <Pressable onPress={toggleMode} disabled={busy}>
          <Text style={styles.switchText}>
            {mode === "signin" ? "معندكش حساب؟ اعمل واحد" : "عندك حساب؟ سجّل دخول"}
          </Text>
        </Pressable>
      </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { color: colors.text, fontSize: 26, fontFamily: "Cairo_900Black", fontWeight: "900", textAlign: "right", marginTop: 20 },
  subtitle: { color: colors.muted, fontSize: 14, textAlign: "right", marginBottom: 12, lineHeight: 23 },
  input: { backgroundColor: colors.surface2, borderRadius: 16, padding: 16, color: colors.text, textAlign: "right", borderWidth: 1, borderColor: colors.border },
  button: { backgroundColor: colors.gold, minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.ink, fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "center" },
  message: { color: colors.goldText, fontSize: 13, textAlign: "right", lineHeight: 21 },
  link: { color: colors.goldText, fontSize: 13, textAlign: "center", marginTop: 4 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 12 },
  googleBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleText: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold" },
  switchText: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 6 },
}));
