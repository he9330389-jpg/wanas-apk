/**
 * يطلّع رسالة مفهومة من أي نوع خطأ.
 * أخطاء Supabase (PostgrestError / StorageError) مش instanceof Error، فكان التطبيق
 * بيعرض "جرّب تاني" بدل السبب الحقيقي.
 */
export function errorMessage(e: unknown, fallback = "جرّب تاني"): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [o.message, o.error_description, o.details, o.hint].filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(" — ") + (typeof o.code === "string" ? ` (${o.code})` : "");
  }
  if (typeof e === "string" && e) return e;
  return fallback;
}
