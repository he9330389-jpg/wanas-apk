import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Report = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  reported_user_id: string | null;
  post_id: string | null;
};

type Person = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  open: "قيد المراجعة",
  pending: "قيد المراجعة",
  reviewing: "بيتراجع",
  resolved: "اتحل",
  actioned: "اتخذ إجراء",
  dismissed: "مرفوض",
};

/**
 * مركز الأمان — القسم 34.
 * بلاغاتي وحالتها، الحسابات المحظورة، والمكتمة، وإدارة كل واحدة.
 * كل بيانات الشاشة من RLS الحقيقية: المستخدم يشوف بلاغاته هو بس.
 */
export default function SafetyScreen() {
  useThemeContext();
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);
  const [muted, setMuted] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMe(uid);
      if (!uid) return;

      const [rep, blk, mut] = await Promise.all([
        supabase
          .from("content_reports")
          .select("id, reason, status, created_at, reported_user_id, post_id")
          .eq("reporter_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("blocks").select("blocked_id").eq("blocker_id", uid).limit(200),
        supabase.from("muted_users").select("muted_user_id").eq("muter_id", uid).limit(200),
      ]);

      setReports((rep.data ?? []) as Report[]);

      const ids = [
        ...((blk.data ?? []) as { blocked_id: string }[]).map((b) => b.blocked_id),
        ...((mut.data ?? []) as { muted_user_id: string }[]).map((m) => m.muted_user_id),
      ];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", Array.from(new Set(ids)));
        names = Object.fromEntries(
          (profs ?? []).map((p) => [p.id as string, (p.display_name ?? p.username ?? "مستخدم") as string]),
        );
      }
      setBlocked(
        ((blk.data ?? []) as { blocked_id: string }[]).map((b) => ({
          id: b.blocked_id,
          name: names[b.blocked_id] ?? "مستخدم",
        })),
      );
      setMuted(
        ((mut.data ?? []) as { muted_user_id: string }[]).map((m) => ({
          id: m.muted_user_id,
          name: names[m.muted_user_id] ?? "مستخدم",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل مركز الأمان");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  function unblock(id: string) {
    Alert.alert("إلغاء الحظر", "هيرجع يشوف منشوراتك ويتفاعل معاك تاني.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "الغِ الحظر",
        onPress: async () => {
          const { error: err } = await supabase.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", id);
          if (err) Alert.alert("مش تم", err.message);
          await load();
        },
      },
    ]);
  }

  async function unmute(id: string) {
    const { error: err } = await supabase.from("muted_users").delete().eq("muter_id", me).eq("muted_user_id", id);
    if (err) Alert.alert("مش تم", err.message);
    await load();
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)"))} hitSlop={12}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>مركز الأمان</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.goldText}
          />
        }
      >
        {loading && <ActivityIndicator color={colors.goldText} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.section}>بلاغاتي ({reports.length})</Text>
        {reports.length === 0 && !loading && <Text style={styles.empty}>مفيش بلاغات. لو حصلت مشكلة ابلّغ من المنشور أو المحادثة.</Text>}
        {reports.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="flag-outline" size={16} color={colors.goldText} />
              <Text style={styles.cardTitle} numberOfLines={1}>{r.reason || "بلاغ"}</Text>
              <Text style={[styles.status, r.status === "resolved" || r.status === "actioned" ? { color: colors.green } : null]}>
                {STATUS_LABEL[r.status] ?? r.status}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              {new Date(r.created_at).toLocaleString("ar-EG-u-nu-latn")}
              {r.post_id ? " · منشور" : r.reported_user_id ? " · حساب" : ""}
            </Text>
          </View>
        ))}

        <Text style={styles.section}>الحسابات المحظورة ({blocked.length})</Text>
        {blocked.length === 0 && !loading && <Text style={styles.empty}>مفيش حد محظور.</Text>}
        {blocked.map((b) => (
          <View key={b.id} style={styles.row}>
            <Text style={styles.rowName}>{b.name}</Text>
            <Pressable onPress={() => unblock(b.id)} hitSlop={8}>
              <Text style={styles.actionText}>إلغاء الحظر</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.section}>المكتمين ({muted.length})</Text>
        {muted.length === 0 && !loading && <Text style={styles.empty}>مفيش حد مكتوم.</Text>}
        {muted.map((m) => (
          <View key={m.id} style={styles.row}>
            <Text style={styles.rowName}>{m.name}</Text>
            <Pressable onPress={() => unmute(m.id)} hitSlop={8}>
              <Text style={styles.actionText}>إلغاء الكتم</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.note}>
          البلاغات بيراجعها فريق الإشراف. لو اتصرف على محتوى، هيظهر عندك الحالة «اتخذ إجراء» أو «اتحل».
          الحظر بيشتغل في الاتجاهين: انت ما تشوفهوش وهو ما يشوفكش.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    section: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 6 },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    cardTitle: { color: colors.text, fontSize: 13.5, flex: 1, textAlign: "right" },
    status: { color: colors.goldText, fontSize: 11 },
    cardMeta: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
    row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: colors.border },
    rowName: { color: colors.text, fontSize: 13.5 },
    actionText: { color: colors.red, fontSize: 12 },
    empty: { color: colors.muted, fontSize: 12, textAlign: "right" },
    error: { color: colors.red, fontSize: 12, textAlign: "center" },
    note: { color: colors.muted, fontSize: 10.5, textAlign: "right", lineHeight: 17, marginTop: 10 },
  }),
);
