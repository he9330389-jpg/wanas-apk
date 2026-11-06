import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Avatar } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { supabase } from "@/lib/supabase";
import { pickImage, publicMediaUrl } from "@/lib/media";
import { PostCard, type FeedPost } from "@/components/post-card";
import { uploadWithProgress } from "@/lib/upload";
import { getProfile, updateProfile, myEarnings, friendsCount, type PublicProfile, TONES, TONE_LABELS } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/**
 * الملف الشخصي (ركن) — القسم 29/30 من الدليل:
 * الغلاف والصورة والاسم والنبذة والرابط والمدينة والعمل والتعليم، شارة التوثيق،
 * أزرار القصة ولوحة المعلومات، ونظام الربح (هدايا ونقاط ونس) مع سجل الأرباح.
 */
const AUDIENCES = [
  { key: "public", label: "للجميع" },
  { key: "friends", label: "للأصدقاء" },
  { key: "private", label: "ليا لوحدي" },
];

export default function ProfileTab() {
  useThemeContext();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0, friends: 0 });
  const [earnings, setEarnings] = useState<{ total: number; rows: number }>({ total: 0, rows: 0 });
  const [pendingVerification, setPendingVerification] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id ?? null;
      setUid(id);
      if (!id) return;
      const p = await getProfile(id);
      setProfile(p);
      const [posts, followers, following, friends, money, vr] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", id).is("deleted_at", null),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", id),
        supabase.from("follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", id),
        friendsCount(id),
        myEarnings(id),
        supabase.from("verification_requests").select("id").eq("user_id", id).eq("status", "pending").limit(1),
      ]);
      setStats({
        posts: posts.count ?? 0,
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        friends,
      });
      setEarnings({ total: money.total, rows: money.rows.length });
      setPendingVerification((vr.data?.length ?? 0) > 0);
      setAvatarUrl(publicMediaUrl(p?.avatar_url));
      setCoverUrl(publicMediaUrl(p?.cover_url));
      // منشوراتي في ركني — زي الفيسبوك: كل اللي نشرته يظهر هنا الأحدث الأول
      const { data: myPosts } = await supabase
        .from("posts")
        .select("id, author_id, body, media_type, media_url, created_at, likes_count, comments_count, allow_comments, archived_at, profiles!posts_author_id_fkey(username, display_name, is_verified, verification_tone)")
        .eq("author_id", id)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setMyPosts((myPosts ?? []) as unknown as FeedPost[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeImage(kind: "avatar" | "cover") {
    if (!uid) return;
    const picked = await pickImage();
    if (!picked) return;
    try {
      const path = await uploadWithProgress(uid, picked);
      await updateProfile(uid, kind === "avatar" ? { avatar_url: path } : { cover_url: path });
      await load();
    } catch (e) {
      Alert.alert("مقدرناش نرفع الصورة", e instanceof Error ? e.message : "جرّب تاني");
    }
  }

  if (loading) {
    return (
      <ScreenShell>
        <ActivityIndicator color={colors.goldText} style={{ marginTop: 60 }} />
      </ScreenShell>
    );
  }

  const name = profile?.display_name || profile?.username || "بدون اسم";

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.goldText}
          />
        }
      >
        {/* الغلاف */}
        <View style={styles.coverBox}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverEmpty]} />
          )}
          <Pressable style={styles.coverEdit} onPress={() => changeImage("cover")}>
            <Ionicons name="camera-outline" size={16} color="#fff" />
            <Text style={styles.coverEditText}>غيّر الغلاف</Text>
          </Pressable>
          <Pressable style={styles.topAction} onPress={() => router.push("/guide")}>
            <Ionicons name="menu" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* الصورة والاسم: الصورة بس هي اللي بتدخل على الغلاف، والاسم تحت الغلاف كله */}
        <View style={styles.identity}>
          <Pressable onPress={() => changeImage("avatar")} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Avatar initial={name[0]} color={colors.surface3} size={84} />
            )}
            <View style={styles.avatarEdit}>
              <Ionicons name="camera" size={13} color={colors.ink} />
            </View>
          </Pressable>
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {profile?.is_verified ? <VerificationBadge tone={profile.verification_tone ?? "yellow"} size={18} /> : null}
            </View>
            <Text style={styles.handle} numberOfLines={1}>@{profile?.username ?? "—"}</Text>
            {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            {!!profile?.link_url && (
              <Pressable onPress={() => router.push("/account")}>
                <Text style={styles.link}>🔗 {profile.link_url}</Text>
              </Pressable>
            )}
          </View>
        </View>
        {/* الأرقام */}
        <View style={styles.statsCard}>
          <Stat label="منشور" value={stats.posts} />
          <Stat label="متابع" value={stats.followers} />
          <Stat label="يتابع" value={stats.following} />
          <Stat label="صديق" value={stats.friends} />
        </View>

        {/* الأزرار */}
        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={() => setEditOpen(true)}>
            <Ionicons name="create-outline" size={18} color={colors.ink} />
            <Text style={styles.primaryText}>عدّل ركنك</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/story/new")}>
            <Ionicons name="add-circle-outline" size={18} color={colors.goldText} />
            <Text style={styles.secondaryText}>ضيف لقصتك</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/creator")}>
            <Ionicons name="stats-chart-outline" size={18} color={colors.goldText} />
            <Text style={styles.secondaryText}>لوحة المعلومات</Text>
          </Pressable>
        </View>

        {/* اختصارات الركن: إنجازاتي · الزوار · بطاقتي · لوحة المعلومات */}
        <View style={styles.tiles}>
          {([
            { icon: "trophy-outline", label: "إنجازاتي", to: "/medals" },
            { icon: "eye-outline", label: "الزوار", to: "/visitors" },
            { icon: "qr-code-outline", label: "بطاقتي", to: "/my-card" },
            { icon: "stats-chart-outline", label: "لوحة المعلومات", to: "/creator" },
          ] as const).map((t) => (
            <Pressable key={t.to} style={styles.tile} onPress={() => router.push(t.to as never)} accessibilityRole="button">
              <Ionicons name={t.icon} size={22} color={colors.goldText} />
              <Text style={styles.tileText}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/ideas" as never)}>
          <Ionicons name="sparkles-outline" size={20} color={colors.goldText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>أفكار جديدة لونس</Text>
            <Text style={styles.rowSub}>لحظات مميزة · الدائرة القريبة · الإنجازات · الحالة المؤقتة</Text>
          </View>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>

        {/* التوثيق */}
        <Pressable style={styles.row} onPress={() => setVerifyOpen(true)}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.goldText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>التوثيق وشارات ونس</Text>
            <Text style={styles.rowSub}>
              {profile?.is_verified
                ? `موثّق · ${TONE_LABELS[profile.verification_tone ?? "yellow"] ?? "شارة ذهبية"}`
                : pendingVerification
                  ? "طلبك تحت المراجعة"
                  : "اطلب التوثيق — الشارة بتتحط بعد المراجعة فقط"}
            </Text>
          </View>
          {profile?.is_verified ? (
            <VerificationBadge tone={profile.verification_tone ?? "yellow"} size={20} />
          ) : (
            <Ionicons name="chevron-back" size={16} color={colors.muted} />
          )}
        </Pressable>

        {/* الربح */}
        <Pressable style={styles.row} onPress={() => router.push("/earnings")}>
          <Ionicons name="cash-outline" size={20} color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>نظام الربح ونقاط ونس</Text>
            <Text style={styles.rowSub}>
              {earnings.total > 0
                ? `رصيدك ${earnings.total.toFixed(2)} جنيه من ${earnings.rows} هدية`
                : "لسه مفيش أرباح — الهدايا اللي بتوصلك بتتحول لرصيد"}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>

        {/* قسم التفاصيل */}
        <Text style={styles.sectionLabel}>التفاصيل</Text>
        <Detail icon="location-outline" label="المدينة" value={profile?.city} onPress={() => setEditOpen(true)} />
        <Detail icon="briefcase-outline" label="العمل" value={profile?.work} onPress={() => setEditOpen(true)} />
        <Detail icon="school-outline" label="التعليم" value={profile?.education} onPress={() => setEditOpen(true)} />
        <Detail icon="heart-outline" label="الحالة الاجتماعية" value={profile?.social_status} onPress={() => setEditOpen(true)} />
        {!!profile?.interests?.length && (
          <View style={styles.interests}>
            {profile.interests.map((i) => (
              <Text key={i} style={styles.chip}>{i}</Text>
            ))}
          </View>
        )}
        <Pressable style={styles.row} onPress={() => router.push(`/user/${uid}`)}>
          <Ionicons name="eye-outline" size={20} color={colors.text} />
          <Text style={styles.rowTitle}>اعرض ركنك زي ما الناس شايفاه</Text>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/account")}>
          <Ionicons name="person-circle-outline" size={20} color={colors.text} />
          <Text style={styles.rowTitle}>الحساب وبياناتي</Text>
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
        {/* منشوراتي */}
        <Text style={styles.sectionLabel}>منشوراتي</Text>
        {myPosts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <Ionicons name="create-outline" size={22} color={colors.muted} />
            <Text style={styles.emptyPostsText}>لسه مفيش منشورات — أول حاجة تنشرها هتظهر هنا وفي آخر الأخبار.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push("/post/new")}>
              <Ionicons name="add" size={18} color={colors.ink} />
              <Text style={styles.primaryText}>اكتب منشور</Text>
            </Pressable>
          </View>
        ) : (
          myPosts.map((item) => <PostCard key={item.id} post={item} />)
        )}
      </ScrollView>

      {uid && (
        <EditSheet
          visible={editOpen}
          uid={uid}
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await load();
          }}
        />
      )}
      {uid && (
        <VerifySheet
          visible={verifyOpen}
          uid={uid}
          onClose={() => setVerifyOpen(false)}
          onSent={() => {
            setPendingVerification(true);
            setVerifyOpen(false);
          }}
        />
      )}
    </ScreenShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Detail({ icon, label, value, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value?: string | null; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.rowValue}>{value || "عيّن"}</Text>
    </Pressable>
  );
}

