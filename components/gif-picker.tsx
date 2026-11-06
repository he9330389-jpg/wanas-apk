import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { colors } from "@/constants/wanas";

/**
 * منتقي GIF حقيقي من Giphy.
 * المفتاح بيتقرأ من app.config.ts (extra.giphyApiKey) اللي بياخده من متغيرات البناء،
 * ومش بيتكتب في الكود ولا في الريبو. لو المفتاح مش موجود بنقول للمستخدم كده
 * بوضوح بدل ما نعرض صور وهمية.
 */
type Gif = { id: string; title: string; preview: string; url: string };

const LIMIT = 24;

function giphyKey(): string {
  const extra = Constants.expoConfig?.extra as { giphyApiKey?: string } | undefined;
  return process.env.EXPO_PUBLIC_GIPHY_API_KEY || extra?.giphyApiKey || "";
}

async function fetchGifs(query: string, offset: number): Promise<{ gifs: Gif[]; error: string | null }> {
  const key = giphyKey();
  if (!key) {
    return { gifs: [], error: "مفتاح GIF مش مضبوط في نسخة البناء دي. اضبط EXPO_PUBLIC_GIPHY_API_KEY وابني نسخة جديدة." };
  }
  const base = query.trim() ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending";
  const params = new URLSearchParams({
    api_key: key,
    limit: String(LIMIT),
    offset: String(offset),
    rating: "pg-13",
    lang: "ar",
  });
  if (query.trim()) params.set("q", query.trim());
  try {
    const res = await fetch(`${base}?${params.toString()}`);
    if (!res.ok) return { gifs: [], error: `خدمة GIF ردت بخطأ (${res.status})` };
    const json = (await res.json()) as {
      data?: { id: string; title?: string; images?: { fixed_width?: { url?: string }; downsized_medium?: { url?: string }; original?: { url?: string } } }[];
    };
    const gifs = (json.data ?? [])
      .map((g) => ({
        id: g.id,
        title: g.title ?? "GIF",
        preview: g.images?.fixed_width?.url ?? g.images?.downsized_medium?.url ?? g.images?.original?.url ?? "",
        url: g.images?.downsized_medium?.url ?? g.images?.original?.url ?? g.images?.fixed_width?.url ?? "",
      }))
      .filter((g) => g.url);
    return { gifs, error: null };
  } catch (e) {
    return { gifs: [], error: e instanceof Error ? e.message : "تعذّر الاتصال بخدمة GIF" };
  }
}

export function GifPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const result = await fetchGifs(q, 0);
    setGifs(result.gifs);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => void load(query), 350);
    return () => clearTimeout(t);
  }, [visible, query, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>GIF</Text>
            <View style={{ width: 22 }} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="دوّر على GIF…"
            placeholderTextColor={colors.muted}
            style={styles.search}
            textAlign="right"
          />
          {loading && <ActivityIndicator color={colors.goldText} style={{ marginTop: 18 }} />}
          {!!error && !loading && <Text style={styles.error}>{error}</Text>}
          {!loading && !error && gifs.length === 0 && <Text style={styles.error}>مفيش نتائج.</Text>}
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={3}
            contentContainerStyle={{ gap: 6, paddingVertical: 10 }}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.cell}
                onPress={() => {
                  onPick(item.url);
                  onClose();
                }}
                accessibilityLabel={item.title}
              >
                <Image source={{ uri: item.preview }} style={styles.gif} resizeMode="cover" />
              </Pressable>
            )}
          />
          <Text style={styles.credit}>GIFs powered by GIPHY</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, height: "72%" },
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold" },
  search: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 },
  cell: { flex: 1 / 3, aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface3 },
  gif: { width: "100%", height: "100%" },
  credit: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 6 },
});
