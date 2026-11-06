import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Header } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, uploadMedia } from "@/lib/media";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
type Stamp = {
  id: string;
  owner_id: string;
  name: string;
  image_url: string;
  sound_url: string | null;
  is_public: boolean;
  pack: string;
  emoji: string | null;
  color: string | null;
};

const PACKS = [
  { key: "mine", label: "أختامي" },
  { key: "wanas", label: "أختام ونس" },
  { key: "moods", label: "مشاعر" },
  { key: "occasions", label: "مناسبات" },
];

/**
 * الأختام وصانع الأختام — القسم 19 من دليل الهوية.
 * «اصنع ختمك من أي صورة» — نختار صورة، نرفعها، ونحفظها كختم خاص
 * أو نشاركها في حزمة عامة بعد المراجعة.
 */
export default function StampsScreen() {
  useThemeContext();
  const router = useRouter();
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [pack, setPack] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{ uri: string; mime: string; name: string } | null>(null);
  const [makePublic, setMakePublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      const { data, error: err } = await supabase
        .from("stamps")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(120);
      if (err) throw err;
      setStamps((data ?? []) as Stamp[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الأختام");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function chooseImage() {
    const m = await pickImage();
    if (m) setPicked({ uri: m.uri, mime: m.mime, name: m.name });
  }

  async function createStamp() {
    if (!me || !picked) return;
    if (name.trim().length < 1) {
      setError("اكتب اسم للختم");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const path = await uploadMedia(me, { ...picked, kind: "stamp", size: undefined });
      const { error: err } = await supabase.from("stamps").insert({
        owner_id: me,
        name: name.trim(),
        image_url: path,
        pack: makePublic ? "wanas" : "mine",
        is_public: makePublic,
      });
      if (err) throw err;
      setName("");
      setPicked(null);
      setMakePublic(false);
      setPack(makePublic ? "wanas" : "mine");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إنشاء الختم");
    } finally {
      setCreating(false);
    }
  }

  async function toggleShare(s: Stamp) {
    const { error: err } = await supabase
      .from("stamps")
      .update({ is_public: !s.is_public, pack: !s.is_public ? "wanas" : "mine" })
      .eq("id", s.id);
    if (err) {
      Alert.alert("تعذّر التعديل", err.message);
      return;
    }
    await load();
  }

  async function remove(s: Stamp) {
    const { error: err } = await supabase.from("stamps").delete().eq("id", s.id);
    if (err) {
      Alert.alert("تعذّر الحذف", err.message);
      return;
    }
    await load();
  }

  const visible = stamps.filter((s) => {
    if (pack === "mine") return s.owner_id === me;
    if (pack === "wanas") return s.is_public;
    return s.pack === pack;
  });

  return (
    <ScreenShell>
      <Header title="الأختام" action="رجوع" onAction={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
        {/* Stamp maker */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏷 اصنع ختمك</Text>
          <Text style={styles.cardHint}>من أي صورة — حط اسم وسيب الباقي علينا</Text>

          <Pressable style={styles.picker} onPress={chooseImage}>
            {picked ? (
              <Image source={{ uri: picked.uri }} style={styles.pickedImg} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={34} color={colors.goldText} />
                <Text style={styles.pickerText}>اختار صورة</Text>
              </>
            )}
          </Pressable>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="اسم الختم (مثال: ونسّتني)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={60}
          />

          <Pressable style={styles.toggleRow} onPress={() => setMakePublic((v) => !v)}>
            <View style={[styles.checkbox, makePublic && styles.checkboxOn]}>
              {makePublic && <Ionicons name="checkmark" size={14} color={colors.ink} />}
            </View>
            <Text style={styles.toggleText}>شاركه في حزمة ونس العامة (يخضع للمراجعة)</Text>
          </Pressable>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.primaryBtn, (!picked || creating) && { opacity: 0.5 }]}
            onPress={createStamp}
            disabled={!picked || creating}
          >
            {creating ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>احفظ الختم</Text>}
          </Pressable>
        </View>

        {/* Packs */}
        <View style={styles.packRow}>
          {PACKS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPack(p.key)}
              style={[styles.packChip, pack === p.key && styles.packChipActive]}
            >
              <Text style={[styles.packText, pack === p.key && styles.packTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading && <ActivityIndicator color={colors.goldText} />}

        {!loading && visible.length === 0 && (
          <Text style={styles.empty}>مفيش أختام هنا لسه — اصنع أول ختم ليك 🏷</Text>
        )}

        <View style={styles.grid}>
          {visible.map((s) => (
            <View key={s.id} style={styles.stampCard}>
              <StampImage path={s.image_url} />
              <Text numberOfLines={1} style={styles.stampName}>{s.name}</Text>
              {s.owner_id === me && (
                <View style={styles.stampActions}>
                  <Pressable onPress={() => toggleShare(s)} hitSlop={8}>
                    <Ionicons
                      name={s.is_public ? "earth" : "share-social-outline"}
                      size={16}
                      color={s.is_public ? colors.green : colors.muted}
                    />
                  </Pressable>
                  <Pressable onPress={() => remove(s)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={colors.red} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function StampImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
      if (data?.signedUrl && active) setUrl(data.signedUrl);
    })();
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return <View style={[styles.stampImg, { backgroundColor: colors.surface3 }]} />;
  return <Image source={{ uri: url }} style={styles.stampImg} resizeMode="cover" />;
}

const styles = themedStyles(() => (StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
  cardHint: { color: colors.muted, fontSize: 12, textAlign: "right" },
  picker: { height: 140, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  pickerText: { color: colors.muted, fontSize: 13 },
  pickedImg: { width: "100%", height: "100%" },
  input: { backgroundColor: colors.surface2, borderRadius: 14, padding: 14, color: colors.text, textAlign: "right", borderWidth: 1, borderColor: colors.border },
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.gold, borderColor: colors.goldText },
  toggleText: { color: colors.muted, fontSize: 12, flex: 1, textAlign: "right" },
  primaryBtn: { backgroundColor: colors.gold, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 15 },
  packRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  packChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  packChipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  packText: { color: colors.muted, fontSize: 12 },
  packTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  stampCard: { width: "30%", backgroundColor: colors.surface, borderRadius: 16, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  stampImg: { width: 72, height: 72, borderRadius: 14 },
  stampName: { color: colors.text, fontSize: 11, textAlign: "center" },
  stampActions: { flexDirection: "row", gap: 12 },
  error: { color: colors.red, fontSize: 12, textAlign: "right" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 20 },
})));