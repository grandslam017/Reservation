import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const EXPECTED_STAGING_REF = "kssxxizhpoxxlbsehymk";
const ALLOWED_ORIGINS = new Set(["https://grandslam017.github.io", "http://localhost:5173", "http://127.0.0.1:5173"]);
const allowedActions = new Set(["availability", "create", "confirm", "release", "verify-payment"]);
const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRx = /^\d{4}-\d{2}-\d{2}$/;

function reply(status: number, data: unknown, origin: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}
function uuid(v: unknown): v is string { return typeof v === "string" && uuidRx.test(v); }
function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !dateRx.test(v)) return false;
  const d = new Date(v + "T00:00:00.000Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { error: "ORIGIN_NOT_ALLOWED" }, null);
  if (req.method === "OPTIONS") return reply(204, null, origin);
  if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Hard stop if accidentally deployed to a different project.
  if (!url.startsWith("https://" + EXPECTED_STAGING_REF + ".supabase.co") || !publicKey || !serviceKey) {
    console.error("Staging backend environment mismatch or missing keys");
    return reply(503, { error: "STAGING_CONFIGURATION_REQUIRED" }, origin);
  }
  const authorization = req.headers.get("Authorization") ?? "";
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match) return reply(401, { error: "AUTH_REQUIRED" }, origin);

  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply(413, { error: "REQUEST_TOO_LARGE" }, origin);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("object required");
    } catch {
      return reply(400, { error: "INVALID_JSON" }, origin);
    }

    const action = body.action;
    // Retire the older Supabase-Auth confirmation route: it does not require
    // LINE-verified slip evidence and MUST NOT be a parallel booking path.
    if (action === "confirm") {
      return reply(410, { error: "LEGACY_CONFIRM_DISABLED_USE_VERIFIED_LIFF" }, origin);
    }
    if (typeof action !== "string" || !allowedActions.has(action)) {
      return reply(400, { error: "INVALID_ACTION" }, origin);
    }

    // The user ID is derived only from the verified Supabase Auth token.
    const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(match[1]);
    if (authError || !user?.id) return reply(401, { error: "INVALID_SESSION" }, origin);

    // Admin status must come from protected app_metadata, not user-editable metadata.
    if (action === "verify-payment" && user.app_metadata?.role !== "admin") {
      return reply(403, { error: "ADMIN_ONLY" }, origin);
    }
    const backend = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const limit = { availability: 30, create: 5, confirm: 8, release: 15, "verify-payment": 10 }[action as "availability" | "create" | "confirm" | "release" | "verify-payment"];
    const rate = await backend.rpc("staging_check_rate_limit", {
      p_actor: user.id, p_action: action, p_limit: limit,
    });
    if (rate.error) {
      console.error("Rate limiter database failure", rate.error.code);
      return reply(503, { error: "RATE_LIMIT_SERVICE_UNAVAILABLE" }, origin);
    }
    if (!rate.data?.allowed) return reply(429, { error: "TOO_MANY_REQUESTS" }, origin);

    let result;
    if (action === "availability") {
      if (!validDate(body.date) || (body.court != null && body.court !== "Main Court")) {
        return reply(400, { error: "INVALID_INPUT" }, origin);
      }
      result = await backend.rpc("staging_get_availability", { p_date: body.date, p_court: "Main Court" });
    } else if (action === "create") {
      if (!validDate(body.date) || !Array.isArray(body.slots) || body.slots.length < 1 ||
          body.slots.length > 8 || !body.slots.every(s => typeof s === "string" && s.length <= 20) ||
          (body.court != null && body.court !== "Main Court")) {
        return reply(400, { error: "INVALID_INPUT" }, origin);
      }
      result = await backend.rpc("staging_create_hold_v2", {
        p_owner: user.id, p_date: body.date, p_slots: body.slots, p_court: "Main Court",
      });
    } else if (action === "confirm") {
      if (!uuid(body.hold_token) || !uuid(body.request_id) ||
          typeof body.name !== "string" || typeof body.phone !== "string" ||
          (body.email != null && typeof body.email !== "string")) {
        return reply(400, { error: "INVALID_INPUT" }, origin);
      }
      // Retired branch: the early action gate above returns 410.
      // Kept temporarily for API shape compatibility; unreachable over HTTP.
      result = await backend.rpc("staging_confirm_hold_v2", {
        p_owner: user.id,
        p_token: body.hold_token,
        p_request_id: body.request_id,
        p_name: body.name,
        p_phone: body.phone,
        p_email: body.email ?? null,
      });
    } else if (action === "release") {
      if (!uuid(body.hold_token)) return reply(400, { error: "INVALID_INPUT" }, origin);
      result = await backend.rpc("staging_release_hold_v2", {
        p_owner: user.id, p_token: body.hold_token,
      });
    } else {
      if (!uuid(body.booking_id) || (body.reference != null && (typeof body.reference !== "string" || body.reference.length > 100))) {
        return reply(400, { error: "INVALID_INPUT" }, origin);
      }
      result = await backend.rpc("staging_verify_booking_payment", {
        p_booking_id: body.booking_id, p_admin_id: user.id, p_reference: body.reference ?? null,
      });
    }

    if (result.error) {
      console.error("Staging RPC failed", action, result.error.code);
      return reply(400, { error: "BOOKING_REQUEST_REJECTED" }, origin);
    }
    // Payment is deliberately not represented as verified here.
    return reply(200, { ...result.data, environment: "staging", payment_verified: false }, origin);
  } catch (err) {
    console.error("Staging edge handler error", err instanceof Error ? err.name : "unknown");
    return reply(500, { error: "INTERNAL_ERROR" }, origin);
  }
});