function EditSheet({
  visible,
  uid,
  profile,
  onClose,
  onSaved,
}: {
  visible: boolean;
  uid: string;
  profile: PublicProfile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [link, setLink] = useState(profile?.link_url ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [work, setWork] = useState(profile?.work ?? "");
  const [education, setEducation] = useState(profile?.education ?? "");
  const [status, setStatus] = useState(profile?.social_status ?? "");
  const [audience, setAudience] = useState(profile?.default_audience ?? "public");
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const INTEREST_OPTIONS = ["موسيقى", "أفلام", "ألعاب", "رياضة", "قراية", "سفر", "طبخ", "تصوير"];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile(uid, {
        display_name: name.trim() || null,
        bio: bio.trim() || null,
        link_url: link.trim() || null,
        city: city.trim() || null,
        work: work.trim() || null,
        education: education.trim() || null,
        social_status: status.trim() || null,
        default_audience: audience,
        interests,
        updated_at: new Date().toISOString(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "الحفظ فشل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.sheetTitle}>عدّل ركنك</Text>
            <Pressable onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.goldText} /> : <Text style={styles.save}>حفظ</Text>}
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <Field label="الاسم الظاهر" value={name} onChange={setName} />
            <Field label="نبذة مختصرة" value={bio} onChange={setBio} multiline />
            <Field label="رابط خارجي" value={link} onChange={setLink} />
            <Field label="المدينة" value={city} onChange={setCity} />
            <Field label="العمل" value={work} onChange={setWork} />
            <Field label="التعليم" value={education} onChange={setEducation} />
            <Field label="الحالة الاجتماعية" value={status} onChange={setStatus} />
            <Text style={styles.fieldLabel}>الافتراضي لمنشوراتك الجديدة</Text>
            <View style={styles.chipRow}>
              {AUDIENCES.map((a) => (
                <Pressable key={a.key} onPress={() => setAudience(a.key)} style={[styles.chip, audience === a.key && styles.chipActive]}>
                  <Text style={[styles.chipText, audience === a.key && styles.chipTextActive]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>الاهتمامات</Text>
            <View style={styles.chipRow}>
              {INTEREST_OPTIONS.map((i) => {
                const on = interests.includes(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() => setInterests((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))}
                    style={[styles.chip, on && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{i}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

function VerifySheet({ visible, uid, onClose, onSent }: { visible: boolean; uid: string; onClose: () => void; onSent: () => void }) {
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (reason.trim().length < 10) {
      setError("اكتب سبب واضح (10 حروف على الأقل) عشان المراجعة.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("verification_requests").insert({ user_id: uid, reason: reason.trim(), link_url: link.trim() || null });
      if (err) throw err;
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "مقدرناش نبعت الطلب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.sheetTitle}>طلب توثيق</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }}>
            <Text style={styles.hint}>
              الشارات الستة (أحمر · برتقالي · أخضر · أزرق · أصفر · بنفسجي) بتتحط بعد مراجعة الطلب فقط — مفيش حد يقدر يزوّرها من التطبيق.
            </Text>
            <View style={styles.toneRow}>
              {TONES.map((t) => (
                <View key={t} style={{ alignItems: "center", gap: 4 }}>
                  <VerificationBadge tone={t} size={26} />
                  <Text style={styles.toneText}>{TONE_LABELS[t].split(" · ")[1]}</Text>
                </View>
              ))}
            </View>
            <Field label="ليه محتاج التوثيق؟" value={reason} onChange={setReason} multiline />
            <Field label="رابط يوضح نشاطك (اختياري)" value={link} onChange={setLink} />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.primaryBtn} onPress={send} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>ابعت الطلب</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    emptyPosts: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    emptyPostsText: { color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 20 },
    coverBox: { height: 150 },
    cover: { width: "100%", height: "100%" },
    coverEmpty: { backgroundColor: colors.surface2 },
    coverEdit: { position: "absolute", bottom: 10, left: 10, flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    coverEditText: { color: "#fff", fontSize: 11 },
    topAction: { position: "absolute", top: 10, right: 12, backgroundColor: "rgba(0,0,0,0.45)", padding: 7, borderRadius: 14 },
    identity: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, marginTop: 0 },
    identityText: { flex: 1, gap: 2, paddingTop: 6 },
    avatarWrap: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.background, overflow: "visible", marginTop: -44 },
    avatarImg: { width: 84, height: 84, borderRadius: 42 },
    avatarEdit: { position: "absolute", bottom: 0, left: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    name: { color: colors.text, fontSize: 19, fontFamily: "Cairo_900Black", fontWeight: "900", textAlign: "right" },
    handle: { color: colors.muted, fontSize: 12, textAlign: "right" },
    bio: { color: colors.text, fontSize: 12.5, textAlign: "right", marginTop: 4, lineHeight: 19 },
    link: { color: colors.goldText, fontSize: 12, textAlign: "right" },
    statsCard: { flexDirection: "row-reverse", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 18, marginHorizontal: 16, marginTop: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
    stat: { alignItems: "center", gap: 2 },
    statValue: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    statLabel: { color: colors.muted, fontSize: 11 },
    tiles: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, marginTop: 12 },
    tile: { flex: 1, minHeight: 72, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 6 },
    tileText: { color: colors.text, fontSize: 11, textAlign: "center" },
    actions: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, marginTop: 14, flexWrap: "wrap" },
    primaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 14, height: 44, flexGrow: 1 },
    primaryText: { color: colors.ink, fontSize: 13.5, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    secondaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, height: 44 },
    secondaryText: { color: colors.goldText, fontSize: 12.5 },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, marginHorizontal: 16, marginTop: 10 },
    rowTitle: { color: colors.text, fontSize: 13.5, textAlign: "right", flexShrink: 1 },
    rowSub: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 2 },
    rowValue: { color: colors.muted, fontSize: 11.5, marginRight: "auto" },
    sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right", marginHorizontal: 20, marginTop: 18 },
    interests: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginHorizontal: 16, marginTop: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    chipText: { color: colors.muted, fontSize: 12 },
    chipTextActive: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
    sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: "88%", gap: 12 },
    sheetHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
    sheetTitle: { color: colors.text, fontSize: 17, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    save: { color: colors.goldText, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    fieldLabel: { color: colors.muted, fontSize: 11.5, textAlign: "right" },
    input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 12, textAlign: "right", fontSize: 13.5 },
    error: { color: colors.red, fontSize: 12, textAlign: "right" },
    hint: { color: colors.muted, fontSize: 11.5, textAlign: "right", lineHeight: 18 },
    toneRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 6 },
    toneText: { color: colors.muted, fontSize: 9.5 },
  }),
);
