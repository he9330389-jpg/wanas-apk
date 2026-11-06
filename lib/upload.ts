import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { normalizeMedia, validateMedia, type PickedMedia } from "@/lib/media";

/**
 * رفع حقيقي مع نسبة مئوية.
 * على الهاتف بنستخدم createUploadTask (تقدّم فعلي بالبايتات)، وعلى الويب XHR.
 * رسالة النجاح في الشاشات مش بتظهر قبل ما الملف يتّرفع فعلًا والصف يتحفظ في قاعدة البيانات.
 */
const BUCKET = "chat-media";

export function storagePath(userId: string, media: PickedMedia): string {
  const ext = (media.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

type Progress = (percent: number) => void;

function parseStorageError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? null;
  } catch {
    return null;
  }
}

async function uploadOnWeb(url: string, blob: Blob, mime: string, token: string, onProgress?: Progress): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(parseStorageError(xhr.responseText) ?? "الرفع فشل"));
      }
    };
    xhr.onerror = () => reject(new Error("اتصال النت قطع أثناء الرفع"));
    xhr.send(blob);
  });
}

export async function uploadWithProgress(
  userId: string,
  rawMedia: PickedMedia,
  onProgress?: Progress,
): Promise<string> {
  const media = normalizeMedia(rawMedia);
  const problem = validateMedia(media);
  if (problem) throw new Error(problem);
  const path = storagePath(userId, media);
  const { data: session } = await supabase.auth.getSession();
  let token = session.session?.access_token;
  if (!token) {
    // الجلسة ممكن تكون منتهية — نحاول نجددها قبل ما نقول للمستخدم يسجل دخول
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    token = refreshed?.data.session?.access_token;
  }
  // الرابط بيجي من .env أو من app.config.ts (process.env لوحده بيطلع فاضي في نسخة الـ APK)
  const baseUrl = SUPABASE_URL;
  if (!token) throw new Error("الجلسة انتهت — سجّل دخولك تاني وجرّب");
  if (!baseUrl) throw new Error("إعدادات الاتصال ناقصة (رابط Supabase) — راجع .env أو app.config.ts");
  const url = `${baseUrl}/storage/v1/object/${BUCKET}/${path}`;

  if (Platform.OS === "web") {
    const blob = await (await fetch(media.uri)).blob();
    await uploadOnWeb(url, blob, media.mime, token, onProgress);
    return path;
  }

  const task = FileSystem.createUploadTask(
    url,
    media.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "false",
        "content-type": media.mime,
      },
    },
    (p) => {
      if (p.totalBytesExpectedToSend > 0) {
        onProgress?.(Math.min(99, Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100)));
      }
    },
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    const message = parseStorageError(result?.body ?? "");
    throw new Error(message ?? `الرفع فشل (${result?.status ?? "?"})`);
  }
  onProgress?.(100);
  return path;
}
