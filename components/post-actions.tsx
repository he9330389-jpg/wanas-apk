import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";

/**
 * قائمة المنشور (⋯) — القسم 17 من الدليل:
 * حفظ · مشاركة داخل ونس وخارجها · إخفاء المنشور · الإبلاغ · حظر صاحب المنشور ·
 * تفعيل/إيقاف التعليقات (لصاحب المنشور) · تعديل · أرشفة · حذف منطقي.
 * كل إجراء بيكتب في قاعدة البيانات فعلًا وبيرجّع رسالة نجاح/فشل صريحة.
 */
export type PostActionsPost = {
  id: string;
  author_id: string;
  body: string | null;
  allow_comments?: boolean | null;
};

export function PostActionsSheet({
  visible,
  post,
  isMine,
  onClose,
  onChanged,
}: {
  visible: boolean;
  post: PostActionsPost | null;
  isMine: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [allowComments, setAllowComments] = useState(!!post?.allow_comments);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post?.body ?? "");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");

  async function save() {
    if (!post) return;
    setBusy("save");
    try {
      const { error } = await supabase.from("saves").upsert({ user_id: (await supabase.auth.getUser()).data.user?.id, post_id: post.id });
      if (error) throw error;
      Alert.alert("اتحفظ", "المنشور بقى في المحفوظات بتاعتك.");
      onClose();
    } catch (e) {
      Alert.alert("الحفظ فشل", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function shareInside() {
    if (!post) return;
    setBusy("share");
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error } = await supabase.from("shares").insert({ user_id: uid, post_id: post.id, share_type: "internal" });
      if (error) throw error;
      Alert.alert("اتشارك", "المنشور اتضاف لمشاركاتك داخل ونس.");
      onChanged?.();
      onClose();
    } catch (e) {
      Alert.alert("المشاركة فشلت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function shareOutside() {
    if (!post) return;
    const url = `https://wanas.app/post/${post.id}`;
    try {
      await Share.share({ message: `${post.body ?? "منشور ونس"}\n${url}` });
    } catch {
      Alert.alert("رابط المنشور", url);
    }
  }

  async function hide() {
    if (!post) return;
    setBusy("hide");
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error } = await supabase.from("hidden_posts").upsert({ user_id: uid, post_id: post.id }, { onConflict: "user_id,post_id" });
      if (error) throw error;
      Alert.alert("اتخبّى", "المنشور ده مش هيظهرلك تاني في الموجز.");
      onChanged?.();
      onClose();
    } catch (e) {
      Alert.alert("مقدرناش نخبّيه", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }
  async function report() {
    if (!post) return;
    if (reportReason.trim().length < 5) {
      Alert.alert("اكتب سبب", "قولنا السبب عشان المراجعة تبقى دقيقة.");
      return;
    }
    setBusy("report");
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error } = await supabase.from("content_reports").insert({
        reporter_id: uid,
        post_id: post.id,
        reported_user_id: post.author_id,
        reason: reportReason.trim(),
        status: "open",
        kind: "content",
      });
      if (error) throw error;
      setReporting(false);
      setReportReason("");
      Alert.alert("وصلنا بلاغك", "شكرًا — فريق المراجعة هيشوفه.");
      onClose();
    } catch (e) {
      Alert.alert("البلاغ مش اتبعت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function block() {
    if (!post) return;
    setBusy("block");
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("محتاج تسجيل دخول");
      const { error } = await supabase.from("blocks").insert({ blocker_id: uid, blocked_id: post.author_id });
      if (error) throw error;
      Alert.alert("اتحظر", "مش هتشوف منشورات الشخص ده تاني.");
      onChanged?.();
      onClose();
    } catch (e) {
      Alert.alert("الحظر فشل", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function toggleComments(next: boolean) {
    if (!post) return;
    setAllowComments(next);
    setBusy("comments");
    try {
      const { error } = await supabase.from("posts").update({ allow_comments: next }).eq("id", post.id);
      if (error) throw error;
      onChanged?.();
    } catch (e) {
      setAllowComments(!next);
      Alert.alert("مقدرناش نغيّر التعليقات", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!post) return;
    setBusy("edit");
    try {
      const { error } = await supabase
        .from("posts")
        .update({ body: draft.trim(), edited_at: new Date().toISOString() })
        .eq("id", post.id);
      if (error) throw error;
      setEditing(false);
      Alert.alert("اتعدّل", "المنشور اتحدّث وبيظهر عليه «معدّل».");
      onChanged?.();
      onClose();
    } catch (e) {
      Alert.alert("التعديل فشل", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (!post) return;
    setBusy("archive");
    try {
      const { error } = await supabase.from("posts").update({ archived_at: new Date().toISOString() }).eq("id", post.id);
      if (error) throw error;
      Alert.alert("اتأرشف", "المنشور اتشال من الموجز بس محفوظ عندك.");
      onChanged?.();
      onClose();
    } catch (e) {
      Alert.alert("الأرشفة فشلت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    if (!post) return;
    Alert.alert("حذف المنشور", "متأكد؟ المنشور هيختفي من عند كل الناس.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "احذف",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          const { error } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", post.id);
          setBusy(null);
          if (error) {
            Alert.alert("الحذف فشل", error.message);
            return;
          }
          Alert.alert("اتحذف", "المنشور اتشال.");
          onChanged?.();
          onClose();
        },
      },
    ]);
  }

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          {editing ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.title}>تعديل المنشور</Text>
              <TextInput value={draft} onChangeText={setDraft} multiline style={styles.input} placeholder="نص المنشور" placeholderTextColor={colors.muted} />
              <Pressable style={styles.primary} onPress={saveEdit} disabled={busy === "edit"}>
                {busy === "edit" ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>حفظ التعديل</Text>}
              </Pressable>
            </View>
          ) : reporting ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.title}>بلّغ عن المنشور</Text>
              <TextInput value={reportReason} onChangeText={setReportReason} multiline style={styles.input} placeholder="اكتب السبب (إساءة · spam · محتوى مؤذي)" placeholderTextColor={colors.muted} />
              <Pressable style={styles.primary} onPress={report} disabled={busy === "report"}>
                {busy === "report" ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>ابعت البلاغ</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              <Row icon="bookmark-outline" label="حفظ في المحفوظات" onPress={save} busy={busy === "save"} />
              <Row icon="share-social-outline" label="مشاركة داخل ونس" onPress={shareInside} busy={busy === "share"} />
              <Row icon="link-outline" label="نسخ/مشاركة الرابط" onPress={shareOutside} />
              {isMine ? (
                <>
                  <View style={styles.switchRow}>
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
                    <Text style={styles.rowLabel}>التعليقات</Text>
                    <Switch
                      value={allowComments}
                      onValueChange={toggleComments}
                      disabled={busy === "comments"}
                      trackColor={{ true: colors.gold, false: colors.border }}
                      thumbColor={allowComments ? colors.ink : colors.text}
                    />
                  </View>
                  <Row icon="create-outline" label="تعديل المنشور" onPress={() => setEditing(true)} />
                  <Row icon="archive-outline" label="أرشفة (مش حذف)" onPress={archive} busy={busy === "archive"} />
                  <Row icon="trash-outline" label="حذف المنشور" onPress={remove} busy={busy === "delete"} danger />
                </>
              ) : (
                <>
                  <Row icon="eye-off-outline" label="إخفاء المنشور" onPress={hide} busy={busy === "hide"} />
                  <Row icon="flag-outline" label="بلّغ عن المنشور" onPress={() => setReporting(true)} danger />
                  <Row icon="ban-outline" label="حظر صاحب المنشور" onPress={block} busy={busy === "block"} danger />
                </>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  busy,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={busy}>
      <Ionicons name={icon} size={20} color={danger ? colors.red : colors.text} />
      <Text style={[styles.rowLabel, danger && { color: colors.red }]}>{label}</Text>
      {busy ? <ActivityIndicator size="small" color={colors.goldText} /> : <Ionicons name="chevron-back" size={15} color={colors.muted} />}
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 30, gap: 6 },
    handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.surface3, alignSelf: "center", marginBottom: 8 },
    title: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 8 },
    switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 8 },
    rowLabel: { color: colors.text, fontSize: 14, flex: 1, textAlign: "right" },
    input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 12, textAlign: "right", minHeight: 90, textAlignVertical: "top" },
    primary: { backgroundColor: colors.gold, borderRadius: 14, height: 48, alignItems: "center", justifyContent: "center" },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  }),
);
