import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { myEarnings, myId, type EarningRow } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * نظام الربح — نقاط ونس:
 * المستخدم بيبعت هدية (1 · 5 · 10 · 25 · 50 · 100) لأي منشئ، والهدية بتتسجل في `gifts`
 * والرصيد بيتحسب تلقائيًا في `creator_earnings` (1 نقطة = 0.05 جنيه).
 * مفيش أرقام وهمية: كل صف هنا متسجل فعليًا بقاعدة البيانات.
 */
export default function EarningsScreen() {
  useThemeContext();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EarningRow[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const uid = await myId();
      if (!uid) return;
      const money = await myEarnings(uid);
      setRows(money.rows);
      setTotal(money.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)/profile"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>نظام الربح ونقاط ونس</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>رصيدك الحالي</Text>
          <Text style={styles.balance}>{total.toFixed(2)} <Text style={styles.currency}>جنيه</Text></Text>
          <Text style={styles.balanceHint}>بيتحسب من الهدايا اللي وصلك · 1 نقطة ونس = 0.05 جنيه</Text>
        </View>
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>إزاي بتكسب؟</Text>
          <Text style={styles.howLine}>• حد يبعتلك هدية على منشورك أو على ركنك (1 · 5 · 10 · 25 · 50 · 100 نقطة).</Text>
          <Text style={styles.howLine}>• كل هدية بتتسجل فورًا في حسابك — من غير تأخير.</Text>
          <Text style={styles.howLine}>• سحب الرصيد بيتطلب من الإعدادات › تواصل معنا، والتحويل بيتم بعد التحقق من بياناتك.</Text>
        </View>
        <Text style={styles.section}>سجل الأرباح</Text>
        {loading && <ActivityIndicator color={colors.goldText} />}
        {!loading && rows.length === 0 && (
          <Text style={styles.empty}>لسه مفيش أرباح — أول هدية توصلك هتظهر هنا فورًا.</Text>
        )}
        {rows.map((r) => (
          <View key={r.id} style={styles.row}>
            <Ionicons name="gift-outline" size={18} color={colors.goldText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.note ?? "هدية ونس"}</Text>
              <Text style={styles.rowMeta}>{new Date(r.created_at).toLocaleString("ar-EG-u-nu-latn")}</Text>
            </View>
            <Text style={styles.amount}>+{Number(r.amount).toFixed(2)}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 18, fontFamily: "Cairo_900Black", fontWeight: "900" },
    balanceCard: { backgroundColor: colors.goldSoft, borderRadius: 20, padding: 18, gap: 4, borderWidth: 1, borderColor: colors.gold },
    balanceLabel: { color: colors.goldText, fontSize: 12, textAlign: "right" },
    balance: { color: colors.text, fontSize: 30, fontFamily: "Cairo_900Black", fontWeight: "900", textAlign: "right" },
    currency: { fontSize: 15, color: colors.muted },
    balanceHint: { color: colors.muted, fontSize: 11, textAlign: "right" },
    howCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
    howTitle: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    howLine: { color: colors.muted, fontSize: 12, textAlign: "right", lineHeight: 19 },
    section: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 6 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    rowTitle: { color: colors.text, fontSize: 13, textAlign: "right" },
    rowMeta: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 2 },
    amount: { color: colors.green, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    empty: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
  }),
);
