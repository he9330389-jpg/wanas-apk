import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors } from "@/constants/wanas";

/**
 * منتقي موسيقى حقيقي — بيجيب من مكتبة Deezer المفتوحة (بحث + تصنيفات عربية/عالمية)
 * والمقطع اللي بتختاره بيتشغّل فعليًا داخل ونس (معاينة 30 ثانية من CDN بتاع Deezer).
 * مفيش مفاتيح ولا تسجيل — نفس واجهة api.deezer.com العامة.
 */
export type Track = { id: string; title: string; artist: string; artwork: string | null; preview: string };

const CATEGORIES: { key: string; label: string; query: string }[] = [
  { key: "arabic", label: "عربي", query: "arabic" },
  { key: "oud", label: "عود", query: "oud" },
  { key: "piano", label: "بيانو", query: "piano" },
  { key: "lofi", label: "لو-فاي", query: "lofi" },
  { key: "chill", label: "هادي", query: "chill" },
  { key: "party", label: "حفلة", query: "party" },
  { key: "guitar", label: "جيتار", query: "guitar" },
  { key: "violin", label: "كمان", query: "violin" },
];

export async function searchTracks(query: string, limit = 20): Promise<Track[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("مكتبة الموسيقى مش متاحة دلوقتي");
  const json = (await res.json()) as { data?: { id: number; title: string; preview: string; artist?: { name?: string }; album?: { cover_medium?: string } }[] };
  return (json.data ?? [])
    .filter((t) => !!t.preview)
    .map((t) => ({
      id: String(t.id),
      title: t.title,
      artist: t.artist?.name ?? "—",
      artwork: t.album?.cover_medium ?? null,
      preview: t.preview,
    }));
}

export function MusicPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (t: Track) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("arabic");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Track | null>(null);
  const player = useAudioPlayer(playing ? { uri: playing.preview } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const cat = CATEGORIES.find((c) => c.key === category)?.query ?? "music";
        const list = await searchTracks(query.trim() || cat);
        setTracks(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "مكتبة الموسيقى مش متاحة");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, category, visible]);

  useEffect(() => {
    if (!playing) return;
    try {
      player.play();
    } catch {
      // المشغل هيعرض خطأ لو الرابط مش شغال
    }
  }, [playing, player]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>موسيقى</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="دوّر على أغنية أو فنان…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.cat, category === c.key && styles.catOn]}>
                <Text style={[styles.catText, category === c.key && { color: colors.ink }]}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {loading && <ActivityIndicator color={colors.goldText} style={{ marginVertical: 16 }} />}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {tracks.map((t) => {
              const isPlaying = playing?.id === t.id;
              return (
                <View key={t.id} style={styles.row}>
                  <Pressable style={styles.playBtn} onPress={() => setPlaying(isPlaying ? null : t)}>
                    <Ionicons name={isPlaying && status.playing ? "pause" : "play"} size={16} color={colors.ink} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.trackTitle}>{t.title}</Text>
                    <Text numberOfLines={1} style={styles.trackArtist}>{t.artist}</Text>
                  </View>
                  <Pressable style={styles.useBtn} onPress={() => onPick(t)}>
                    <Text style={styles.useText}>استخدم</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.foot}>المعاينات من مكتبة Deezer المفتوحة — ٣٠ ثانية لكل مقطع.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 14, gap: 10, maxHeight: "88%" },
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 17, fontWeight: "900", fontFamily: "Cairo_900Black" },
  input: { color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, textAlign: "right", backgroundColor: colors.surface },
  cats: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 },
  cat: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: colors.surface },
  catOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  catText: { color: colors.text, fontSize: 11.5 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  trackTitle: { color: colors.text, fontSize: 12.5, textAlign: "right" },
  trackArtist: { color: colors.muted, fontSize: 11, textAlign: "right" },
  useBtn: { borderWidth: 1, borderColor: colors.goldText, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  useText: { color: colors.goldText, fontSize: 11.5, fontWeight: "800" },
  error: { color: colors.red, fontSize: 11.5, textAlign: "center" },
  foot: { color: colors.muted, fontSize: 10, textAlign: "center" },
});
