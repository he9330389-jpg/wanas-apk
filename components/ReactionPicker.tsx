import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { reactions, type ReactionType, colors } from "@/constants/wanas";
import { playReactionSound } from "@/lib/reactions";
import { themedStyles } from "@/lib/theme-runtime";

export type Anchor = { x: number; y: number; width: number; height: number } | null;

/**
 * شريط تفاعلات عائم وصغير (كبسولة) بيظهر فوق زر التفاعل عند الضغط المطوّل — ٩ تفاعلات في صف واحد.
 * كل إيموجي بيكبر لحظة اللمس ويظهر اسمه فوقه، ومعاه اهتزاز خفيف وصوت.
 */
export function ReactionPicker({ visible, onClose, onSelect, anchor, current }: { visible: boolean; onClose: () => void; onSelect: (r: ReactionType) => void; anchor?: Anchor; current?: ReactionType | null }) {
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  const [hover, setHover] = useState<ReactionType | null>(null);

  useEffect(() => {
    if (visible) {
      setHover(null);
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 140 }).start();
    }
  }, [visible, pop]);

  const barWidth = Math.min(width - 24, 9 * 38 + 20);
  const left = anchor ? Math.max(12, Math.min(width - barWidth - 12, anchor.x + anchor.width / 2 - barWidth / 2)) : (width - barWidth) / 2;
  const top = anchor ? Math.max(60, anchor.y - 64) : height / 2 - 30;

  function choose(r: ReactionType) {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    playReactionSound(r);
    onSelect(r);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.bar,
            { width: barWidth, left, top, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }, { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
          ]}
        >
          {!!hover && (
            <View style={styles.tip}>
              <Text style={styles.tipText}>{hover}</Text>
            </View>
          )}
          {reactions.map((r) => (
            <Pressable
              key={r.type}
              onPress={() => choose(r.type)}
              onPressIn={() => setHover(r.type)}
              onPressOut={() => setHover(null)}
              onHoverIn={() => setHover(r.type)}
              onHoverOut={() => setHover(null)}
              accessibilityRole="button"
              accessibilityLabel={r.type}
              style={[styles.item, hover === r.type && styles.itemOn, current === r.type && { backgroundColor: `${r.color}33` }]}
            >
              <Text style={[styles.emoji, hover === r.type && { transform: [{ scale: 1.35 }] }]}>{r.emoji}</Text>
            </Pressable>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
    bar: {
      position: "absolute",
      height: 52,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    item: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    itemOn: { backgroundColor: colors.surface2 },
    emoji: { fontSize: 22 },
    tip: { position: "absolute", top: -30, alignSelf: "center", left: 0, right: 0, alignItems: "center" },
    tipText: { color: colors.text, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, overflow: "hidden", fontFamily: "Cairo_600SemiBold" },
  }),
);
