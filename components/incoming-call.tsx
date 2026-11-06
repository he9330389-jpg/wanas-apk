import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { listenCalls, sendCallSignal, type CallMode } from "@/lib/calls";
import { supabase } from "@/lib/supabase";
import { themedStyles } from "@/lib/theme-runtime";

type Incoming = { from: string; name: string; mode: CallMode };

/** مستمع عالمي للمكالمات الواردة: نغمة ونس المميزة + رد / رفض / «رد برسالة» جاهزة. */
export function IncomingCallListener() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [call, setCall] = useState<Incoming | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setMe(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!me) return;
    return listenCalls(me, (s) => {
      if (s.type === "ring") setCall({ from: s.from, name: s.name, mode: s.mode });
      if (s.type === "cancelled") setCall((cur) => (cur?.from === s.from ? null : cur));
    });
  }, [me]);

  // نغمة الرنين + اهتزاز طول ما المكالمة الواردة ظاهرة
  useEffect(() => {
    if (!call) return;
    try {
      const p = createAudioPlayer(require("../assets/sounds/ring.wav"));
      p.loop = true;
      p.volume = 1;
      p.play();
      player.current = p;
    } catch { /* النغمة اختيارية */ }
    Vibration.vibrate([0, 600, 700], true);
    const stop = setTimeout(() => setCall(null), 45000); // مكالمة فايتة بعد ٤٥ ثانية
    return () => {
      clearTimeout(stop);
      Vibration.cancel();
      try { player.current?.remove(); } catch { /* اتقفل */ }
      player.current = null;
    };
  }, [call]);

  if (!call || !me) return null;

  const accept = async () => {
    const c = call;
    setCall(null);
    void sendCallSignal(c.from, { type: "accepted", from: me });
    router.push({ pathname: "/call/[id]", params: { id: c.from, name: c.name, mode: c.mode, autostart: "1" } });
  };
  const reject = async (withMessage: boolean) => {
    const c = call;
    setCall(null);
    void sendCallSignal(c.from, { type: "rejected", from: me, message: withMessage });
    if (withMessage) {
      await supabase.from("direct_messages").insert({ sender_id: me, recipient_id: c.from, body: "مش فاضي دلوقتي، هكلمك بعدين 🙏" }).then(() => undefined, () => undefined);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void reject(false)}>
      <View style={styles.wrap}>
        <Text style={styles.kind}>{call.mode === "video" ? "وش لوش وارد" : "رنّة واردة"}</Text>
        <Avatar initial={call.name[0] ?? "؟"} color={colors.surface3} size={110} />
        <Text style={styles.name}>{call.name}</Text>
        <Text style={styles.sub}>بيرن عليك في ونس…</Text>
        <Pressable style={styles.msgBtn} onPress={() => void reject(true)}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.goldText} />
          <Text style={styles.msgText}>رد برسالة: «مش فاضي دلوقتي»</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable style={[styles.round, { backgroundColor: colors.red }]} onPress={() => void reject(false)} accessibilityLabel="رفض">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          <Pressable style={[styles.round, { backgroundColor: "#5BC98A" }]} onPress={() => void accept()} accessibilityLabel="رد">
            <Ionicons name={call.mode === "video" ? "videocam" : "call"} size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
    kind: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    name: { color: "#fff", fontSize: 26, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    sub: { color: "rgba(255,255,255,0.65)", fontSize: 13 },
    msgBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: colors.goldText, marginTop: 18 },
    msgText: { color: colors.goldText, fontSize: 13 },
    row: { flexDirection: "row", gap: 60, marginTop: 28 },
    round: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  }),
);
