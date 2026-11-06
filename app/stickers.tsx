import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, signedMediaUrl } from "@/lib/media";
import { uploadWithProgress } from "@/lib/upload";
import { myId } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * الستيكرات — بتتعمل من صورة من جهازك، بتتخزن في التخزين الخاص وسطرها في `stickers`،
 * وبتتاح في التعليقات والرسائل (مكوّن StickerPicker).
 */
type Sticker = { id: string; label: string | null; image_path: string; owner_id: string; url?: string | null };

export default function StickersScreen() {
  useThemeContext();
  const router = useRouter();
  const [rows, setRows] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [uid, setUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await myId();
      setUid(me);
      const { data } = await supabase.from("stickers").select("id, label, image_path, owner_id").order("created_at", { ascending: false }).limit(80);
      const list = (data ?? []) as Sticker[];
      const withUrls = await Promise.all(
        list.map(async (s) => ({ ...s, url: s.image_path.startsWith("http") ? s.image_path : await signedMediaUrl(s.image_path, 3600) })),
      );
      setRows(withUrls);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSticker() {
    if (!uid) {
      Alert.alert("محتاج تسجيل دخول", "سجّل دخولك الأول.");
      return;
    }
    const picked = await pickImage();
    if (!picked) return;
    setBusy(true);
    try {
      const path = await uploadWithProgress(uid, picked);
      const { error } = await supabase.from("stickers").insert({ owner_id: uid, image_path: path, label: label.trim() || null });
      if (error) throw error;
      setLabel("");
      await load();
    } catch (e) {
      Alert.alert("الستيكر مش اتحفظ", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("stickers").delete().eq("id", id);
    if (error) {
      Alert.alert("مقدرناش نحذفه", error.message);
      return;
    }
    setRows((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>الستيكرات</Text>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <TextInput value={label} onChangeText={setLabel} placeholder="اسم الستيكر (اختياري)" placeholderTextColor={colors.muted} style={styles.input} />
        <Pressable style={styles.primary} onPress={addSticker} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : (
            <>
              <Ionicons name="add" size={20} color={colors.ink} />
              <Text style={styles.primaryText}>اعمل ستيكر من صورة</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>الستيكرات بتظهر في التعليقات والرسائل — وبتقدر تحذف ستيكراتك في أي وقت.</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          numColumns={3}
          columnWrapperStyle={{ flexDirection: "row-reverse", gap: 8 }}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>لسه مفيش ستيكرات — ابدأ بصورة تعجبك.</Text>}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              {item.url ? <Image source={{ uri: item.url }} style={styles.img} resizeMode="contain" /> : <Ionicons name="image-outline" size={30} color={colors.muted} />}
              {!!item.label && <Text numberOfLines={1} style={styles.cellLabel}>{item.label}</Text>}
              {item.owner_id === uid && (
                <Pressable style={styles.remove} onPress={() => remove(item.id)} hitSlop={6}>
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 12, textAlign: "right" },
    primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 14, height: 46 },
    primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    hint: { color: colors.muted, fontSize: 11, textAlign: "right", lineHeight: 17 },
    cell: { flex: 1, aspectRatio: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: 6 },
    img: { width: "100%", height: "80%" },
    cellLabel: { color: colors.muted, fontSize: 9.5 },
    remove: { position: "absolute", top: 4, left: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 9, padding: 2 },
    empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 20 },
  }),
);
