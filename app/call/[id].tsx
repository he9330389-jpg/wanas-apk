import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "@/constants/wanas";
import { Avatar } from "@/components/wanas-ui";
import { jitsiRoomUrl } from "@/lib/jitsi";
import { JitsiRoom } from "@/components/jitsi-room";
import { callRoomId, listenCalls, logCallNotification, sendCallSignal } from "@/lib/calls";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
/**
 * رنّة / وش لوش — القسم 21 من دليل الهوية.
 * واجهة المكالمة كاملة: حلقات نبض، مؤقّت، كتم، سماعة، تحويل، إنهاء.
 * الصوت الحقيقي: غرفة Jitsi Meet مجانية (بدون حساب) مشتقة من مُعرّف المحادثة —
 * الطرفان بيدخلوا نفس الغرفة من زر «ابدأ الصوت» وبيتكلموا فعليًا.
 */
export default function CallScreen() {
  useThemeContext();
  const { id, name, mode, autostart } = useLocalSearchParams<{ id: string; name?: string; mode?: string; autostart?: string }>();
  const router = useRouter();
  const isVideo = mode === "video";
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [opened, setOpened] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "ringing" | "rejected">("idle");
  const [myName, setMyName] = useState("ونس");
  const room = me && id ? callRoomId(me, id) : id;

  const [pulse1] = useState(() => new Animated.Value(1));
  const [pulse2] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1.6, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    loop(pulse1, 0);
    loop(pulse2, 800);
  }, [pulse1, pulse2]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setMe(uid);
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("display_name, username").eq("id", uid).maybeSingle();
        setMyName((p as { display_name?: string; username?: string } | null)?.display_name ?? (p as { username?: string } | null)?.username ?? "ونس");
      }
    })();
  }, []);

  // الطرف المتصل: بيسمع رد الطرف التاني (قبل/رفض)
  useEffect(() => {
    if (!me) return;
    if (autostart === "1") setOpened(true); // الرد على مكالمة واردة بيدخل الغرفة فورًا
    return listenCalls(me, (sig) => {
      if (sig.type === "accepted" && sig.from === id) setOpened(true);
      if (sig.type === "rejected" && sig.from === id) setState("rejected");
    });
  }, [me, id, autostart]);

  useEffect(() => {
    if (!opened) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [opened]);

  // المكالمة بتفتح جوه التطبيق نفسه (Jitsi داخل WebView) — مفيش خروج ولا تحميل تطبيق خارجي
  const startVoice = async () => {
    if (!id || !me) return;
    if (opened) return;
    // نرن على الطرف التاني: إشارة لحظية + إشعار محفوظ
    setState("ringing");
    void sendCallSignal(id, { type: "ring", from: me, name: myName, mode: isVideo ? "video" : "audio" });
    void logCallNotification(me, id, isVideo ? "video" : "audio");
  };
  const cancelRing = () => {
    if (me && id && state === "ringing") void sendCallSignal(id, { type: "cancelled", from: me });
    router.back();
  };

  const shareRoom = async () => {
    if (!id) return;
    const url = jitsiRoomUrl("call", room ?? id, { video: isVideo, displayName: name ?? undefined });
    await Share.share({ message: `تعال نونس في مكالمة ونس: ${url}` });
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (opened && id) {
    return (
      <View style={styles.screen}>
        <JitsiRoom kind="call" id={room ?? id} displayName={name} video={isVideo} onClose={() => router.back()} />
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.kind}>{isVideo ? "وش لوش" : "رنّة"}</Text>

      <View style={styles.avatarArea}>
        <Animated.View style={[styles.ring, { transform: [{ scale: pulse1 }] }]} />
        <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: pulse2 }] }]} />
        <Avatar initial={(name ?? "؟")[0]} color={colors.surface3} size={120} />
      </View>

      <Text style={styles.name}>{name ?? "مكالمة"}</Text>
      <Text style={styles.status}>
        {opened ? `${mm}:${ss}` : state === "ringing" ? "بنرن عليه…" : state === "rejected" ? "رفض المكالمة" : "لسه ما بدأتش"}
      </Text>

      <Pressable style={styles.voiceBtn} onPress={startVoice}>
        <Ionicons name={isVideo ? "videocam" : "call"} size={20} color={colors.ink} />
        <Text style={styles.voiceText}>{opened ? "ارجع للمكالمة" : state === "ringing" ? "رنّ تاني" : isVideo ? "ابدأ وش لوش" : "ابدأ رنّة"}</Text>
      </Pressable>
      <Pressable onPress={shareRoom} hitSlop={8}>
        <Text style={styles.shareText}>ابعت لينك المكالمة لصاحبك</Text>
      </Pressable>

      <View style={styles.controls}>
        <ControlBtn
          icon={muted ? "mic-off" : "mic"}
          label={muted ? "فاتح" : "اكتم"}
          active={muted}
          onPress={() => setMuted((v) => !v)}
        />
        <ControlBtn
          icon={speaker ? "volume-high" : "volume-low"}
          label="السماعة"
          active={!speaker}
          onPress={() => setSpeaker((v) => !v)}
        />
        {isVideo && (
          <ControlBtn
            icon={camOn ? "videocam" : "videocam-off"}
            label="الكاميرا"
            active={!camOn}
            onPress={() => setCamOn((v) => !v)}
          />
        )}
        <ControlBtn icon="swap-horizontal" label="تحويل" onPress={() => {}} />
        <ControlBtn
          icon="call"
          label="اقفل"
          danger
          onPress={cancelRing}
        />
      </View>

      <Text style={styles.note}>
        الصوت والفيديو بيشتغلوا جوه ونس نفسه — لما ترن، التطبيق عند الطرف التاني بيرن بنغمة ونس ويدخل نفس الغرفة أول ما يرد. محتاجين نت للطرفين، والرنين الفوري بيشتغل والتطبيق مفتوح.
      </Text>
    </View>
  );
}

function ControlBtn({
  icon,
  label,
  onPress,
  active,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.controlWrap}>
      <View style={[styles.control, active && styles.controlActive, danger && styles.controlDanger]}>
        <Ionicons
          name={icon}
          size={24}
          color={danger ? "#fff" : active ? colors.ink : colors.text}
        />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  kind: { color: colors.goldText, fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold", marginBottom: 30 },
  avatarArea: { alignItems: "center", justifyContent: "center", height: 220, width: 220 },
  ring: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 1.5, borderColor: "rgba(240,201,90,0.35)" },
  ring2: { borderColor: "rgba(240,201,90,0.18)" },
  name: { color: colors.text, fontSize: 24, fontFamily: "Cairo_700Bold", fontWeight: "bold", marginTop: 10 },
  status: { color: colors.muted, fontSize: 14, marginBottom: 40 },
  controls: { flexDirection: "row-reverse", gap: 16, flexWrap: "wrap", justifyContent: "center" },
  controlWrap: { alignItems: "center", gap: 6 },
  control: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  controlActive: { backgroundColor: colors.gold },
  controlDanger: { backgroundColor: colors.red },
  controlLabel: { color: colors.muted, fontSize: 11 },
  note: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 28, paddingHorizontal: 30 },
  voiceBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.gold, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 13, marginTop: 4 },
  voiceText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 15 },
  shareText: { color: colors.goldText, fontSize: 12, marginTop: 10 },
})));
