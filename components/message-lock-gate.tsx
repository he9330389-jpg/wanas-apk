import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, DeviceEventEmitter, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { supabase } from "@/lib/supabase";
import { loadMessageState } from "@/lib/chat-preferences";

export function MessageLockGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const enabledRef = useRef(false);
  const lockedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const sync = useCallback(async (userId: string | null) => {
    if (!userId) {
      enabledRef.current = false;
      lockedRef.current = false;
      lastUserIdRef.current = null;
      setEnabled(false);
      setLocked(false);
      return;
    }
    const state = await loadMessageState(userId);
    enabledRef.current = state.global.appLock;
    setEnabled(state.global.appLock);
    if (!state.global.appLock) {
      lockedRef.current = false;
      setLocked(false);
    } else if (lastUserIdRef.current !== userId && !lockedRef.current) {
      lockedRef.current = true;
      setLocked(true);
    }
    lastUserIdRef.current = userId;
  }, []);

  const unlock = useCallback(async () => {
    if (Platform.OS === "web" || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "افتح تطبيق ونس",
        cancelLabel: "إلغاء",
        fallbackLabel: "استخدم رمز الجهاز",
        disableDeviceFallback: false,
      });
      if (result.success) {
        lockedRef.current = false;
        setLocked(false);
      } else if (result.error !== "user_cancel" && result.error !== "system_cancel" && result.error !== "app_cancel") {
        setError("ما قدرناش نتحقق. جرّب البصمة أو رمز قفل الجهاز.");
      }
    } catch {
      setError("ميزة التحقق غير متاحة على الجهاز ده.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data } = await supabase.auth.getUser();
      if (active) await sync(data.user?.id ?? null);
    };
    void refresh();
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      void sync(session?.user?.id ?? null);
    });
    const stateSubscription = DeviceEventEmitter.addListener("wanas:messaging-state", (event: { userId?: string }) => {
      void sync(event?.userId ?? null);
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "background" && enabledRef.current) {
        lockedRef.current = true;
        setLocked(true);
      } else if (state === "active" && lockedRef.current) {
        void unlock();
      }
    });
    return () => {
      active = false;
      auth.data.subscription.unsubscribe();
      stateSubscription.remove();
      appState.remove();
    };
  }, [sync, unlock]);

  return (
    <>
      {children}
      <Modal visible={enabled && locked && Platform.OS !== "web"} animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.screen}>
          <View style={styles.logo}><Text style={styles.logoText}>W</Text><View style={styles.dot} /></View>
          <Text style={styles.title}>المحادثات مقفولة</Text>
          <Text style={styles.subtitle}>افتحها ببصمة الإصبع أو رمز قفل الجهاز.</Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy} onPress={() => void unlock()} style={styles.button}>
            {busy ? <ActivityIndicator color="#000000" /> : <Text style={styles.buttonText}>تحقق وافتح</Text>}
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#111114", alignItems: "center", justifyContent: "center", padding: 26 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: "#000000", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  logoText: { color: "#FFFFFF", fontSize: 38, fontWeight: "900" },
  dot: { position: "absolute", right: 14, top: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: "#E8C96A" },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#B9B9C1", fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 22 },
  error: { color: "#FF7373", fontSize: 12, textAlign: "center", marginTop: 14 },
  button: { marginTop: 24, minWidth: 180, minHeight: 48, borderRadius: 15, backgroundColor: "#FFD54A", alignItems: "center", justifyContent: "center", padding: 12 },
  buttonText: { color: "#000000", fontWeight: "800", fontSize: 15 },
});
