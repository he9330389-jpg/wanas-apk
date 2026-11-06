import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveToDevice } from "@/lib/media";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { translateText, targetLangLabel } from "@/lib/translate";
import { colors, reactions } from "@/constants/wanas";
import { Avatar } from "@/components/wanas-ui";
import { AttachmentBag, type BagPayload } from "@/components/attachment-bag";
import { uploadMedia } from "@/lib/media";
import { ClipPlayer } from "@/components/clip-player";

import { themedStyles } from "@/lib/theme-runtime";
import { StickerPicker } from "@/components/sticker-picker";
import { GifPicker } from "@/components/gif-picker";
import { useThemeContext } from "@/lib/theme-provider";
import { useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, RecordingPresets } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import { VoiceNote } from "@/components/voice-note";
import { EmojiPicker } from "@/components/emoji-picker";
import { loadMessageState, updateMessageState, type MessageLocalState, type ScheduledMessage } from "@/lib/chat-preferences";
import { consumeChatAccess } from "@/lib/chat-access";
type DM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  read_at: string | null;
  played_at?: string | null;
  delivered_at: string | null;
  reply_to: string | null;
  pinned: boolean;
  disappear_after: string | null;
  unlock_at: string | null;
  viewed_once: boolean;
  viewed_at: string | null;
  reaction: string | null;
};

function wallClockMs() {
  return Date.now();
}

const REACTION_MAP = Object.fromEntries(reactions.map((r) => [r.type, r]));

