// Server-only protocol. Never import this module or its secret into browser assets.
export const AUDIENCE = 'grand-slam-gas-staging-v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function signingText(e) {
  return [e.version, e.audience, e.timestamp, e.nonce, e.payload].join('\n');
}
export async function signEnvelope(payload, secret, options = {}) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw Error('GATEWAY_SECRET_REQUIRED');
  const e = {version: 1, audience: AUDIENCE,
    timestamp: options.now ?? Date.now(), nonce: options.nonce ?? crypto.randomUUID(),
    payload: JSON.stringify(payload)};
  if (!UUID.test(e.nonce) || !Number.isSafeInteger(e.timestamp) || e.payload.length > 8192)
    throw Error('INVALID_ENVELOPE');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(signingText(e)));
  return {...e, signature: Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join('')};
}
