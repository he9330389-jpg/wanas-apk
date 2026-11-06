import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export type BagKind =
  | "image" | "camera" | "video" | "file"
  | "location" | "contact" | "audio" | "poll" | "stamp"
  | "scheduled" | "temporary" | "translate";

export type PickedMedia = {
  uri: string;
  name: string;
  mime: string;
  size?: number;
  kind: BagKind;
  /** مدة الفيديو بالثواني لو المتاح (الحد في القصص 90 ثانية). */
  duration?: number;
};

const MAX_BYTES = 50 * 1024 * 1024; // 50MB per the bucket limit
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm|3gpp|x-matroska)|audio\/(mpeg|mp4|aac|ogg|wav|webm|flac|amr|3gpp|opus)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)$/;

/** امتداد الملف -> نوع MIME معياري (الموبايل أحيانًا بيرجّع أنواع غريبة زي audio/m4a أو application/octet-stream). */
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska",
  m4a: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  flac: "audio/flac", amr: "audio/amr", "3ga": "audio/3gpp",
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain",
};
const MIME_ALIASES: Record<string, string> = {
  "audio/m4a": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav", "audio/x-aac": "audio/aac", "audio/aacp": "audio/aac", "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg",
  "video/x-m4v": "video/mp4", "video/mov": "video/quicktime", "audio/x-flac": "audio/flac",
};

/** يصلّح نوع الملف حسب الامتداد لو النظام رجّع نوع ناقص/غريب. */
export function normalizeMime(mime: string | null | undefined, name: string): string {
  const raw = (mime ?? "").toLowerCase().split(";")[0].trim();
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const byExt = EXT_MIME[ext];
  if (!raw || raw === "application/octet-stream" || raw === "binary/octet-stream") return byExt ?? raw ?? "application/octet-stream";
  return MIME_ALIASES[raw] ?? raw;
}

export function normalizeMedia(m: PickedMedia): PickedMedia {
  const mime = normalizeMime(m.mime, m.name);
  return mime === m.mime ? m : { ...m, mime };
}

export function validateMedia(m: PickedMedia): string | null {
  if (m.size && m.size > MAX_BYTES) return "الملف أكبر من 50 ميجا";
  if (!ALLOWED.test(normalizeMime(m.mime, m.name))) return "نوع الملف مش مدعوم";
  return null;
}

async function askPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return perm.granted;
}

export async function pickImage(fromCamera = false): Promise<PickedMedia | null> {
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    return { uri: a.uri, name: a.fileName ?? "camera.jpg", mime: normalizeMime(a.mimeType, a.fileName ?? "camera.jpg"), size: a.fileSize, kind: "camera" };
  }
  if (!(await askPermission())) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ["images"], allowsMultipleSelection: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.fileName ?? "image.jpg", mime: normalizeMime(a.mimeType, a.fileName ?? "image.jpg"), size: a.fileSize, kind: "image" };
}

export async function pickVideo(): Promise<PickedMedia | null> {
  if (!(await askPermission())) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoMaxDuration: 90 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return {
    uri: a.uri,
    name: a.fileName ?? "clip.mp4",
    mime: normalizeMime(a.mimeType ?? "video/mp4", a.fileName ?? "clip.mp4"),
    size: a.fileSize,
    kind: "video",
    duration: a.duration ? Math.round(a.duration / 1000) : undefined,
  };
}

export async function pickFile(): Promise<PickedMedia | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mime: normalizeMime(a.mimeType, a.name), size: a.size ?? undefined, kind: "file" };
}

/** اختيار ملف صوتي من الجهاز (mp3 / m4a / wav / aac / ogg ...). */
export async function pickAudio(): Promise<PickedMedia | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mime: normalizeMime(a.mimeType, a.name), size: a.size ?? undefined, kind: "audio" };
}

/**
 * Uploads to the private chat-media bucket inside the user's own folder and
 * returns the storage path (never a public URL — the bucket is private).
 */
export async function uploadMedia(userId: string, media: PickedMedia): Promise<string> {
  // مسار واحد موثوق للرفع (نفس المنشورات): بيستخدم رابط Supabase الصحيح وبيدعم الصور والفيديو والصوت على الموبايل.
  const { uploadWithProgress } = await import("@/lib/upload");
  return uploadWithProgress(userId, media);
}

/** Creates a short-lived signed URL to display/download a private object. */
export async function signedMediaUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}

/**
 * رابط عام دائم للميديا (صور/فيديو/صوت/PDF) — بيشتغل لأي مستخدم مسجّل،
 * وبيستخدم للعرض في آخر الأخبار والملف الشخصي وتبويب الفيديو.
 * لو المسار أصلاً رابط كامل بيرجّعه زي ما هو.
 */
export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
  return data.publicUrl;
}

/** Saves a remote/signed file to the device and returns the local URI. */
export async function saveToDevice(url: string, filename: string): Promise<string> {
  if (Platform.OS === "web") return url;
  const dir = new Directory(Paths.cache, "wanas-downloads");
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, filename);
  if (target.exists) target.delete();
  const downloaded = await File.downloadFileAsync(url, target);
  return downloaded.uri;
}