export default function ChatScreen() {
  const { colorScheme } = useThemeContext();
  const { id: peerId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<DM[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [replyTo, setReplyTo] = useState<DM | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [mentionList, setMentionList] = useState<{ id: string; username: string; display_name: string | null }[]>([]);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const [localState, setLocalState] = useState<MessageLocalState | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<DM | null>(null);
  const [moreActionsMessage, setMoreActionsMessage] = useState<DM | null>(null);
  const [showMoreReactions, setShowMoreReactions] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<DM | null>(null);
  const [onceMessage, setOnceMessage] = useState<DM | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [pendingForward, setPendingForward] = useState<DM | null>(null);
  const [forwardUsers, setForwardUsers] = useState<{ id: string; username: string; display_name: string | null }[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cancelRecording, setCancelRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const micPressed = useRef(false);
  const recordingRef = useRef(false);
  const cancelRef = useRef(false);
  const micStartX = useRef(0);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meta = localState?.conversations[peerId ?? ""] ?? {};
  async function toggleTranslate(m: DM) {
    if (!m.body) return;
    if (translated[m.id]) {
      setTranslated((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      return;
    }
    setTranslating(m.id);
    try {
      const out = await translateText(m.body);
      if (out) setTranslated((prev) => ({ ...prev, [m.id]: out }));
      else setToast("الترجمة مش متاحة دلوقتي، جرّب تاني");
    } catch {
      setToast("الترجمة مش متاحة دلوقتي، جرّب تاني");
    } finally {
      setTranslating(null);
    }
  }
  // حفظ تلقائي للصور الواردة في معرض الهاتف (اختياري لكل ونسة) — بدون الصور لمرة واحدة
  const autoSaving = useRef(false);
  useEffect(() => {
    if (!meta.autoSaveMedia || !me || Platform.OS === "web" || autoSaving.current) return;
    const todo = messages.filter((m) => m.recipient_id === me && m.media_type?.startsWith("image") && !m.viewed_once && mediaUrls[m.id]);
    if (!todo.length) return;
    autoSaving.current = true;
    void (async () => {
      try {
        const key = `wanas.autosaved.${me}`;
        const done = new Set<string>(JSON.parse((await AsyncStorage.getItem(key)) ?? "[]"));
        const fresh = todo.filter((m) => !done.has(m.id)).slice(0, 10);
        if (!fresh.length) return;
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        if (!perm.granted) return;
        for (const m of fresh) {
          try {
            const uri = await saveToDevice(mediaUrls[m.id], `wanas-${m.id}.jpg`);
            await MediaLibrary.saveToLibraryAsync(uri);
            done.add(m.id);
          } catch { /* نكمّل باقي الصور */ }
        }
        await AsyncStorage.setItem(key, JSON.stringify([...done].slice(-500)));
      } finally {
        autoSaving.current = false;
      }
    })();
  }, [messages, mediaUrls, meta.autoSaveMedia, me]);

  const listRef = useRef<FlatList<DM>>(null);

  const load = useCallback(async () => {
    if (!me || !peerId || !accessChecked) return;
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setToast(`تعذّر تحميل المحادثة: ${error.message}`);
    } else {
      const hidden = new Set(localState?.hiddenMessageIds ?? []);
      setMessages(((data ?? []) as DM[]).filter((message) => !hidden.has(message.id)));
    }
    setLoading(false);

    // إيصالات القراءة اختيارية حسب إعداد المستخدم.
    const unread = localState?.global.readReceipts === false
      ? []
      : (data ?? []).filter((m) => m.recipient_id === me && !m.read_at);
    if (unread.length) {
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
        .in("id", unread.map((m) => m.id));
    }
  }, [accessChecked, localState, me, peerId]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id ?? null;
        if (!active) return;
        if (!userId) {
          setToast("لازم تسجّل الدخول الأول");
          setLoading(false);
          return;
        }
        const state = await loadMessageState(userId);
        if (state.conversations[peerId ?? ""]?.locked && !consumeChatAccess(peerId ?? "")) {
          try {
            const result = await LocalAuthentication.authenticateAsync({ promptMessage: "افتح المحادثة المقفولة", cancelLabel: "إلغاء", fallbackLabel: "استخدم رمز الجهاز", disableDeviceFallback: false });
            if (!result.success) {
              if (active) {
                setToast("المحادثة فضلت مقفولة");
                setLoading(false);
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)/messages");
              }
              return;
            }
          } catch {
            if (active) {
              setToast("التحقق بالبصمة أو رمز الجهاز مش متاح");
              setLoading(false);
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/messages");
            }
            return;
          }
        }
        if (active) {
          setMe(userId);
          setLocalState(state);
          setAccessChecked(true);
        }
      })();
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [peerId, router]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!me || !peerId) return;
    const roomId = [me, peerId].sort().join(":");
    const hideActivity = localState?.global.hideActivity || meta.hideActivity;
    const channel = supabase
      .channel(`dm-live-${roomId}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        () => load()
      )
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).includes(peerId));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === peerId) setTyping(Boolean(payload.typing));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !hideActivity) {
          void channel.track({ userId: me, online: true, at: new Date().toISOString() });
        }
      });
    liveChannel.current = channel;
    return () => {
      liveChannel.current = null;
      supabase.removeChannel(channel);
    };
  }, [localState?.global.hideActivity, load, me, meta.hideActivity, peerId]);

  useEffect(() => {
    if (!me || localState?.global.hideActivity) return;
    const presence = supabase.channel("wanas-messages-presence", { config: { presence: { key: me } } });
    presence.subscribe((status) => {
      if (status === "SUBSCRIBED") void presence.track({ userId: me, online: true, at: new Date().toISOString() });
    });
    return () => { void supabase.removeChannel(presence); };
  }, [localState?.global.hideActivity, me]);

  const updateLocal = useCallback(async (update: (state: MessageLocalState) => MessageLocalState) => {
    if (!me) return;
    const state = await updateMessageState(me, update);
    setLocalState(state);
  }, [me]);

  function onMessageTap(message: DM, at: number) {
    const previous = lastTap.current;
    if (previous?.id === message.id && at - previous.at <= 340) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      lastTap.current = null;
      void react(message, message.reaction === "❤️" ? "" : "❤️");
      return;
    }
    lastTap.current = { id: message.id, at };
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      setReceiptMessage(message);
      tapTimer.current = null;
    }, 360);
  }

  async function startVoiceRecording() {
    micPressed.current = true;
    cancelRef.current = false;
    setCancelRecording(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted || !micPressed.current) {
        if (!permission.granted) setToast("اسمح باستخدام الميكروفون عشان تسجل رسالة صوتية");
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!micPressed.current) {
        await recorder.stop();
        return;
      }
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
    } catch (error) {
      micPressed.current = false;
      recordingRef.current = false;
      setRecording(false);
      setToast(error instanceof Error ? error.message : "مش قادر أبدأ التسجيل دلوقتي");
    }
  }

  async function finishVoiceRecording() {
    micPressed.current = false;
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || cancelRef.current || (recorderState.durationMillis ?? 0) < 600) {
        setToast(cancelRef.current ? "اتلغى التسجيل" : "التسجيل قصير جدًا");
        return;
      }
      if (!me) return;
      setSending(true);
      const mediaUrl = await uploadMedia(me, { uri, name: `voice-${wallClockMs()}.m4a`, mime: "audio/mp4", kind: "audio" });
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: me,
        recipient_id: peerId,
        body: "رسالة صوتية",
        media_type: "audio",
        media_url: mediaUrl,
        reply_to: replyTo?.id ?? null,
      });
      if (error) throw error;
      setReplyTo(null);
      setToast("اتبعتت الرسالة الصوتية");
    } catch (error) {
      setToast(error instanceof Error ? `تعذّر إرسال الصوت: ${error.message}` : "تعذّر إرسال الصوت");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  async function sendSticker(path: string) {
    if (!me || sending) return;
    setSending(true);
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: me,
      recipient_id: peerId,
      body: "ستيكر",
      media_type: "sticker",
      media_url: path,
      reply_to: replyTo?.id ?? null,
    });
    setSending(false);
    if (error) setToast(`الستيكر مش اتبعت: ${error.message}`);
    else {
      setReplyTo(null);
      void load();
    }
  }
  async function send(extra?: Partial<DM>) {
    const body = draft.trim();
    if ((!body && !extra?.media_url) || !me || sending) return;
    setSending(true);
    setDraft("");
    const payload = {
      sender_id: me,
      recipient_id: peerId,
      body: body || (extra?.media_type ? "" : ""),
      ...extra,
      reply_to: replyTo?.id ?? null,
    };
    const { error } = await supabase.from("direct_messages").insert(payload);
    setSending(false);
    if (error) {
      setDraft(body);
      setToast(`الرسالة ما اتبعتتش: ${error.message}`);
    } else {
      setReplyTo(null);
      void load();
    }
  }

  async function sendGif(url: string) {
    if (!me || sending) return;
    setSending(true);
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: me,
      recipient_id: peerId,
      body: "",
      media_type: "image",
      media_url: url,
      reply_to: replyTo?.id ?? null,
    });
    setSending(false);
    if (error) setToast(`الـGIF مش اتبعت: ${error.message}`);
    else {
      setReplyTo(null);
      void load();
    }
  }
  /** منشن في الرسائل: @بيجيب مستخدمين حقيقيين، واللي تختاره بيوصله إشعار. */
  async function mentionSomeone(u: { id: string; username: string }) {
    setDraft((d) => d.replace(/@([\p{L}\p{N}_]{0,20})$/u, `@${u.username} `));
    setMentionList([]);
    if (me) {
      await supabase.from("notifications").insert({
        recipient_id: u.id,
        actor_id: me,
        kind: "mention",
        payload: { chat: peerId, text: "ذكرك في محادثة" },
      });
    }
  }
  async function togglePin(m: DM) {
    const { error } = await supabase
      .from("direct_messages")
      .update({ pinned: !m.pinned, pinned_at: !m.pinned ? new Date().toISOString() : null })
      .eq("id", m.id);
    if (error) setToast(`تعذّر تثبيت الرسالة: ${error.message}`);
    else {
      setSelectedMessage(null);
      void load();
    }
  }

  async function react(m: DM, reaction: string) {
    const { error } = await supabase.from("direct_messages").update({ reaction: reaction || null }).eq("id", m.id);
    if (error) setToast(`التفاعل ما اتحفظش: ${error.message}`);
    else void load();
    setPickerFor(null);
    setSelectedMessage(null);
  }

  async function saveMessageLocally(m: DM) {
    if (!me) return;
    const exists = localState?.savedMessageIds.includes(m.id);
    await updateLocal((state) => ({
      ...state,
      savedMessageIds: exists ? state.savedMessageIds.filter((id) => id !== m.id) : [...state.savedMessageIds, m.id],
    }));
    setSelectedMessage(null);
    setToast(exists ? "اتشالت من المحفوظات على الجهاز" : "اتحفظت في محفوظات الرسائل على الجهاز");
  }

  async function deleteForMe(m: DM) {
    if (!me) return;
    await updateLocal((state) => ({ ...state, hiddenMessageIds: [...new Set([...state.hiddenMessageIds, m.id])] }));
    setMessages((current) => current.filter((item) => item.id !== m.id));
    setSelectedMessage(null);
    setToast("اختفت من محادثتك على الجهاز ده فقط");
  }

  async function deleteForEveryone(m: DM) {
    if (!me || m.sender_id !== me) {
      setToast("تقدر تحذف للجميع الرسالة اللي أنت باعتها بس");
      return;
    }
    const { data, error } = await supabase.from("direct_messages").delete().eq("id", m.id).eq("sender_id", me).select("id");
    if (error || !data?.length) {
      setToast(`ماقدرناش نحذفها للجميع: ${error?.message ?? "مفيش صلاحية كفاية"}`);
      return;
    }
    if (m.media_url && !/^https?:\/\//i.test(m.media_url)) {
      const path = m.media_url.startsWith("chat-media/") ? m.media_url.slice("chat-media/".length) : m.media_url;
      if (path.startsWith(`${me}/`)) {
        const { error: storageError } = await supabase.storage.from("chat-media").remove([path]);
        if (storageError) setToast("اتحذفت الرسالة للجميع، لكن الملف نفسه محتاج تنظيف من التخزين");
      }
    }
    setMessages((current) => current.filter((item) => item.id !== m.id));
    setSelectedMessage(null);
  }

  async function openForward(message: DM) {
    if (!me) return;
    setPendingForward(message);
    setSelectedMessage(null);
    const { data, error } = await supabase.from("profiles").select("id, username, display_name").neq("id", me).order("display_name").limit(100);
    if (error) {
      setToast(`تعذّر تحميل الأشخاص للتحويل: ${error.message}`);
      return;
    }
    setForwardUsers((data ?? []) as { id: string; username: string; display_name: string | null }[]);
    setForwardSearch("");
    setForwardOpen(true);
  }

  async function forwardMessage(m: DM, recipientId: string) {
    if (!me) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: me,
      recipient_id: recipientId,
      body: m.body ? `↪ ${m.body}` : "↪ رسالة محوّلة",
      media_type: m.media_type,
      media_url: m.media_url,
    });
    if (error) setToast(`تعذّر تحويل الرسالة: ${error.message}`);
    else setToast("اتحولت الرسالة");
    setForwardOpen(false);
    setSelectedMessage(null);
  }

  async function copyMessage(m: DM) {
    await Clipboard.setStringAsync(m.body ?? "");
    setSelectedMessage(null);
    setToast("اتنسخت الرسالة");
  }

  function showMoreActions(m: DM) {
    setSelectedMessage(null);
    setMoreActionsMessage(m);
  }

  async function sendFromBag(payload: BagPayload): Promise<void> {
    if (!me || sending) return;
    if (payload.kind === "scheduled") {
      if (!payload.scheduledAt) throw new Error("حدد موعد الإرسال الأول");
      const queued: ScheduledMessage = {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        recipientId: peerId,
        body: payload.body,
        mediaType: null,
        mediaUrl: null,
        scheduledAt: payload.scheduledAt,
        disappearAfter: null,
      };
      await updateLocal((state) => ({ ...state, scheduledMessages: [...state.scheduledMessages, queued] }));
      setToast(`اتحفظت على الجهاز للإرسال ${fmtDate(payload.scheduledAt)} ${fmtTime(payload.scheduledAt)}`);
      return;
    }
    setSending(true);
    try {
      let body = payload.body;
      let mediaType: string | null = payload.kind === "temporary" || payload.kind === "translate" ? null : payload.kind;
      let mediaUrl: string | null = null;

      if (payload.media) {
        mediaUrl = await uploadMedia(me, payload.media);
        const mime = payload.media.mime.toLowerCase();
        mediaType = mime.startsWith("image") ? mime : mime.startsWith("video") ? "video" : mime.startsWith("audio") ? "audio" : payload.kind;
        if (!body) body = payload.media.mime.startsWith("image") ? "صورة" : "مرفق";
      } else if (payload.location) {
        body = payload.body || `📍 ${payload.location.latitude.toFixed(4)}, ${payload.location.longitude.toFixed(4)}`;
        mediaType = "location";
      } else if (payload.contact) {
        body = payload.body || `👤 ${payload.contact.name}${payload.contact.phone ? ` · ${payload.contact.phone}` : ""}`;
        mediaType = "contact";
      } else if (payload.poll) {
        body = `📊 ${payload.poll.question}\n${payload.poll.options.map((o) => `· ${o}`).join("\n")}`;
        mediaType = "poll";
      }

      const { error } = await supabase.from("direct_messages").insert({
        sender_id: me,
        recipient_id: peerId,
        body,
        media_type: mediaType,
        media_url: mediaUrl,
        viewed_once: payload.onceView ?? false,
        disappear_after: payload.disappearAfter ?? null,
        reply_to: replyTo?.id ?? null,
      });
      if (error) throw new Error(error.message);
      setReplyTo(null);
      void load();
      setToast("اتبعتت الرسالة");
    } catch (e) {
      console.warn("bag send failed", e);
      setBagOpen(true);
      throw e;
    } finally {
      setSending(false);
    }
  }

  async function viewOnce(m: DM) {
    if (!m.viewed_once || m.viewed_at || m.sender_id === me) return;
    const viewedAt = new Date().toISOString();
    const { data, error } = await supabase.from("direct_messages").update({ viewed_at: viewedAt }).eq("id", m.id).is("viewed_at", null).select("id");
    if (error) {
      setToast(`تعذّر فتح الرسالة: ${error.message}`);
      return;
    }
    if (!data?.length) {
      setToast("الرسالة دي اتفتحت بالفعل على جهاز تاني");
      setMessages((current) => current.map((item) => item.id === m.id ? { ...item, viewed_at: viewedAt } : item));
      return;
    }
    setMessages((current) => current.map((item) => item.id === m.id ? { ...item, viewed_at: viewedAt } : item));
    setOnceMessage(m);
  }


  // Resolve signed URLs for media messages (private chat-media bucket).
  useEffect(() => {
    let active = true;
    (async () => {
      for (const m of messages) {
        if (!m.media_url) continue;
        if (m.viewed_once && m.viewed_at && m.sender_id !== me) continue;
        if (mediaUrls[m.id]) continue;
        if (/^https?:\/\//i.test(m.media_url)) {
          if (active) setMediaUrls((prev) => ({ ...prev, [m.id]: m.media_url! }));
          continue;
        }
        const path = m.media_url.startsWith("chat-media/") ? m.media_url.slice("chat-media/".length) : m.media_url;
        const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 1800);
        if (error) {
          setToast(`تعذّر فتح المرفق: ${error.message}`);
          continue;
        }
        if (data?.signedUrl && active) {
          setMediaUrls((prev) => ({ ...prev, [m.id]: data.signedUrl }));
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, me]);

  async function downloadOnce(m: DM, signedUrl: string) {
    // التزنيل وقفله: محتوى «لمرة واحدة» ممنوع يتنزّل خارج التطبيق
    if (m.viewed_once) {
      setToast("الصورة لمرة واحدة — مش هتقدّر تزنّلها");
      return;
    }
    try {
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      if (typeof window !== "undefined" && "createObjectURL" in window) {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `wanas-${m.id}.jpg`;
        a.click();
        URL.revokeObjectURL(objUrl);
        setToast("اتزنّل ✅");
      } else {
        setToast("التزنيل متاح من المتصفح");
      }
    } catch {
      setToast("حصلت مشكلة، جرّب تاني");
    }
  }

  const nowTs = now();
  const pinned = messages.filter((m) => m.pinned);

  function receipts(m: DM) {
    if (m.sender_id !== me) return null;
    if (m.media_type === "audio" && m.played_at) return <Text style={styles.receipt}>🎧 اتسمعت</Text>;
    if (m.read_at) return <Text style={styles.receipt}>✓✓ اتفتحت</Text>;
    if (m.delivered_at) return <Text style={styles.receipt}>✓ وصلت</Text>;
    return <Text style={styles.receipt}>⏳</Text>;
  }

  function renderMessage(m: DM) {
    const mine = m.sender_id === me;
    const locked = m.unlock_at && new Date(m.unlock_at).getTime() > nowTs;
    const vanished = m.disappear_after && new Date(m.created_at).getTime() + parseInterval(m.disappear_after) < nowTs;
    const hiddenOnce = m.viewed_once && m.viewed_at && m.sender_id !== me;
    const stamp = m.reaction ? REACTION_MAP[m.reaction] : null;

    if (vanished || localState?.hiddenMessageIds.includes(m.id)) return null;

    return (
      <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
        <Pressable accessibilityLabel="تحويل الرسالة" hitSlop={8} onPress={() => void openForward(m)} style={styles.forwardBtn}>
          <Ionicons name="arrow-redo-outline" size={17} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={(event) => onMessageTap(m, event.nativeEvent.timestamp)}
          onLongPress={() => { if (tapTimer.current) clearTimeout(tapTimer.current); tapTimer.current = null; setShowMoreReactions(false); setSelectedMessage(m); }}
          delayLongPress={350}
          style={[styles.bubble, mine ? colorScheme === "light" ? styles.bubbleMineLight : styles.bubbleMineDark : colorScheme === "light" ? styles.bubbleTheirsLight : styles.bubbleTheirsDark]}
        >
          {m.pinned && <Text style={styles.pinMark}>📌</Text>}
          {locked && (
            <Text style={styles.timeKey}>🗝 بتتفتح {fmtDate(m.unlock_at)}</Text>
          )}
          {hiddenOnce ? (
            <Text style={styles.onceText}>📷 لمرة واحدة — اتفتحت خلاص</Text>
          ) : m.viewed_once && !m.viewed_at && !mine ? (
            <Pressable onPress={() => viewOnce(m)}>
              <Text style={styles.onceText}>📷 اضغط لتشوف (لمرة واحدة)</Text>
            </Pressable>
          ) : (
            <>
              {!!mediaUrls[m.id] && m.media_type === "sticker" && (
                <Image source={{ uri: mediaUrls[m.id] }} style={{ width: 110, height: 110 }} resizeMode="contain" />
              )}
              {!!mediaUrls[m.id] && m.media_type?.startsWith("image") && /giphy|media\d*\.giphy/.test(mediaUrls[m.id]) && (
                <Image source={{ uri: mediaUrls[m.id] }} style={{ width: 200, height: 150, borderRadius: 12 }} resizeMode="cover" />
              )}
              {!!mediaUrls[m.id] && m.media_type?.startsWith("image") && !/giphy/.test(mediaUrls[m.id]) && (
                <Image source={{ uri: mediaUrls[m.id] }} style={styles.media} resizeMode="cover" />
              )}
              {!!mediaUrls[m.id] && m.media_type?.startsWith("video") && (
                <Pressable onPress={() => setPlaying(mediaUrls[m.id])} style={styles.videoCard}>
                  <Ionicons name="play-circle" size={34} color={colors.goldText} />
                  <Text style={styles.videoLabel}>لقطة — اضغط للتشغيل</Text>
                </Pressable>
              )}
              {m.media_type === "audio" && !!m.media_url && <VoiceNote path={m.media_url} label="رسالة صوتية" onPlayed={() => {
                if (m.recipient_id !== me || m.played_at) return;
                const at = new Date().toISOString();
                setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, played_at: at } : x)));
                void supabase.from("direct_messages").update({ played_at: at }).eq("id", m.id).then(() => undefined, () => undefined);
              }} />}
              {m.media_type === "file" && !!mediaUrls[m.id] && (
                <Pressable style={styles.fileLink} onPress={() => void Linking.openURL(mediaUrls[m.id])}>
                  <Ionicons name="document-text-outline" size={22} color={colors.goldText} />
                  <Text style={styles.body}>افتح الملف المرفق</Text>
                </Pressable>
              )}
              {m.media_type === "location" && (
                <Pressable onPress={() => {
                  const coordinates = m.body?.match(/(-?\d+(?:\.\d+)?)[,، ]+(-?\d+(?:\.\d+)?)/);
                  if (coordinates) void Linking.openURL(`https://maps.google.com/?q=${coordinates[1]},${coordinates[2]}`);
                }}>
                  <Text style={styles.body}>📍 افتح الموقع المرسل</Text>
                </Pressable>
              )}
              {!!m.body && m.media_type !== "audio" && m.media_type !== "file" && <Text style={[styles.body, { color: mine ? colorScheme === "light" ? "#FFFFFF" : "#000000" : colorScheme === "light" ? "#111111" : "#FFFFFF" }]}>{m.body}</Text>}
              {!!translated[m.id] && <Text style={styles.translated}>🌐 {translated[m.id]}</Text>}
              {!!m.body && m.body.trim().length > 1 && (
                <Pressable onPress={() => toggleTranslate(m)} hitSlop={8} style={styles.translateBtn}>
                  <Text style={styles.translateText}>
                    {translating === m.id ? "بينقّل…" : translated[m.id] ? "الأصل" : `ترجم لـ ${targetLangLabel()}`}
                  </Text>
                </Pressable>
              )}
              {!!mediaUrls[m.id] && mine && (
                <Pressable onPress={() => downloadOnce(m, mediaUrls[m.id])} style={styles.lockBtn}>
                  <Ionicons name="download" size={14} color={colors.ink} />
                  <Text style={styles.lockText}>تزنيل</Text>
                </Pressable>
              )}
            </>
          )}
          {m.reply_to && <Text style={styles.replyTag}>↩ رد على رسالة</Text>}
          {m.reaction && <Text style={styles.reactionChip}>{stamp?.emoji ?? m.reaction}</Text>}
          {m.disappear_after && <Text style={styles.expiryTag}>⏱ رسالة مؤقتة</Text>}
          <View style={styles.metaRow}>
            <Text style={styles.time}>{fmtTime(m.created_at)}</Text>
            {receipts(m)}
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-forward" size={26} color={colors.text} />
        </Pressable>
        <Avatar initial={(name ?? "؟")[0]} color={colors.surface3} size={40} />
        <Pressable
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/chat/info/[id]", params: { id: peerId, name: name ?? "" } })}
        >
          <Text style={styles.peerName}>{name ?? "الونسة"}</Text>
          <Text style={[styles.presence, { color: typing || online ? colors.green : colors.muted }]}>{typing ? "● بيكتب دلوقتي…" : online ? "● متصل دلوقتي" : "غير متصل"}</Text>
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={() => router.push({ pathname: "/call/[id]", params: { id: peerId, name: name ?? "", mode: "audio" } })}
        >
          <Ionicons name="call" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={() => router.push({ pathname: "/call/[id]", params: { id: peerId, name: name ?? "", mode: "video" } })}
        >
          <Ionicons name="videocam" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={() => router.push({ pathname: "/chat/info/[id]", params: { id: peerId, name: name ?? "" } })}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Pinned message strip */}
      {pinned.length > 0 && (
        <View style={styles.pinnedStrip}>
          <Text style={styles.pinnedText}>📌 {pinned[0].body}</Text>
          <Pressable onPress={() => togglePin(pinned[0])}>
            <Text style={styles.pinnedUnpin}>فك التثبيت</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => renderMessage(item)}
          inverted
          contentContainerStyle={{ padding: 16, gap: 6 }}
        />
      )}

      {/* Reaction picker */}
      {pickerFor && (
        <View style={styles.reactionBar}>
          {reactions.map((r) => (
            <Pressable
              key={r.type}
              onPress={() => react(messages.find((m) => m.id === pickerFor)!, r.type)}
              style={styles.reactionBtn}
            >
              <Text style={{ fontSize: 26 }}>{r.emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Reply preview */}
      {replyTo && (
        <View style={styles.replyPreview}>
          <Text numberOfLines={1} style={styles.replyPreviewText}>↩ {replyTo.body}</Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      )}

      {!!mentionList.length && (
        <View style={styles.mentionBox}>
          {mentionList.map((u) => (
            <Pressable key={u.id} style={styles.mentionRow} onPress={() => mentionSomeone(u)}>
              <Text style={styles.mentionName}>{u.display_name ?? u.username}</Text>
              <Text style={styles.mentionHandle}>@{u.username}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {/* Composer */}
      {recording && (
        <View style={styles.recordBanner}>
          <Text style={styles.recordText}>{cancelRecording ? "سيب عشان تلغي" : "جاري تسجيل الرسالة"} · {Math.floor((recorderState.durationMillis ?? 0) / 1000)} ث</Text>
          <Text style={styles.recordHint}>اسحب يمين للإلغاء</Text>
        </View>
      )}
      <View style={styles.composer}>
        <Pressable style={styles.bagBtn} onPress={() => setBagOpen(true)}>
          <Text style={{ fontSize: 20 }}>🎒</Text>
        </Pressable>
        <Pressable style={styles.bagBtn} onPress={() => setGifOpen(true)} accessibilityLabel="GIF">
          <Text style={styles.gifLabel}>GIF</Text>
        </Pressable>
        <Pressable style={styles.bagBtn} onPress={() => setEmojiOpen(true)} accessibilityLabel="إيموجي">
          <Ionicons name="happy-outline" size={22} color={colors.goldText} />
        </Pressable>
        <Pressable style={styles.bagBtn} onPress={() => setStickerOpen(true)} accessibilityLabel="ستيكر">
          <Ionicons name="pricetag-outline" size={21} color={colors.goldText} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (!localState?.global.hideTyping && !meta.hideTyping) {
              void liveChannel.current?.send({ type: "broadcast", event: "typing", payload: { userId: me, typing: Boolean(t.trim()) } });
            }
            const m = t.match(/@([\p{L}\p{N}_]{0,20})$/u);
            if (!m) {
              setMentionList([]);
              return;
            }
            setTimeout(async () => {
              const { data } = await supabase.from("profiles").select("id, username, display_name").or(`username.ilike.${m[1]}%,display_name.ilike.${m[1]}%`).limit(5);
              setMentionList((data ?? []) as { id: string; username: string; display_name: string | null }[]);
            }, 250);
          }}
          placeholder="اكتب ونستك… و @ لمنشن"
          placeholderTextColor={colors.muted}
          style={[styles.input, { borderColor: colorScheme === "light" ? "#000000" : "#FFD54A" }]}
          multiline
        />
        {draft.trim() ? (
          <Pressable onPress={() => send()} disabled={sending} style={styles.sendBtn}>
            {sending ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="send" size={20} color={colors.ink} />}
          </Pressable>
        ) : (
          <Pressable
            onPressIn={(event) => { micStartX.current = event.nativeEvent.pageX; void startVoiceRecording(); }}
            onPressOut={() => void finishVoiceRecording()}
            onTouchMove={(event) => {
              if (event.nativeEvent.pageX - micStartX.current > 75) {
                cancelRef.current = true;
                setCancelRecording(true);
              }
            }}
            disabled={sending}
            style={[styles.sendBtn, recording && styles.recordingBtn]}
            accessibilityLabel="اضغط مطولًا لتسجيل رسالة صوتية واسحب يمينًا للإلغاء"
          >
            {sending ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name={recording ? "radio-button-on" : "mic"} size={20} color={colors.ink} />}
          </Pressable>
        )}
      </View>

      <StickerPicker visible={stickerOpen} onClose={() => setStickerOpen(false)} onPick={(st) => sendSticker(st.image_path)} />
      <GifPicker visible={gifOpen} onClose={() => setGifOpen(false)} onPick={(url) => void sendGif(url)} />
      <EmojiPicker visible={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={(emoji) => setDraft((value) => value + emoji)} />
      {!!toast && (
        <Pressable style={styles.toast} onPress={() => setToast(null)}>
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      )}

      {!!playing && (
        <ClipPlayer uri={playing} visible onClose={() => setPlaying(null)} label={name} />
      )}

      <AttachmentBag
        visible={bagOpen}
        onClose={() => setBagOpen(false)}
        onSend={sendFromBag}
        sending={sending}
      />

      <Modal visible={!!selectedMessage} transparent animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedMessage(null)}>
          <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>تفاعل مع الرسالة</Text>
            <View style={styles.actionReactions}>
              {(["❤️", "😂", "😮", "😢", "😡"] as const).map((emoji) => (
                <Pressable key={emoji} style={styles.actionReaction} onPress={() => selectedMessage && void react(selectedMessage, emoji)}>
                  <Text style={{ fontSize: 25 }}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.moreReaction} onPress={() => setShowMoreReactions((value) => !value)}>
                <Text style={styles.moreReactionText}>＋</Text>
              </Pressable>
            </View>
            {showMoreReactions && <View style={styles.extraReactions}>{reactions.map((reaction) => (
              <Pressable key={reaction.type} style={styles.actionReaction} onPress={() => selectedMessage && void react(selectedMessage, reaction.type)}>
                <Text style={{ fontSize: 23 }}>{reaction.emoji}</Text>
              </Pressable>
            ))}</View>}
            <View style={styles.actionRow}>
              <Pressable style={styles.actionButton} onPress={() => { if (selectedMessage) setReplyTo(selectedMessage); setSelectedMessage(null); }}><Text style={styles.actionText}>↩ رد</Text></Pressable>
              <Pressable style={styles.actionButton} onPress={() => { if (selectedMessage) void toggleTranslate(selectedMessage); setSelectedMessage(null); }}><Text style={styles.actionText}>🌐 ترجمة</Text></Pressable>
              <Pressable style={styles.actionButton} onPress={() => selectedMessage && void copyMessage(selectedMessage)}><Text style={styles.actionText}>نسخ</Text></Pressable>
              <Pressable style={styles.actionButton} onPress={() => selectedMessage && showMoreActions(selectedMessage)}><Text style={styles.actionText}>المزيد</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!receiptMessage} transparent animationType="fade" onRequestClose={() => setReceiptMessage(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReceiptMessage(null)}>
          <Pressable style={styles.receiptCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>تفاصيل الرسالة</Text>
            <Text style={styles.receiptDetail}>أُرسلت: {receiptMessage ? fmtTime(receiptMessage.created_at) : "—"}</Text>
            <Text style={styles.receiptDetail}>تم التسليم: {receiptMessage?.delivered_at ? fmtTime(receiptMessage.delivered_at) : "لسه ما اتسلمتش"}</Text>
            <Text style={styles.receiptDetail}>تمت القراءة: {receiptMessage?.read_at ? fmtTime(receiptMessage.read_at) : "لسه ما اتقريتش"}</Text>
            <Pressable style={styles.closeSheetBtn} onPress={() => setReceiptMessage(null)}><Text style={styles.actionText}>تمام</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!onceMessage} transparent animationType="fade" onRequestClose={() => setOnceMessage(null)}>
        <View style={styles.onceBackdrop}>
          <View style={styles.onceCard}>
            <Text style={styles.sheetTitle}>رسالة لمرة واحدة</Text>
            {onceMessage?.media_type?.startsWith("image") && !!mediaUrls[onceMessage.id] && <Image source={{ uri: mediaUrls[onceMessage.id] }} style={styles.onceImage} resizeMode="contain" />}
            {onceMessage?.media_type?.startsWith("video") && <Pressable style={styles.onceOpenVideo} onPress={() => { setPlaying(mediaUrls[onceMessage.id]); setOnceMessage(null); }}><Ionicons name="play-circle" size={32} color={colors.ink} /><Text style={styles.onceOpenVideoText}>شغّل الفيديو</Text></Pressable>}
            {!!onceMessage?.body && onceMessage.media_type !== "audio" && <Text style={styles.onceBody}>{onceMessage.body}</Text>}
            {onceMessage?.media_type === "audio" && !!onceMessage.media_url && <VoiceNote path={onceMessage.media_url} label="رسالة صوتية لمرة واحدة" />}
            <Pressable style={styles.closeSheetBtn} onPress={() => setOnceMessage(null)}><Text style={styles.actionText}>إغلاق</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!moreActionsMessage} transparent animationType="slide" onRequestClose={() => setMoreActionsMessage(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMoreActionsMessage(null)}>
          <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>المزيد من خيارات الرسالة</Text>
            {moreActionsMessage && <>
              <Pressable style={styles.moreActionRow} onPress={() => { const message = moreActionsMessage; setMoreActionsMessage(null); void openForward(message); }}><Ionicons name="arrow-redo-outline" size={19} color={colors.text} /><Text style={styles.moreActionText}>تحويل</Text></Pressable>
              <Pressable style={styles.moreActionRow} onPress={() => { const message = moreActionsMessage; setMoreActionsMessage(null); void togglePin(message); }}><Ionicons name="pin-outline" size={19} color={colors.text} /><Text style={styles.moreActionText}>{moreActionsMessage.pinned ? "فك التثبيت" : "تثبيت"}</Text></Pressable>
              <Pressable style={styles.moreActionRow} onPress={() => { const message = moreActionsMessage; setMoreActionsMessage(null); void saveMessageLocally(message); }}><Ionicons name="bookmark-outline" size={19} color={colors.text} /><Text style={styles.moreActionText}>{localState?.savedMessageIds.includes(moreActionsMessage.id) ? "إلغاء الحفظ" : "حفظ على الجهاز"}</Text></Pressable>
              <Pressable style={styles.moreActionRow} onPress={() => { const message = moreActionsMessage; setMoreActionsMessage(null); void deleteForMe(message); }}><Ionicons name="eye-off-outline" size={19} color={colors.red} /><Text style={[styles.moreActionText, { color: colors.red }]}>حذف عندي (على الجهاز)</Text></Pressable>
              {moreActionsMessage.sender_id === me && <Pressable style={styles.moreActionRow} onPress={() => { const message = moreActionsMessage; setMoreActionsMessage(null); Alert.alert("حذف للجميع", "تحذف الرسالة نهائيًا من المحادثة؟", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => void deleteForEveryone(message) }]); }}><Ionicons name="trash-outline" size={19} color={colors.red} /><Text style={[styles.moreActionText, { color: colors.red }]}>حذف للجميع</Text></Pressable>}
            </>}
            <Pressable style={styles.closeSheetBtn} onPress={() => setMoreActionsMessage(null)}><Text style={styles.actionText}>إلغاء</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={forwardOpen} transparent animationType="slide" onRequestClose={() => setForwardOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setForwardOpen(false)}>
          <Pressable style={styles.forwardSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>تحويل إلى…</Text>
            <TextInput value={forwardSearch} onChangeText={setForwardSearch} placeholder="ابحث بالاسم أو @المستخدم" placeholderTextColor={colors.muted} style={styles.forwardSearch} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {forwardUsers.filter((user) => `${user.display_name ?? ""} ${user.username}`.toLowerCase().includes(forwardSearch.toLowerCase())).map((user) => (
                <Pressable key={user.id} style={styles.forwardUser} onPress={() => pendingForward && void forwardMessage(pendingForward, user.id)}>
                  <Text style={styles.actionText}>{user.display_name ?? user.username}</Text>
                  <Text style={styles.forwardHandle}>@{user.username}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function now() {
  return new Date().getTime();
}
function parseInterval(v: string): number {
  if (v.includes("01:00:00") || v === "1 hour") return 3600_000;
  return 24 * 3600_000;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("ar-EG-u-nu-latn") : "";
}

const styles = themedStyles(() => (StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  peerName: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 16, textAlign: "right" },
  presence: { color: colors.green, fontSize: 11 },
  pinnedStrip: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, borderLeftColor: colors.goldText },
  pinnedText: { color: colors.text, fontSize: 12, flex: 1, textAlign: "right" },
  pinnedUnpin: { color: colors.goldText, fontSize: 11 },
  bubbleRow: { flexDirection: "row", paddingHorizontal: 4 },
  rowMine: { justifyContent: "flex-start" },
  rowTheirs: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 20, padding: 12, gap: 4 },
  bubbleMine: { backgroundColor: colors.gold, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surface2, borderBottomLeftRadius: 6 },
  bubbleMineLight: { backgroundColor: "#000000", borderBottomRightRadius: 6 },
  bubbleMineDark: { backgroundColor: "#FFD54A", borderBottomRightRadius: 6 },
  bubbleTheirsLight: { backgroundColor: "#FFFFFF", borderColor: "#000000", borderWidth: 1, borderBottomLeftRadius: 6 },
  bubbleTheirsDark: { backgroundColor: "#2A2A33", borderBottomLeftRadius: 6 },
  body: { color: colors.text, fontSize: 16, textAlign: "right" },
  translated: { color: colors.goldText, fontSize: 12.5, marginTop: 4, lineHeight: 19 },
  translateBtn: { alignSelf: "flex-start", marginTop: 4 },
  translateText: { color: colors.muted, fontSize: 10.5 },
  timeKey: { color: colors.ink, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  onceText: { color: colors.ink, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  pinMark: { fontSize: 10, textAlign: "right" },
  replyTag: { fontSize: 10, opacity: 0.7, textAlign: "right" },
  reactionChip: { fontSize: 11, backgroundColor: "rgba(0,0,0,0.12)", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: "hidden" },
  metaRow: { flexDirection: "row-reverse", gap: 6, alignItems: "center" },
  time: { fontSize: 10, opacity: 0.6 },
  receipt: { fontSize: 10, opacity: 0.7 },
  forwardBtn: { alignSelf: "center", paddingHorizontal: 7, paddingVertical: 9 },
  fileLink: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 5 },
  expiryTag: { color: colors.muted, fontSize: 10, textAlign: "right" },
  reactionBar: { flexDirection: "row-reverse", justifyContent: "center", backgroundColor: colors.surface2, padding: 10, gap: 8, borderTopWidth: 0.5, borderTopColor: colors.border },
  reactionBtn: { padding: 6 },
  replyPreview: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 8 },
  replyPreviewText: { color: colors.muted, fontSize: 12, flex: 1, textAlign: "right" },
  composer: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  recordBanner: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.goldSoft },
  recordText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  recordHint: { color: colors.red, fontSize: 11 },
  mentionBox: { backgroundColor: colors.surface, marginHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  mentionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  mentionName: { color: colors.text, fontSize: 12.5, flex: 1, textAlign: "right" },
  mentionHandle: { color: colors.muted, fontSize: 11 },
  bagBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, backgroundColor: colors.surface2, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, textAlign: "right", maxHeight: 110 },
  gifLabel: { color: colors.goldText, fontWeight: "800", fontSize: 11 },
  recordingBtn: { backgroundColor: colors.red },
  media: { width: 220, height: 220, borderRadius: 14, marginBottom: 4 },
  videoCard: { width: 220, height: 130, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", gap: 4 },
  videoLabel: { color: "#fff", fontSize: 11 },
  lockBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.12)" },
  lockText: { color: colors.ink, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  toast: { position: "absolute", bottom: 90, alignSelf: "center", backgroundColor: colors.surface3, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  toastText: { color: colors.text, fontSize: 12 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30, borderWidth: 1, borderColor: colors.border },
  sheetHandle: { width: 42, height: 4, borderRadius: 4, backgroundColor: colors.muted, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  actionReactions: { flexDirection: "row-reverse", justifyContent: "space-around", alignItems: "center", paddingVertical: 8 },
  actionReaction: { minWidth: 42, height: 46, alignItems: "center", justifyContent: "center" },
  extraReactions: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 8, marginBottom: 10 },
  moreActionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, minHeight: 48, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  moreActionText: { color: colors.text, fontSize: 14, textAlign: "right" },
  moreReaction: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  moreReactionText: { color: colors.goldText, fontSize: 22, fontWeight: "700" },
  actionRow: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 8 },
  actionButton: { minWidth: "24%", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  actionText: { color: colors.text, fontSize: 13, textAlign: "right" },
  receiptCard: { backgroundColor: colors.surface, margin: 24, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 10 },
  receiptDetail: { color: colors.text, fontSize: 14, textAlign: "right" },
  closeSheetBtn: { backgroundColor: colors.gold, alignItems: "center", padding: 12, borderRadius: 12, marginTop: 8 },
  onceBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", padding: 22 },
  onceCard: { backgroundColor: colors.surface, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 12 },
  onceImage: { width: "100%", height: 320, borderRadius: 14, backgroundColor: colors.surface2 },
  onceBody: { color: colors.text, fontSize: 16, textAlign: "right", lineHeight: 24 },
  onceOpenVideo: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, padding: 12, borderRadius: 14 },
  onceOpenVideoText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  forwardSheet: { backgroundColor: colors.surface, maxHeight: "78%", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 28 },
  forwardSearch: { color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, padding: 12, textAlign: "right", marginBottom: 10 },
  forwardUser: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  forwardHandle: { color: colors.muted, fontSize: 12 },
})));
