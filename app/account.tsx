import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * حسابي وبياناتي — القسم 35.
 * تصدير حقيقي لبياناتك من الجداول اللي RLS بتسمحلك بيها، ومشاركة الملف.
 * حذف الحساب: بيتسجّل طلب حقيقي في `content_reports` بنوع طلب حذف
 * (التطبيق مش بيمسح auth.users لأنه محتاج Service Role مش موجود في التطبيق أبدًا)،
 * وبيوضّح للمستخدم إن الحساب بيتوقف فعليًا بعد المراجعة.
 */
const TABLES: { table: string; column: string; label: string }[] = [
  { table: "posts", column: "author_id", label: "منشوراتي" },
  { table: "comments", column: "author_id", label: "تعليقاتي" },
  { table: "post_reactions", column: "user_id", label: "تفاعلاتي" },
  { table: "saves", column: "user_id", label: "محفوظاتي" },
  { table: "stories", column: "user_id", label: "قصصي" },
  { table: "direct_messages", column: "sender_id", label: "رسائلي" },
  { table: "friends", column: "user_a", label: "أصدقائي" },
  { table: "blocks", column: "blocker_id", label: "حظري" },
];

export default function AccountScreen() {
  useThemeContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [shownName, setShownName] = useState("");
  const [bio, setBio] = useState("");
  const [loadedProfile, setLoadedProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("username, display_name, bio").eq("id", uid).maybeSingle();
      setHandle(data?.username ?? "");
      setShownName(data?.display_name ?? "");
      setBio(data?.bio ?? "");
      setLoadedProfile(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /** تعديل اليوزر نيم @ والاسم والنبذة — بيتحفظ فعليًا في profiles. */
  async function saveProfile() {
    if (savingProfile) return;
    const cleanHandle = handle.trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanHandle)) {
      Alert.alert("اليوزر نيم غلط", "من 3 لـ30 حرف، حروف إنجليزي وأرقام و _ بس (من غير @).");
      return;
    }
    setSavingProfile(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      // نعدّل نفس صف الحساب (بالـ id) ونتأكد إن الصف اتغيّر فعلاً — مش بنعمل حساب جديد أبدًا
      const patch = { username: cleanHandle, display_name: shownName.trim() || cleanHandle, bio: bio.trim() || null };
      const { data: updated, error } = await supabase.from("profiles").update(patch).eq("id", uid).select("id, username");
      if (error) {
        if (error.code === "23505") throw new Error("اليوزر نيم ده محجوز — جرّب واحد تاني");
        throw new Error(errorMessage(error));
      }
      if (!updated?.length) {
        // مفيش صف اتعدّل: إما البروفايل مش موجود أو سياسة الأمان منعت التعديل
        const { data: existing } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
        if (existing) throw new Error("السيرفر رفض تعديل اليوزر نيم (صلاحيات قاعدة البيانات) — راجع سياسة UPDATE على جدول profiles");
        const { error: insertError } = await supabase.from("profiles").insert({ id: uid, ...patch });
        if (insertError) throw new Error(errorMessage(insertError));
      }
      setHandle(cleanHandle);
      Alert.alert("اتحفظ", `اليوزر نيم بتاعك بقى @${cleanHandle} — هيظهر في البحث والمنشن.`);
    } catch (e) {
      Alert.alert("مش اتحفظ", errorMessage(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function exportData() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("محتاج تسجيل دخول");

      const payload: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at },
      };

      for (const t of TABLES) {
        const { data, error } = await supabase.from(t.table).select("*").eq(t.column, user.id).limit(1000);
        payload[t.table] = error ? { error: error.message } : data ?? [];
      }

      const json = JSON.stringify(payload, null, 2);
      const file = new File(Paths.cache, `wanas-data-${Date.now()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "بيانات ونس" });
      } else {
        Alert.alert("تم التصدير", `الملف محفوظ في: ${file.uri}`);
      }
    } catch (e) {
      Alert.alert("التصدير مش تم", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(false);
    }
  }

  function requestDeletion() {
    Alert.alert(
      "طلب حذف الحساب",
      "هنسجّل طلب حذف حقيقي. الحساب بيتم تعطيله ويُحذف نهائيًا بعد مراجعة فريق ونس. محتاج تأكد.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "سجّل الطلب",
          style: "destructive",
          onPress: async () => {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth.user?.id;
            if (!uid) return;
            const { error } = await supabase.from("content_reports").insert({
              reporter_id: uid,
              reported_user_id: uid,
              reason: "طلب حذف الحساب (Account deletion request)",
              status: "open",
            });
            if (error) {
              Alert.alert("مش تم", error.message);
              return;
            }
            Alert.alert("اتسجل الطلب", "فريق ونس هيتواصل معاك ويقفل الحساب خلال أيام. تقدر ترجع في الطلب بالتواصل مع الدعم.");
          },
        },
      ],
    );
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)"))} hitSlop={12}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>حسابي وبياناتي</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        <View style={styles.editCard}>
          <Text style={styles.actionTitle}>تعديل بياناتي</Text>
          <Text style={styles.fieldLabel}>اليوزر نيم (@)</Text>
          <View style={styles.handleRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username"
              placeholderTextColor={colors.muted}
              style={styles.input}
              editable={loadedProfile}
            />
          </View>
          <Text style={styles.fieldLabel}>الاسم الظاهر</Text>
          <TextInput
            value={shownName}
            onChangeText={setShownName}
            placeholder="اسمك اللي يظهر للناس"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>النبذة</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="اكتب عن نفسك في سطر"
            placeholderTextColor={colors.muted}
            style={[styles.input, { minHeight: 64 }]}
            multiline
          />
          <Pressable style={styles.saveBtn} onPress={saveProfile} disabled={savingProfile}>
            {savingProfile ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>احفظ التعديلات</Text>}
          </Pressable>
        </View>
        <Pressable style={styles.action} onPress={exportData} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.goldText} />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={22} color={colors.goldText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>صدّر بياناتي</Text>
                <Text style={styles.actionSub}>ملف JSON فيه منشوراتك وتعليقاتك وتفاعلاتك وقصصك ورسائلك.</Text>
              </View>
            </>
          )}
        </Pressable>

        <Pressable style={[styles.action, styles.danger]} onPress={requestDeletion}>
          <Ionicons name="trash-outline" size={22} color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: colors.red }]}>اطلب حذف الحساب</Text>
            <Text style={styles.actionSub}>بيتسجّل طلب حقيقي للمراجعة، مش حذف فوري.</Text>
          </View>
        </Pressable>

        <Text style={styles.note}>
          التصدير بيقرأ بس الجداول اللي صلاحياتك (RLS) بتسمحلك تشوفها، فمفيش بيانات حد تاني في الملف.
          حذف الحساب نهائيًا محتاج صلاحية خادم عالية، عشان كده بيتسجل كطلب ويتنفّذ من فريق ونس — ده أمان لك مش نقص.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    action: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border },
    danger: { borderColor: colors.red },
    actionTitle: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    actionSub: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 3 },
    note: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17, marginTop: 8 },
    editCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
    fieldLabel: { color: colors.muted, fontSize: 11.5, textAlign: "right", marginTop: 4 },
    handleRow: { flexDirection: "row-reverse", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10 },
    at: { color: colors.goldText, fontSize: 15, fontWeight: "800" },
    input: { flex: 1, color: colors.text, fontSize: 13.5, paddingVertical: 10, textAlign: "right" },
    saveBtn: { backgroundColor: colors.gold, borderRadius: 12, alignItems: "center", paddingVertical: 11, marginTop: 6 },
    saveText: { color: colors.ink, fontSize: 13.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  }),
);
