import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { listCouncils, createCouncil, type CouncilRoom } from "@/lib/councils";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
const SPEAK_POLICIES = [
  { key: "host", label: "المضيف بس" },
  { key: "request", label: "بطلب" },
  { key: "everyone", label: "الكل" },
];

/**
 * المجالس — القسم 22 من دليل الهوية.
 * «افتح مجلس»: نوع المجلس (عام/خاص)، مين يتكلم، جدولة + تذكير،
 * التسجيل بإذن المشاركين، ثم الدخول لجوّه المجلس.
 */
export default function CouncilsScreen() {
  useThemeContext();
  const router = useRouter();
  const [rooms, setRooms] = useState<CouncilRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"public" | "private">("public");
  const [policy, setPolicy] = useState("request");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [reminder, setReminder] = useState(true);
  const [record, setRecord] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRooms(await listCouncils());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل المجالس");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listCouncils()
      .then((r) => {
        if (active) setRooms(r);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "تعذّر تحميل المجالس");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate() {
    if (title.trim().length < 1) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("لازم تسجّل الدخول الأول");

      // Scheduled councils require a parseable date; empty = start now
      let scheduledAt: string | null = null;
      if (scheduledFor.trim()) {
        const d = new Date(scheduledFor.trim());
        if (Number.isNaN(d.getTime())) throw new Error("صيغة الموعد مش مفهومة (مثال: 2026-11-05 21:00)");
        scheduledAt = d.toISOString();
      }

      await createCouncil({ hostId: data.user.id, title, description });
      const { data: created } = await supabase
        .from("majlis_rooms")
        .select("id")
        .eq("host_id", data.user.id)
        .eq("title", title.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (created?.id) {
        await supabase
          .from("majlis_rooms")
          .update({
            topic: topic.trim() || null,
            kind,
            speak_policy: policy,
            scheduled_at: scheduledAt,
            status: scheduledAt ? "scheduled" : "live",
            is_live: !scheduledAt,
            reminder_minutes: reminder ? 15 : null,
            is_recorded: record,
          })
          .eq("id", created.id);
        router.push({ pathname: "/council/[id]", params: { id: created.id, name: title.trim() } });
      }

      setTitle("");
      setTopic("");
      setDescription("");
      setScheduledFor("");
      setRecord(false);
      setCreateVisible(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إنشاء المجلس");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell>
      <Header title="المجالس" />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.goldText} />
        }
      >
        <Pressable style={styles.createBtn} onPress={() => setCreateVisible(true)}>
          <Ionicons name="mic" size={20} color={colors.ink} />
          <Text style={styles.createText}>افتح مجلس</Text>
        </Pressable>

        {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && rooms.length === 0 && !error && (
          <Text style={styles.empty}>مفيش مجالس مفتوحة دلوقتي. افتح مجلسك وأجمع الونس.</Text>
        )}

        {rooms.map((room) => {
          const extra = room as CouncilRoom & {
            kind?: string;
            status?: string;
            topic?: string;
            speaker_slots?: number;
          };
          const isLive = extra.status === "live" || room.is_live;
          const isScheduled = extra.status === "scheduled";
          return (
            <Pressable
              key={room.id}
              style={styles.card}
              onPress={() => router.push({ pathname: "/council/[id]", params: { id: room.id, name: room.title } })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{room.title}</Text>
                <View style={[styles.statusPill, { backgroundColor: isLive ? colors.red : colors.surface3 }]}>
                  <Text style={styles.statusText}>{isLive ? "LIVE" : isScheduled ? "مجدول" : "متاح"}</Text>
                </View>
              </View>
              {!!extra.topic && <Text style={styles.cardTopic} numberOfLines={1}>{extra.topic}</Text>}
              {!!room.description && <Text style={styles.cardDesc} numberOfLines={2}>{room.description}</Text>}
              <Text style={styles.cardMeta}>
                {extra.kind === "private" ? "مجلس خاص" : "مجلس عام"}
                {room.is_recorded ? " · بيتسجل" : ""}
                {isScheduled && room.scheduled_at ? ` · ${new Date(room.scheduled_at).toLocaleString("ar-EG-u-nu-latn")}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>مجلس جديد</Text>
                <Pressable onPress={() => setCreateVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>

              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="عنوان المجلس"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={160}
              />
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="الموضوع (اختياري)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={160}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="كلمة عن المجلس (اختياري)"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.multiline]}
                multiline
              />

              <Text style={styles.sectionLabel}>نوع المجلس</Text>
              <View style={styles.chipRow}>
                {[{ k: "public", l: "عام" }, { k: "private", l: "خاص (بطلب انضمام)" }].map((o) => (
                  <Pressable
                    key={o.k}
                    onPress={() => setKind(o.k as "public" | "private")}
                    style={[styles.chip, kind === o.k && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, kind === o.k && styles.chipTextActive]}>{o.l}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>مين يتكلم؟</Text>
              <View style={styles.chipRow}>
                {SPEAK_POLICIES.map((p) => (
                  <Pressable
                    key={p.key}
                    onPress={() => setPolicy(p.key)}
                    style={[styles.chip, policy === p.key && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, policy === p.key && styles.chipTextActive]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>جدولة (اختياري)</Text>
              <TextInput
                value={scheduledFor}
                onChangeText={setScheduledFor}
                placeholder="2026-11-05 21:00"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              <View style={styles.switchRow}>
                <Switch value={reminder} onValueChange={setReminder} trackColor={{ true: colors.gold, false: colors.surface3 }} />
                <Text style={styles.switchText}>فكّرني قبل المجلس بـ 15 دقيقة</Text>
              </View>
              <View style={styles.switchRow}>
                <Switch value={record} onValueChange={setRecord} trackColor={{ true: colors.gold, false: colors.surface3 }} />
                <Text style={styles.switchText}>سجّل المجلس (بإذن المشاركين)</Text>
              </View>

              <Pressable style={[styles.publishBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.publishText}>افتح المجلس</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  container: { padding: 20, gap: 12 },
  createBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, height: 52, borderRadius: 18 },
  createText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 16 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 30, fontSize: 14 },
  error: { color: colors.red, textAlign: "center", marginTop: 16, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 6 },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
  cardTopic: { color: colors.goldText, fontSize: 12, textAlign: "right" },
  cardDesc: { color: colors.muted, fontSize: 13, textAlign: "right" },
  cardMeta: { color: colors.muted, fontSize: 11, textAlign: "right" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { color: colors.text, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 30, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  input: { backgroundColor: colors.surface3, borderRadius: 14, padding: 14, color: colors.text, textAlign: "right", borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right" },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  chipText: { color: colors.muted, fontSize: 12 },
  chipTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  switchText: { color: colors.text, fontSize: 13 },
  publishBtn: { backgroundColor: colors.gold, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 6 },
  publishText: { color: colors.ink, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
})));