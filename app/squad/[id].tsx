import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Image,
  Modal,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenShell, Header, Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, pickVideo, signedMediaUrl, uploadMedia } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import {
  THEMES,
  getSquad,
  getSquadMembers,
  inviteToSquad,
  leaveSquad,
  openSquadCouncil,
  removeSquadMember,
  setSquadMemberRole,
  type Squad,
  type SquadMember,
} from "@/lib/excellence";

type Friend = { user_id: string; display_name: string | null; username: string | null };

type AlbumItem = { id: string; sender_id: string; media_url: string | null; media_type: string | null; created_at: string };

function AlbumTile({ item }: { item: AlbumItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!item.media_url) return;
      const signed = await signedMediaUrl(item.media_url);
      if (active) setUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [item.media_url]);
  if (!url) return <View style={styles.albumTile} />;
  if (item.media_type === "video") {
    return (
      <View style={[styles.albumTile, styles.videoTile]}>
        <Ionicons name="play-circle" size={30} color={colors.goldText} />
        <Text style={styles.videoLabel}>فيديو</Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={styles.albumTile} />;
}

/**
 * جوّه الشّلة — الأعضاء والأدوار، دعوة بكود أو من الأصدقاء،
 * مجلس الشّلة المشترك، والألبوم المشترك (من رسائل المحادثة).
 */
export default function SquadScreen() {
  useThemeContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [album, setAlbum] = useState<AlbumItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: auth } = await supabase.auth.getUser();
    setUserId(auth.user?.id ?? null);
    try {
      const [s, m] = await Promise.all([getSquad(id), getSquadMembers(id)]);
      setSquad(s);
      setMembers(m);
      if (s?.conversation_id) {
        const { data, error } = await supabase
          .from("group_messages")
          .select("id, sender_id, media_url, media_type, created_at")
          .eq("conversation_id", s.conversation_id)
          .not("media_url", "is", null)
          .in("media_type", ["image", "video"])
          .order("created_at", { ascending: false })
          .limit(24);
        if (error) throw new Error(error.message);
        setAlbum((data ?? []) as AlbumItem[]);
      } else {
        setAlbum([]);
      }
    } catch (error) {
      Alert.alert("مشكلة في التحميل", error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const myRole = members.find((m) => m.user_id === userId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  const loadFriends = async () => {
    if (!userId) return;
    const { data } = await supabase.from("friends").select("user_a, user_b").or(`user_a.eq.${userId},user_b.eq.${userId}`).limit(100);
    const ids = (data ?? []).map((f) => (f.user_a === userId ? f.user_b : f.user_a));
    if (ids.length === 0) {
      setFriends([]);
      return;
    }
    const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
    setFriends((profs ?? []).map((p) => ({ user_id: p.id, display_name: p.display_name, username: p.username })));
  };

  const openInvite = async () => {
    setShowInvite(true);
    await loadFriends();
  };

  const invite = async (friendId: string) => {
    if (!squad || !userId) return;
    setBusy(true);
    try {
      await inviteToSquad(squad.id, userId, [friendId]);
      Alert.alert("اتبعتت الدعوة", "هتلاقيها في الشّلة عند صاحبك.");
    } catch (error) {
      Alert.alert("مش قادر أدعو", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  };

  const shareCode = async () => {
    if (!squad) return;
    await Share.share({
      message: `انضم لشلّتنا «${squad.emoji} ${squad.name}» على ونس — كود الدعوة: ${squad.invite_code}`,
    });
  };

  /**
   * رفع صورة/فيديو للألبوم المشترك: الملف يترفع فعليًا على التخزين الخاص
   * الأول، وبعد ما ينجح بس بيتسجل في رسائل الشلّة — لو الرفع فشل بنقول للمستخدم
   * صراحة ومفيش أي رسالة وهمية.
   */
  const uploadToAlbum = async (kind: "image" | "video") => {
    if (!squad?.conversation_id || !userId) {
      Alert.alert("مش قادر أرفع", "مفيش محادثة للشلّة دي لسه.");
      return;
    }
    const picked = kind === "image" ? await pickImage() : await pickVideo();
    if (!picked) return;
    setUploading(true);
    try {
      const path = await uploadMedia(userId, picked);
      const { error } = await supabase.from("group_messages").insert({
        conversation_id: squad.conversation_id,
        sender_id: userId,
        body: kind === "image" ? "صورة من ألبوم الشلّة" : "فيديو من ألبوم الشلّة",
        media_url: path,
        media_type: kind,
      });
      if (error) {
        await supabase.storage.from("chat-media").remove([path]);
        throw new Error(error.message);
      }
      await load();
      Alert.alert("نزل في الألبوم", "الصورة بقت عند كل الشلّة.");
    } catch (error) {
      Alert.alert("الرفع ما كمّلش", error instanceof Error ? error.message : "جرّب تاني");
    } finally {
      setUploading(false);
    }
  };

  const openAlbumItem = async (item: AlbumItem) => {
    const url = item.media_url ? await signedMediaUrl(item.media_url) : null;
    if (!url) return;
    if (item.media_type === "video") {
      Alert.alert("فيديو الشلّة", "هتفتح في مشغّل الجهاز.", [
        { text: "قفل", style: "cancel" },
        { text: "افتح", onPress: () => Linking.openURL(url) },
      ]);
      return;
    }
    setPreview(url);
  };

  const openCouncil = async () => {
    if (!squad || !userId) return;
    setBusy(true);
    try {
      if (squad.majlis_room_id) {
        router.push({ pathname: "/council/[id]", params: { id: squad.majlis_room_id } });
        return;
      }
      const roomId = await openSquadCouncil(squad, userId);
      await load();
      router.push({ pathname: "/council/[id]", params: { id: roomId } });
    } catch (error) {
      Alert.alert("مش قادر أفتح المجلس", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  };

  const memberActions = (member: SquadMember) => {
    if (!isAdmin || member.user_id === userId || !squad) return;
    const options: { text: string; onPress: () => void; style?: "cancel" | "destructive" }[] = [
      {
        text: member.role === "admin" ? "شيله من المشرفين" : "خليه مشرف",
        onPress: async () => {
          await setSquadMemberRole(squad.id, member.user_id, member.role === "admin" ? "member" : "admin");
          await load();
        },
      },
      {
        text: "شيله من الشلّة",
        style: "destructive",
        onPress: async () => {
          await removeSquadMember(squad.id, member.user_id);
          await load();
        },
      },
      { text: "إلغاء", style: "cancel", onPress: () => {} },
    ];
    Alert.alert(member.profiles?.display_name ?? "عضو", "تحب تعمل إيه؟", options);
  };

  const leave = () => {
    if (!squad || !userId) return;
    Alert.alert("تخرج من الشلّة؟", "هتخرج من الونسة والمجلس المشترك.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "اخرج",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveSquad(squad.id, userId);
            router.back();
          } catch (error) {
            Alert.alert("مش قادر أخرج", error instanceof Error ? error.message : "");
          }
        },
      },
    ]);
  };

  return (
    <ScreenShell>
      <Header title={squad?.name ?? "الشّلة"} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
        ) : !squad ? (
          <Text style={styles.empty}>مش لاقي الشلّة دي، أو مش عضو فيها.</Text>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={{ fontSize: 40 }}>{squad.emoji}</Text>
              <Text style={styles.name}>{squad.name}</Text>
              <Text style={styles.meta}>
                {THEMES.find((t) => t.key === squad.theme)?.label} · {members.length}/{squad.max_members} عضو
              </Text>
              {squad.description ? <Text style={styles.desc}>{squad.description}</Text> : null}
              <View style={styles.heroActions}>
                <Pressable style={styles.primaryAction} onPress={openCouncil} disabled={busy}>
                  <Ionicons name="mic" size={16} color={colors.ink} />
                  <Text style={styles.primaryText}>مجلس الشّلة</Text>
                </Pressable>
                <Pressable style={styles.ghostAction} onPress={shareCode}>
                  <Ionicons name="share-social" size={16} color={colors.text} />
                  <Text style={styles.ghostText}>شارك الكود</Text>
                </Pressable>
              </View>
              <Pressable style={styles.codeBox} onPress={shareCode}>
                <Text style={styles.codeLabel}>كود الدعوة</Text>
                <Text style={styles.codeValue}>{squad.invite_code}</Text>
              </Pressable>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>الأعضاء ({members.length})</Text>
              {isAdmin && members.length < squad.max_members && (
                <Pressable style={styles.addMember} onPress={openInvite}>
                  <Ionicons name="person-add" size={14} color={colors.ink} />
                  <Text style={styles.addMemberText}>ادعو حد</Text>
                </Pressable>
              )}
            </View>
            {members.map((m) => (
              <Pressable key={m.user_id} style={styles.memberRow} onPress={() => memberActions(m)}>
                <Avatar initial={(m.profiles?.display_name ?? "و").slice(0, 1)} color={colors.surface3} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>
                    {m.profiles?.display_name ?? m.profiles?.username ?? "عضو"}
                    {m.user_id === userId ? " (أنت)" : ""}
                  </Text>
                  <Text style={styles.memberMeta}>
                    {m.role === "owner" ? "مالك الشلّة" : m.role === "admin" ? "مشرف" : "عضو"}
                  </Text>
                </View>
                {m.role === "owner" && <Text style={styles.crown}>👑</Text>}
              </Pressable>
            ))}

            <Text style={styles.sectionTitle}>الألبوم المشترك</Text>
            {album.length === 0 ? (
              <Text style={styles.empty}>لسه مفيش صور أو فيديوهات في ونسة الشلّة.</Text>
            ) : (
              <View style={styles.albumGrid}>
                {album.map((a) => (
                  <Pressable key={a.id} onPress={() => openAlbumItem(a)}>
                    <AlbumTile item={a} />
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.uploadRow}>
              <Pressable
                style={[styles.uploadBtn, uploading && { opacity: 0.5 }]}
                disabled={uploading}
                onPress={() => uploadToAlbum("image")}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Ionicons name="image" size={16} color={colors.ink} />
                )}
                <Text style={styles.uploadText}>ارفع صورة</Text>
              </Pressable>
              <Pressable
                style={[styles.uploadGhost, uploading && { opacity: 0.5 }]}
                disabled={uploading}
                onPress={() => uploadToAlbum("video")}
              >
                <Ionicons name="videocam" size={16} color={colors.text} />
                <Text style={styles.uploadGhostText}>ارفع فيديو</Text>
              </Pressable>
            </View>

            <Pressable style={styles.leaveBtn} onPress={leave}>
              <Text style={styles.leaveText}>اخرج من الشلّة</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={showInvite} transparent animationType="slide" onRequestClose={() => setShowInvite(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ادعو صاحبك للشلّة</Text>
            {friends.length === 0 ? (
              <Text style={styles.empty}>مفيش أصدقاء لسه — شارك الكود معاهم.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {friends.map((f) => {
                  const already = members.some((m) => m.user_id === f.user_id);
                  return (
                    <View key={f.user_id} style={styles.memberRow}>
                      <Avatar initial={(f.display_name ?? "و").slice(0, 1)} color={colors.surface3} size={34} />
                      <Text style={[styles.memberName, { flex: 1 }]}>{f.display_name ?? f.username ?? "صاحبك"}</Text>
                      <Pressable
                        style={[styles.smallBtn, (already || busy) && { opacity: 0.4 }]}
                        disabled={already || busy}
                        onPress={() => invite(f.user_id)}
                      >
                        <Text style={styles.smallBtnText}>{already ? "عضو" : "دعوة"}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <Pressable style={styles.closeBtn} onPress={() => setShowInvite(false)}>
              <Text style={styles.closeText}>قفل</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable
          onPress={() => setPreview(null)}
          style={{ flex: 1, backgroundColor: "#000000F2", justifyContent: "center", alignItems: "center", padding: 16 }}
        >
          {preview ? <Image source={{ uri: preview }} resizeMode="contain" style={{ width: "100%", height: "82%" }} /> : null}
          <Text style={{ color: "white", marginTop: 12 }}>اضغط للإغلاق</Text>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 16, lineHeight: 20 },
  hero: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 6, borderWidth: 1, borderColor: colors.border },
  name: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "center" },
  meta: { color: colors.muted, fontSize: 12, textAlign: "center" },
  desc: { color: colors.text, fontSize: 12.5, textAlign: "center", marginTop: 4, lineHeight: 19 },
  heroActions: { flexDirection: "row-reverse", gap: 8, marginTop: 10, width: "100%" },
  primaryAction: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 13, paddingVertical: 11 },
  primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 13 },
  ghostAction: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface2, borderRadius: 13, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.text, fontSize: 13 },
  codeBox: { marginTop: 10, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", width: "100%" },
  codeLabel: { color: colors.muted, fontSize: 10 },
  codeValue: { color: colors.goldText, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", letterSpacing: 2 },
  sectionRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 22, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right", marginTop: 6 },
  addMember: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.gold, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  addMemberText: { color: colors.ink, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  memberRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border },
  memberName: { color: colors.text, fontSize: 13, fontFamily: "Cairo_600SemiBold", fontWeight: "600", textAlign: "right" },
  memberMeta: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
  crown: { fontSize: 14 },
  albumGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  albumTile: { width: "31%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface2 },
  videoTile: { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: colors.border },
  videoLabel: { color: colors.text, fontSize: 10, fontFamily: "Cairo_600SemiBold", fontWeight: "600" },
  leaveBtn: { marginTop: 18, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#ED556555" },
  leaveText: { color: colors.red, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10 },
  modalTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  smallBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { color: colors.ink, fontSize: 11.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  closeBtn: { alignItems: "center", paddingVertical: 10 },
  uploadRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  uploadBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, paddingVertical: 12, borderRadius: 12 },
  uploadText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  uploadGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: 12 },
  uploadGhostText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  closeText: { color: colors.muted, fontSize: 13 },
})));
