import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * مسار خادمي احتياطي للتطوير. الإنتاج يستخدم Supabase Edge Function
 * `push-drain` المجدولة عبر pg_cron؛ لا يوضع مفتاح الخدمة على الهاتف.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;
const MAX_ATTEMPTS = 5;

type DispatchRow = {
  id: string;
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  attempts: number;
};

type ExpoTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

let admin: SupabaseClient | null = null;

function adminClient(): SupabaseClient | null {
  if (admin) return admin;
  // Prefer the app's project-scoped URL; the host may provide a different global URL.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PushResult = { sent: number; failed: number; removed: number; retried: number; skipped: boolean; reason?: string };

/** يصرف دفعة واحدة بعد حجز صفوفها ذريًا في قاعدة البيانات. */
export async function drainPushQueue(limit = BATCH): Promise<PushResult> {
  const sb = adminClient();
  if (!sb) return { sent: 0, failed: 0, removed: 0, retried: 0, skipped: true, reason: "missing_service_role_key" };

  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || BATCH)));
  const { data, error } = await sb.rpc("claim_push_dispatch", { p_limit: safeLimit });
  if (error) return { sent: 0, failed: 0, removed: 0, retried: 0, skipped: true, reason: error.message };
  const queue = (data ?? []) as DispatchRow[];
  if (!queue.length) return { sent: 0, failed: 0, removed: 0, retried: 0, skipped: false };

  let sent = 0;
  let failed = 0;
  let removed = 0;
  let retried = 0;
  const valid = queue.filter((row) => row.token?.startsWith("ExponentPushToken["));
  const malformed = queue.filter((row) => !row.token?.startsWith("ExponentPushToken["));

  for (const row of malformed) {
    failed++;
    await sb.from("push_dispatch").update({ status: "failed", last_error: "invalid_token_format", claimed_at: null }).eq("id", row.id);
  }
  if (!valid.length) return { sent, failed, removed, retried, skipped: false };

  let tickets: ExpoTicket[];
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(valid.map((row) => ({
        to: row.token,
        title: row.title,
        body: row.body,
        sound: "default",
        priority: "high",
        channelId: "wanas",
        data: row.data ?? {},
      }))),
    });
    const payload = await response.json() as { data?: ExpoTicket[] };
    if (!response.ok) throw new Error(`expo_http_${response.status}`);
    tickets = payload.data ?? [];
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network_error";
    for (const row of valid) {
      const retry = row.attempts < MAX_ATTEMPTS;
      await sb.from("push_dispatch").update({
        status: retry ? "pending" : "failed",
        last_error: reason.slice(0, 300),
        claimed_at: null,
      }).eq("id", row.id);
      if (retry) retried++;
      else failed++;
    }
    return { sent, failed, removed, retried, skipped: false, reason };
  }

  for (let index = 0; index < valid.length; index++) {
    const row = valid[index];
    const ticket = tickets[index];
    if (ticket?.status === "ok") {
      const { error: updateError } = await sb.from("push_dispatch").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
        claimed_at: null,
      }).eq("id", row.id);
      if (updateError) failed++;
      else sent++;
      continue;
    }

    const code = ticket?.details?.error ?? ticket?.message ?? "missing_expo_ticket";
    if (code === "DeviceNotRegistered" || code === "InvalidCredentials") {
      const { error: deleteError } = await sb.from("push_tokens").delete().eq("token", row.token);
      if (!deleteError) removed++;
    }
    const retryable = !["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig", "MessageRateExceeded"].includes(code);
    const retry = retryable && row.attempts < MAX_ATTEMPTS;
    await sb.from("push_dispatch").update({
      status: retry ? "pending" : "failed",
      last_error: String(code).slice(0, 300),
      claimed_at: null,
    }).eq("id", row.id);
    if (retry) retried++;
    else failed++;
  }

  return { sent, failed, removed, retried, skipped: false };
}

export function registerPushRoutes(app: Express) {
  app.get("/api/push/health", (_req: Request, res: Response) => {
    const ready = !!(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL));
    res.json({ ok: ready, service: "wanas-push-dev-route" });
  });

  app.post("/api/push/drain", async (req: Request, res: Response) => {
    const expected = process.env.PUSH_DRAIN_SECRET;
    const provided = req.header("x-push-secret");
    if (!expected) {
      res.status(503).json({ ok: false, error: "push_secret_not_configured" });
      return;
    }
    if (!provided || !secretMatches(provided, expected)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || BATCH)));
    try {
      const result = await drainPushQueue(limit);
      res.status(result.skipped ? 503 : 200).json({ ok: !result.skipped, ...result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "drain_failed" });
    }
  });
}
