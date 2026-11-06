import { supabase } from "@/lib/supabase";

/** غرفة المكالمة لازم تكون واحدة للطرفين: ندمج المعرّفين بترتيب ثابت. */
export function callRoomId(a: string, b: string): string {
  return [a, b].sort().join("-");
}

export type CallMode = "audio" | "video";
export type CallSignal =
  | { type: "ring"; from: string; name: string; mode: CallMode }
  | { type: "accepted"; from: string }
  | { type: "rejected"; from: string; message?: boolean }
  | { type: "cancelled"; from: string };

const channelName = (userId: string) => `wanas-calls-${userId}`;

/** يبعت إشارة مكالمة للطرف التاني (Realtime Broadcast) — بتوصل لو تطبيقه مفتوح. */
export async function sendCallSignal(toId: string, signal: CallSignal): Promise<void> {
  const ch = supabase.channel(channelName(toId));
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void ch.send({ type: "broadcast", event: "call", payload: signal }).finally(() => {
          clearTimeout(timer);
          resolve();
        });
      }
    });
  });
  void supabase.removeChannel(ch);
}

/** يسمع الإشارات الموجهة للمستخدم الحالي. يرجّع دالة إلغاء الاشتراك. */
export function listenCalls(myId: string, onSignal: (s: CallSignal) => void): () => void {
  const ch = supabase
    .channel(channelName(myId))
    .on("broadcast", { event: "call" }, ({ payload }) => onSignal(payload as CallSignal))
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/** إشعار «بيرن عليك» محفوظ (لو التطبيق مقفول يظهر كمكالمة فايتة/إشعار). */
export async function logCallNotification(fromId: string, toId: string, mode: CallMode): Promise<void> {
  await supabase
    .from("notifications")
    .insert({ recipient_id: toId, actor_id: fromId, kind: "call", payload: { text: mode === "video" ? "بيعملك وش لوش" : "بيرن عليك", mode } })
    .then(() => undefined, () => undefined);
}
