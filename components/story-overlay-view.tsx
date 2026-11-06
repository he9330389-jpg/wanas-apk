import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/wanas";

/**
 * عرض طبقات القصة (كتابة/رسم/ملصق/سؤال/منشن) لما حد يتفرج عليها.
 * الطبقات بتيجي من `stories.overlays` (JSON) اللي اتحفظ وقت النشر.
 */
export { filterOverlay } from "@/components/story-filters";

type Overlay =
  | { type: "text"; id: string; text: string; color: string; x: number; y: number; size: number }
  | { type: "sticker"; id: string; emoji: string; x: number; y: number; size: number }
  | { type: "question"; id: string; prompt: string; x: number; y: number }
  | { type: "mention"; id: string; username: string; display_name: string | null; x: number; y: number }
  | { type: "draw"; id: string; color: string; width: number; points: { x: number; y: number }[] };

export function StoryOverlayView({ overlays }: { overlays: unknown }) {
  const list = Array.isArray(overlays) ? (overlays as Overlay[]) : [];
  if (!list.length) return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      {list.map((o) => {
        if (o.type === "text") {
          return (
            <View key={o.id} style={[styles.abs, { left: `${o.x * 100}%`, top: `${o.y * 100}%`, transform: [{ translateX: -40 }] }]}>
              <Text style={{ color: o.color, fontSize: o.size, fontWeight: "900", textAlign: "center" }}>{o.text}</Text>
            </View>
          );
        }
        if (o.type === "sticker") {
          return (
            <Text key={o.id} style={[styles.abs, { left: `${o.x * 100}%`, top: `${o.y * 100}%`, fontSize: o.size }]}>
              {o.emoji}
            </Text>
          );
        }
        if (o.type === "question") {
          return (
            <View key={o.id} style={[styles.abs, styles.questionCard, { left: `${o.x * 100 - 40}%`, top: `${o.y * 100}%` }]}>
              <Text style={styles.questionText}>{o.prompt}</Text>
              <Text style={styles.questionHint}>اكتب إجابتك…</Text>
            </View>
          );
        }
        if (o.type === "mention") {
          return (
            <View key={o.id} style={[styles.abs, styles.mentionChip, { left: `${o.x * 100 - 20}%`, top: `${o.y * 100}%` }]}>
              <Text style={styles.mentionText}>@{o.username}</Text>
            </View>
          );
        }
        if (o.type === "draw") {
          return o.points.slice(1).map((p, i) => {
            const prev = o.points[i];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={`${o.id}-${i}`}
                style={{
                  position: "absolute",
                  left: prev.x,
                  top: prev.y,
                  width: len,
                  height: o.width,
                  borderRadius: o.width / 2,
                  backgroundColor: o.color,
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: "left center",
                }}
              />
            );
          });
        }
        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  abs: { position: "absolute" },
  questionCard: { backgroundColor: "#FFFFFFEE", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, minWidth: 160 },
  questionText: { color: "#111", fontSize: 14, fontWeight: "800", textAlign: "center" },
  questionHint: { color: "#777", fontSize: 11, textAlign: "center", marginTop: 3 },
  mentionChip: { backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  mentionText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
});
