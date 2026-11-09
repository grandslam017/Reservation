// Pure, testable LINE identity verification. No LINE User ID is trusted from browser input.
export async function verifyLineIDToken(rawToken, channelId, fetcher=fetch) {
  if (typeof rawToken !== "string" || rawToken.length < 100 || rawToken.length > 4096 || !/^[A-Za-z0-9_.-]+$/.test(rawToken)) {
    return { ok: false, error: "INVALID_LINE_TOKEN" };
  }
  if (typeof channelId !== "string" || !/^\d{8,15}$/.test(channelId)) return { ok: false, error: "CHANNEL_NOT_CONFIGURED" };
  let response;
  try {
    const form = new URLSearchParams({ id_token: rawToken, client_id: channelId });
    response = await fetcher("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(5000),
    });
  } catch { return { ok: false, error: "LINE_VERIFICATION_UNAVAILABLE" }; }
  if (!response.ok) return { ok: false, error: "INVALID_LINE_TOKEN" };
  let claims;
  try { claims=await response.json(); } catch { return { ok: false, error: "INVALID_LINE_RESPONSE" }; }
  const now = Math.floor(Date.now()/1000);
  if (!claims || claims.iss !== "https://access.line.me" || claims.aud !== channelId ||
      !/^U[0-9a-fA-F]{32}$/.test(claims.sub ?? "") ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now+60) {
    return { ok: false, error: "INVALID_LINE_CLAIMS" };
  }
  return { ok: true, lineUserId: claims.sub };
}
// Deterministic UUID derived only from the LINE-verified user identity.
// Same LINE account -> same hold owner across devices; cannot be chosen by caller.
export async function actorIdFromVerifiedLineId(lineUserId) {
  if (!/^U[0-9a-fA-F]{32}$/.test(lineUserId ?? "")) throw new Error("INVALID_LINE_ID");
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("grandslam-staging-liff-actor-v1:"+lineUserId)));
  bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes.subarray(0,16)].map(v=>v.toString(16).padStart(2,"0")).join("");
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}
