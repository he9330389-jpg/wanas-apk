import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Avatar } from "@/components/wanas-ui";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { myId } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** الأصدقاء — أصدقائي · طلبات واردة · اقتراحات. كل زرار بيعمل عملية حقيقية في `friends`/`friend_requests`. */
type Person = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
type Tab = "friends" | "requests" | "suggest";

export default function FriendsScreen() {
  useThemeContext();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friends, setFriends] = useState<Person[]>([]);
  const [requests, setRequests] = useState<{ id: string; requester: Person }[]>([]);
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = await myId();
    if (!uid) return;
    try {
      const [fr, rq, profs] = await Promise.all([
        supabase.from("friends").select("user_a, user_b").or(`user_a.eq.${uid},user_b.eq.${uid}`).limit(500),
        supabase.from("friend_requests").select("id, from_user").eq("to_user", uid).eq("status", "pending").limit(100),
        supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", uid).limit(80),
      ]);
      const friendIds = (fr.data ?? []).map((r: { user_a: string; user_b: string }) => (r.user_a === uid ? r.user_b : r.user_a));
      const byId = new Map<string, Person>(((profs.data ?? []) as Person[]).map((p) => [p.id, p]));
      setFriends(friendIds.map((id) => byId.get(id)).filter(Boolean) as Person[]);
      setRequests(
        (rq.data ?? []).map((r: { id: string; from_user: string }) => ({
          id: r.id,
          requester: byId.get(r.from_user) ?? { id: r.from_user, username: null, display_name: null, avatar_url: null },
        })),
      );
      const friendSet = new Set(friendIds);
      setSuggestions(((profs.data ?? []) as Person[]).filter((p) => !friendSet.has(p.id)).slice(0, 40));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addFriend(person: Person) {
    const uid = await myId();
    if (!uid) return;
    setBusyId(person.id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("send_friend_request", { p_to_user: person.id });
      if (error) throw error;
      setNotice(`اتبعت طلب صداقة لـ ${person.display_name ?? person.username ?? "المستخدم"}`);
      setSuggestions((prev) => prev.filter((p) => p.id !== person.id));
    } catch (e) {
      Alert.alert("الطلب مش اتبعت", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusyId(null);
    }
  }

  async function respond(reqId: string, accept: boolean) {
    setBusyId(reqId);
    try {
      const { error } = await supabase.rpc("respond_friend_request", { p_request_id: reqId, p_status: accept ? "accepted" : "declined" });
      if (error) throw error;
      setRequests((prev) => prev.filter((r) => r.id !== reqId));
      await load();
    } catch (e) {
      Alert.alert("مقدرناش ننفّذ", e instanceof Error ? e.message : "جرّب تاني");
    } finally {
      setBusyId(null);
    }
  }

  const data: Person[] = tab === "friends" ? friends : tab === "suggest" ? suggestions : requests.map((r) => r.requester);

  return (
    <ScreenShell>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/guide"))} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>الأصدقاء</Text>
      </View>
      <View style={styles.tabs}>
        {([
          ["friends", `أصدقائي (${friends.length})`],
          ["requests", `طلبات (${requests.length})`],
          ["suggest", "اقتراحات"],
        ] as [Tab, string][]).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {loading ? (
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.goldText} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "friends" ? "لسه مفيش أصدقاء — ابعت طلب من «اقتراحات»." : tab === "requests" ? "مفيش طلبات صداقة دلوقتي." : "مفيش اقتراحات جديدة."}
            </Text>
          }
          renderItem={({ item }) => {
            const req = requests.find((r) => r.requester.id === item.id);
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/user/${item.id}`)}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <Avatar initial={(item.display_name ?? item.username ?? "و")[0]} color={colors.surface3} size={44} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.display_name ?? item.username ?? "مستخدم ونس"}</Text>
                  <Text style={styles.handle}>@{item.username ?? "—"}</Text>
                </View>
                {tab === "requests" && req ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.accept} onPress={() => respond(req.id, true)} disabled={busyId === req.id}>
                      <Text style={styles.acceptText}>قبول</Text>
                    </Pressable>
                    <Pressable style={styles.reject} onPress={() => respond(req.id, false)} disabled={busyId === req.id}>
                      <Text style={styles.rejectText}>رفض</Text>
                    </Pressable>
                  </View>
                ) : tab === "suggest" ? (
                  <Pressable style={styles.accept} onPress={() => addFriend(item)} disabled={busyId === item.id}>
                    {busyId === item.id ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.acceptText}>ضيف صديق</Text>}
                  </Pressable>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 20, fontFamily: "Cairo_900Black", fontWeight: "900" },
    tabs: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16 },
    tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface },
    tabActive: { backgroundColor: colors.gold },
    tabText: { color: colors.muted, fontSize: 12 },
    tabTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    notice: { color: colors.green, fontSize: 12, textAlign: "right", paddingHorizontal: 18, paddingTop: 8 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    name: { color: colors.text, fontSize: 13.5, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    handle: { color: colors.muted, fontSize: 11, textAlign: "right" },
    actions: { flexDirection: "row-reverse", gap: 6 },
    accept: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    acceptText: { color: colors.ink, fontSize: 11.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    reject: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    rejectText: { color: colors.muted, fontSize: 11.5 },
    empty: { color: colors.muted, fontSize: 12.5, textAlign: "center", marginTop: 30 },
  }),
);
