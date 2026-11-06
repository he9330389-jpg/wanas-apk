import React, { useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors } from "@/constants/wanas";
import { publicMediaUrl } from "@/lib/media";

export type PostMediaProps = {
  /** المسار المخزّن في posts.media_url (مسار داخل bucket أو رابط كامل). */
  path: string | null | undefined;
  /** نوع المرفق المخزّن في posts.media_type: image · video · audio · file · pdf. */
  type: string | null | undefined;
  /** هل نشغّل الفيديو تلقائيًا (تبويب الفيديو)؟ */
  autoPlay?: boolean;
  /** لما المستخدم يدوس على الصورة: بنفتحها كاملة. لو مفيش، بيفتح صفحة التعليقات. */
  onPress?: () => void;
};

/** مشغّل الفيديو داخل الكارت — بيتحمّل أول ما المستخدم يدوس عليه. */
function VideoAttachment({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.videoBox}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
    </View>
  );
}

/** مشغّل الصوت (منشور صوتي / تسجيل مباشر). */
function AudioAttachment({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const duration = Math.max(0, Math.round((status.duration ?? 0) - (status.currentTime ?? 0)));
  const mm = Math.floor(duration / 60);
  const ss = (duration % 60).toString().padStart(2, "0");
  return (
    <Pressable
      style={styles.audioBox}
      onPress={() => {
        if (status.playing) player.pause();
        else player.play();
      }}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? "إيقاف الصوت" : "تشغيل الصوت"}
    >
      <View style={styles.audioPlay}>
        <Ionicons name={status.playing ? "pause" : "play"} size={18} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.audioTitle}>منشور صوتي</Text>
        <Text style={styles.audioSub}>
          {status.isLoaded ? `المتبقي ${mm}:${ss}` : "بجهز الصوت…"}
        </Text>
      </View>
      <Ionicons name="mic" size={18} color={colors.goldText} />
    </Pressable>
  );
}

/** مرفق الملف (PDF أو مستند) — بيفتح بالعارض اللي على الجهاز. */
function FileAttachment({ url, label }: { url: string; label: string }) {
  return (
    <Pressable style={styles.fileBox} onPress={() => void Linking.openURL(url)}>
      <View style={styles.fileIcon}>
        <Ionicons name="document-text" size={20} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.audioTitle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.audioSub}>دوس عشان تفتح الملف</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.goldText} />
    </Pressable>
  );
}

/**
 * مرفق المنشور الحقيقي: صورة / فيديو / صوت / ملف — بيظهر في آخر الأخبار
 * وفي الملف الشخصي وفي تبويب الفيديو، وكل نوع ليه عارض مناسب.
 */
export function PostMedia({ path, type, autoPlay, onPress }: PostMediaProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const url = publicMediaUrl(path);
  if (!url) return null;
  const kind = (type ?? "").toLowerCase();

  if (kind === "video") {
    return autoPlay ? <VideoAttachment url={url} /> : <VideoAttachment url={url} />;
  }
  if (kind === "audio" || kind === "voice" || kind === "sound") {
    return <AudioAttachment url={url} />;
  }
  if (kind === "file" || kind === "pdf" || kind === "document") {
    const name = decodeURIComponent(url.split("/").pop() ?? "ملف");
    return <FileAttachment url={url} label={name} />;
  }
  // الافتراضي: صورة
  if (imageFailed) {
    return <FileAttachment url={url} label="مرفق" />;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel="افتح صورة المنشور">
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setImageFailed(true)}
      />
    </Pressable>
  );
}

/**
 * عارض صورة المنشور بالحجم الكامل: يفتح بالضغط على الصورة، فيه تكبير/تصغير بإيماءة
 * وزر «التعليقات» بيروح لصفحة المنشور، وزر «مشاركة» بيشارك الرابط.
 */
export function ImageViewer({
  visible,
  url,
  onClose,
  onComments,
  onShare,
}: {
  visible: boolean;
  url: string | null;
  onClose: () => void;
  onComments?: () => void;
  onShare?: () => void;
}) {
  const [scale, setScale] = useState(1);
  if (!url) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <View style={styles.viewerBar}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: "row-reverse", gap: 18 }}>
            <Pressable onPress={() => setScale((v) => (v >= 2.4 ? 1 : v + 0.7))} hitSlop={10}>
              <Ionicons name="expand" size={22} color="#fff" />
            </Pressable>
            {!!onShare && (
              <Pressable onPress={onShare} hitSlop={10}>
                <Ionicons name="share-social-outline" size={22} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.viewerScroll} maximumZoomScale={4} minimumZoomScale={1} centerContent>
          <Image source={{ uri: url }} style={[styles.viewerImage, { transform: [{ scale }] }]} resizeMode="contain" />
        </ScrollView>
        {!!onComments && (
          <Pressable style={styles.viewerComments} onPress={onComments}>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.ink} />
            <Text style={styles.viewerCommentsText}>التعليقات والتفاعل</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: 220, borderRadius: 16, marginTop: 8, backgroundColor: "#111" },
  viewerBackdrop: { flex: 1, backgroundColor: "#000" },
  viewerBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 48, paddingBottom: 10 },
  viewerScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: 360, height: 520 },
  viewerComments: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, margin: 16, backgroundColor: colors.gold, borderRadius: 16, paddingVertical: 12 },
  viewerCommentsText: { color: colors.ink, fontSize: 13.5, fontWeight: "800" },
  videoBox: { width: "100%", aspectRatio: 9 / 12, maxHeight: 460, borderRadius: 16, overflow: "hidden", marginTop: 8, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
  audioBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  audioPlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  audioTitle: { color: colors.text, fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: "right" },
  audioSub: { color: colors.muted, fontSize: 11, textAlign: "right" },
  fileBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
});
