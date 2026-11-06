import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/constants/wanas";

const EMOJI = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","🥹","😊","😍","🥰","😘","😎","🤩","🥳",
  "🙂","🙃","😉","😌","🤗","🤔","🤭","😴","😭","😢","😡","😱","🤯","🥺","😇","🤝",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💞","💖","💘","💝","💯","✨",
  "👍","👎","👏","🙌","🙏","🫶","🤲","💪","👋","🤌","✌️","👌","🫡","🤍","🌷","🎉",
];

export function EmojiPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => query ? EMOJI.filter((emoji) => emoji.includes(query)) : EMOJI, [query]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>الإيموجي</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.close}>إغلاق</Text></Pressable>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن إيموجي…" placeholderTextColor={colors.muted} style={styles.search} />
          <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
            {results.map((emoji, index) => (
              <Pressable key={`${emoji}-${index}`} style={styles.emojiCell} onPress={() => { onPick(emoji); onClose(); }}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 28, maxHeight: "60%" },
  handle: { width: 42, height: 4, borderRadius: 4, backgroundColor: colors.muted, alignSelf: "center", marginBottom: 14 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  close: { color: colors.goldText, fontSize: 13 },
  search: { marginTop: 12, marginBottom: 10, color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, textAlign: "right" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "flex-start", gap: 5 },
  emojiCell: { width: "12%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  emoji: { fontSize: 27 },
});
