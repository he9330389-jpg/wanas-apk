import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";
import QRCode from "qrcode";
import { ScreenShell } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { getProfile, myId, type PublicProfile } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** بطاقتي — كود QR بيفتح ركنك مباشرة + مشاركة الرابط. */
export default function MyCardScreen() {
  useThemeContext();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    void (async () => {
      const id = await myId();
      setUid(id);
      if (id) setProfile(await getProfile(id));
    })();
  }, []);

  const link = uid ? ExpoLinking.createURL(`/user/${uid}`) : "";
  const modules = useMemo(() => {
    if (!link) return null;
    try {
      const qr = QRCode.create(link, { errorCorrectionLevel: "M" });
      return { size: qr.modules.size, data: qr.modules.data as unknown as ArrayLike<number> };
    } catch {
      return null;
    }
  }, [link]);

  const SIZE = 220;
  const cell = modules ? SIZE / modules.size : 0;
  const name = profile?.display_name ?? profile?.username ?? "ونس";

  return (
    <ScreenShell>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>بطاقتي</Text>
      </View>
      {!profile ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.wrap}>
          <View style={styles.card}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{name}</Text>
              {profile.is_verified ? <VerificationBadge tone={profile.verification_tone ?? "yellow"} size={22} /> : null}
            </View>
            <Text style={styles.handle}>@{profile.username}</Text>
            <View style={styles.qrBox}>
              {modules ? (
                <Svg width={SIZE} height={SIZE}>
                  {Array.from({ length: modules.size * modules.size }).map((_, i) =>
                    modules.data[i] ? <Rect key={i} x={(i % modules.size) * cell} y={Math.floor(i / modules.size) * cell} width={cell + 0.4} height={cell + 0.4} fill="#14141A" /> : null,
                  )}
                </Svg>
              ) : (
                <Text style={styles.handle}>مقدرناش نعمل الكود</Text>
              )}
            </View>
            <Text style={styles.hint}>امسح الكود وافتح ركني في ونس</Text>
          </View>
          <Pressable style={styles.btn} onPress={() => void Share.share({ message: `ركني في ونس: ${link}` })}>
            <Ionicons name="share-outline" size={18} color={colors.ink} />
            <Text style={styles.btnText}>شارك بطاقتي</Text>
          </Pressable>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    top: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold", fontWeight: "bold", flex: 1, textAlign: "right" },
    wrap: { padding: 16, gap: 16 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    name: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
    handle: { color: colors.muted, fontSize: 13 },
    qrBox: { marginVertical: 14, padding: 14, borderRadius: 18, backgroundColor: "#FFFFFF" },
    hint: { color: colors.muted, fontSize: 12 },
    btn: { minHeight: 52, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
    btnText: { color: colors.ink, fontSize: 15, fontWeight: "bold", fontFamily: "Cairo_700Bold" },
  }),
);
