import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";
import type { ReactionType } from "@/constants/wanas";

/** نغمة قصيرة لكل تفاعل (assets/sounds) — بتتشغل مرة عند الاختيار، والفشل صامت. */
const SOURCES: Record<ReactionType, number> = {
  "ونسّتني": require("../assets/sounds/wansatni.wav"),
  "ورود": require("../assets/sounds/wrood.wav"),
  "أثر فيّ": require("../assets/sounds/athar.wav"),
  "مبهر": require("../assets/sounds/mobhir.wav"),
  "أحببته": require("../assets/sounds/ahbbto.wav"),
  "أدعمه": require("../assets/sounds/adaamo.wav"),
  "أبكاني": require("../assets/sounds/abkani.wav"),
  "سخسخني": require("../assets/sounds/sakhsakhni.wav"),
  "لا أوافقك الرأي": require("../assets/sounds/laauafiq.wav"),
};

let current: AudioPlayer | null = null;

export function playReactionSound(type: ReactionType) {
  if (Platform.OS === "web") return;
  try {
    current?.remove();
    const player = createAudioPlayer(SOURCES[type]);
    current = player;
    player.volume = 0.6;
    player.play();
    setTimeout(() => {
      try { player.remove(); } catch { /* already released */ }
      if (current === player) current = null;
    }, 1200);
  } catch {
    /* الصوت اختياري */
  }
}
