import { useEffect, useState } from "react";

/**
 * حالة رفع المنشور المشتركة بين شاشة النشر والرئيسية،
 * عشان المستخدم يشوف «جاري تحميل منشورك + النسبة» تحت القصص حتى لو رجع للرئيسية.
 */
export type UploadState = {
  state: "idle" | "uploading" | "saving" | "done";
  percent: number;
  kind: string | null;
};

let current: UploadState = { state: "idle", percent: 0, kind: null };
const listeners = new Set<(s: UploadState) => void>();

export function setUploadStatus(next: Partial<UploadState>): void {
  current = { ...current, ...next };
  listeners.forEach((l) => l(current));
}

export function getUploadStatus(): UploadState {
  return current;
}

export function useUploadStatus(): UploadState {
  const [value, setValue] = useState<UploadState>(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
