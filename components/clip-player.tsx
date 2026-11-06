import React, { useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Dimensions, Alert, Share } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
/**
 * اللقطات (فيديو) — القسم 24 من دليل الهوية.
 * - مقاسين: عمودي 9:16 / عادي 16:9 (تبديل بضغطة).
 * - وضع الصفاء: ضغطة مطولة تُخفي كل الأزرار حتى الحك.
 * - سرعة التشغيل: 0.5× / 1× / 1.5× / 2×.
 */
export function ClipPlayer({
  uri,
  visible,
  onClose,
  label,
  postId,
}: {
  uri: string;
  visible: boolean;
  onClose: () => void;
  label?: string;
  /** لو متحدد: أزرار الإعجاب/التعليق/المشاركة/الحفظ بتشتغل على المنشور ده */
  postId?: string;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [interest, setInterest] = useState<"yes" | "no" | null>(null);
  const screen = Dimensions.get("window");
  const [portrait, setPortrait] = useState(true);
  const [purity, setPurity] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(visible ? uri : "", (p) => {
    p.loop = true;
    p.muted = muted;
    p.playbackRate = speed;
    p.play();
  });

  const width = portrait ? screen.width : Math.min(screen.width, (screen.height * 16) / 9);
  const height = portrait ? Math.min(screen.height * 0.78, (width * 16) / 9) : (width * 9) / 16;

  const changeSpeed = (next: number) => setSpeed(next);
  const toggleMute = () => setMuted((v) => !v);

  // السرعة والكتم لازم يتطبقوا على المشغّل نفسه مش على الـ state بس
  useEffect(() => { try { player.playbackRate = speed; } catch { /* المشغّل اتقفل */ } }, [speed, player]);
  useEffect(() => { try { player.muted = muted; } catch { /* المشغّل اتقفل */ } }, [muted, player]);

  async function toggleLike() {
    if (!postId) return;
    const was = liked;
    setLiked(!was);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("الجلسة انتهت");
      const q = was
        ? await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", uid)
        : await supabase.from("post_reactions").upsert({ post_id: postId, user_id: uid, reaction: "أحببته" }, { onConflict: "post_id,user_id" });
      if (q.error) throw q.error;
    } catch {
      setLiked(was);
    }
  }
  async function toggleSave() {
    if (!postId) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    if (saved) {
      await supabase.from("saves").delete().eq("user_id", uid).eq("post_id", postId);
      setSaved(false);
    } else {
      const { error } = await supabase.from("saves").upsert({ user_id: uid, post_id: postId });
      if (error) return Alert.alert("الحفظ فشل", error.message);
      setSaved(true);
    }
  }
  function openComments() {
    if (!postId) return;
    onClose();
    router.push({ pathname: "/post/[id]", params: { id: postId } });
  }
  function sharePost() {
    if (!postId) return;
    void Share.share({ message: `شوف المقطع ده على ونس: ${ExpoLinking.createURL(`/post/${postId}`)}` });
  }

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  function startPurity() {
    holdTimer.current = setTimeout(() => setPurity(true), 550);
  }
  function endPurity() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }
  function cycleSpeed() {
    changeSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1);
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <Pressable
          style={[styles.videoWrap, { width, height }]}
          onPress={() => setPurity(false)}
          onLongPress={startPurity}
          onPressOut={endPurity}
          delayLongPress={300}
        >
          <VideoView
            player={player}
            style={{ width, height }}
            contentFit={portrait ? "cover" : "contain"}
            nativeControls={false}
            allowsPictureInPicture={false}
          />

          {!purity && (
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.topRow}>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={28} color="#fff" />
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setPortrait((v) => !v)} hitSlop={12} style={styles.iconBtn}>
                  <Text style={styles.iconLabel}>{portrait ? "9:16" : "16:9"}</Text>
                </Pressable>
                <Pressable onPress={toggleMute} hitSlop={12} style={styles.iconBtn}>
                  <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
                </Pressable>
                <Pressable onPress={cycleSpeed} hitSlop={12} style={styles.iconBtn}>
                  <Text style={styles.speed}>{speed}×</Text>
                </Pressable>
              </View>

              <View style={styles.rightActions}>
                <Pressable style={styles.action} onPress={() => void toggleLike()} disabled={!postId} accessibilityLabel="إعجاب">
                  <Ionicons name={liked ? "heart" : "heart-outline"} size={24} color={liked ? colors.red : "#fff"} />
                </Pressable>
                <Pressable style={styles.action} onPress={openComments} disabled={!postId} accessibilityLabel="التعليقات">
                  <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
                </Pressable>
                <Pressable style={styles.action} onPress={sharePost} disabled={!postId} accessibilityLabel="مشاركة">
                  <Ionicons name="arrow-redo" size={24} color="#fff" />
                </Pressable>
                <Pressable style={styles.action} onPress={() => void toggleSave()} disabled={!postId} accessibilityLabel="حفظ">
                  <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={24} color={colors.goldText} />
                </Pressable>
                <Pressable style={styles.action} onPress={() => setMoreOpen((v) => !v)} accessibilityLabel="المزيد">
                  <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                </Pressable>
                {moreOpen && (
                  <View style={styles.moreMenu}>
                    <Pressable onPress={() => { setInterest("yes"); setMoreOpen(false); }} style={styles.moreItem}>
                      <Text style={styles.moreText}>{interest === "yes" ? "✓ " : ""}يهمني</Text>
                    </Pressable>
                    <Pressable onPress={() => { setInterest("no"); setMoreOpen(false); onClose(); }} style={styles.moreItem}>
                      <Text style={styles.moreText}>مش يهمني</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View pointerEvents="none">
                {!!label && <Text style={styles.caption}>{label}</Text>}
                <Text style={styles.purityHint}>اضغط مطولاً لوضع الصفاء ✨</Text>
              </View>
            </View>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  videoWrap: { overflow: "hidden", borderRadius: 8, backgroundColor: "#000" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 14, justifyContent: "space-between" },
  topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconBtn: { alignItems: "center", gap: 2 },
  iconLabel: { color: "#fff", fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  speed: { color: "#fff", fontSize: 13, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  rightActions: { position: "absolute", left: 12, bottom: 90, alignItems: "center", gap: 18 },
  action: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  moreMenu: { position: "absolute", left: 52, bottom: 0, backgroundColor: "rgba(20,20,26,0.95)", borderRadius: 12, paddingVertical: 4, minWidth: 110 },
  moreItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  moreText: { color: "#fff", fontSize: 13, textAlign: "right" },
  caption: { color: "#fff", fontSize: 14, textAlign: "right", marginBottom: 4 },
  purityHint: { color: "rgba(255,255,255,0.55)", fontSize: 11, textAlign: "center", marginBottom: 6 },
})));