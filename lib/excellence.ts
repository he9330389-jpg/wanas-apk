import { supabase } from "@/lib/supabase";
import { uploadMedia, type PickedMedia } from "@/lib/media";

/* ===================== كبسولة الذكرى ===================== */

export type Capsule = {
  id: string;
  owner_id: string;
  title: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  audience: "private" | "friends" | "public";
  open_at: string;
  opened_at: string | null;
  remind_before_hours: number | null;
  created_at: string;
  profiles?: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export type NewCapsule = {
  title: string;
  body?: string;
  media?: PickedMedia | null;
  audience: "private" | "friends" | "public";
  openAt: Date;
  remindBeforeHours?: number;
};

export async function listMyCapsules(userId: string) {
  const { data, error } = await supabase
    .from("memory_capsules")
    .select("*")
    .eq("owner_id", userId)
    .order("open_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Capsule[];
}

/** الكبسولات اللي فتحت ومتاحة لأصحابي/الجميع. */
export async function listOpenedCapsules(userId: string) {
  const { data, error } = await supabase
    .from("memory_capsules")
    .select("*, profiles:owner_id(display_name, username, avatar_url)")
    .neq("owner_id", userId)
    .lte("open_at", new Date().toISOString())
    .in("audience", ["friends", "public"])
    .order("open_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as Capsule[];
}

export async function createCapsule(userId: string, input: NewCapsule) {
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  if (input.media) {
    mediaUrl = await uploadMedia(userId, input.media);
    mediaType = input.media.kind === "image" ? "image" : input.media.kind === "video" ? "video" : "audio";
  }
  const { data, error } = await supabase
    .from("memory_capsules")
    .insert({
      owner_id: userId,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      media_url: mediaUrl,
      media_type: mediaType ?? "none",
      audience: input.audience,
      open_at: input.openAt.toISOString(),
      remind_before_hours: input.remindBeforeHours ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteCapsule(id: string) {
  const { error } = await supabase.from("memory_capsules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function openCapsule(id: string) {
  const { error } = await supabase.rpc("open_capsule", { p_id: id });
  if (error) throw new Error(error.message);
}

export function capsuleCountdown(openAt: string): string {
  const diff = new Date(openAt).getTime() - Date.now();
  if (diff <= 0) return "فاتحة";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 365) return `بعد ${Math.round(days / 365)} سنة`;
  if (days >= 30) return `بعد ${Math.round(days / 30)} شهر`;
  if (days >= 1) return `بعد ${days} يوم`;
  const hours = Math.max(1, Math.floor(diff / 3_600_000));
  return `بعد ${hours} ساعة`;
}

/* ===================== الشّلة ===================== */

export type Squad = {
  id: string;
  name: string;
  emoji: string;
  theme: "masri" | "khaligi" | "shami";
  description: string | null;
  owner_id: string;
  avatar_url: string | null;
  max_members: number;
  invite_code: string;
  conversation_id: string | null;
  majlis_room_id: string | null;
  created_at: string;
};

export type SquadMember = {
  squad_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  muted: boolean;
  profiles?: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export const THEMES = [
  { key: "masri", label: "مصري", emoji: "🇪🇬" },
  { key: "khaligi", label: "خليجي", emoji: "🇸🇦" },
  { key: "shami", label: "شامي", emoji: "🇸🇾" },
] as const;

export async function listMySquads(userId: string) {
  const { data, error } = await supabase.from("squad_members").select("squad_id, role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.squad_id);
  if (ids.length === 0) return [] as Array<Squad & { my_role: string }>;
  const { data: squads, error: sqError } = await supabase.from("squads").select("*").in("id", ids);
  if (sqError) throw new Error(sqError.message);
  return (squads ?? []).map((s) => ({
    ...(s as Squad),
    my_role: (data ?? []).find((r) => r.squad_id === s.id)?.role ?? "member",
  }));
}

export async function createSquad(input: { name: string; emoji: string; theme: string; max: number }) {
  const { data, error } = await supabase.rpc("create_squad", {
    p_name: input.name.trim(),
    p_emoji: input.emoji,
    p_theme: input.theme,
    p_max: input.max,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function joinSquad(code: string) {
  const { data, error } = await supabase.rpc("join_squad_by_code", { p_code: code.trim() });
  if (error) {
    const map: Record<string, string> = {
      SQUAD_NOT_FOUND: "مفيش شلّة بالكود ده",
      SQUAD_FULL: "الشلّة وصلت للحد الأقصى (15)",
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    throw new Error(key ? map[key] : error.message);
  }
  return data as string;
}

export async function getSquad(id: string) {
  const { data, error } = await supabase.from("squads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Squad | null;
}

export async function getSquadMembers(id: string) {
  const { data, error } = await supabase
    .from("squad_members")
    .select("*, profiles:user_id(display_name, username, avatar_url)")
    .eq("squad_id", id);
  if (error) throw new Error(error.message);
  return (data ?? []) as SquadMember[];
}

export async function inviteToSquad(squadId: string, inviterId: string, inviteeIds: string[]) {
  if (inviteeIds.length === 0) return;
  const { error } = await supabase
    .from("squad_invites")
    .upsert(
      inviteeIds.map((id) => ({ squad_id: squadId, inviter_id: inviterId, invitee_id: id, status: "pending" })),
      { onConflict: "squad_id,invitee_id" },
    );
  if (error) throw new Error(error.message);
}

export async function listMySquadInvites(userId: string) {
  const { data, error } = await supabase
    .from("squad_invites")
    .select("id, squad_id, status, created_at, squads:squad_id(name, emoji, theme)")
    .eq("invitee_id", userId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    squads: Array.isArray(row.squads) ? (row.squads[0] ?? null) : row.squads,
  })) as Array<{
    id: string;
    squad_id: string;
    status: string;
    created_at: string;
    squads: { name: string; emoji: string; theme: string } | null;
  }>;
}

export async function respondSquadInvite(inviteId: string, squadId: string, accept: boolean) {
  const { error } = await supabase.from("squad_invites").update({ status: accept ? "accepted" : "declined" }).eq("id", inviteId);
  if (error) throw new Error(error.message);
  if (!accept) return;
  const { error: joinError } = await supabase.from("squad_members").insert({ squad_id: squadId, user_id: (await supabase.auth.getUser()).data.user?.id, role: "member" });
  if (joinError && !joinError.message.includes("duplicate")) throw new Error(joinError.message);
}

export async function leaveSquad(squadId: string, userId: string) {
  const { error } = await supabase.from("squad_members").delete().eq("squad_id", squadId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setSquadMemberRole(squadId: string, userId: string, role: "admin" | "member") {
  const { error } = await supabase.from("squad_members").update({ role }).eq("squad_id", squadId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeSquadMember(squadId: string, userId: string) {
  const { error } = await supabase.from("squad_members").delete().eq("squad_id", squadId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** إنشاء مجلس خاص بالشّلة وربطه بها. */
export async function openSquadCouncil(squad: Squad, ownerId: string) {
  const { data, error } = await supabase
    .from("majlis_rooms")
    .insert({
      host_id: ownerId,
      title: `مجلس ${squad.emoji} ${squad.name}`,
      description: squad.description,
      kind: "private",
      status: "live",
      speak_policy: "raise_hand",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("majlis_members").insert({ room_id: data.id, user_id: ownerId, role: "host" });
  await supabase.from("squads").update({ majlis_room_id: data.id }).eq("id", squad.id);
  return data.id as string;
}

/* ===================== بطاقة شكر ===================== */

export type ThankCard = {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  sender_id: string;
  recipient_id: string;
  message: string | null;
  audio_url: string | null;
  audio_seconds: number | null;
  stamp_id: string | null;
  created_at: string;
  profiles?: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export async function sendThankCard(input: {
  senderId: string;
  recipientId: string;
  postId?: string | null;
  commentId?: string | null;
  message?: string;
  audio?: PickedMedia | null;
  stampId?: string | null;
  seconds?: number;
}) {
  if (input.senderId === input.recipientId) throw new Error("مش هتبعت لنفسك شكر 😄");
  let audioUrl: string | null = null;
  if (input.audio) audioUrl = await uploadMedia(input.senderId, input.audio);
  const { data, error } = await supabase
    .from("thank_cards")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      post_id: input.postId ?? null,
      comment_id: input.commentId ?? null,
      message: input.message?.trim() || null,
      audio_url: audioUrl,
      audio_seconds: input.seconds ?? null,
      stamp_id: input.stampId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("notifications").insert({
    recipient_id: input.recipientId,
    actor_id: input.senderId,
    kind: "thank_card",
    payload: { thank_card_id: data.id, post_id: input.postId ?? null },
  });
  return data.id as string;
}

export async function listThankCardsReceived(userId: string) {
  const { data, error } = await supabase
    .from("thank_cards")
    .select("*, profiles:sender_id(display_name, username, avatar_url)")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []) as ThankCard[];
}

export async function listThankCardsForPost(postId: string) {
  const { data, error } = await supabase
    .from("thank_cards")
    .select("*, profiles:sender_id(display_name, username, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ThankCard[];
}

/* ===================== ونسة الصباح ===================== */

export type MorningQuestion = { id: string; question: string; theme: string; active_on: string };

export type MorningAnswer = {
  id: string;
  question_id: string;
  user_id: string;
  body: string | null;
  audio_url: string | null;
  audio_seconds: number | null;
  created_at: string;
  profiles?: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
  cheers?: Array<{ user_id: string }>;
};

export async function getTodayQuestion(): Promise<MorningQuestion | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("morning_questions").select("*").eq("active_on", today).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as MorningQuestion;
  // لو تاريخ اليوم مش مزروع، نستخدم أقرب سؤال سابق
  const { data: fallback } = await supabase
    .from("morning_questions")
    .select("*")
    .lte("active_on", today)
    .order("active_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (fallback as MorningQuestion | null) ?? null;
}

export async function listAnswers(questionId: string) {
  const { data, error } = await supabase
    .from("morning_answers")
    .select("*, profiles:user_id(display_name, username, avatar_url), cheers:morning_cheers(user_id)")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []) as MorningAnswer[];
}

export async function answerMorning(input: {
  questionId: string;
  userId: string;
  body?: string;
  audio?: PickedMedia | null;
  seconds?: number;
}) {
  let audioUrl: string | null = null;
  if (input.audio) audioUrl = await uploadMedia(input.userId, input.audio);
  const { error } = await supabase.from("morning_answers").upsert(
    {
      question_id: input.questionId,
      user_id: input.userId,
      body: input.body?.trim() || null,
      audio_url: audioUrl,
      audio_seconds: input.seconds ?? null,
    },
    { onConflict: "question_id,user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function toggleCheer(answerId: string, userId: string, hasCheered: boolean) {
  if (hasCheered) {
    const { error } = await supabase.from("morning_cheers").delete().eq("answer_id", answerId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from("morning_cheers").insert({ answer_id: answerId, user_id: userId });
  if (error) throw new Error(error.message);
  return true;
}

/* ===================== حدود صحية ===================== */

export type WellbeingSettings = {
  user_id?: string;
  enabled: boolean;
  daily_limit_minutes: number;
  break_after_minutes: number;
  quiet_from: string | null;
  quiet_to: string | null;
  reminder_tone: "gentle" | "firm";
};

export const WELLBEING_DEFAULTS: WellbeingSettings = {
  enabled: true,
  daily_limit_minutes: 120,
  break_after_minutes: 45,
  quiet_from: "23:00",
  quiet_to: "07:00",
  reminder_tone: "gentle",
};

export async function getWellbeing(userId: string): Promise<WellbeingSettings> {
  const { data, error } = await supabase.from("wellbeing_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...WELLBEING_DEFAULTS, ...data } as WellbeingSettings) : { ...WELLBEING_DEFAULTS };
}

export async function saveWellbeing(userId: string, next: WellbeingSettings) {
  const { error } = await supabase.from("wellbeing_settings").upsert(
    { user_id: userId, ...next, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function todayMinutes(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("wellbeing_sessions")
    .select("minutes")
    .eq("user_id", userId)
    .gte("started_at", start.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + (row.minutes ?? 0), 0);
}

export async function logWellbeingMinutes(userId: string, minutes: number) {
  if (minutes <= 0) return;
  const { error } = await supabase.from("wellbeing_sessions").insert({ user_id: userId, minutes });
  if (error) throw new Error(error.message);
}

/* ===================== فصحى ↔ عامية ===================== */

export type DialectKey = "fusha" | "masri" | "khaligi" | "shami" | "en" | "fr" | "es" | "de" | "tr" | "ur";

export const DIALECT_LABELS: Record<DialectKey, string> = {
  fusha: "فصحى",
  masri: "مصري",
  khaligi: "خليجي",
  shami: "شامي",
  en: "إنجليزي",
  fr: "فرنسي",
  es: "إسباني",
  de: "ألماني",
  tr: "تركي",
  ur: "أردي",
};

/** اللهجات العربية أولًا — تظهر قبل اللغات العالمية في الشاشة. */
export const ARABIC_DIALECT_KEYS: DialectKey[] = ["fusha", "masri", "khaligi", "shami"];
export const WORLD_LANGUAGE_KEYS: DialectKey[] = ["en", "fr", "es", "de", "tr", "ur"];

export async function translateDialect(text: string, target: DialectKey, source: DialectKey | "auto" = "auto"): Promise<string> {
  const res = await fetch("/api/dialect/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target, source }),
  });
  const json = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!res.ok || !json.ok || !json.text) throw new Error(json.error ?? "التحويل فشل");
  return json.text;
}

export async function getDialectPrefs(userId: string) {
  const { data, error } = await supabase.from("dialect_prefs").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? { preferred_dialect: "masri", auto_translate: false }) as {
    preferred_dialect: DialectKey;
    auto_translate: boolean;
  };
}

export async function saveDialectPrefs(userId: string, preferred: DialectKey, auto: boolean) {
  const { error } = await supabase.from("dialect_prefs").upsert(
    { user_id: userId, preferred_dialect: preferred, auto_translate: auto, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}
