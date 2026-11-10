// Server-only. This signs server-authorized commands, never arbitrary browser payloads.
export const AUDIENCE = 'grand-slam-gas-production-v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['health','sendConfirmation','cancelBooking','updateNotes','backup',
  'logAdminAction','getAdminLogs','getExistingBookings','lineWebhook']);
export async function signProductionRequest(payload,secret,options={}) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw Error('GATEWAY_SECRET_REQUIRED');
  if (!payload || !ACTIONS.has(payload.action) || !UUID.test(payload.requestId || '')) throw Error('INVALID_PAYLOAD');
  const e = {version:1,audience:AUDIENCE,timestamp:options.now ?? Date.now(),
    nonce:options.nonce ?? crypto.randomUUID(),payload:JSON.stringify(payload)};
  if (!Number.isSafeInteger(e.timestamp) || !UUID.test(e.nonce) || e.payload.length > 131072) throw Error('INVALID_PAYLOAD');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,
    enc.encode([e.version,e.audience,e.timestamp,e.nonce,e.payload].join('\n')));
  return {...e,signature:Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('')};
}
