import { MEDIA_FILTERS } from "@/components/media-filters";

/** فلاتر القصة — بتستخدم نفس مجموعة فلاتر الميديا (طبقة لون حقيقية فوق الصورة). */
export const STORY_FILTERS: { key: string; label: string; swatch: string; overlay: string }[] = MEDIA_FILTERS.map((f) => ({
  key: f.key,
  label: f.label,
  swatch: f.swatch === "transparent" ? "transparent" : `${f.swatch}88`,
  overlay: f.key === "none" ? "transparent" : `${f.top}33`,
}));
export function filterOverlay(filter?: string | null): string {
  return STORY_FILTERS.find((f) => f.key === filter)?.overlay ?? "transparent";
}
