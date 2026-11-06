import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { loadMessageState, updateMessageState } from "@/lib/chat-preferences";

/** Sends due local drafts while WANAS is open; reliable delivery while the app is closed requires a server worker. */
export function ScheduledMessageWorker() {
  useEffect(() => {
    let running = false;
    let alive = true;
    const attempted = new Set<string>();

    const flush = async () => {
      if (!alive || running || AppState.currentState !== "active") return;
      running = true;
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return;
        const state = await loadMessageState(user.id);
        const due = state.scheduledMessages.filter((item) => !attempted.has(item.localId) && new Date(item.scheduledAt).getTime() <= Date.now());
        const sent: string[] = [];
        for (const item of due) {
          const { error } = await supabase.from("direct_messages").insert({
            sender_id: user.id,
            recipient_id: item.recipientId,
            body: item.body,
            media_type: item.mediaType,
            media_url: item.mediaUrl,
            disappear_after: item.disappearAfter,
          });
          if (error) {
            console.warn("Scheduled message remains queued after send failure:", error.message);
            continue;
          }
          attempted.add(item.localId);
          sent.push(item.localId);
        }
        if (sent.length) {
          const sentSet = new Set(sent);
          await updateMessageState(user.id, (current) => ({
            ...current,
            scheduledMessages: current.scheduledMessages.filter((item) => !sentSet.has(item.localId)),
          }));
        }
      } catch (error) {
        console.warn("Scheduled message processing failed; queued drafts are retained:", error);
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => void flush(), 15_000);
    const stateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") void flush();
    });
    const initialTimer = setTimeout(() => void flush(), 0);
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(initialTimer);
      stateListener.remove();
    };
  }, []);

  return null;
}
