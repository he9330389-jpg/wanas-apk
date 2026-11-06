import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, StyleSheet, View, Text } from "react-native";
import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { HapticTab } from "@/components/haptic-tab";
import { colors } from "@/constants/wanas";
import { useThemeContext } from "@/lib/theme-provider";
import { useLang } from "@/lib/i18n";
import { themedStyles } from "@/lib/theme-runtime";

/**
 * شريط التبويبات — من ناحية اليمين للي ماسك الموبايل:
 * الرئيسية · فيديو · المجالس · الونسة · الملف الشخصي (آخر حاجة شمال).
 * الإعدادات اتشالت من الشريط وبتتفتح من ☰ فوق.
 */
type IconName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({ focused, name, activeName, label }: { focused: boolean; name: IconName; activeName: IconName; label: string }) {
  useThemeContext();
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Ionicons name={focused ? activeName : name} size={26} color={focused ? colors.yellow : colors.muted} />
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const tabRouteOptions = (t: (k: string) => string) => ({
  index: {
    title: t("tab.home"),
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} name="home-outline" activeName="home" label={t("tab.home")} />,
  },
  video: {
    title: t("tab.video"),
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} name="play-circle-outline" activeName="play-circle" label={t("tab.video")} />,
  },
  councils: {
    title: t("tab.councils"),
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} name="mic-outline" activeName="mic" label={t("tab.councils")} />,
  },
  messages: {
    title: t("tab.chat"),
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} name="chatbubbles-outline" activeName="chatbubbles" label={t("tab.chat")} />,
  },
  profile: {
    title: t("profile.title"),
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon focused={focused} name="person-outline" activeName="person" label={t("tab.profile")} />,
  },
});

export default function TabLayout() {
  const { colorScheme } = useThemeContext();
  const { t } = useLang();
  const tabRoute = useMemo(() => tabRouteOptions(t), [t]);
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 68 + bottomPadding;
  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarButton: HapticTab,
    tabBarShowLabel: false,
    tabBarStyle: {
      paddingTop: 8,
      paddingBottom: bottomPadding,
      height: tabBarHeight,
      backgroundColor: colorScheme === "dark" ? "#000000" : "#FAF8F3",
      borderTopColor: colorScheme === "dark" ? "#2A2A33" : "#E2DCCB",
      borderTopWidth: 0.5,
    },
  }), [bottomPadding, colorScheme, tabBarHeight]);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={tabRoute.index} />
      <Tabs.Screen name="video" options={tabRoute.video} />
      <Tabs.Screen name="councils" options={tabRoute.councils} />
      <Tabs.Screen name="messages" options={tabRoute.messages} />
      <Tabs.Screen name="profile" options={tabRoute.profile} />
      <Tabs.Screen name="stories" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  pill: { alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, minWidth: 56 },
  pillActive: { backgroundColor: colors.goldSoft },
  label: { fontSize: 10, color: colors.muted, fontFamily: "Cairo_600SemiBold" },
  labelActive: { color: colors.goldText },
})));
