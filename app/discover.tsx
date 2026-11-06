import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Avatar, VerificationBadge } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";

import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
type Tab = "people" | "posts" | "clips" | "councils" | "tags" | "voices";
const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "people", label: "ناس", emoji: "👤" },
  { key: "posts", label: "منشورات", emoji: "✍️" },
  { key: "clips", label: "لقطات", emoji: "🎬" },
  { key: "councils", label: "مجالس", emoji: "🎧" },
  { key: "tags", label: "وسوم", emoji: "#" },
  { key: "voices", label: "أصوات", emoji: "🎙" },
];

type Person = { id: string; username: string; display_name: string | null; is_verified: boolean | null; verification_tone: string | null };
type Post = { id: string; body: string; media_type: string | null };
type Council = { id: string; title: string; status: string | null };
type HistoryItem = { id: string; term: string; tab: string };

/**
 * اكتشف — القسم 28 من دليل الهوية.
 * «دوّر على ناس» + تبويبات النتائج: ناس · منشورات · لقطات · مجالس · وسوم · أصوات
 * + آخر ما دوّرت عليه (مع مسح فردي أو كلي) + اقتراحات أثناء الكتابة.
 */
export default function DiscoverScreen() {
  useThemeContext();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [councils, setCouncils] = useState<Council[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggested, setSuggested] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const loadHistory = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("search_history")
      .select("id, term, tab")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(12);
    setHistory((data ?? []) as HistoryItem[]);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!active) return;
      setMe(uid);
      if (uid) await loadHistory(uid);

      // suggestions: newest profiles that are not me
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, is_verified, verification_tone")
        .neq("id", uid ?? "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(8);
      if (active) setSuggested((data ?? []) as Person[]);
    })();
    return () => {
      active = false;
    };
  }, [loadHistory]);

  const search = useCallback(
    async (query: string, which: Tab) => {
      const q = query.trim();
      if (q.length < 1) return;
      setLoading(true);
      try {
        if (which === "people") {
          const { data } = await supabase
            .from("profiles")
            .select("id, username, display_name, is_verified, verification_tone")
            .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
            .limit(25);
          setPeople((data ?? []) as Person[]);
        } else if (which === "posts" || which === "clips" || which === "voices" || which === "tags") {
          const { data } = await supabase
            .from("posts")
            .select("id, body, media_type")
            .ilike("body", `%${q}%`)
            .limit(25);
          let rows = (data ?? []) as Post[];
          if (which === "clips") rows = rows.filter((r) => r.media_type?.startsWith("video"));
          if (which === "voices") rows = rows.filter((r) => r.media_type?.startsWith("audio"));
          setPosts(rows);
        } else {
          const { data } = await supabase
            .from("majlis_rooms")
            .select("id, title, status")
            .ilike("title", `%${q}%`)
            .limit(25);
          setCouncils((data ?? []) as Council[]);
        }

        if (me) {
          await supabase.from("search_history").insert({ user_id: me, term: q, tab: which });
          await loadHistory(me);
        }
      } finally {
        setLoading(false);
      }
    },
    [me, loadHistory]
  );

  async function clearHistory(id?: string) {
    if (!me) return;
    if (id) await supabase.from("search_history").delete().eq("id", id).eq("user_id", me);
    else await supabase.from("search_history").delete().eq("user_id", me);
    await loadHistory(me);
  }

  const showResults = term.trim().length > 0;

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>اكتشف</Text>
        </View>

        <View style={styles.searchBox}>
          <Pressable onPress={() => search(term, tab)} hitSlop={8}>
            <Ionicons name="search" size={20} color={colors.goldText} />
          </Pressable>
          <TextInput
            value={term}
            onChangeText={setTerm}
            onSubmitEditing={() => search(term, tab)}
            placeholder="اسم المستخدم أو الاسم الظاهر"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          <Pressable onPress={() => {}} hitSlop={8}>
            <Ionicons name="mic-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => { setTab(t.key); if (term.trim()) search(term, t.key); }}
              style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && <ActivityIndicator color={colors.goldText} />}

        {!showResults && (
          <>
            <Text style={styles.sectionLabel}>آخر ما دوّرت عليه</Text>
            {history.length === 0 ? (
              <Text style={styles.empty}>لسه ما دوّرتش على حاجة</Text>
            ) : (
              <View style={styles.historyWrap}>
                {history.map((h) => (
                  <Pressable
                    key={h.id}
                    style={styles.historyChip}
                    onPress={() => { setTerm(h.term); search(h.term, tab); }}
                  >
                    <Text style={styles.historyText}>{h.term}</Text>
                    <Pressable onPress={() => clearHistory(h.id)} hitSlop={8}>
                      <Ionicons name="close" size={14} color={colors.muted} />
                    </Pressable>
                  </Pressable>
                ))}
                <Pressable onPress={() => clearHistory()} style={styles.clearAll}>
                  <Text style={styles.clearAllText}>امسح الكل</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionLabel}>ناس ممكن تعرفهم</Text>
            {suggested.map((p) => (
              <PersonRow key={p.id} person={p} onOpen={() => router.push({ pathname: "/user/[id]", params: { id: p.id } })} />
            ))}
          </>
        )}

        {showResults && tab === "people" && (
          people.length === 0 ? <Text style={styles.empty}>مفيش نتايج بالاسم ده</Text> :
            people.map((p) => (
              <PersonRow key={p.id} person={p} onOpen={() => router.push({ pathname: "/user/[id]", params: { id: p.id } })} />
            ))
        )}

        {showResults && (tab === "posts" || tab === "clips" || tab === "voices" || tab === "tags") && (
          posts.length === 0 ? <Text style={styles.empty}>مفيش نتايج هنا</Text> :
            posts.map((p) => (
              <View key={p.id} style={styles.resultCard}>
                <Text numberOfLines={3} style={styles.resultBody}>{p.body}</Text>
                {!!p.media_type && <Text style={styles.resultMeta}>{p.media_type}</Text>}
              </View>
            ))
        )}

        {showResults && tab === "councils" && (
          councils.length === 0 ? <Text style={styles.empty}>مفيش مجالس بالاسم ده</Text> :
            councils.map((c) => (
              <Pressable
                key={c.id}
                style={styles.resultCard}
                onPress={() => router.push({ pathname: "/council/[id]", params: { id: c.id, name: c.title } })}
              >
                <Text style={styles.resultBody}>🎧 {c.title}</Text>
                <Text style={styles.resultMeta}>{c.status === "live" ? "مباشر" : c.status === "scheduled" ? "مجدول" : "منتهي"}</Text>
              </Pressable>
            ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function PersonRow({ person, onOpen }: { person: Person; onOpen: () => void }) {
  const [state, setState] = useState<"idle" | "sent" | "friend" | "busy">("idle");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || !active) return;
      const { data: fr } = await supabase
        .from("friends")
        .select("user_a")
        .or(`and(user_a.eq.${uid},user_b.eq.${person.id}),and(user_a.eq.${person.id},user_b.eq.${uid})`)
        .maybeSingle();
      if (fr) return setState("friend");
      const { data: req } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("from_user", uid)
        .eq("to_user", person.id)
        .eq("status", "pending")
        .maybeSingle();
      if (req) setState("sent");
    })();
    return () => {
      active = false;
    };
  }, [person.id]);

  async function addFriend() {
    if (state !== "idle") return;
    setState("busy");
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return setState("idle");
    const { error } = await supabase.from("friend_requests").insert({ from_user: uid, to_user: person.id });
    if (error) {
      setState("idle");
      Alert.alert("مش تم", error.message);
      return;
    }
    setState("sent");
  }

  return (
    <Pressable style={styles.personRow} onPress={onOpen}>
      <Avatar initial={(person.display_name ?? person.username)[0]} color={colors.surface3} size={44} />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.personName}>{person.display_name ?? person.username}</Text>
          {person.is_verified && <VerificationBadge tone={(person.verification_tone as "yellow") ?? "yellow"} small />}
        </View>
        <Text style={styles.personHandle}>@{person.username}</Text>
      </View>
      <Pressable style={[styles.addBtn, state !== "idle" && styles.addBtnDone]} onPress={addFriend}>
        <Text style={[styles.addText, state !== "idle" && { color: colors.muted }]}>
          {state === "friend" ? "صديق" : state === "sent" ? "اتبعتها" : state === "busy" ? "…" : "ضيف صديق"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  title: { color: colors.text, fontSize: 22, fontFamily: "Cairo_900Black", fontWeight: "900" },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, textAlign: "right", fontSize: 14 },
  tabRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.gold, borderColor: colors.goldText },
  tabText: { color: colors.muted, fontSize: 12 },
  tabTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 6 },
  historyWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  historyChip: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.surface2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  historyText: { color: colors.text, fontSize: 12 },
  clearAll: { paddingHorizontal: 12, paddingVertical: 8 },
  clearAllText: { color: colors.red, fontSize: 12 },
  personRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  personName: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14 },
  personHandle: { color: colors.muted, fontSize: 11, textAlign: "right" },
  addBtn: { backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  addText: { color: colors.ink, fontSize: 11, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  addBtnDone: { backgroundColor: colors.surface3 },
  resultCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  resultBody: { color: colors.text, fontSize: 13, textAlign: "right" },
  resultMeta: { color: colors.muted, fontSize: 10, textAlign: "right" },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
})));
