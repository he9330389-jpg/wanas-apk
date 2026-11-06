import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/wanas";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * رجوع تسجيل الدخول بجوجل (Supabase OAuth):
 * على الهاتف بيجي بكود في الرابط، وبنحوّله لجلسة؛ وعلى الويب Supabase بيعمل
 * exchange تلقائي، فبنسحب الجلسة مباشرة. لو فيه خطأ بنعرضه بوضوح.
 */
export default function AuthCallbackScreen() {
  useThemeContext();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        const query = url ? new URL(url).searchParams : null;
        const fragment = url && url.includes("#") ? new URLSearchParams(url.split("#")[1]) : null;
        const errorDescription = query?.get("error_description") ?? fragment?.get("error_description");
        if (errorDescription) throw new Error(errorDescription);

        const code = query?.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
        // على الويب: الجلسة بتتسجّل تلقائيًا من الرابط
        await supabase.auth.getSession();
        if (!active) return;
        router.replace("/(tabs)");
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تسجيل الدخول بجوجل فشل");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.title}>مكمّلناش الدخول بجوجل</Text>
            <Text style={styles.body}>{error}</Text>
            <Text style={styles.link} onPress={() => router.replace("/auth")}>
              ارجع لشاشة الدخول
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.body}>بنجهّز حسابك…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "center" },
  body: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 21 },
  link: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", marginTop: 8 },
});
