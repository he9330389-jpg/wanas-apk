import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/constants/wanas";

import { themedStyles } from "@/lib/theme-runtime";
/**
 * أختام التنبيهات — القسمان 26 و27 من دليل الهوية.
 * كل نوع تنبيه له ختم بشكل ولون وأيقونة مختلفة يُحطّ على صورة صاحب الحدث.
 */
export type AlertKind =
  | "reaction" | "reply_comment" | "voice_comment" | "text_comment"
  | "mention" | "message" | "live_council" | "council_invite"
  | "friend_request" | "new_version" | "verified" | "clip_ready" | "post_shared";

type SealSpec = { emoji: string; color: string; shape: SealShape; label: string };

export type SealShape = "circle" | "squircle" | "hexagon" | "star" | "diamond" | "octagon" | "pentagon" | "shield" | "drop" | "square";

export const ALERT_SEALS: Record<AlertKind, SealSpec> = {
  reaction:        { emoji: "❤️", color: "#ED5565", shape: "circle",   label: "تفاعل" },
  reply_comment:   { emoji: "↩",  color: "#4FC3C7", shape: "pentagon", label: "رد على تعليقك" },
  voice_comment:   { emoji: "🎙", color: "#9B6DE8", shape: "squircle", label: "تعليق صوتي" },
  text_comment:    { emoji: "💬", color: "#6FD593", shape: "octagon",  label: "تعليق نصي" },
  mention:         { emoji: "@",  color: "#F0A152", shape: "hexagon",  label: "إشارة" },
  message:         { emoji: "✉",  color: "#E8C96A", shape: "squircle", label: "رسالة جديدة" },
  live_council:    { emoji: "LIVE", color: "#ED5565", shape: "circle", label: "مجلس مباشر الآن" },
  council_invite:  { emoji: "🎧", color: "#9B6DE8", shape: "shield",   label: "دعوة مجلس" },
  friend_request:  { emoji: "👤", color: "#5B8DEF", shape: "shield",   label: "طلب صداقة" },
  new_version:     { emoji: "⬇",  color: "#E8C96A", shape: "circle",   label: "جديد ونس" },
  verified:        { emoji: "✓",  color: "#E8C96A", shape: "hexagon",  label: "توثيق الحساب" },
  clip_ready:      { emoji: "▶",  color: "#ED5565", shape: "square",   label: "لقطة جاهزة" },
  post_shared:     { emoji: "↗",  color: "#F07BA8", shape: "squircle", label: "مشاركة منشور" },
};

const RADIUS: Record<SealShape, number> = {
  circle: 999, squircle: 10, hexagon: 4, star: 6, diamond: 6,
  octagon: 6, pentagon: 6, shield: 8, drop: 12, square: 5,
};

export function AlertSeal({ kind, size = 22 }: { kind: AlertKind; size?: number }) {
  const spec = ALERT_SEALS[kind];
  return (
    <View
      style={[
        styles.seal,
        {
          backgroundColor: spec.color,
          width: size,
          height: size,
          borderRadius: RADIUS[spec.shape],
        },
      ]}
    >
      <Text style={[styles.sealText, { fontSize: kind === "live_council" ? size * 0.34 : size * 0.5 }]}>
        {spec.emoji}
      </Text>
    </View>
  );
}

/** صف التنبيه: صورة صاحب الحدث + الختم + نص بالاسم العريض + الوقت. */
export function AlertRow({
  kind,
  avatar,
  title,
  preview,
  time,
}: {
  kind: AlertKind;
  avatar: React.ReactNode;
  title: string;
  preview?: string;
  time: string;
}) {
  return (
    <View style={styles.row}>
      <View>
        {avatar}
        <View style={styles.sealWrap}>
          <AlertSeal kind={kind} />
        </View>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!preview && <Text style={styles.preview} numberOfLines={1}>{preview}</Text>}
      </View>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  seal: { alignItems: "center", justifyContent: "center" },
  sealText: { color: colors.ink, fontFamily: "Cairo_900Black", fontWeight: "900" },
  sealWrap: { position: "absolute", right: -2, bottom: -2 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  rowBody: { flex: 1 },
  title: { color: colors.text, fontFamily: "Cairo_700Bold", fontWeight: "bold", fontSize: 14, textAlign: "right" },
  preview: { color: colors.muted, fontSize: 12, marginTop: 2, textAlign: "right" },
  time: { color: colors.muted, fontSize: 11 },
})));
