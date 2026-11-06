import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenShell, Avatar } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { cairoFonts } from "@/lib/fonts";
import { supabase } from "@/lib/supabase";
import { friendsCount, getProfile, myPages, myMedals, MEDAL_LABELS, type PageRow, type PublicProfile } from "@/lib/social";
import { signedMediaUrl } from "@/lib/media";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";
import { UI_LANGS, useLang } from "@/lib/i18n";

/**
 * الدليل (☰) — القسم 31 من دليل الهوية، مقسّم زي ما المستخدم طلب:
 * كارت الحساب · مفاتيحك · الأصدقاء/المنشئ/المحفوظات/ذكريات ونس · الأوسمة ·
 * الإعدادات والخصوصية (مركز الأمان والبلاغات · بلّغ عن مشكلة · تواصل معنا · الخصوصية · الشروط) ·
 * المميزات الإضافية · مركز المساعدة في الآخر · تسجيل الخروج آخر الصفحة.
 * كل صف هنا بيفتح شاشة حقيقية — مفيش زر ميت.
 */
type Counts = { friends: number; saved: number; memories: number; pages: number };

export default function GuideScreen() {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const { colorScheme, setColorScheme } = useThemeContext();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [medals, setMedals] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts>({ friends: 0, saved: 0, memories: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [showMore, setShowMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const p = await getProfile(uid);
      setProfile(p);
      if (p?.avatar_url) setAvatarUrl(p.avatar_url.startsWith("http") ? p.avatar_url : await signedMediaUrl(p.avatar_url, 3600));
      const [friends, saved, memories, myPageList, medalList] = await Promise.all([
        friendsCount(uid),
        supabase.from("saves").select("post_id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.rpc("wanas_memories", { p_limit: 50 }),
        myPages(uid),
        myMedals(uid),
      ]);
      setPages(myPageList);
      setMedals(medalList.map((m) => MEDAL_LABELS[m.medal] ?? m.medal));
      setCounts({
        friends,
        saved: saved.count ?? 0,
        memories: Array.isArray(memories.data) ? memories.data.length : 0,
        pages: myPageList.length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function signOut() {
    Alert.alert("تسجيل الخروج", "متأكد إنك عايز تخرج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "اخرج",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/auth");
        },
      },
    ]);
  }

  const name = profile?.display_name || profile?.username || "—";

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)"))} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>الدليل والإعدادات</Text>
        </View>

        {loading && <ActivityIndicator color={colors.goldText} />}

        {/* كارت الحساب */}
        <Pressable style={styles.accountCard} onPress={() => router.push("/(tabs)/profile")}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Avatar initial={name[0]} color={colors.surface3} size={58} />
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.accountName}>{name}</Text>
              {profile?.is_verified ? <VerificationBadge tone={profile.verification_tone ?? "yellow"} size={16} /> : null}
            </View>
            <Text style={styles.accountHandle}>@{profile?.username ?? "—"}</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>

        <Pressable style={styles.createPage} onPress={() => router.push("/page/new")}>
          <Ionicons name="add-circle-outline" size={20} color={colors.ink} />
          <Text style={styles.createPageText}>أنشئ صفحة على ونس</Text>
        </Pressable>
        {pages.map((pg) => (
          <Pressable key={pg.id} style={styles.row} onPress={() => router.push(`/page/${pg.id}`)}>
            <Ionicons name="flag-outline" size={18} color={colors.goldText} />
            <Text style={styles.rowLabel}>صفحة: {pg.name}</Text>
            <Text style={styles.rowValue}>@{pg.handle}</Text>
          </Pressable>
        ))}

        {/* مفاتيحك */}
        <Text style={styles.sectionLabel}>مفاتيحك</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keysRow}>
          <KeyItem label="ركنك" icon="person" onPress={() => router.push("/(tabs)/profile")} />
          <KeyItem label="مجالس" icon="mic" onPress={() => router.push("/(tabs)/councils")} />
          <KeyItem label="قصص" icon="albums" onPress={() => router.push("/(tabs)/stories")} />
          <KeyItem label="الشّلة" icon="people" onPress={() => router.push("/squad")} />
          <KeyItem label="الأختام" icon="pricetags" onPress={() => router.push("/stamps")} />
          <KeyItem label="اكتشف" icon="compass" onPress={() => router.push("/discover")} />
        </ScrollView>

        {/* الأقسام الأساسية */}
        <MenuItem icon="people-outline" label={`الأصدقاء (${counts.friends})`} onPress={() => router.push("/friends")} />
        <MenuItem icon="stats-chart-outline" label="لوحة معلومات المنشئ" onPress={() => router.push("/creator")} />
        <MenuItem icon="bookmark-outline" label={`المحفوظات (${counts.saved})`} onPress={() => router.push("/saved")} />
        <MenuItem icon="time-outline" label={`ذكريات ونس (${counts.memories})`} onPress={() => router.push("/memories")} />
        <MenuItem
          icon="ribbon-outline"
          label={medals.length ? `أوسمة ونس (${medals.length})` : "أوسمة ونس — لسه ماكسبتش وسام هذا الأسبوع"}
          onPress={() => router.push("/medals")}
        />

        {!showMore ? (
          <Pressable onPress={() => setShowMore(true)} style={styles.moreBtn}>
            <Text style={styles.moreText}>عرض المزيد</Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        ) : (
          <>
            <MenuItem icon="sparkles-outline" label="اكتشف مع AI" onPress={() => router.push("/discover")} />
            <MenuItem icon="cloud-download-outline" label="تنزيل محتواي" onPress={() => router.push("/account")} />
            <MenuItem icon="chatbubble-ellipses-outline" label="الستيكرات والأوسمة" onPress={() => router.push("/stickers")} />
            <Pressable onPress={() => setShowMore(false)} style={styles.moreBtn}>
              <Text style={styles.moreText}>أقل</Text>
              <Ionicons name="chevron-up" size={16} color={colors.muted} />
            </Pressable>
          </>
        )}

        {/* الإعدادات والخصوصية */}
        <Pressable style={styles.settingsHeader} onPress={() => setSettingsOpen((v) => !v)}>
          <Ionicons name="settings-outline" size={20} color={colors.text} />
          <Text style={styles.settingsTitle}>الإعدادات والخصوصية</Text>
          <Ionicons name={settingsOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
        </Pressable>
        {settingsOpen && (
          <View style={styles.settingsBody}>
            <View style={styles.row}>
              <Ionicons name={colorScheme === "dark" ? "moon-outline" : "sunny-outline"} size={20} color={colors.goldText} />
              <Text style={styles.rowLabel}>{t("settings.appearance")}</Text>
              <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setColorScheme("light")}
                  style={[styles.themeChip, colorScheme === "light" && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, colorScheme === "light" && { color: colors.ink }]}>{t("settings.light")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setColorScheme("dark")}
                  style={[styles.themeChip, colorScheme === "dark" && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, colorScheme === "dark" && { color: colors.ink }]}>{t("settings.dark")}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.langBlock}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                <Ionicons name="language-outline" size={19} color={colors.goldText} />
                <Text style={styles.rowLabel}>{t("settings.language")}</Text>
              </View>
              <Text style={styles.langHint}>{t("settings.languageHint")}</Text>
              <View style={styles.langRow}>
                {UI_LANGS.map((l) => (
                  <Pressable
                    key={l.code}
                    accessibilityRole="button"
                    onPress={() => void setLang(l.code)}
                    style={[styles.themeChip, lang === l.code && styles.themeChipActive]}
                  >
                    <Text style={[styles.themeChipText, lang === l.code && { color: colors.ink }]}>{l.native}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <MenuItem icon="person-outline" label="الملف الشخصي" onPress={() => router.push("/(tabs)/profile")} />
            <MenuItem icon="people-outline" label="الأصدقاء" onPress={() => router.push("/friends")} />
            <MenuItem icon="shield-checkmark-outline" label="التوثيق" onPress={() => router.push("/verification")} />
            <MenuItem icon="lock-closed-outline" label="الخصوصية والأمان" onPress={() => router.push("/account")} />
            <MenuItem icon="moon-outline" label="الوضع الهادئ" onPress={() => router.push("/quiet-mode")} />
            <MenuItem icon="document-text-outline" label="الشروط والخصوصية" onPress={() => router.push("/legal")} />
            <MenuItem icon="arrow-up-circle-outline" label="جديد ونس — تحديث البرنامج" onPress={() => router.push("/whatsnew")} />
            <Text style={styles.subLabel}>الأمان والبلاغات</Text>
            <MenuItem icon="shield-outline" label="مركز الأمان والبلاغات" onPress={() => router.push("/safety")} />
            <MenuItem icon="flag-outline" label="بلّغ عن مشكلة" onPress={() => router.push("/support?mode=bug")} />
            <MenuItem icon="mail-outline" label="تواصل معنا" onPress={() => router.push("/support?mode=contact")} />
          </View>
        )}

        {/* اللغات والترجمة */}
        <Text style={styles.sectionLabel}>اللغات والترجمة</Text>
        <MenuItem icon="language-outline" label="اللغات والترجمة · فصحى ↔ عامية" onPress={() => router.push("/dialect")} />

        {/* المميزات الإضافية (كانت في الكبسولات) */}
        <Text style={styles.sectionLabel}>المميزات الإضافية</Text>
        {[
          { icon: "🌙", label: "هدوء الصلاة", sub: "مواقيت اليوم والتقويم الهجري", route: "/prayer" },
          { icon: "🎁", label: "كبسولة الذكرى", sub: "رسالة لنفسك بعد سنة", route: "/capsule" },
          { icon: "👥", label: "الشّلة", sub: "دائرة صغيرة بونسة ومجلس", route: "/squad" },
          { icon: "💌", label: "بطاقة شكر", sub: "شكر صوتي قصير لصاحب منشور", route: "/thank-card" },
          { icon: "🌿", label: "حدود صحية", sub: "«ارتاح شوية» بلطف", route: "/wellbeing" },
          { icon: "☀️", label: "ونسة الصباح", sub: "سؤال يومي ترد عليه بصوتك", route: "/morning" },
          { icon: "🎬", label: "اللقطات", sub: "مشغّل الفيديو بالمقاسين", route: "/clips" },
        ].map((item) => (
          <Pressable key={item.route} style={styles.extraRow} onPress={() => router.push(item.route as never)}>
            <Text style={styles.extraIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.extraLabel}>{item.label}</Text>
              <Text style={styles.extraSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={colors.muted} />
          </Pressable>
        ))}

        {/* مركز المساعدة في الآخر */}
        <Text style={styles.sectionLabel}>مركز المساعدة</Text>
        <MenuItem icon="help-circle-outline" label="مركز المساعدة والأسئلة الشائعة" onPress={() => router.push("/help")} />

        <Text style={styles.version}>WANAS v1.0 · مساحة آمنة للونس</Text>

        <Pressable style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

function KeyItem({ label, icon, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void }) {
  return (
    <Pressable style={styles.keyItem} onPress={onPress}>
      <View style={styles.keyCircle}>
        <Ionicons name={icon} size={20} color={colors.goldText} />
      </View>
      <Text numberOfLines={1} style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
  themeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  themeChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  themeChipText: { color: colors.text, fontSize: 12, fontFamily: cairoFonts.semibold },
    topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
    title: { color: colors.text, fontSize: 22, fontFamily: "Cairo_900Black", fontWeight: "900" },
    accountCard: { flexDirection: "row-reverse", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
    avatarImg: { width: 58, height: 58, borderRadius: 29 },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    accountName: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold", textAlign: "right" },
    accountHandle: { color: colors.muted, fontSize: 12, textAlign: "right" },
    createPage: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.gold, height: 48, borderRadius: 16 },
    createPageText: { color: colors.ink, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14 },
    sectionLabel: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 8 },
    subLabel: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 4 },
    keysRow: { flexDirection: "row-reverse", gap: 14, paddingVertical: 4 },
    keyItem: { alignItems: "center", gap: 6, width: 70 },
    keyCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    keyLabel: { color: colors.muted, fontSize: 10, textAlign: "center" },
    row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border },
    rowLabel: { color: colors.text, fontSize: 14, flex: 1, textAlign: "right" },
    rowValue: { color: colors.muted, fontSize: 11.5 },
    moreBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
    moreText: { color: colors.muted, fontSize: 12 },
    settingsHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    settingsTitle: { color: colors.text, fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    settingsBody: { gap: 8 },
    version: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 10 },
    signOut: { borderWidth: 1, borderColor: colors.red, borderRadius: 16, height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
    extraRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
    extraIcon: { fontSize: 20 },
    extraLabel: { color: colors.text, fontSize: 13.5, fontFamily: "Cairo_600SemiBold", fontWeight: "600", textAlign: "right" },
    extraSub: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 2 },
    signOutText: { color: colors.red, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    langBlock: { gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.border },
    langHint: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
    langRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 4 },
  }),
);
