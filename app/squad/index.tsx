import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  THEMES,
  createSquad,
  joinSquad,
  listMySquadInvites,
  listMySquads,
  respondSquadInvite,
  type Squad,
} from "@/lib/excellence";

const EMOJIS = ["👥", "🌙", "☕", "🎧", "🏠", "✨", "🫂", "🎓", "⚽", "🍵"];

type MySquad = Squad & { my_role: string };

/**
 * الشّلة — القسم 34: دائرة صغيرة (3–15 شخص) لها ونسة ومجلس مشترك،
 * بألبوم واحد مشترك، بثيمات مصرية/خليجية/شامية.
 */
export default function SquadsScreen() {
  useThemeContext();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [squads, setSquads] = useState<MySquad[]>([]);
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof listMySquadInvites>>>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "create" | "join">("none");

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [theme, setTheme] = useState<"masri" | "khaligi" | "shami">("masri");
  const [max, setMax] = useState(15);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const [mine, pending] = await Promise.all([listMySquads(uid), listMySquadInvites(uid)]);
      setSquads(mine);
      setInvites(pending);
    } catch (error) {
      Alert.alert("مشكلة في التحميل", error instanceof Error ? error.message : "حاول تاني");
    } finally {
      setLoading(false);
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

  const submitCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert("اكتب اسم للشلّة", "الاسم من حرفين على الأقل");
      return;
    }
    setBusy(true);
    try {
      const id = await createSquad({ name, emoji, theme, max });
      setName("");
      setMode("none");
      await load();
      router.push({ pathname: "/squad/[id]", params: { id } });
    } catch (error) {
      Alert.alert("محصلتش الشلّة", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const id = await joinSquad(code);
      setCode("");
      setMode("none");
      await load();
      router.push({ pathname: "/squad/[id]", params: { id } });
    } catch (error) {
      Alert.alert("مش قادر أنضم", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (inviteId: string, squadId: string, accept: boolean) => {
    try {
      await respondSquadInvite(inviteId, squadId, accept);
      await load();
    } catch (error) {
      Alert.alert("مش قادر أرد على الدعوة", error instanceof Error ? error.message : "");
    }
  };

  return (
    <ScreenShell>
      <Header title="الشّلة" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>👥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>الشّلة — دايرتك الصغيرة</Text>
            <Text style={styles.heroSub}>
              من 3 لـ 15 شخص بس، ليهم ونسة ومجلس مشترك وألبوم واحد. مفيش غرباء، مفيش زحمة — ونستك مع ناسك.
            </Text>
          </View>
        </View>

        {invites.length > 0 && (
          <View style={styles.inviteBox}>
            <Text style={styles.inviteTitle}>عندك {invites.length} دعوة شلّة</Text>
            {invites.map((inv) => (
              <View key={inv.id} style={styles.inviteRow}>
                <Text style={styles.inviteName}>
                  {inv.squads?.emoji ?? "👥"} {inv.squads?.name ?? "شلّة"}
                </Text>
                <View style={styles.inviteActions}>
                  <Pressable style={styles.acceptBtn} onPress={() => respond(inv.id, inv.squad_id, true)}>
                    <Text style={styles.acceptText}>انضم</Text>
                  </Pressable>
                  <Pressable style={styles.declineBtn} onPress={() => respond(inv.id, inv.squad_id, false)}>
                    <Text style={styles.declineText}>بعدين</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {mode === "none" && (
          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={() => setMode("create")}>
              <Ionicons name="add-circle" size={20} color={colors.ink} />
              <Text style={styles.actionText}>أنشئ شلّة</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={() => setMode("join")}>
              <Ionicons name="enter-outline" size={18} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>انضم بكود</Text>
            </Pressable>
          </View>
        )}

        {mode === "create" && (
          <View style={styles.form}>
            <Text style={styles.label}>اسم الشلّة</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="مثلًا: شلّة القهوة"
              placeholderTextColor={colors.muted}
              style={styles.input}
              textAlign="right"
              maxLength={40}
            />
            <Text style={styles.label}>الأيقونة</Text>
            <View style={styles.chipRow}>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiChip, emoji === e && styles.chipActive]}>
                  <Text style={{ fontSize: 18 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>الثيم</Text>
            <View style={styles.chipRow}>
              {THEMES.map((t) => (
                <Pressable key={t.key} onPress={() => setTheme(t.key)} style={[styles.chip, theme === t.key && styles.chipActive]}>
                  <Text style={[styles.chipText, theme === t.key && { color: colors.ink }]}>
                    {t.emoji} {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>أقصى عدد ({max})</Text>
            <View style={styles.chipRow}>
              {[3, 5, 8, 10, 15].map((n) => (
                <Pressable key={n} onPress={() => setMax(n)} style={[styles.chip, max === n && styles.chipActive]}>
                  <Text style={[styles.chipText, max === n && { color: colors.ink }]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.formActions}>
              <Pressable style={styles.primary} onPress={submitCreate} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>اعمل الشلّة</Text>}
              </Pressable>
              <Pressable onPress={() => setMode("none")} style={styles.cancel}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
            </View>
          </View>
        )}

        {mode === "join" && (
          <View style={styles.form}>
            <Text style={styles.label}>كود الدعوة</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="اكتب الكود اللي وصلك"
              placeholderTextColor={colors.muted}
              style={styles.input}
              textAlign="right"
              autoCapitalize="none"
            />
            <View style={styles.formActions}>
              <Pressable style={styles.primary} onPress={submitJoin} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>انضم</Text>}
              </Pressable>
              <Pressable onPress={() => setMode("none")} style={styles.cancel}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>شللي</Text>
        {loading ? (
          <ActivityIndicator color={colors.goldText} style={{ marginTop: 20 }} />
        ) : squads.length === 0 ? (
          <Text style={styles.empty}>لسه مش في شلّة. اعمل واحدة وابعت الكود لأصحابك القريبين.</Text>
        ) : (
          squads.map((s) => (
            <Pressable
              key={s.id}
              style={styles.squadCard}
              onPress={() => router.push({ pathname: "/squad/[id]", params: { id: s.id } })}
            >
              <View style={styles.squadEmojiWrap}>
                <Text style={{ fontSize: 24 }}>{s.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.squadName}>{s.name}</Text>
                <Text style={styles.squadMeta}>
                  {THEMES.find((t) => t.key === s.theme)?.label} · لحد {s.max_members} شخص ·{" "}
                  {s.my_role === "owner" ? "أنت المالك" : s.my_role === "admin" ? "مشرف" : "عضو"}
                </Text>
              </View>
              <Ionicons name="chevron-back" size={18} color={colors.muted} />
            </Pressable>
          ))
        )}
        {userId ? null : <Text style={styles.empty}>سجّل دخولك عشان تستخدم الشّلة.</Text>}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  hero: { flexDirection: "row-reverse", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  heroSub: { color: colors.muted, fontSize: 12.5, textAlign: "right", lineHeight: 19, marginTop: 4 },
  inviteBox: { backgroundColor: "#E8C96A14", borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: "#E8C96A44" },
  inviteTitle: { color: colors.goldText, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13, textAlign: "right" },
  inviteRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  inviteName: { color: colors.text, fontSize: 13 },
  inviteActions: { flexDirection: "row-reverse", gap: 6 },
  acceptBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  acceptText: { color: colors.ink, fontSize: 12, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  declineBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  declineText: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: "row-reverse", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 12 },
  actionGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  form: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.muted, fontSize: 11.5, textAlign: "right" },
  input: { backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  emojiChip: { backgroundColor: colors.surface2, borderRadius: 12, padding: 6, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.text, fontSize: 12 },
  formActions: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 6 },
  primary: { flex: 1, backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: colors.muted, fontSize: 13 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 6 },
  empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 14, lineHeight: 20 },
  squadCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
  squadEmojiWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  squadName: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  squadMeta: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 },
})));
