import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl, TextInput, Alert, Switch, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ScreenShell, Header, Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { loadMessageState, updateMessageState, withConversation, type MessageGlobalPreferences, type MessageLocalState } from "@/lib/chat-preferences";
import { grantChatAccess } from "@/lib/chat-access";

type Conversation = {
  peer_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_body: string | null;
  last_at: string | null;
  unread: boolean;
};
type Section = "inbox" | "active" | "archive" | "locked" | "settings";
type BlockedUser = { id: string; username: string; display_name: string | null };

const SECTION_TABS: { key: Exclude<Section, "inbox">; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "locked", label: "القفل", icon: "lock-closed-outline" },
  { key: "active", label: "النشطون", icon: "radio-outline" },
  { key: "archive", label: "الأرشيف", icon: "archive-outline" },
  { key: "settings", label: "الإعدادات", icon: "settings-outline" },
];

export default function MessagesScreen() {
  useThemeContext();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [section, setSection] = useState<Section>("inbox");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [localState, setLocalState] = useState<MessageLocalState | null>(null);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [search, setSearch] = useState("");
  const [actionConversation, setActionConversation] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) throw new Error("لازم تسجّل الدخول");
      const uid = userData.user.id;
      setUserId(uid);
      const state = await loadMessageState(uid);
      setLocalState(state);

      const { data, error: dmError } = await supabase
        .from("direct_messages")
        .select("sender_id, recipient_id, body, media_type, created_at, read_at")
        .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (dmError) throw dmError;

      const byPeer = new Map<string, { body: string; type: string | null; at: string; unread: boolean }>();
      for (const message of data ?? []) {
        const peer = message.sender_id === uid ? message.recipient_id : message.sender_id;
        if (!byPeer.has(peer)) {
          byPeer.set(peer, {
            body: message.body ?? "",
            type: message.media_type ?? null,
            at: message.created_at,
            unread: message.recipient_id === uid && !message.read_at,
          });
        }
      }
      const peers = [...byPeer.keys()];
      if (!peers.length) {
        setConversations([]);
      } else {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", peers);
        if (profileError) throw profileError;
        const list: Conversation[] = (profiles ?? []).map((profile) => {
          const last = byPeer.get(profile.id);
          const mediaLabel = last?.type?.startsWith("image") ? "📷 صورة" : last?.type?.startsWith("video") ? "🎥 فيديو" : last?.type === "audio" ? "🎙 رسالة صوتية" : last?.type === "file" ? "📎 ملف" : "";
          return {
            peer_id: profile.id,
            username: profile.username,
            display_name: profile.display_name || profile.username,
            avatar_url: profile.avatar_url,
            last_body: last?.body || mediaLabel || null,
            last_at: last?.at ?? null,
            unread: last?.unread ?? false,
          };
        });
        setConversations(list);
      }
      const { data: blocks, error: blockError } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", uid);
      if (blockError) throw blockError;
      const ids = (blocks ?? []).map((item) => item.blocked_id);
      if (!ids.length) setBlocked([]);
      else {
        const { data: people, error: peopleError } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
        if (peopleError) throw peopleError;
        setBlocked((people ?? []) as BlockedUser[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الرسائل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => { if (active) await load(); })();
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("wanas-messages-presence", { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => setOnlineIds(Object.keys(channel.presenceState())))
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => void load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && localState?.global.hideActivity !== true) {
          void channel.track({ userId, online: true, at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [load, localState?.global.hideActivity, userId]);

  const visibleConversations = useMemo(() => {
    const meta = localState?.conversations ?? {};
    return conversations
      .filter((conversation) => {
        if (blocked.some((item) => item.id === conversation.peer_id)) return false;
        if (section === "archive") return !!meta[conversation.peer_id]?.archived;
        if (section === "locked") return !!meta[conversation.peer_id]?.locked;
        if (section === "active") return onlineIds.includes(conversation.peer_id);
        if (section !== "inbox") return false;
        return !meta[conversation.peer_id]?.archived && !meta[conversation.peer_id]?.locked;
      })
      .filter((conversation) => `${conversation.display_name} ${conversation.username}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => Number(!!meta[b.peer_id]?.pinned) - Number(!!meta[a.peer_id]?.pinned) || (b.last_at ?? "").localeCompare(a.last_at ?? ""));
  }, [blocked, conversations, localState?.conversations, onlineIds, search, section]);

  async function saveConversation(peerId: string, patch: { pinned?: boolean; archived?: boolean; locked?: boolean; muted?: boolean }) {
    if (!userId) return;
    try {
      const state = await updateMessageState(userId, (current) => withConversation(current, peerId, patch));
      setLocalState(state);
      return true;
    } catch {
      setToast("ما قدرناش نحفظ الاختيار على الجهاز");
      return false;
    }
  }

  async function toggleMute(peerId: string) {
    if (!userId) return;
    const muted = !!localState?.conversations[peerId]?.muted;
    const result = muted
      ? await supabase.from("muted_users").delete().eq("muter_id", userId).eq("muted_user_id", peerId)
      : await supabase.from("muted_users").insert({ muter_id: userId, muted_user_id: peerId });
    if (result.error && !(muted === false && result.error.code === "23505")) {
      setToast(`تعذّر ${muted ? "إلغاء الكتم" : "كتم المحادثة"}: ${result.error.message}`);
      return;
    }
    if (await saveConversation(peerId, { muted: !muted })) setToast(muted ? "اتلغى كتم المحادثة" : "المحادثة مكتومة");
  }

  async function authenticate(title: string) {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: title, cancelLabel: "إلغاء", fallbackLabel: "استخدم رمز الجهاز", disableDeviceFallback: false });
      return result.success;
    } catch {
      return false;
    }
  }

  async function openConversation(item: Conversation) {
    if (localState?.conversations[item.peer_id]?.locked) {
      if (!(await authenticate("افتح المحادثة المقفولة"))) {
        setToast("المحادثة فضلت مقفولة");
        return;
      }
      grantChatAccess(item.peer_id);
    }
    router.push({ pathname: "/chat/[id]", params: { id: item.peer_id, name: item.display_name } });
  }

  async function blockPerson(item: Conversation) {
    if (!userId) return;
    const { error: blockError } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: item.peer_id });
    if (blockError && blockError.code !== "23505") {
      setToast(`تعذّر الحظر: ${blockError.message}`);
      return;
    }
    setToast(`تم حظر ${item.display_name}`);
    void load();
  }

  async function deleteConversation(item: Conversation) {
    if (!userId) return;
    const { data, error: deleteError } = await supabase.from("direct_messages")
      .delete()
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${item.peer_id}),and(sender_id.eq.${item.peer_id},recipient_id.eq.${userId})`)
      .select("id");
    if (deleteError) {
      setToast(`تعذّر حذف المحادثة نهائيًا: ${deleteError.message}`);
      return;
    }
    if (!data?.length) {
      setToast("مافيش رسائل اتحذفت؛ راجع صلاحيات حذف رسائل الطرفين");
      return;
    }
    const state = await updateMessageState(userId, (current) => ({
      ...current,
      conversations: Object.fromEntries(Object.entries(current.conversations).filter(([id]) => id !== item.peer_id)),
      hiddenMessageIds: current.hiddenMessageIds.filter((id) => !data.some((row) => row.id === id)),
      savedMessageIds: current.savedMessageIds.filter((id) => !data.some((row) => row.id === id)),
    }));
    setLocalState(state);
    setToast("اتحذفت المحادثة ورسائلها اللي سمحت الصلاحيات بحذفها");
    void load();
  }

  function conversationActions(item: Conversation) {
    setActionConversation(item);
  }

  async function saveGlobal<K extends keyof MessageGlobalPreferences>(key: K, value: MessageGlobalPreferences[K]) {
    if (!userId) return;
    if (key === "appLock" && value === true) {
      if (!(await authenticate("تحقق لتفعيل قفل تطبيق ونس"))) {
        setToast("ما تمش تفعيل قفل التطبيق");
        return;
      }
    }
    try {
      const state = await updateMessageState(userId, (current) => ({ ...current, global: { ...current.global, [key]: value } }));
      setLocalState(state);
      setToast("اتحفظ الإعداد على الجهاز");
    } catch {
      setToast("ما قدرناش نحفظ الإعداد");
    }
  }

  async function unblockPerson(person: BlockedUser) {
    if (!userId) return;
    const { error: unblockError } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", person.id);
    if (unblockError) setToast(`تعذّر فك الحظر: ${unblockError.message}`);
    else { setToast("اتشال الحظر"); void load(); }
  }

  async function createBackup() {
    if (!userId) return;
    try {
      const { data, error: backupError } = await supabase.from("direct_messages")
        .select("id, sender_id, recipient_id, body, media_type, media_url, created_at, read_at, delivered_at, reply_to, pinned, disappear_after, reaction")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false }).limit(5000);
      if (backupError) throw backupError;
      const bundle = JSON.stringify({ exportedAt: new Date().toISOString(), messages: data ?? [], localPreferences: localState }, null, 2);
      const uri = `${FileSystem.cacheDirectory}wanas-messages-backup-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(uri, bundle, { encoding: FileSystem.EncodingType.UTF8 });
      const available = await Sharing.isAvailableAsync();
      if (!available) throw new Error("مشاركة الملفات مش متاحة على الجهاز ده");
      await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "حفظ نسخة رسائل WANAS" });
      setToast("اتجهز ملف النسخة وفتحنا مشاركة Android؛ اختار مكان آمن تحفظه فيه");
    } catch (e) {
      setToast(`تعذّر إنشاء النسخة الاحتياطية: ${e instanceof Error ? e.message : "حصل خطأ"}`);
    }
  }

  function renderConversation({ item }: { item: Conversation }) {
    const meta = localState?.conversations[item.peer_id] ?? {};
    return (
      <Pressable style={styles.row} onPress={() => void openConversation(item)} onLongPress={() => conversationActions(item)} delayLongPress={350}>
        <Avatar initial={item.display_name[0]} color={colors.surface3} />
        <View style={styles.rowText}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, item.unread && styles.unread]} numberOfLines={1}>{item.display_name}</Text>
            {meta.pinned && <Ionicons name="pin" size={13} color={colors.goldText} />}
            {meta.muted && <Ionicons name="volume-mute" size={13} color={colors.muted} />}
            {meta.locked && <Ionicons name="lock-closed" size={13} color={colors.goldText} />}
          </View>
          <Text numberOfLines={1} style={styles.preview}>{item.last_body ?? "ابدأ الونسة…"}</Text>
        </View>
        {item.unread && <View style={styles.dot} />}
        <Ionicons name="chevron-back" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  const global = localState?.global;
  const actionMeta = actionConversation ? localState?.conversations[actionConversation.peer_id] ?? {} : {};
  const menuActions = actionConversation ? [
    { label: actionMeta.pinned ? "فك تثبيت المحادثة" : "تثبيت المحادثة", icon: "pin-outline" as const, run: () => void saveConversation(actionConversation.peer_id, { pinned: !actionMeta.pinned }) },
    { label: actionMeta.muted ? "إلغاء كتم المحادثة" : "كتم المحادثة", icon: "notifications-off-outline" as const, run: () => void toggleMute(actionConversation.peer_id) },
    { label: actionMeta.locked ? "إلغاء قفل المحادثة" : "قفل المحادثة بالبصمة" , icon: "lock-closed-outline" as const, run: async () => {
      const next = !actionMeta.locked;
      if (next && !(await authenticate("تحقق لتفعيل قفل المحادثة"))) { setToast("ما تمش تفعيل القفل لأن التحقق ما نجحش"); return; }
      await saveConversation(actionConversation.peer_id, { locked: next });
    } },
    { label: actionMeta.archived ? "إلغاء الأرشفة" : "أرشفة المحادثة", icon: "archive-outline" as const, run: () => void saveConversation(actionConversation.peer_id, { archived: !actionMeta.archived }) },
    { label: "حظر صاحبها", icon: "ban-outline" as const, danger: true, run: () => Alert.alert("حظر الحساب", `تأكيد حظر ${actionConversation.display_name}؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حظر", style: "destructive", onPress: () => void blockPerson(actionConversation) }]) },
    { label: "حذف المحادثة نهائيًا", icon: "trash-outline" as const, danger: true, run: () => Alert.alert("حذف نهائي", "هنحاول حذف رسائل المحادثة من قاعدة البيانات. الإجراء لا يمكن التراجع عنه.", [{ text: "إلغاء", style: "cancel" }, { text: "احذف", style: "destructive", onPress: () => void deleteConversation(actionConversation) }]) },
  ] : [];
  return (
    <ScreenShell>
      <Header title="الرسائل" />
      <View style={styles.tabs}>
        {SECTION_TABS.map((tab) => (
          <Pressable key={tab.key} style={[styles.tab, section === tab.key && styles.tabActive]} onPress={() => setSection((current) => current === tab.key ? "inbox" : tab.key)}>
            <Ionicons name={tab.icon} size={17} color={section === tab.key ? colors.ink : colors.muted} />
            <Text style={[styles.tabText, section === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
      {section === "settings" ? (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.settingsList}
          ListHeaderComponent={(
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>الخصوصية</Text>
              <GlobalSwitch label="إخفاء حالة النشاط" hint="لكل المحادثات على الجهاز ده" value={global?.hideActivity ?? false} onChange={(v) => void saveGlobal("hideActivity", v)} />
              <GlobalSwitch label="إخفاء الكتابة" hint="لكل المحادثات على الجهاز ده" value={global?.hideTyping ?? false} onChange={(v) => void saveGlobal("hideTyping", v)} />
              <GlobalSwitch label="إشعار القراءة" hint="لو اتقفل، الطرف الآخر هيشوف تم التسليم فقط" value={global?.readReceipts ?? true} onChange={(v) => void saveGlobal("readReceipts", v)} />
              <Text style={styles.sectionTitle}>عام</Text>
              <GlobalSwitch label="الإشعارات" hint="يتحكم في عرض التنبيهات داخل التطبيق؛ تنبيهات الخلفية من إعدادات Android" value={global?.notifications ?? true} onChange={(v) => void saveGlobal("notifications", v)} />
              <GlobalSwitch label="الأصوات" hint="يكتم صوت التنبيهات أثناء استخدام التطبيق" value={global?.sounds ?? true} onChange={(v) => void saveGlobal("sounds", v)} />
              <GlobalSwitch label="قفل التطبيق" hint="ببصمة أو رمز قفل الجهاز عند الرجوع للتطبيق" value={global?.appLock ?? false} onChange={(v) => void saveGlobal("appLock", v)} />
              <Pressable style={styles.utilityRow} onPress={() => void createBackup()}>
                <Ionicons name="cloud-download-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}><Text style={styles.utilityTitle}>النسخ الاحتياطي</Text><Text style={styles.utilityHint}>مشاركة ملف JSON لآخر 5000 رسالة وتفضيلاتك</Text></View>
                <Ionicons name="chevron-back" size={17} color={colors.muted} />
              </Pressable>
              <Text style={styles.sectionTitle}>المحادثات المحظورة</Text>
              {blocked.length === 0 && <Text style={styles.emptyInline}>مفيش حسابات محظورة.</Text>}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.blockedRow}>
              <Text style={styles.name}>{item.display_name ?? item.username}</Text>
              <Pressable onPress={() => void unblockPerson(item)}><Text style={styles.unblock}>فك الحظر</Text></Pressable>
            </View>
          )}
          ListEmptyComponent={null}
        />
      ) : (
        <>
          {(section === "inbox" || section === "active" || section === "archive" || section === "locked") && (
            <TextInput style={styles.search} placeholder="ابحث بالاسم أو @المستخدم" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
          )}
          {loading ? <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} /> : error ? <Text style={styles.error}>{error}</Text> : (
            <FlatList
              data={visibleConversations}
              keyExtractor={(conversation) => conversation.peer_id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 10, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.goldText} />}
              ListEmptyComponent={(
                <View style={styles.emptyState}>
                  <Ionicons name={section === "locked" ? "lock-closed-outline" : section === "archive" ? "archive-outline" : section === "active" ? "radio-outline" : "chatbubbles-outline"} size={36} color={colors.muted} />
                  <Text style={styles.empty}>{section === "archive" ? "لا توجد محادثات مؤرشفة" : section === "locked" ? "مفيش محادثات مقفولة" : section === "active" ? "مفيش حد ظاهر نشط دلوقتي" : "مفيش ونسات لسه. ابدأ ونسة من صفحة أي صاحب."}</Text>
                  {section === "archive" && <Text style={styles.emptySub}>المحادثات المؤرشفة مش هتظهر في القائمة الرئيسية.</Text>}
                  {section === "locked" && <Text style={styles.emptySub}>المحادثات المقفولة بتتفتح ببصمة أو رمز قفل الجهاز.</Text>}
                </View>
              )}
              renderItem={renderConversation}
            />
          )}
        </>
      )}
      {!!toast && <Pressable style={styles.toast} onPress={() => setToast(null)}><Text style={styles.toastText}>{toast}</Text></Pressable>}
      <Modal visible={!!actionConversation} transparent animationType="slide" onRequestClose={() => setActionConversation(null)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setActionConversation(null)}>
          <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{actionConversation?.display_name ?? "المحادثة"}</Text>
            {menuActions.map((action) => (
              <Pressable key={action.label} style={styles.actionRow} onPress={() => { setActionConversation(null); action.run(); }}>
                <Ionicons name={action.icon} size={19} color={action.danger ? colors.red : colors.text} />
                <Text style={[styles.actionLabel, action.danger && { color: colors.red }]}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelAction} onPress={() => setActionConversation(null)}><Text style={styles.cancelText}>إلغاء</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function GlobalSwitch({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.gold, false: colors.surface3 }} thumbColor={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Text style={styles.switchHint}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  tabs: { flexDirection: "row-reverse", justifyContent: "space-around", paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  tab: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: colors.surface, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { color: colors.muted, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  tabTextActive: { color: colors.ink },
  search: { marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlign: "right" },
  error: { color: colors.red, textAlign: "center", marginTop: 16, paddingHorizontal: 20 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 12, fontSize: 14 },
  emptySub: { color: colors.muted, textAlign: "center", marginTop: 6, fontSize: 12 },
  emptyInline: { color: colors.muted, textAlign: "right", fontSize: 12, marginVertical: 8 },
  emptyState: { flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center", padding: 28 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1 },
  nameLine: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  name: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 15, textAlign: "right", flexShrink: 1 },
  unread: { color: colors.goldText },
  preview: { color: colors.muted, fontSize: 13, marginTop: 2, textAlign: "right" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  settingsList: { padding: 16, paddingBottom: 38, gap: 10 },
  sectionTitle: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 8, marginBottom: 2 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
  switchLabel: { color: colors.text, fontSize: 14, textAlign: "right" },
  switchHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 3, lineHeight: 16 },
  utilityRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border },
  utilityTitle: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  utilityHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 3 },
  blockedRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", padding: 13, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  unblock: { color: colors.goldText, fontSize: 12, fontWeight: "700" },
  toast: { position: "absolute", bottom: 18, alignSelf: "center", maxWidth: "88%", backgroundColor: colors.surface3, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  toastText: { color: colors.text, fontSize: 12, textAlign: "center" },
  actionBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, borderWidth: 1, borderColor: colors.border },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.muted, opacity: 0.5, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  actionRow: { minHeight: 48, flexDirection: "row-reverse", alignItems: "center", gap: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  actionLabel: { color: colors.text, fontSize: 14, flex: 1, textAlign: "right" },
  cancelAction: { alignItems: "center", paddingVertical: 13, marginTop: 8, borderRadius: 13, backgroundColor: colors.surface2 },
  cancelText: { color: colors.muted, fontWeight: "700" },
})));
