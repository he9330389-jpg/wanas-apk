import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ClaimedMessage = {
  id: string;
  notification_id: string;
  user_id: string;
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

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "worker_environment_missing" }, 503);

  const suppliedSecret = request.headers.get("x-push-secret");
  if (!suppliedSecret) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authorized, error: authError } = await admin.rpc("validate_push_drain_secret", {
    p_secret: suppliedSecret,
  });
  if (authError) return json({ ok: false, error: "secret_validation_unavailable" }, 503);
  if (authorized !== true) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const requestedLimit = Number(body.limit ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 100;

  const { data: claimed, error: claimError } = await admin.rpc("claim_push_dispatch", {
    p_limit: limit,
  });
  if (claimError) return json({ ok: false, error: "queue_claim_failed" }, 500);

  const rows = (claimed ?? []) as ClaimedMessage[];
  if (rows.length === 0) return json({ ok: true, sent: 0, failed: 0, retried: 0, removed: 0 });

  const valid = rows.filter((row) => typeof row.token === "string" && row.token.startsWith("ExponentPushToken["));
  const malformed = rows.filter((row) => !valid.includes(row));
  let failed = 0;
  let retried = 0;
  let removed = 0;
  let sent = 0;
  let persistenceErrors = 0;

  for (const row of malformed) {
    const { error } = await admin.from("push_dispatch").update({
      status: "failed",
      last_error: "invalid_token_format",
      claimed_at: null,
    }).eq("id", row.id);
    if (error) {
      persistenceErrors++;
      console.error("push_dispatch_state_update_failed", row.id, error.message);
    } else {
      failed++;
    }
  }

  if (valid.length === 0) {
    return json({ ok: persistenceErrors === 0, sent, failed, retried, removed, persistenceErrors }, persistenceErrors ? 500 : 200);
  }

  let tickets: ExpoTicket[];
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
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
    const payload = await response.json().catch(() => ({})) as { data?: ExpoTicket[] };
    if (!response.ok) throw new Error(`expo_http_${response.status}`);
    tickets = Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "expo_network_error";
    for (const row of valid) {
      const retry = row.attempts < MAX_ATTEMPTS;
      const { error: updateError } = await admin.from("push_dispatch").update({
        status: retry ? "pending" : "failed",
        last_error: message.slice(0, 300),
        claimed_at: null,
      }).eq("id", row.id);
      if (updateError) {
        persistenceErrors++;
        console.error("push_dispatch_state_update_failed", row.id, updateError.message);
      } else if (retry) retried++;
      else failed++;
    }
    return json({ ok: persistenceErrors === 0, sent, failed, retried, removed, persistenceErrors }, persistenceErrors ? 500 : 200);
  }

  for (let index = 0; index < valid.length; index++) {
    const row = valid[index];
    const ticket = tickets[index];
    if (ticket?.status === "ok") {
      const { error } = await admin.from("push_dispatch").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
        claimed_at: null,
      }).eq("id", row.id);
      if (error) {
        failed++;
        persistenceErrors++;
        console.error("push_dispatch_state_update_failed", row.id, error.message);
      }
      else sent++;
      continue;
    }

    const code = ticket?.details?.error ?? ticket?.message ?? "missing_expo_ticket";
    if (code === "DeviceNotRegistered" || code === "InvalidCredentials") {
      const { error: deleteError } = await admin.from("push_tokens").delete().eq("token", row.token);
      if (deleteError) {
        persistenceErrors++;
        console.error("push_token_cleanup_failed", row.id, deleteError.message);
      } else {
        removed++;
      }
    }
    const retryable = !["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig", "MessageRateExceeded"].includes(code);
    const retry = retryable && row.attempts < MAX_ATTEMPTS;
    const { error: updateError } = await admin.from("push_dispatch").update({
      status: retry ? "pending" : "failed",
      last_error: String(code).slice(0, 300),
      claimed_at: null,
    }).eq("id", row.id);
    if (updateError) {
      persistenceErrors++;
      console.error("push_dispatch_state_update_failed", row.id, updateError.message);
    } else if (retry) retried++;
    else failed++;
  }

  return json({ ok: persistenceErrors === 0, sent, failed, retried, removed, persistenceErrors }, persistenceErrors ? 500 : 200);
});
