import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** الشروط والخصوصية — بنود مختصرة تطابق سلوك التطبيق الفعلي. */
const SECTIONS = [
  {
    title: "بياناتك",
    body: "بياناتك (الاسم · الصورة · المنشورات · الرسائل) بتتخزن في قاعدة بيانات ونس وتخزينها الخاص. مفيش حد يقدر يقرأ رسائلك أو منشوراتك الخاصة غير الأشخاص اللي سمحت لهم.",
  },
  {
    title: "مين يشوف إيه",
    body: "كل منشور له جمهور (الكل · المتابعين · الأصدقاء · أصدقاء الأصدقاء · الجميع ما عدا الأصدقاء · أنا بس)، والحظر والكتم بيمنعوا الوصول فعلًا من مستوى قاعدة البيانات.",
  },
  {
    title: "الوسائط",
    body: "الصور والفيديوهات والملفات بتترفع على تخزين خاص وبتتفتح بروابط مؤقتة. الملفات بتتقفل على صاحبها ومين ليه حق يشوفها.",
  },
  {
    title: "البلاغات والإشراف",
    body: "أي بلاغ بيدخل مركز البلاغات وبيتراجع بشريًا. المحتوى المخالف بيتشال، والحساب المخالف ممكن يتقيّد أو يتحظر مع إمكانية الاستئناف.",
  },
  {
    title: "الأرباح",
    body: "نقاط ونس الناتجة عن الهدايا بتتحسب في رصيدك (1 نقطة = 0.05 جنيه). سحب الرصيد بيتطلب طلب من «تواصل معنا» وبعد التحقق من بياناتك.",
  },
  {
    title: "حذف الحساب",
    body: "تقدر تحذف حسابك في أي وقت من الخصوصية والأمان. الحذف بيشيل بياناتك ومنشوراتك نهائيًا.",
  },
];

export default function LegalScreen() {
  useThemeContext();
  const router = useRouter();
  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>الشروط والخصوصية</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 50 }}>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.card}>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardBody}>{s.body}</Text>
          </View>
        ))}
        <Text style={styles.footer}>WANAS · مساحة الونس · آخر تحديث 2026</Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
    cardTitle: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    cardBody: { color: colors.text, fontSize: 12.5, textAlign: "right", lineHeight: 21 },
    footer: { color: colors.muted, fontSize: 10.5, textAlign: "center", marginTop: 10 },
  }),
);
