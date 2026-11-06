import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";
import QRCodeGenerator from "qrcode-generator";
import { ScreenShell } from "@/components/wanas-ui";
import { VerificationBadge } from "@/components/verification-badge";
import { colors } from "@/constants/wanas";
import { getProfile, myId, type PublicProfile } from "@/lib/social";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** كود — بطاقتي QR الرابط مشاركة مباشرة + زكيك مشاركة الرابط */
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
      const qr = QRCodeGenerator(0, "M");
      qr.addData(link);
      qr.make();
      const size = qr.getModuleCount();
      const data: boolean[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          data.push(qr.isDark(r, c));
        }
      }
      return { size, data };
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
              {profile.is_verified ? <VerificationBadge tone={profile.verification_tone} /> : null}
            </View>
            <Text style={styles.handle}>@{profile.username}</Text>
            <View style={styles.qrBox}>
              {modules ? (
                <Svg width={SIZE} height={SIZE}>
                  {Array.from({ length: modules.size * modules.size }).map((_, i) =>
                    modules.data[i] ? <Rect key={i} x={(i % modules.size) * cell} y={Math.floor(i / modules.size) * cell} width={cell} height={cell} fill={colors.text} /> : null
                  )}
                </Svg>
              ) : (
                <Text style={styles.handle}>مقدرناش نعمل الكود</Text>
              )}
            </View>
            <Text style={styles.hint}>امسح الكود وافتح زكيك في ونس</Text>
          </View>
          <Pressable style={styles.btn} onPress={() => void Share.share({ message: link })}>
            <Ionicons name="share-outline" size={18} color={colors.ink} />
            <Text style={styles.btnText}>مشاركة بطاقتي</Text>
          </Pressable>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    top: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
    iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 19, fontFamily: "Cairo_700Bold" },
    wrap: { padding: 16, gap: 16 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, alignItems: "center" },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    name: { color: colors.text, fontSize: 20, fontFamily: "Cairo_700Bold" },
    handle: { color: colors.muted, fontSize: 13 },
    qrBox: { margin: 14, padding: 14, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
    hint: { color: colors.muted, fontSize: 12 },
    btn: { minHeight: 52, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
    btnText: { color: colors.ink, fontSize: 15, fontWeight: "bold" },
  })
);
