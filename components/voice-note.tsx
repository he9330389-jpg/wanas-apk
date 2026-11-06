import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { colors } from "@/constants/wanas";
import { signedMediaUrl } from "@/lib/media";

import { themedStyles } from "@/lib/theme-runtime";
/** مشغّل رسالة صوتية قصيرة (بطاقة شكر · ونسة الصباح · مرفقات). */
export function VoiceNote({ path, label = "رسالة صوتية", onPlayed }: { path: string; label?: string; onPlayed?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    let active = true;
    (async () => {
      const signed = await signedMediaUrl(path);
      if (active) setUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [path]);

  useEffect(() => {
    return () => {
      try {
        player?.release();
      } catch {
        // المشغّل ممكن يكون اتقفل قبل كده
      }
    };
  }, [player]);

  const toggle = () => {
    if (!url) return;
    try {
      if (!player) {
        const next = createAudioPlayer({ uri: url });
        try { next.shouldCorrectPitch = true; next.setPlaybackRate(rate); } catch { /* السرعة اختيارية */ }
        next.play();
        onPlayed?.();
        setPlayer(next);
        setPlaying(true);
        return;
      }
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        player.play();
        setPlaying(true);
      }
    } catch {
      setFailed(true);
    }
  };

  return (
    <Pressable style={styles.row} onPress={toggle} disabled={!url || failed}>
      <View style={styles.iconWrap}>
        {!url ? (
          <ActivityIndicator size="small" color={colors.goldText} />
        ) : (
          <Ionicons name={failed ? "alert-circle" : playing ? "pause" : "play"} size={16} color={colors.ink} />
        )}
      </View>
      <View style={styles.wave}>
        {[6, 12, 8, 16, 10, 14, 7, 12, 9, 15, 8, 11].map((h, i) => (
          <View key={i} style={[styles.bar, { height: h, opacity: playing ? 0.9 : 0.45 }]} />
        ))}
      </View>
      <Text style={styles.label}>{failed ? "الصوت مش متاح" : label}</Text>
      <Pressable
        onPress={() => {
          const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
          setRate(next);
          try { player?.setPlaybackRate(next); } catch { /* لسه ما اتشغلش */ }
        }}
        hitSlop={8}
        style={styles.speed}
        accessibilityLabel={`سرعة التشغيل ×${rate}`}
      >
        <Text style={styles.speedText}>×{rate}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface2, borderRadius: 14, padding: 8, paddingHorizontal: 10 },
  iconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  wave: { flexDirection: "row-reverse", alignItems: "center", gap: 2, flex: 1, height: 20 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.gold },
  label: { color: colors.text, fontSize: 11.5 },
  speed: { minWidth: 36, height: 26, borderRadius: 13, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  speedText: { color: colors.goldText, fontSize: 11, fontWeight: "bold" },
})));
