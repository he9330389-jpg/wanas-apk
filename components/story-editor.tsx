import React, { useState } from "react";
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GestureResponderHandlers } from "react-native";
import { colors } from "@/constants/wanas";
import { MentionSuggest, type MentionUser } from "@/components/mention-suggest";
import { STORY_FILTERS, filterOverlay } from "@/components/story-filters";

/**
 * طبقات القصة زي إنستجرام:
 * text (كتابة بلون وحجم) · draw (رسم بالإصبع) · sticker (ملصق) · question (سؤال) · mention (منشن)
 * كل طبقة بتتحفظ في `stories.overlays` كـ JSON وبترجع للمكوّن الأب عند النشر.
 */
export type StoryOverlay =
  | { type: "text"; id: string; text: string; color: string; x: number; y: number; size: number }
  | { type: "sticker"; id: string; emoji: string; x: number; y: number; size: number }
  | { type: "question"; id: string; prompt: string; x: number; y: number }
  | { type: "mention"; id: string; username: string; display_name: string | null; x: number; y: number }
  | { type: "draw"; id: string; color: string; width: number; points: { x: number; y: number }[] };

const TEXT_COLORS = ["#FFFFFF", "#E8C96A", "#ED5565", "#6ECF9B", "#7AB8FF", "#000000", "#FF9F43", "#C084FC"];
const STICKERS = ["😀", "😂", "🥰", "😎", "🔥", "✨", "💛", "🌙", "🎉", "☕", "🌸", "🏆", "📸", "🎧", "⚡", "💬", "❤️", "🌞", "🎈", "🍀"];
const DRAW_COLORS = ["#FFFFFF", "#E8C96A", "#ED5565", "#6ECF9B", "#7AB8FF", "#000000"];

export { STORY_FILTERS, filterOverlay } from "@/components/story-filters";
let seq = 0;
const nid = () => `ov-${Date.now()}-${seq++}`;

