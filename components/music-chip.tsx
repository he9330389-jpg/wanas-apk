import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors } from "@/constants/wanas";

export type MusicMeta = { id?: string; title: string; artist?: string; preview: string; artwork?: string | null };

/**
 * شريط الموسيقى المختارة للمنشور/القصة — بيشغّل المعاينة الحقيقية من مكتبة Deezer
 * وبيتحكم فيها بالضغط (تشغيل/إيقاف) زي إنستجرام.
 */
export function MusicChip({ music, compact }: { music: MusicMeta | null | undefined; compact?: boolean }) {
  const [on, setOn] = useState(false);
  const player = useAudioPlayer(on && music?.preview ? { uri: music.preview } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!on) return;
    try {
      player.play();
    } catch {
      // لو الرابط وقع، الزرار بيرجع لحالته
    }
  }, [on, player]);

  if (!music?.preview) return null;
  return (
    <Pressable
      onPress={() => setOn((v) => !v)}
      style={[styles.chip, compact && { paddingVertical: 4, paddingHorizontal: 8 }]}
      accessibilityRole="button"
      accessibilityLabel={on ? "إيقاف الموسيقى" : "تشغيل الموسيقى"}
    >
      <Ionicons name={on && status.playing ? "pause-circle" : "play-circle"} size={compact ? 15 : 17} color={colors.ink} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.title, compact && { fontSize: 10.5 }]}>{music.title}</Text>
        {!!music.artist && !compact && <Text numberOfLines={1} style={styles.artist}>{music.artist}</Text>}
      </View>
      {on && status.isBuffering && <ActivityIndicator size="small" color={colors.ink} />}
      <Ionicons name="musical-notes" size={13} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 7, backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, maxWidth: "92%" },
  title: { color: colors.ink, fontSize: 11.5, fontWeight: "800", textAlign: "right" },
  artist: { color: colors.ink, fontSize: 10, opacity: 0.75, textAlign: "right" },
});
