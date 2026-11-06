import { supabase } from "@/lib/supabase";
import { signedMediaUrl, saveToDevice } from "@/lib/media";

/**
 * التزنيل (القسم 17) — حفظ محتوى المنشور خارج التطبيق.
 * القفل: نفحص خصوصية المنشور وجدول الحظر قبل أي تنزيل، وما نسمحش
 * بتزنيل المحتوى الخاص أو المخفي عن المستخدم.
 */
export type DownloadReason =
  | "blocked"      // المحظور: مفيش تزنيل
  | "private"      // خصوصية الملف/المنشور: أنا بس وأصحابي
  | "one_time"     // لمرة واحدة: مفيش تزنيل
  | "ok"
  | "error";

export async function checkDownloadAllowed(postId: string): Promise<DownloadReason> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return "blocked";

    const { data: post, error } = await supabase
      .from("posts")
      .select("id, author_id, audience")
      .eq("id", postId)
      .single();
    if (error || !post) return "error";

    if (post.author_id === auth.user.id) return "ok";

    // Mutual-block check: blocked accounts cannot save each other's media
    const { data: block } = await supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${auth.user.id},blocked_id.eq.${post.author_id}),and(blocker_id.eq.${post.author_id},blocked_id.eq.${auth.user.id})`
      )
      .limit(1);
    if (block && block.length) return "blocked";

    if (post.audience === "private" || post.audience === "only_me") return "private";

    return "ok";
  } catch {
    return "error";
  }
}

const BLOCK_MESSAGES: Record<Exclude<DownloadReason, "ok">, string> = {
  blocked: "المحتوى ده مش متاح للتزنيل",
  private: "المشغّل مفعّل قفل التزنيل على المحتوى ده",
  one_time: "الصورة لمرة واحدة — مش هتقدّر تزنّلها",
  error: "حصلت مشكلة، جرّب تاني",
};

export async function downloadPostMedia(
  postId: string,
  storagePath: string,
  filename: string
): Promise<{ ok: boolean; message?: string; uri?: string }> {
  const reason = await checkDownloadAllowed(postId);
  if (reason !== "ok") return { ok: false, message: BLOCK_MESSAGES[reason] };

  try {
    const signed = await signedMediaUrl(storagePath, 900);
    if (!signed) return { ok: false, message: BLOCK_MESSAGES.error };
    const uri = await saveToDevice(signed, filename);
    return { ok: true, uri };
  } catch {
    return { ok: false, message: BLOCK_MESSAGES.error };
  }
}