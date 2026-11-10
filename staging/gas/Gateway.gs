// STAGING ONLY. Install in a NEW standalone Apps Script project.
// No Sheets, Calendar, LINE, Gemini, email or booking writes exist in this file.
// Do not paste over the production project or install its reminder trigger.
function gasJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
function gasEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  var difference = 0;
  for (var i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function gasConsumeNonce(nonce, expiresAt, now) {
  // A persistent, bounded store under one lock; CacheService alone can evict nonces.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw Error('GATEWAY_BUSY');
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('GAS_GATEWAY_NONCES');
    var entries = raw ? JSON.parse(raw) : {};
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('NONCE_STORE_INVALID');
    Object.keys(entries).forEach(function(key) {
      if (!Number.isSafeInteger(entries[key])) throw Error('NONCE_STORE_INVALID');
      if (entries[key] < now) delete entries[key];
    });
    if (Object.prototype.hasOwnProperty.call(entries, nonce)) throw Error('REPLAY_REJECTED');
    // Refuse more work rather than evict an unexpired nonce. <9KB property limit.
    if (Object.keys(entries).length >= 60) throw Error('GATEWAY_RATE_LIMIT');
    entries[nonce] = expiresAt;
    props.setProperty('GAS_GATEWAY_NONCES', JSON.stringify(entries));
  } finally { lock.releaseLock(); }
}
function gasVerifyEnvelope(e, now) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('GAS_GATEWAY_SECRET') || '';
  if (props.getProperty('GAS_GATEWAY_ENVIRONMENT') !== 'staging' || !/^[a-f0-9]{64}$/i.test(secret))
    throw Error('STAGING_CONFIGURATION_REQUIRED');
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!e || e.version !== 1 || e.audience !== 'grand-slam-gas-staging-v1' ||
      !Number.isSafeInteger(e.timestamp) || !uuid.test(e.nonce || '') ||
      typeof e.payload !== 'string' || e.payload.length > 8192 ||
      typeof e.signature !== 'string' || !/^[a-f0-9]{64}$/.test(e.signature)) throw Error('INVALID_ENVELOPE');
  var windowMs = 120000;
  if (Math.abs(now - e.timestamp) > windowMs) throw Error('REQUEST_EXPIRED');
  var text = [e.version, e.audience, e.timestamp, e.nonce, e.payload].join('\n');
  var bytes = Utilities.computeHmacSha256Signature(text, secret, Utilities.Charset.UTF_8);
  var expected = bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  if (!gasEqualHex(expected, e.signature)) throw Error('INVALID_SIGNATURE');
  var payload = JSON.parse(e.payload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !uuid.test(payload.requestId || '') ||
      ['health', 'simulateConfirmation'].indexOf(payload.action) === -1) throw Error('ACTION_NOT_ALLOWED');
  // Expiry is derived from the signed timestamp, including allowed clock skew.
  gasConsumeNonce(e.nonce, e.timestamp + windowMs, now);
  return payload;
}
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 16384) throw Error('INVALID_REQUEST');
    var payload = gasVerifyEnvelope(JSON.parse(raw), Date.now());
    if (payload.action === 'health') return gasJson({status:'success',environment:'staging',mode:'simulation-only'});
    var booking = payload.booking;
    if (!booking || typeof booking.id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(booking.id) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(booking.date || '') ||
        typeof booking.slot !== 'string' || !/^\d{2}:\d{2} - \d{2}:\d{2}$/.test(booking.slot) ||
        typeof booking.fee !== 'number' || !isFinite(booking.fee) || booking.fee < 0)
      throw Error('INVALID_BOOKING');
    return gasJson({status:'success',environment:'staging',mode:'simulation-only',
      requestId:payload.requestId,bookingId:booking.id,
      effects:{sheetsRowsWritten:0,calendarEventsCreated:0,lineMessagesSent:0,emailsSent:0}});
  } catch (err) {
    // Return controlled codes only; never log request bodies, credentials or errors with URLs.
    var code = err && err.message;
    var allowed = ['STAGING_CONFIGURATION_REQUIRED','INVALID_ENVELOPE','REQUEST_EXPIRED',
      'INVALID_SIGNATURE','ACTION_NOT_ALLOWED','REPLAY_REJECTED','GATEWAY_RATE_LIMIT',
      'GATEWAY_BUSY','NONCE_STORE_INVALID','INVALID_REQUEST','INVALID_BOOKING'];
    return gasJson({status:'error',error:allowed.indexOf(code) >= 0 ? code : 'REQUEST_REJECTED'});
  }
}
function doGet() {
  return gasJson({status:'online',environment:'staging',mode:'simulation-only'});
}
