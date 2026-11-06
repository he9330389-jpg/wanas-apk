import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSession } from "@/hooks/use-session";
import { registerForPushNotifications } from "@/lib/push";
import { colors } from "@/constants/wanas";
import { themedStyles } from "@/lib/theme-runtime";
import { useThemeContext } from "@/lib/theme-provider";

/** Wait until the authenticated UI has settled before requesting notification permission. */
const PUSH_REGISTRATION_DELAY_MS = 2500;

/**
 * Protects every screen behind a real Supabase session and registers the
 * device push token once per signed-in user.
 *
 * ملاحظة مهمة: تسجيل الإشعارات مش بيمنع فتح التطبيق. لو الإشعارات اتأخرت
 * أو فشلت، المستخدم بيدخل عادي والتوكن بيتسجل في الخلفية لما يجهز.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  useThemeContext();
  const router = useRouter();
  const { session, loading, userId } = useSession();
  const segments = useSegments();
  const [tokenAttemptDone, setTokenAttemptDone] = useState<string | null>(null);
  const onAuthScreen = segments[0] === "auth";
  const onEmailVerificationScreen = segments[0] === "verify-email";
  const onPasswordRecoveryScreen = segments[0] === "forgot-password";
  const onPublicAuthScreen = onAuthScreen || onEmailVerificationScreen || onPasswordRecoveryScreen;
  const onAuthenticatedTabs = segments[0] === "(tabs)";
  const emailVerified = !session?.user.email || !!session.user.email_confirmed_at;
  const needsLogin = !session && !onPublicAuthScreen;
  const needsVerification = !!session && !emailVerified && !onEmailVerificationScreen;
  const needsTabs = !!session && emailVerified && onAuthScreen;

  // One controlled redirect owner prevents the login screen and AuthGate from
  // issuing competing navigation actions after Supabase signs the user in.
  useEffect(() => {
    if (loading) return;
    if (needsLogin) router.replace("/auth");
    else if (needsVerification) {
      router.replace({ pathname: "/verify-email", params: { email: session?.user.email ?? "" } });
    } else if (needsTabs) router.replace("/(tabs)");
  }, [loading, needsLogin, needsVerification, needsTabs, router, session?.user.email]);

  useEffect(() => {
    if (!userId || !emailVerified || !onAuthenticatedTabs || tokenAttemptDone === userId) return;
    let active = true;
    const timer = setTimeout(() => {
      void registerForPushNotifications(userId)
        .catch(() => null)
        .finally(() => {
          if (active) setTokenAttemptDone(userId);
        });
    }, PUSH_REGISTRATION_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId, emailVerified, onAuthenticatedTabs, tokenAttemptDone]);

  // Keep a visible state while restoring a session or moving away from a
  // protected/unverified route. On post-login, keep the login form mounted
  // until the tabs route is active instead of returning a blank Redirect.
  if ((loading && !onPublicAuthScreen) || needsLogin || needsVerification) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.goldText} />
        <Text style={styles.loadingText}>بنجهز دخولك…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    loadingText: { color: colors.muted, fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  }),
);
