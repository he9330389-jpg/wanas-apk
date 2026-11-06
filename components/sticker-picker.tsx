import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { signedMediaUrl } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";

/** منتقي الستيكرات — بيقرأ من `stickers` (كل الستيكرات المتاحة) وبيرجّع المسار المختار. */
export type StickerItem = { id: string; image_path: string; label: string | null; url: string | null };

export function useStickers() {
  const [items, setItems] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase.from("stickers").select("id, image_path, label").order("created_at", { ascending: false }).limit(80);
      const list = (data ?? []) as { id: string; image_path: string; label: string | null }[];
      setItems(
        await Promise.all(
          list.map(async (s) => ({ ...s, url: s.image_path.startsWith("http") ? s.image_path : await signedMediaUrl(s.image_path, 3600) })),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return { items, loading, load };
}

export function StickerPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (sticker: StickerItem) => void;
}) {
  const router = useRouter();
  const { items, loading, load } = useStickers();

  useEffect(() => {
    if (visible) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.head}>
            <Text style={styles.title}>ستيكرات</Text>
            <Pressable onPress={() => router.push("/stickers")} hitSlop={8}>
              <Text style={styles.add}>اعمل ستيكر +</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.goldText} style={{ margin: 20 }} />
          ) : items.length === 0 ? (
            <Text style={styles.empty}>لسه مفيش ستيكرات — اضغط «اعمل ستيكر» واختار صورة.</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(s) => s.id}
              numColumns={4}
              columnWrapperStyle={{ flexDirection: "row-reverse", gap: 8 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.cell}
                  onPress={() => {
                    onPick(item);
                    onClose();
                  }}
                >
                  {item.url ? <Image source={{ uri: item.url }} style={styles.img} resizeMode="contain" /> : <Ionicons name="image-outline" size={22} color={colors.muted} />}
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 28, gap: 8 },
    head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
    title: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    add: { color: colors.goldText, fontSize: 12 },
    cell: { flex: 1, aspectRatio: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: 5 },
    img: { width: "100%", height: "100%" },
    empty: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 20 },
  }),
);