/** هندلرز الرسم — بره الكومبوننت عشان القيم تتقرأ من الـ refs وقت الرسم نفسه. */
function panHandlersRef(
  setCurrent: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>,
  setOverlays: (next: StoryOverlay[] | ((prev: StoryOverlay[]) => StoryOverlay[])) => void,
  drawRef: React.MutableRefObject<{ color: string; width: number }>,
) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setCurrent([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]),
    onPanResponderMove: (e) => setCurrent((p) => [...p, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]),
    onPanResponderRelease: () => {
      setCurrent((pts) => {
        if (pts.length > 1) {
          const { color, width } = drawRef.current;
          setOverlays((prev) => [...prev, { type: "draw", id: nid(), color, width, points: pts }]);
        }
        return [];
      });
    },
  }).panHandlers;
}
export function StoryEditor({
  overlays,
  setOverlays,
  onMention,
  musicTitle,
  filter,
  setFilter,
}: {
  overlays: StoryOverlay[];
  setOverlays: (next: StoryOverlay[] | ((prev: StoryOverlay[]) => StoryOverlay[])) => void;
  /** بيتنادى لما حد يختار منشن — الأب بيبعتله إشعار */
  onMention?: (u: MentionUser) => void;
  /** اسم المقطع المختار من مكتبة الموسيقى (بيظهر زي ستوري إنستجرام) */
  musicTitle?: string | null;
  /** فلتر بصري للقصة (طبقة لون حقيقية فوق الصورة) */
  filter?: string | null;
  setFilter?: (f: string | null) => void;
}) {
  const [tool, setTool] = useState<null | "text" | "draw" | "sticker" | "question" | "mention" | "filter">(null);
  const [textDraft, setTextDraft] = useState("");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [textSize, setTextSize] = useState(24);
  const [questionDraft, setQuestionDraft] = useState("");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[1]);
  const [drawWidth, setDrawWidth] = useState(4);
  const [current, setCurrent] = useState<{ x: number; y: number }[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");

  const drawRef = React.useRef({ color: DRAW_COLORS[1], width: 4 });
  const handlersRef = React.useRef<ReturnType<typeof panHandlersRef> | null>(null);
  React.useEffect(() => {
    if (!handlersRef.current) handlersRef.current = panHandlersRef(setCurrent, setOverlays, drawRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // اللون والعرض بياخدوا قيمتهم وقت إنشاء الطبقة نفسها (مفيش refs في الرندر)

  function addText() {
    const value = textDraft.trim();
    if (!value) return;
    setOverlays((prev) => [...prev, { type: "text", id: nid(), text: value, color: textColor, size: textSize, x: 0.5, y: 0.5 }]);
    setTextDraft("");
    setTool(null);
  }
  function addQuestion() {
    const value = questionDraft.trim();
    if (!value) return;
    setOverlays((prev) => [...prev, { type: "question", id: nid(), prompt: value, x: 0.5, y: 0.3 }]);
    setQuestionDraft("");
    setTool(null);
  }
  function addSticker(emoji: string) {
    setOverlays((prev) => [...prev, { type: "sticker", id: nid(), emoji, size: 44, x: 0.5, y: 0.6 }]);
    setTool(null);
  }
  function addMention(u: MentionUser) {
    setOverlays((prev) => [...prev, { type: "mention", id: nid(), username: u.username, display_name: u.display_name, x: 0.5, y: 0.42 }]);
    onMention?.(u);
    setMentionQuery("");
    setTool(null);
  }
  function removeOverlay(id: string) {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <View style={styles.wrap}>
      {/* معاينة الطبقات فوق الصورة */}
      <View style={styles.overlayLayer} pointerEvents="box-none">
        {!!filter && (
          <View pointerEvents="none" style={[styles.filterPreview, { backgroundColor: filterOverlay(filter) }]} />
        )}
        {overlays.map((o) => {
          if (o.type === "text") {
            return (
              <Pressable key={o.id} onLongPress={() => removeOverlay(o.id)} style={[styles.abs, { left: `${o.x * 100}%`, top: `${o.y * 100}%` }]}>
                <Text style={{ color: o.color, fontSize: o.size, fontWeight: "900", textAlign: "center" }}>{o.text}</Text>
              </Pressable>
            );
          }
          if (o.type === "sticker") {
            return (
              <Pressable key={o.id} onLongPress={() => removeOverlay(o.id)} style={[styles.abs, { left: `${o.x * 100}%`, top: `${o.y * 100}%` }]}>
                <Text style={{ fontSize: o.size }}>{o.emoji}</Text>
              </Pressable>
            );
          }
          if (o.type === "question") {
            return (
              <Pressable key={o.id} onLongPress={() => removeOverlay(o.id)} style={[styles.abs, styles.questionCard, { left: `${o.x * 100 - 40}%`, top: `${o.y * 100}%` }]}>
                <Text style={styles.questionText}>{o.prompt}</Text>
                <Text style={styles.questionHint}>اكتب إجابتك…</Text>
              </Pressable>
            );
          }
          if (o.type === "mention") {
            return (
              <Pressable key={o.id} onLongPress={() => removeOverlay(o.id)} style={[styles.abs, styles.mentionChip, { left: `${o.x * 100 - 20}%`, top: `${o.y * 100}%` }]}>
                <Ionicons name="at" size={13} color={colors.ink} />
                <Text style={styles.mentionChipText}>{o.username}</Text>
              </Pressable>
            );
          }
          return null;
        })}
        {/* طبقة الرسم */}
        <DrawLayer
          active={tool === "draw"}
          handlersRef={handlersRef}
          overlays={overlays}
          live={current}
          color={drawColor}
          width={drawWidth}
        />
      </View>

      {!!musicTitle && (
        <View style={styles.musicChip}>
          <Ionicons name="musical-notes" size={12} color={colors.ink} />
          <Text numberOfLines={1} style={styles.musicChipText}>{musicTitle}</Text>
        </View>
      )}
      {/* شريط الأدوات */}
      <View style={styles.tools}>
        <Tool icon="text" label="كتابة" active={tool === "text"} onPress={() => setTool(tool === "text" ? null : "text")} />
        <Tool icon="brush" label="رسم" active={tool === "draw"} onPress={() => setTool(tool === "draw" ? null : "draw")} />
        <Tool icon="happy" label="ملصق" active={tool === "sticker"} onPress={() => setTool(tool === "sticker" ? null : "sticker")} />
        <Tool icon="help-circle" label="سؤال" active={tool === "question"} onPress={() => setTool(tool === "question" ? null : "question")} />
        <Tool icon="at" label="منشن" active={tool === "mention"} onPress={() => setTool(tool === "mention" ? null : "mention")} />
        <Tool icon="color-filter" label="فلاتر" active={tool === "filter"} onPress={() => setTool(tool === "filter" ? null : "filter")} />
        {overlays.length > 0 && (
          <Tool icon="trash" label="مسح الكل" active={false} onPress={() => Alert.alert("تمسح الطبقات؟", "هتتشال كل الكتابة والرسم والملصقات.", [{ text: "إلغاء", style: "cancel" }, { text: "امسح", style: "destructive", onPress: () => setOverlays([]) }])} />
        )}
      </View>

      {tool === "text" && (
        <View style={styles.panel}>
          <TextInput value={textDraft} onChangeText={setTextDraft} placeholder="اكتب حاجة على القصة…" placeholderTextColor={colors.muted} style={styles.input} multiline />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {TEXT_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setTextColor(c)} style={[styles.swatch, { backgroundColor: c }, textColor === c && styles.swatchOn]} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {[18, 24, 30, 38].map((s) => (
              <Pressable key={s} onPress={() => setTextSize(s)} style={[styles.sizeChip, textSize === s && styles.sizeChipOn]}>
                <Text style={styles.sizeText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.apply} onPress={addText}>
            <Text style={styles.applyText}>ضيف الكتابة</Text>
          </Pressable>
        </View>
      )}

      {tool === "draw" && (
        <View style={styles.panel}>
          <Text style={styles.panelHint}>ارسم بإصبعك على الصورة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {DRAW_COLORS.map((c) => (
              <Pressable key={c} onPress={() => { setDrawColor(c); drawRef.current.color = c; }} style={[styles.swatch, { backgroundColor: c }, drawColor === c && styles.swatchOn]} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {[2, 4, 7, 11].map((w) => (
              <Pressable key={w} onPress={() => { setDrawWidth(w); drawRef.current.width = w; }} style={[styles.sizeChip, drawWidth === w && styles.sizeChipOn]}>
                <View style={{ width: w * 2, height: w * 2, borderRadius: w, backgroundColor: drawColor }} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {tool === "sticker" && (
        <View style={styles.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {STICKERS.map((s) => (
              <Pressable key={s} onPress={() => addSticker(s)} style={styles.stickerBtn}>
                <Text style={{ fontSize: 26 }}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {tool === "question" && (
        <View style={styles.panel}>
          <TextInput value={questionDraft} onChangeText={setQuestionDraft} placeholder="اكتب سؤالك للناس…" placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable style={styles.apply} onPress={addQuestion}>
            <Text style={styles.applyText}>ضيف السؤال</Text>
          </Pressable>
        </View>
      )}

      {tool === "filter" && (
        <View style={styles.panel}>
          <Text style={styles.panelHint}>اختار فلتر للقصة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {STORY_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter?.(f.key === "none" ? null : f.key)}
                style={[styles.filterSwatch, { backgroundColor: f.swatch }, (filter ?? "none") === f.key && styles.swatchOn]}
              >
                <Text style={styles.filterLabel}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {tool === "mention" && (
        <View style={styles.panel}>
          <MentionSuggest query={mentionQuery} visible title="اعمل منشن لحد في القصة" onPick={addMention} />
          <TextInput value={mentionQuery} onChangeText={setMentionQuery} placeholder="اكتب اسم أو اختار حرف…" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" />
        </View>
      )}
    </View>
  );
}

/** طبقة الرسم — بتاخد الهاندلرز من ref جوه event handler بدل الرندر. */
function DrawLayer({
  active,
  handlersRef,
  overlays,
  live,
  color,
  width,
}: {
  active: boolean;
  handlersRef: React.RefObject<GestureResponderHandlers | null>;
  overlays: StoryOverlay[];
  live: { x: number; y: number }[];
  color: string;
  width: number;
}) {
  const [handlers, setHandlers] = useState<GestureResponderHandlers | null>(null);
  React.useEffect(() => {
    setHandlers(handlersRef.current);
  }, [handlersRef, active]);
  return (
    <View style={StyleSheet.absoluteFill} {...(active && handlers ? handlers : {})}>
      <DrawPaths overlays={overlays} live={live} color={color} width={width} />
    </View>
  );
}

function DrawPaths({ overlays, live, color, width }: { overlays: StoryOverlay[]; live: { x: number; y: number }[]; color: string; width: number }) {
  const draws = overlays.filter((o): o is Extract<StoryOverlay, { type: "draw" }> => o.type === "draw");
  const segments = (pts: { x: number; y: number }[], c: string, w: number, key: string) =>
    pts.slice(1).map((p, i) => {
      const prev = pts[i];
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      return (
        <View
          key={`${key}-${i}`}
          style={{
            position: "absolute",
            left: prev.x,
            top: prev.y,
            width: len,
            height: w,
            borderRadius: w / 2,
            backgroundColor: c,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "left center",
          }}
        />
      );
    });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {draws.map((d) => segments(d.points, d.color, d.width, d.id))}
      {live.length > 1 && segments(live, color, width, "live")}
    </View>
  );
}

function Tool({ icon, label, active, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tool, active && styles.toolOn]}>
      <Ionicons name={icon} size={18} color={active ? colors.ink : colors.text} />
      <Text style={[styles.toolLabel, active && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  filterPreview: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  overlayLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 },
  abs: { position: "absolute" },
  questionCard: { backgroundColor: "#FFFFFFEE", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, minWidth: 160 },
  questionText: { color: "#111", fontSize: 14, fontWeight: "800", textAlign: "center" },
  questionHint: { color: "#777", fontSize: 11, textAlign: "center", marginTop: 3 },
  mentionChip: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  mentionChipText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  musicChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-end", backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4, maxWidth: "70%" },
  musicChipText: { color: colors.ink, fontSize: 11, fontWeight: "700", maxWidth: 170 },
  tools: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 190 },
  tool: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surface },
  toolOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  toolLabel: { color: colors.text, fontSize: 11.5 },
  panel: { gap: 8, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 },
  panelHint: { color: colors.muted, fontSize: 11, textAlign: "right" },
  input: { color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlign: "right", minHeight: 40 },
  row: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: colors.goldText },
  filterSwatch: { width: 62, height: 44, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  filterLabel: { color: "#fff", fontSize: 10, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 3 },
  sizeChip: { minWidth: 32, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  sizeChipOn: { borderColor: colors.goldText },
  sizeText: { color: colors.text, fontSize: 11 },
  stickerBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  apply: { backgroundColor: colors.gold, borderRadius: 12, alignItems: "center", paddingVertical: 9 },
  applyText: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
});
