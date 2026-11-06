/**
 * الصوت الحقيقي في ونس — Jitsi Meet (مجاني، بدون حساب ولا مفاتيح).
 * بنستخدم سيرفر meet.jit.si العام: كل مكالمة/مجلس له غرفة ثابتة مشتقة من مُعرّفه،
 * فالمتصلين بنفس المُعرّف يلاقوا بعض في نفس الغرفة.
 *
 * الغرفة بتفتح جوه التطبيق نفسه عبر components/jitsi-room.tsx (WebView) من غير ما تطلع لتطبيق Jitsi.
 * لو حبيت SDK أصلي بالكامل بعدين: @jitsi/react-native-sdk في بناء Android/iOS مخصص.
 */

const JITSI_DOMAIN = "meet.jit.si";

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
}

/** غرفة ثابتة لمحادثة/مجلس — نفس المُعرّف يعطي نفس الغرفة دائمًا. */
export function jitsiRoomName(kind: "call" | "council" | "squad", id: string): string {
  return `wanas-${kind}-${sanitize(id) || "room"}`;
}

/** رابط الغرفة مع إعدادات مبدئية (كاميرا/صوت حسب النوع). */
export function jitsiRoomUrl(kind: "call" | "council" | "squad", id: string, options?: { video?: boolean; displayName?: string }): string {
  const room = jitsiRoomName(kind, id);
  const params = new URLSearchParams();
  if (!options?.video) params.set("config.startWithVideoMuted", "true");
  params.set("config.disableDeepLinking", "true");
  params.set("config.prejoinPageEnabled", "false");
  if (options?.displayName) params.set("userInfo.displayName", options.displayName);
  return `https://${JITSI_DOMAIN}/${room}?${params.toString()}`;
}
