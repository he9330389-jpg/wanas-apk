import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** مركز المساعدة — أسئلة شائعة حقيقية عن السلوك الفعلي للتطبيق + روابط للدعم. */
const FAQ = [
  {
    q: "مش وصلني كود تأكيد البريد، أعمل إيه؟",
    a: "استنى دقيقة وجرّب «ابعت الكود تاني». لو لسه، بص في مجلد Spam. الكود بيبعت من سيرفر ونس المخصص ومدة صلاحيته ساعة.",
  },
  {
    q: "ليه المنشور مش بيظهر لصحابي؟",
    a: "راجع الجمهور اللي اخترته وقت النشر (الأصدقاء · أصدقاء الأصدقاء · الجميع ما عدا الأصدقاء). الجمهور بيحدد مين يشوف المنشور فعلًا.",
  },
  {
    q: "إزاي أرفع صوت أو PDF؟",
    a: "من زر + في الرئيسية › أضف PDF/ملف أو سجّل صوت. الملف بيتّرفع على التخزين الخاص قبل النشر، وبتشوف نسبة الرفع.",
  },
  {
    q: "الوضع الهادئ بيعمل إيه؟",
    a: "بيوقف تنبيهات الإشعارات لفترة تختارها، وبيفضل تقدر تتصفح عادي. الإشعارات اللي جت في الفترة بتتجمع وتظهر لما الوضع يخلص.",
  },
  {
    q: "إزاي أكسب من ونس؟",
    a: "بهدايا نقاط ونس اللي الناس بتبعتها على منشوراتك. كل نقطة = 0.05 جنيه، والرصيد بيتحسب فورًا في نظام الربح.",
  },
  {
    q: "إزاي أحذف حسابي؟",
    a: "من الحساب › الخصوصية والأمان › حذف الحساب. بيتطلب تأكيد، وبيتم حذف بياناتك من الحساب نهائيًا.",
  },
];

export default function HelpScreen() {
  useThemeContext();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>مركز المساعدة</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 50 }}>
        {FAQ.map((item, i) => (
          <Pressable key={item.q} style={styles.card} onPress={() => setOpen(open === i ? null : i)}>
            <View style={styles.qRow}>
              <Text style={styles.q}>{item.q}</Text>
              <Ionicons name={open === i ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
            </View>
            {open === i && <Text style={styles.a}>{item.a}</Text>}
          </Pressable>
        ))}
        <Pressable style={styles.row} onPress={() => router.push("/support?mode=bug")}>
          <Ionicons name="flag-outline" size={20} color={colors.text} />
          <Text style={styles.rowLabel}>لسه محتاج مساعدة؟ بلّغ عن مشكلة</Text>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/support?mode=contact")}>
          <Ionicons name="mail-outline" size={20} color={colors.text} />
          <Text style={styles.rowLabel}>تواصل معنا</Text>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
    qRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    q: { color: colors.text, fontSize: 13.5, flex: 1, textAlign: "right", fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
    a: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 20 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    rowLabel: { color: colors.text, fontSize: 13.5, flex: 1, textAlign: "right" },
  }),
);
