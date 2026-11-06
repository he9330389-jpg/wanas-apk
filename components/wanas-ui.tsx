import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type VerificationTone } from '@/constants/wanas';
import { VerificationBadge as StarBadge } from '@/components/verification-badge';

import { themedStyles } from "@/lib/theme-runtime";
// --- الهوية البصرية (Brand Identity) ---
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <Image source={require('@/assets/images/icon.png')} style={styles.brandMark} resizeMode="cover" />
      {!compact && (
        <View>
          <Text style={styles.brandName}>WANAS</Text>
          <Text style={styles.brandCredit}>Built and programmed by</Text>
          <Text style={styles.brandAuthor}>ABD.ALLAH ZOHAIR OMARA</Text>
          <Text style={styles.brandTagline}>مساحة الونس</Text>
        </View>
      )}
    </View>
  );
}

// --- المكونات الأساسية (Core Components) ---
export function Avatar({ initial, color, size = 44 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

export function VerificationBadge({ tone = "yellow", small = false }: { tone?: VerificationTone; small?: boolean }) {
  return <StarBadge tone={tone} size={small ? 15 : 20} />;
}

// --- شاشة الحاوية (Screen Container) ---
export function ScreenShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {children}
    </View>
  );
}

// --- شريط الأدوات (Header) ---
export function Header({ title, action, onAction }: { title?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.header}>
      <BrandMark compact />
      {title && <Text style={styles.headerTitle}>{title}</Text>}
      <Pressable onPress={onAction} style={styles.headerIcon}>
        <Ionicons name={action === "search" ? "search" : "notifications-outline"} size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 12 },
  brandLetter: { color: colors.text, fontSize: 24, fontFamily: "Cairo_900Black", fontWeight: "900" },
  brandDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, right: 6, top: 6 },
  brandName: { color: colors.text, fontSize: 18, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  brandTagline: { color: colors.muted, fontSize: 10, marginTop: -2 },
  brandCredit: { color: colors.goldText, fontSize: 9, marginTop: 4, letterSpacing: 0.3 },
  brandAuthor: { color: colors.text, fontSize: 11, marginTop: 1, fontFamily: "Cairo_700Bold", fontWeight: "bold", letterSpacing: 0.4 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  badge: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerTitle: { color: colors.text, fontSize: 16, fontFamily: "Cairo_700Bold", fontWeight: "bold" },
  headerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
})));
