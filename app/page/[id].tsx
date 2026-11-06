import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId, type PageRow } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** صفحة ونس — بيانات حقيقية من `pages`، وصاحبها يقدر يعدّل النبذة أو يحذفها. */
export default function PageScreen() {
  useThemeContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<PageRow | null>(null);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const uid = await myId();
      const { data, error: err } = await supabase
        .from("pages")
        .select("id, owner_id, name, handle, about, category, avatar_url, cover_url, is_verified, created_at")
        .eq("id", id)
        .maybeSingle();
      if (err) throw err;
      if (!data) {
        setError("الصفحة مش موجودة أو اتشالت.");
        return;
      }
      setPage(data as PageRow);
      setMine(!!uid && data.owner_id === uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الصفحة");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // تأجيل التحميل لما بعد أول رسم (بدون setState متزامن داخل الـeffect)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function removePage() {
    Alert.alert("حذف الصفحة", "الصفحة هتتشال نهائيًا من ونس.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احذف",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await supabase.from("pages").delete().eq("id", id);
          if (err) {
            Alert.alert("الحذف فشل", err.message);
            return;
          }
          router.replace("/guide");
        },
      },
    ]);
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>صفحة</Text>
      </View>
      {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {page && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <View style={styles.cover} />
          <View style={styles.head}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{page.name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{page.name}</Text>
                {page.is_verified && <VerificationBadge tone="blue" size={17} />}
              </View>
              <Text style={styles.handle}>@{page.handle} · {page.category ?? "صفحة"}</Text>
            </View>
          </View>
          {!!page.about && <Text style={styles.about}>{page.about}</Text>}
          <Text style={styles.meta}>اتعملت في {new Date(page.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</Text>
          {mine ? (
            <Pressable style={styles.danger} onPress={removePage}>
              <Ionicons name="trash-outline" size={18} color={colors.red} />
              <Text style={styles.dangerText}>حذف الصفحة</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>الصفحة دي ملك مستخدم ونس تاني.</Text>
          )}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    cover: { height: 120, borderRadius: 18, backgroundColor: colors.surface2 },
    head: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    avatarLetter: { color: colors.ink, fontSize: 26, fontFamily: "Cairo_900Black", fontWeight: "900" },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    name: { color: colors.text, fontSize: 19, fontFamily: "Cairo_900Black", fontWeight: "900", textAlign: "right" },
    handle: { color: colors.muted, fontSize: 12, textAlign: "right" },
    about: { color: colors.text, fontSize: 13.5, textAlign: "right", lineHeight: 21 },
    meta: { color: colors.muted, fontSize: 11, textAlign: "right" },
    danger: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.red, borderRadius: 14, height: 48, marginTop: 10 },
    dangerText: { color: colors.red, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    hint: { color: colors.muted, fontSize: 11.5, textAlign: "right" },
    error: { color: colors.red, textAlign: "center", padding: 16 },
  }),
);
