import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { brandPalette } from "@/constants/brand";
import * as SecureStore from "expo-secure-store";
import { setActiveWanasScheme } from "@/lib/theme-runtime";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ونس وجهتها الأساسية لايت مود — الدارك مود اختياري من الإعدادات
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");

  const applyScheme = useCallback((scheme: ColorScheme) => {
    setActiveWanasScheme(scheme);
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      root.style.colorScheme = scheme;
      const palette = SchemeColors[scheme];
      const brand = brandPalette[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
      root.style.setProperty("--wanas-surface-2", scheme === "dark" ? "#1B1B22" : "#F1EDE2");
      root.style.setProperty("--wanas-gold-text", brand.goldText);
      root.style.setProperty("--wanas-gold", brand.gold);
      root.style.setProperty("--wanas-gold-soft", brand.goldSoft);
      root.style.setProperty("--wanas-red", brand.red);
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      themeMeta?.setAttribute("content", palette.background);
      document.body.style.backgroundColor = palette.background;
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    applyScheme(scheme);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("wanas-color-scheme", scheme);
      else void SecureStore.setItemAsync("wanas-color-scheme", scheme).catch(() => {});
    } catch {
      // Theme remains active for this session if persistence is unavailable.
    }
  }, [applyScheme]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const stored = typeof localStorage !== "undefined"
          ? localStorage.getItem("wanas-color-scheme")
          : await SecureStore.getItemAsync("wanas-color-scheme");
        if (alive && (stored === "dark" || stored === "light")) setColorScheme(stored);
      } catch {
        // Keep the brand default (light) if storage is unavailable.
      }
    })();
    return () => { alive = false; };
  }, [setColorScheme]);

  useEffect(() => {
    applyScheme(colorScheme);
  }, [applyScheme, colorScheme]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-accent-soft": SchemeColors[colorScheme].accentSoft,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
    }),
    [colorScheme, setColorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
