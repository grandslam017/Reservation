// Verify raw request bytes BEFORE decoding or JSON parsing; no dependencies or logging.
// Caller must enforce body limits before allocating bytes, and deduplicate webhookEventId.
export async function verifyLineWebhookSignature(rawBytes,signature,channelSecret) {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.byteLength > 131072 ||
      typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature) ||
      typeof channelSecret !== 'string' || channelSecret.length < 16) return false;
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(channelSecret),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes = Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
  return crypto.subtle.verify('HMAC',key,bytes,rawBytes);
}
