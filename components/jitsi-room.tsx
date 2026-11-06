import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { colors } from "@/constants/wanas";
import { jitsiRoomName } from "@/lib/jitsi";
import { themedStyles } from "@/lib/theme-runtime";

/**
 * غرفة صوت حقيقية داخل التطبيق — Jitsi Meet عبر WebView مع صلاحية الميكروفون.
 * مفيش خروج للتطبيق ولا تحميل تطبيق خارجي. على الويب بنستخدم iframe مباشرة.
 * ملاحظة: الصوت بيحتاج إنترنت، وأول مرة هيطلب صلاحية الميكروفون من النظام.
 */
export function JitsiRoom({
  kind,
  id,
  displayName,
  video = false,
  onClose,
}: {
  kind: "call" | "council" | "squad";
  id: string;
  displayName?: string;
  video?: boolean;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState(Platform.OS === "web");

  // لازم صلاحية الميكروفون تتطلب من النظام قبل ما الـ WebView يفتح الغرفة، وإلا الصوت مش هيشتغل
  useEffect(() => {
    if (Platform.OS === "web") return;
    void requestRecordingPermissionsAsync()
      .then((p) => {
        if (!p.granted) setError("لازم تسمح بالميكروفون من إعدادات الهاتف عشان تتكلم في الغرفة.");
      })
      .catch(() => undefined)
      .finally(() => setMicReady(true));
  }, []);

  const uri = useMemo(() => {
    const room = jitsiRoomName(kind, id);
    const params = new URLSearchParams();
    params.set("config.prejoinPageEnabled", "false");
    // يمنع صفحة "حمّل تطبيق Jitsi" والتحويل لتطبيق خارجي — الغرفة تفضل جوه ونس
    params.set("config.disableDeepLinking", "true");
    params.set("config.disableInviteFunctions", "true");
    params.set("config.startWithVideoMuted", video ? "false" : "true");
    params.set("config.startAudioOnly", video ? "false" : "true");
    params.set("config.toolbarButtons", video ? "['microphone','camera','hangup','chat','tileview']" : "['microphone','hangup','chat','tileview']");
    if (displayName) params.set("userInfo.displayName", displayName);
    return `https://meet.jit.si/${room}#${params.toString()}`;
  }, [kind, id, video, displayName]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{video ? "مكالمة فيديو" : "غرفة الصوت"} · داخل ونس</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
      {!loaded && !error && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.goldText} />
          <Text style={styles.loadingText}>بنجهّز الغرفة…</Text>
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {Platform.OS === "web" ? (
        <WebView
          source={{ uri }}
          style={{ flex: 1, backgroundColor: "#000" }}
          onLoadEnd={() => setLoaded(true)}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
        />
      ) : !micReady ? null : (
        <WebView
          source={{ uri }}
          style={{ flex: 1, backgroundColor: "#000" }}
          onLoadEnd={() => setLoaded(true)}
          onError={() => setError("مقدرناش نفتح الغرفة — اتأكد من النت وجرّب تاني.")}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          setSupportMultipleWindows={false}
          // نمنع أي رابط مش http/https (زي org.jitsi.meet:// أو intent://) عشان ما يطلعش من التطبيق
          onShouldStartLoadWithRequest={(req) => /^(https?:|about:|blob:|data:)/i.test(req.url)}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
          androidLayerType="hardware"
        />
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: "#000" },
    head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000" },
    title: { color: "#fff", fontSize: 13 },
    close: { padding: 4 },
    loading: { position: "absolute", top: "45%", alignSelf: "center", alignItems: "center", gap: 8, zIndex: 2 },
    loadingText: { color: "#fff", fontSize: 12 },
    error: { color: colors.red, fontSize: 12, textAlign: "center", padding: 12 },
  }),
);
