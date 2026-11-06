import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { errorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

type Notification = {
  id: string;
  actor_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  pinned_at?: string | null;
  hidden_at?: string | null;
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Filter = "all" | "friends" | "comments" | "reactions";
type FriendState = "pending" | "accepted" | "declined";

const MAX_PINNED = 5;
const UNDO_MS = 5000;
const GREEN = "#4ADE80";

const KIND_LABEL: Record<string, { text: string; icon: IconName }> = {
  reaction: { text: "تفاعل مع منشورك", icon: "heart-outline" },
  comment: { text: "علّق على منشورك", icon: "chatbubble-outline" },
  reply: { text: "رد على تعليقك", icon: "return-down-back-outline" },
  follow: { text: "بدأ يتابعك", icon: "person-add-outline" },
  friend_request: { text: "بعتلك طلب صداقة", icon: "people-outline" },
  friend_accept: { text: "قبل طلب الصداقة", icon: "checkmark-circle-outline" },
  message: { text: "بعتلك رسالة", icon: "mail-outline" },
  mention: { text: "ذكرك في منشور", icon: "at-outline" },
  story: { text: "شاهد قصتك", icon: "eye-outline" },
  council: { text: "مجلس جديد", icon: "mic-outline" },
  thank: { text: "بعتلك بطاقة شكر", icon: "gift-outline" },
  share: { text: "شارك منشورك", icon: "share-social-outline" },
  system: { text: "إشعار من ونس", icon: "notifications-outline" },
};

const FILTERS: { key: Filter; label: string; kinds: string[] | null }[] = [
  { key: "all", label: "الكل", kinds: null },
  { key: "friends", label: "الصداقة", kinds: ["friend_request", "friend_accept", "follow"] },
  { key: "comments", label: "التعليقات", kinds: ["comment", "reply", "mention"] },
  { key: "reactions", label: "التفاعلات", kinds: ["reaction", "share", "story", "thank"] },
];

/** تجاهل التشكيل والهمزات والتاء المربوطة، مع خريطة ترجع للنص الأصلي (للتمييز). */
function normalizeMap(input: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (/[ً-ٰٟـ]/.test(ch)) continue;
    let c = ch.toLowerCase();
    if (c === "أ" || c === "إ" || c === "آ") c = "ا";
    else if (c === "ة") c = "ه";
    else if (c === "ى") c = "ي";
    norm += c;
    map.push(i);
  }
  return { norm, map };
}

function highlight(text: string, query: string, style: object, hl: object): React.ReactNode {
  const q = normalizeMap(query.trim()).norm;
  if (!q) return text;
  const { norm, map } = normalizeMap(text);
  const idx = norm.indexOf(q);
  if (idx < 0) return text;
  const start = map[idx];
  const end = (map[idx + q.length - 1] ?? text.length - 1) + 1;
  return (
    <Text style={style}>
      {text.slice(0, start)}
      <Text style={hl}>{text.slice(start, end)}</Text>
      {text.slice(end)}
    </Text>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d === 1) return "أمس";
  if (d < 7) return `منذ ${d} أيام`;
  return new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long" });
}

function bodyText(n: Notification): string {
  const base = KIND_LABEL[n.kind]?.text ?? n.kind;
  const t = typeof n.payload?.text === "string" ? (n.payload.text as string) : "";
  return n.kind === "comment" || n.kind === "reply" ? (t ? `${base}: «${t}»` : base) : base;
}

/**
 * الإشعارات — تحديث ٤ نوفمبر ٢٠٢٦:
 * بحث · تمييز الكل كمقروء · قائمة ⋮ · تثبيت/إخفاء/حذف مع «تراجع» ٥ ثوانٍ · قبول الصداقة وتفاعل من البطاقة ·
 * الانتقال لمكان الإشعار. لو أعمدة pinned_at/hidden_at مش موجودة في قاعدة البيانات، التثبيت والإخفاء بيتحفظوا على الجهاز.
 */
export default function NotificationsScreen() {
  useThemeContext();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [friendState, setFriendState] = useState<Record<string, FriendState>>({});
  const [reacted, setReacted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [menuFor, setMenuFor] = useState<Notification | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);

  const hasCols = useRef(true);
  const local = useRef<{ pinned: string[]; hidden: string[] }>({ pinned: [], hidden: [] });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDelete = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  // بحث بتأخير ٢٥٠ مللي ثانية
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  const showToast = useCallback((text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
  }, []);

  const saveLocal = useCallback(async (userId: string) => {
    try {
      await AsyncStorage.setItem(`wanas.notif.local.${userId}`, JSON.stringify(local.current));
    } catch {
      /* التخزين المحلي اختياري */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      setUid(userId);

      let rows: Notification[] = [];
      const full = await supabase
        .from("notifications")
        .select("id, actor_id, kind, payload, read_at, created_at, pinned_at, hidden_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (full.error && (full.error.code === "42703" || full.error.code === "PGRST204" || /pinned_at|hidden_at/.test(full.error.message))) {
        hasCols.current = false;
        try {
          const raw = await AsyncStorage.getItem(`wanas.notif.local.${userId}`);
          if (raw) local.current = JSON.parse(raw) as typeof local.current;
        } catch {
          /* ignore */
        }
        const basic = await supabase
          .from("notifications")
          .select("id, actor_id, kind, payload, read_at, created_at")
          .eq("recipient_id", userId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (basic.error) throw basic.error;
        rows = ((basic.data ?? []) as Notification[]).map((r) => ({
          ...r,
          pinned_at: local.current.pinned.includes(r.id) ? r.created_at : null,
          hidden_at: local.current.hidden.includes(r.id) ? r.created_at : null,
        }));
      } else {
        if (full.error) throw full.error;
        hasCols.current = true;
        rows = (full.data ?? []) as Notification[];
      }
      setItems(rows);

      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
      if (actorIds.length) {
        const [{ data: profs }, { data: reqs }] = await Promise.all([
          supabase.from("profiles").select("id, username, display_name").in("id", actorIds),
          supabase.from("friend_requests").select("from_user, status").eq("to_user", userId).in("from_user", actorIds),
        ]);
        setNames(
          Object.fromEntries(
            (profs ?? []).map((p) => [p.id as string, (p.display_name ?? p.username ?? "مستخدم") as string]),
          ),
        );
        const byActor = Object.fromEntries((reqs ?? []).map((r) => [r.from_user as string, r.status as FriendState]));
        setFriendState(
          Object.fromEntries(
            rows.filter((r) => r.kind === "friend_request" && r.actor_id).map((r) => [r.id, byActor[r.actor_id as string] ?? "pending"]),
          ),
        );
      }

      const commentIds = rows
        .filter((r) => (r.kind === "comment" || r.kind === "reply") && typeof r.payload?.comment_id === "string")
        .map((r) => r.payload?.comment_id as string);
      if (commentIds.length) {
        const { data: mine } = await supabase.from("comment_reactions").select("comment_id").eq("user_id", userId).in("comment_id", commentIds);
        const set = new Set((mine ?? []).map((m) => m.comment_id as string));
        setReacted(Object.fromEntries(commentIds.map((c) => [c, set.has(c)])));
      }

      const { data: token } = await supabase.from("push_tokens").select("quiet_mode").eq("user_id", userId).limit(1).maybeSingle();
      setQuiet(!!token?.quiet_mode);
    } catch (e) {
      setError(errorMessage(e, "تعذّر تحميل الإشعارات"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      // لو خرج المستخدم قبل انتهاء مهلة التراجع، الحذف يتنفذ
      const p = pendingDelete.current;
      if (p) {
        clearTimeout(p.timer);
        void supabase.from("notifications").delete().eq("id", p.id);
      }
    };
  }, [load]);

  const patch = useCallback((id: string, changes: Partial<Notification>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }, []);

  const unreadCount = items.filter((i) => !i.read_at && !i.hidden_at).length;
  const pinnedCount = items.filter((i) => i.pinned_at && !i.hidden_at).length;

  async function markAllRead() {
    const ids = items.filter((i) => !i.read_at && !i.hidden_at).map((i) => i.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read_at: now } : i)));
    const { error: err } = await supabase.from("notifications").update({ read_at: now }).in("id", ids);
    if (err) {
      setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read_at: null } : i)));
      showToast(errorMessage(err, "مش تم — جرّب تاني"));
      return;
    }
    showToast(`اتعلّمت ${ids.length} إشعار كمقروء`, async () => {
      setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read_at: null } : i)));
      await supabase.from("notifications").update({ read_at: null }).in("id", ids);
    });
  }

  async function setRead(n: Notification, read: boolean) {
    const value = read ? new Date().toISOString() : null;
    patch(n.id, { read_at: value });
    const { error: err } = await supabase.from("notifications").update({ read_at: value }).eq("id", n.id);
    if (err) patch(n.id, { read_at: n.read_at });
  }

  async function setPinned(n: Notification, pin: boolean) {
    if (pin && pinnedCount >= MAX_PINNED) {
      showToast(`يمكنك تثبيت ${MAX_PINNED} إشعارات فقط`);
      return;
    }
    const value = pin ? new Date().toISOString() : null;
    patch(n.id, { pinned_at: value });
    if (!hasCols.current) {
      local.current.pinned = pin ? [...local.current.pinned, n.id] : local.current.pinned.filter((x) => x !== n.id);
      if (uid) await saveLocal(uid);
    } else {
      const { error: err } = await supabase.from("notifications").update({ pinned_at: value }).eq("id", n.id);
      if (err) {
        patch(n.id, { pinned_at: n.pinned_at ?? null });
        showToast(errorMessage(err));
        return;
      }
    }
    showToast(pin ? "تم تثبيت الإشعار" : "تم إلغاء التثبيت", () => void setPinned({ ...n, pinned_at: value }, !pin));
  }

  async function setHidden(n: Notification, hide: boolean) {
    const value = hide ? new Date().toISOString() : null;
    patch(n.id, { hidden_at: value });
    if (!hasCols.current) {
      local.current.hidden = hide ? [...local.current.hidden, n.id] : local.current.hidden.filter((x) => x !== n.id);
      if (uid) await saveLocal(uid);
    } else {
      const { error: err } = await supabase.from("notifications").update({ hidden_at: value }).eq("id", n.id);
      if (err) {
        patch(n.id, { hidden_at: n.hidden_at ?? null });
        showToast(errorMessage(err));
        return;
      }
    }
    if (hide) showToast("تم إخفاء الإشعار", () => void setHidden({ ...n, hidden_at: value }, false));
  }

  function removeWithUndo(n: Notification) {
    // لو في حذف سابق معلّق ننفّذه فورًا
    const prev = pendingDelete.current;
    if (prev) {
      clearTimeout(prev.timer);
      void supabase.from("notifications").delete().eq("id", prev.id);
      pendingDelete.current = null;
    }
    setItems((list) => list.filter((i) => i.id !== n.id));
    const timer = setTimeout(async () => {
      pendingDelete.current = null;
      const { error: err } = await supabase.from("notifications").delete().eq("id", n.id);
      if (err) {
        setItems((list) => (list.some((i) => i.id === n.id) ? list : [n, ...list]));
        showToast(errorMessage(err, "مقدرناش نحذف الإشعار"));
      }
    }, UNDO_MS);
    pendingDelete.current = { id: n.id, timer };
    showToast("تم حذف الإشعار", () => {
      clearTimeout(timer);
      pendingDelete.current = null;
      setItems((list) => [n, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    });
  }

  async function respondFriend(n: Notification, accept: boolean) {
    if (!n.actor_id || !uid) return;
    setBusy(n.id);
    try {
      const { data: req, error: findErr } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("from_user", n.actor_id)
        .eq("to_user", uid)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;
      if (req?.id) {
        const { error: rpcErr } = await supabase.rpc("respond_friend_request", { p_request_id: req.id, p_status: accept ? "accepted" : "declined" });
        if (rpcErr) throw rpcErr;
      }
      setFriendState((s) => ({ ...s, [n.id]: accept ? "accepted" : "declined" }));
      await setRead(n, true);
      if (!accept) removeWithUndo(n);
    } catch (e) {
      showToast(errorMessage(e, "مش تم — جرّب تاني"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleReaction(n: Notification) {
    const cid = typeof n.payload?.comment_id === "string" ? (n.payload.comment_id as string) : null;
    if (!cid || !uid) {
      openTarget(n);
      return;
    }
    const was = !!reacted[cid];
    setReacted((r) => ({ ...r, [cid]: !was })); // Optimistic UI
    const { error: err } = was
      ? await supabase.from("comment_reactions").delete().eq("comment_id", cid).eq("user_id", uid)
      : await supabase.from("comment_reactions").insert({ comment_id: cid, user_id: uid, type: "like" });
    if (err) {
      setReacted((r) => ({ ...r, [cid]: was }));
      showToast(errorMessage(err, "مش تم — جرّب تاني"));
    }
  }

  function openTarget(n: Notification, extra?: { reply?: boolean }) {
    if (!n.read_at) void setRead(n, true);
    const p = n.payload ?? {};
    const postId = typeof p.post_id === "string" ? p.post_id : null;
    const commentId = typeof p.comment_id === "string" ? p.comment_id : null;
    const qs = commentId ? `?comment=${commentId}${extra?.reply ? "&reply=1" : ""}` : "";
    switch (n.kind) {
      case "friend_request":
      case "friend_accept":
      case "follow":
        if (n.actor_id) router.push(`/user/${n.actor_id}` as never);
        break;
      case "message":
        if (n.actor_id) router.push(`/chat/${typeof p.chat === "string" ? p.chat : n.actor_id}` as never);
        break;
      case "council":
        if (typeof p.council_id === "string") router.push(`/council/${p.council_id}` as never);
        break;
      case "story":
        if (n.actor_id) router.push(`/user/${n.actor_id}` as never);
        break;
      default:
        if (postId) router.push(`/post/${postId}${qs}` as never);
        else if (n.actor_id) router.push(`/user/${n.actor_id}` as never);
    }
  }

  const visible = useMemo(() => {
    const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? null;
    const q = normalizeMap(query.trim()).norm;
    return items.filter((n) => {
      if (n.hidden_at) return false;
      if (kinds && !kinds.includes(n.kind)) return false;
      if (q) {
        const hay = normalizeMap(`${names[n.actor_id ?? ""] ?? ""} ${bodyText(n)}`).norm;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query, names]);

  const pinned = visible.filter((n) => n.pinned_at);
  const recent = visible.filter((n) => !n.pinned_at);

  function closeSearch() {
    setSearching(false);
    setQueryInput("");
    setQuery("");
    setFilter("all");
  }

  function renderCard(n: Notification) {
    const meta = KIND_LABEL[n.kind] ?? { text: n.kind, icon: "notifications-outline" as IconName };
    const actor = n.actor_id ? names[n.actor_id] ?? "مستخدم" : "ونس";
    const unread = !n.read_at;
    const fs = friendState[n.id];
    const cid = typeof n.payload?.comment_id === "string" ? (n.payload.comment_id as string) : null;
    const liked = cid ? !!reacted[cid] : false;
    const active = menuFor?.id === n.id;
    return (
      <Pressable
        key={n.id}
        onPress={() => openTarget(n)}
        accessibilityRole="button"
        accessibilityLabel={`${actor} ${bodyText(n)}`}
        style={[styles.card, unread && styles.cardUnread, active && styles.cardActive]}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{actor.slice(0, 1)}</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name={meta.icon} size={11} color={colors.goldText} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>
              {highlight(actor, query, styles.rowActor, styles.hl) !== actor ? (
                highlight(actor, query, styles.rowActor, styles.hl)
              ) : (
                <Text style={styles.rowActor}>{actor}</Text>
              )}
              <Text> </Text>
              {highlight(bodyText(n), query, styles.rowBody, styles.hl)}
            </Text>
            <View style={styles.metaRow}>
              {unread && <View style={styles.dot} />}
              {n.pinned_at && <Ionicons name="pin" size={11} color={colors.goldText} />}
              <Text style={styles.rowTime}>{n.pinned_at ? `مثبّت · ${relTime(n.created_at)}` : relTime(n.created_at)}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setMenuFor(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="خيارات الإشعار"
            style={styles.moreBtn}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {n.kind === "friend_request" && fs !== "declined" && (
          <View style={styles.actions}>
            {fs === "accepted" ? (
              <Text style={styles.okText}>أصبحتم أصدقاء ✓</Text>
            ) : (
              <>
                <Pressable style={styles.primaryBtn} disabled={busy === n.id} onPress={() => respondFriend(n, true)} accessibilityLabel="قبول طلب الصداقة">
                  {busy === n.id ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="person-add-outline" size={15} color={colors.ink} />}
                  <Text style={styles.primaryText}>قبول</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} disabled={busy === n.id} onPress={() => respondFriend(n, false)} accessibilityLabel="حذف طلب الصداقة">
                  <Text style={styles.ghostText}>حذف</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {(n.kind === "comment" || n.kind === "reply") && (
          <View style={styles.actions}>
            <Pressable style={[styles.outlineBtn, liked && styles.outlineBtnOn]} onPress={() => toggleReaction(n)} accessibilityLabel="التفاعل مع التعليق">
              <Ionicons name={liked ? "heart" : "heart-outline"} size={15} color={colors.goldText} />
              <Text style={styles.outlineText}>تفاعل</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => openTarget(n, { reply: true })} accessibilityLabel="رد على التعليق">
              <Ionicons name="return-down-back-outline" size={15} color={colors.text} />
              <Text style={styles.ghostText}>رد</Text>
            </Pressable>
          </View>
        )}

        {n.kind === "mention" && (
          <View style={styles.actions}>
            <Pressable style={styles.ghostBtn} onPress={() => openTarget(n, { reply: true })} accessibilityLabel="رد">
              <Ionicons name="return-down-back-outline" size={15} color={colors.text} />
              <Text style={styles.ghostText}>رد</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  }

  const menu = menuFor;
  const menuFs = menu ? friendState[menu.id] : undefined;
  const menuCid = menu && typeof menu.payload?.comment_id === "string" ? (menu.payload.comment_id as string) : null;

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (searching ? closeSearch() : router.canGoBack() ? router.back() : router.push("/(tabs)"))}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel={searching ? "إغلاق البحث" : "رجوع"}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        {searching ? (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.goldText} />
            <TextInput
              autoFocus
              value={queryInput}
              onChangeText={setQueryInput}
              placeholder="ابحث في الإشعارات"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              textAlign="right"
              returnKeyType="search"
            />
            {!!queryInput && (
              <Pressable onPress={() => setQueryInput("")} hitSlop={8} accessibilityLabel="مسح النص">
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.title}>الإشعارات</Text>
            <Pressable onPress={() => setSearching(true)} style={styles.iconBtn} accessibilityLabel="بحث في الإشعارات">
              <Ionicons name="search" size={21} color={colors.text} />
            </Pressable>
          </>
        )}
      </View>

      {searching ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.markRow}>
          <Pressable
            onPress={markAllRead}
            disabled={unreadCount === 0}
            style={[styles.markBtn, unreadCount === 0 && { opacity: 0.4 }]}
            accessibilityLabel="تمييز الكل كمقروء"
          >
            <Ionicons name="checkmark-done" size={17} color={colors.goldText} />
            <Text style={styles.markText}>تمييز الكل كمقروء</Text>
          </Pressable>
          <Text style={styles.unreadCount}>{unreadCount} غير مقروء</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.goldText}
          />
        }
      >
        {quiet && (
          <View style={styles.quietBanner}>
            <Ionicons name="moon" size={16} color={colors.goldText} />
            <Text style={styles.quietText}>وضع الهدوء شغال — الإشعارات بتتجمّع من غير تنبيه.</Text>
          </View>
        )}
        {loading && <ActivityIndicator color={colors.goldText} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {searching && !!query.trim() && !loading && (
          visible.length ? (
            <Text style={styles.sectionLabel}>{visible.length === 2 ? "نتيجتان" : `${visible.length} نتيجة`} لـ «{query.trim()}»</Text>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>لا توجد نتائج لـ «{query.trim()}»</Text>
              <Pressable style={styles.ghostBtn} onPress={() => setQueryInput("")}>
                <Text style={styles.ghostText}>مسح البحث</Text>
              </Pressable>
            </View>
          )
        )}

        {!loading && !error && items.filter((i) => !i.hidden_at).length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="notifications-outline" size={42} color={colors.muted} />
            <Text style={styles.empty}>لا توجد إشعارات حاليًا</Text>
          </View>
        )}

        {pinned.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Ionicons name="pin-outline" size={13} color={colors.muted} />
              <Text style={styles.sectionLabel}>المثبّتة</Text>
            </View>
            {pinned.map(renderCard)}
          </>
        )}
        {recent.length > 0 && (
          <>
            {pinned.length > 0 && <Text style={styles.sectionLabel}>الأحدث</Text>}
            {recent.map(renderCard)}
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{toast.text}</Text>
          {toast.undo && (
            <Pressable
              onPress={() => {
                toast.undo?.();
                setToast(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.toastUndo}>تراجع</Text>
            </Pressable>
          )}
        </View>
      )}

      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)}>
          <View style={styles.menu}>
            {menu?.kind === "friend_request" && menuFs !== "accepted" && menuFs !== "declined" && (
              <MenuItem icon="person-add-outline" label="قبول طلب الصداقة" accent onPress={() => { const n = menu; setMenuFor(null); void respondFriend(n, true); }} />
            )}
            {(menu?.kind === "comment" || menu?.kind === "reply") && (
              <>
                <MenuItem icon={menuCid && reacted[menuCid] ? "heart" : "heart-outline"} label="التفاعل مع التعليق" accent onPress={() => { const n = menu; setMenuFor(null); void toggleReaction(n); }} />
                <MenuItem icon="return-down-back-outline" label="رد" onPress={() => { const n = menu; setMenuFor(null); openTarget(n, { reply: true }); }} />
              </>
            )}
            <MenuItem
              icon={menu?.pinned_at ? "pin" : "pin-outline"}
              label={menu?.pinned_at ? "إلغاء تثبيت الإشعار" : "تثبيت الإشعار"}
              onPress={() => { const n = menu; setMenuFor(null); if (n) void setPinned(n, !n.pinned_at); }}
            />
            <MenuItem icon="eye-off-outline" label="إخفاء الإشعار" onPress={() => { const n = menu; setMenuFor(null); if (n) void setHidden(n, true); }} />
            <MenuItem
              icon={menu?.read_at ? "mail-unread-outline" : "mail-open-outline"}
              label={menu?.read_at ? "تمييز كغير مقروء" : "تمييز كمقروء"}
              onPress={() => { const n = menu; setMenuFor(null); if (n) void setRead(n, !n.read_at); }}
            />
            <View style={styles.sep} />
            <MenuItem icon="trash-outline" label="حذف الإشعار" danger onPress={() => { const n = menu; setMenuFor(null); if (n) removeWithUndo(n); }} />
          </View>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function MenuItem({ icon, label, onPress, accent, danger }: { icon: IconName; label: string; onPress: () => void; accent?: boolean; danger?: boolean }) {
  const color = danger ? colors.red : accent ? colors.goldText : colors.text;
  return (
    <Pressable onPress={onPress} style={styles.menuItem} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.menuText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    iconBtn: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    searchBox: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.goldText, borderRadius: 999, paddingHorizontal: 14, minHeight: 46, backgroundColor: colors.surface },
    searchInput: { flex: 1, color: colors.text, fontSize: 15, fontFamily: "Cairo_400Regular", paddingVertical: 6 },
    chips: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    chip: { paddingHorizontal: 16, minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
    chipText: { color: colors.muted, fontSize: 13, fontFamily: "Cairo_600SemiBold" },
    chipTextOn: { color: colors.ink },
    markRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 4 },
    markBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.goldText, backgroundColor: colors.surface },
    markText: { color: colors.goldText, fontSize: 13, fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
    unreadCount: { color: colors.muted, fontSize: 12 },
    quietBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: colors.border },
    quietText: { color: colors.muted, fontSize: 11, flex: 1, textAlign: "right" },
    sectionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right" },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.border, gap: 10 },
    cardUnread: { backgroundColor: colors.goldSoft ?? colors.surface },
    cardActive: { borderColor: colors.goldText },
    cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
    avatarWrap: { width: 46, height: 46 },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.ink, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    badge: { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    rowText: { color: colors.text, fontSize: 14, textAlign: "right", lineHeight: 21 },
    rowActor: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    rowBody: { color: colors.text, fontFamily: "Cairo_400Regular" },
    hl: { backgroundColor: "rgba(240,201,90,0.35)", color: colors.text },
    metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 2 },
    rowTime: { color: colors.muted, fontSize: 12, textAlign: "right" },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
    moreBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    actions: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingRight: 58 },
    primaryBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.gold },
    primaryText: { color: colors.ink, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    ghostBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    ghostText: { color: colors.text, fontSize: 13, fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
    outlineBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: colors.goldText },
    outlineBtnOn: { backgroundColor: colors.goldSoft ?? colors.surface },
    outlineText: { color: colors.goldText, fontSize: 13, fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
    okText: { color: GREEN, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", minHeight: 44, textAlignVertical: "center" },
    emptyBox: { alignItems: "center", gap: 12, marginTop: 36 },
    empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
    error: { color: colors.red, textAlign: "center", fontSize: 12 },
    toast: { position: "absolute", left: 16, right: 16, bottom: 24, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.text, borderRadius: 14, paddingHorizontal: 16, minHeight: 52 },
    toastText: { color: colors.background, fontSize: 13, fontFamily: "Cairo_600SemiBold", flex: 1, textAlign: "right" },
    toastUndo: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", paddingHorizontal: 8 },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
    menu: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 6 },
    menuItem: { flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 18 },
    menuText: { fontSize: 15, fontFamily: "Cairo_600SemiBold", textAlign: "right", flex: 1 },
    sep: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  }),
);
