import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { IncomingCallListener } from "@/components/incoming-call";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { AuthGate } from "@/components/auth-gate";
import { WellbeingGuard } from "@/components/wellbeing-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { MessageLockGate } from "@/components/message-lock-gate";
import { ScheduledMessageWorker } from "@/components/scheduled-message-worker";
import { applyCairoGlobally, useWanasFonts } from "@/lib/fonts";
import { installGlobalCrashHandler, reportCrash } from "@/lib/crash-report";

installGlobalCrashHandler();
applyCairoGlobally();

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  // Load Cairo in the background; app routing must not wait for font loading.
  useWanasFonts();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    try {
      initManusRuntime();
    } catch (error) {
      void reportCrash({
        phase: "launch",
        message: error instanceof Error ? error.message : "initManusRuntime failed",
        stack: error instanceof Error ? error.stack : null,
      });
    }
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          <MessageLockGate>
            <AuthGate>
              <WellbeingGuard>
                <IncomingCallListener />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="verify-email" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="forgot-password" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="oauth/callback" />
                  <Stack.Screen name="auth-callback" />
                </Stack>
                <ScheduledMessageWorker />
              </WellbeingGuard>
            </AuthGate>
          </MessageLockGate>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  const tree = shouldOverrideSafeArea ? (
    <ThemeProvider>
      <LanguageProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </LanguageProvider>
    </ThemeProvider>
  ) : (
    <ThemeProvider>
      <LanguageProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
      </LanguageProvider>
    </ThemeProvider>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ErrorBoundary>{tree}</ErrorBoundary>
    </View>
  );
}
