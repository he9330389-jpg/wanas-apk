import { supabase } from "@/lib/supabase";

/**
 * طبقة بيانات صغيرة للميزات الجديدة (الحسابات · الأوسمة · الهدايا · الصفحات).
 * كل الجداول مقفولة بـRLS، والقراءة/الكتابة بتتحقق من صاحب الصف.
 */

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  verification_tone: string | null;
  link_url: string | null;
  city: string | null;
  work: string | null;
  education: string | null;
  interests: string[] | null;
  social_status: string | null;
  ai_content: boolean | null;
  default_audience: string | null;
  one_time_from: string | null;
  status_text: string | null;
};

export async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, cover_url, bio, is_verified, verification_tone, link_url, city, work, education, interests, social_status, ai_content, default_audience, one_time_from, status_text",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as PublicProfile) ?? null;
}

export async function updateProfile(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** ترتيب أوسمة ونس كما في دليل الهوية. */
export const TONES = ["red", "orange", "green", "blue", "yellow", "purple"] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABELS: Record<string, string> = {
  red: "أحمر · توثيق رسمي",
  orange: "برتقالي · منشئ محتوى",
  green: "أخضر · شخصية عامة",
  blue: "أزرق · مؤسسة",
  yellow: "أصفر · ونس مميز",
  purple: "بنفسجي · شريك",
  mint: "سكروز · ألوان ناعمة",
  sky: "لبني · ألوان ناعمة",
  pink: "بينك · ألوان ناعمة",
  black: "أسود · ألوان ناعمة",
  white: "أبيض · ألوان ناعمة",
  rose: "وردي · ألوان ناعمة",
  olive: "زيتوني · ألوان ترابية",
  teal: "بترولي · ألوان ترابية",
  tan: "جملي · ألوان ترابية",
};

/** الألوان الإضافية المعتمدة (ناعمة وترابية) — بتتمنح من الفريق بجانب الستة الأساسية. */
export const EXTRA_TONES = ["mint", "sky", "pink", "black", "white", "rose", "olive", "teal", "tan"] as const;

export async function friendsCount(uid: string): Promise<number> {
  const { count } = await supabase
    .from("friends")
    .select("user_a", { count: "exact", head: true })
    .or(`user_a.eq.${uid},user_b.eq.${uid}`);
  return count ?? 0;
}

/** هل بيني وبين المستخدم التاني صداقة مقبولة؟ */
export async function areFriends(me: string, other: string): Promise<boolean> {
  const { data } = await supabase
    .from("friends")
    .select("user_a")
    .or(`and(user_a.eq.${me},user_b.eq.${other}),and(user_a.eq.${other},user_b.eq.${me})`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** أصدقاء الأصدقاء: مجموعة معرّفاتهم (لتطبيق الجمهور) — تُستخدم على الخادم/العميل للعرض فقط. */
export async function friendIds(uid: string): Promise<string[]> {
  const { data } = await supabase
    .from("friends")
    .select("user_a, user_b")
    .or(`user_a.eq.${uid},user_b.eq.${uid}`)
    .limit(1000);
  return (data ?? []).map((r: { user_a: string; user_b: string }) => (r.user_a === uid ? r.user_b : r.user_a));
}

export type Gift = {
  id: string;
  sender_id: string;
  recipient_id: string;
  post_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
};

/** يبعت هدية (نقطة ونس) — بتتحسب للرصيد لو المستلم منشئ مؤهل، وبتظهر في المنشور. */
export async function sendGift(input: { senderId: string; recipientId: string; postId?: string | null; amount: number; note?: string }) {
  const { error } = await supabase.from("gifts").insert({
    sender_id: input.senderId,
    recipient_id: input.recipientId,
    post_id: input.postId ?? null,
    amount: input.amount,
    note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export type EarningRow = {
  id: string;
  creator_id: string;
  source: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export async function myEarnings(uid: string): Promise<{ rows: EarningRow[]; total: number; pending: number }> {
  const { data } = await supabase
    .from("creator_earnings")
    .select("id, creator_id, source, amount, note, created_at")
    .eq("creator_id", uid)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as EarningRow[];
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  return { rows, total, pending: 0 };
}

export type PageRow = {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  about: string | null;
  category: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean | null;
  created_at: string;
};

export async function myPages(uid: string): Promise<PageRow[]> {
  const { data } = await supabase
    .from("pages")
    .select("id, owner_id, name, handle, about, category, avatar_url, cover_url, is_verified, created_at")
    .eq("owner_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []) as PageRow[];
}

export async function createPage(input: { ownerId: string; name: string; handle: string; category: string; about?: string }): Promise<PageRow> {
  const handle = input.handle.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
  if (!input.name.trim()) throw new Error("اكتب اسم الصفحة");
  if (handle.length < 3) throw new Error("اسم المستخدم للصفحة لازم 3 حروف على الأقل (إنجليزي/أرقام)");
  const { data, error } = await supabase
    .from("pages")
    .insert({
      owner_id: input.ownerId,
      name: input.name.trim(),
      handle,
      category: input.category,
      about: input.about?.trim() || null,
    })
    .select("id, owner_id, name, handle, about, category, avatar_url, cover_url, is_verified, created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("اسم المستخدم ده محجوز لصفحة تانية");
    throw new Error(error.message);
  }
  return data as PageRow;
}

/** جدول medals في WANAS-App بيخزّن الوسام في العمود `medal` وتاريخه في `awarded_at`. */
export type Medal = {
  id: string;
  user_id: string;
  medal: string;
  week_start: string;
  awarded_at: string;
};

export const MEDAL_LABELS: Record<string, string> = {
  star_of_week: "نجم الأسبوع",
  golden_council: "المجلس الذهبي",
  friendly: "الونيس",
};

export async function myMedals(uid: string): Promise<Medal[]> {
  const { data } = await supabase
    .from("medals")
    .select("id, user_id, medal, week_start, awarded_at")
    .eq("user_id", uid)
    .order("awarded_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Medal[];
}
