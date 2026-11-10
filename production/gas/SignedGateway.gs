// Candidate only: replace the original doPost/doGet entrypoints at coordinated cutover.
// Existing business handlers and Script Properties (including Gemini) are retained.
function secureGatewayJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function secureGatewayEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  var difference = 0;
  for (var i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function secureGatewayConsumeNonce(nonce, expiresAt, now) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw Error('GATEWAY_BUSY');
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('GAS_PRODUCTION_NONCES');
    var entries = raw ? JSON.parse(raw) : {};
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('NONCE_STORE_INVALID');
    Object.keys(entries).forEach(function(key) {
      if (!Number.isSafeInteger(entries[key])) throw Error('NONCE_STORE_INVALID');
      if (entries[key] < now) delete entries[key];
    });
    if (Object.prototype.hasOwnProperty.call(entries, nonce)) throw Error('REPLAY_REJECTED');
    // Do not evict live nonces to make room. Bound the Script Property under 9KB.
    if (Object.keys(entries).length >= 60) throw Error('GATEWAY_RATE_LIMIT');
    entries[nonce] = expiresAt;
    props.setProperty('GAS_PRODUCTION_NONCES', JSON.stringify(entries));
  } finally { lock.releaseLock(); }
}
function secureGatewayVerify(envelope, now) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('GAS_GATEWAY_SECRET') || '';
  if (props.getProperty('GAS_GATEWAY_ENVIRONMENT') !== 'production' ||
      props.getProperty('GAS_GATEWAY_MODE') !== 'SIGNED_ONLY' || !/^[a-f0-9]{64}$/i.test(secret))
    throw Error('GATEWAY_CONFIGURATION_REQUIRED');
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!envelope || envelope.version !== 1 || envelope.audience !== 'grand-slam-gas-production-v1' ||
      !Number.isSafeInteger(envelope.timestamp) || !uuid.test(envelope.nonce || '') ||
      typeof envelope.payload !== 'string' || envelope.payload.length > 131072 ||
      typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature))
    throw Error('INVALID_ENVELOPE');
  if (Math.abs(now - envelope.timestamp) > 120000) throw Error('REQUEST_EXPIRED');
  var text = [envelope.version,envelope.audience,envelope.timestamp,envelope.nonce,envelope.payload].join('\n');
  var signature = Utilities.computeHmacSha256Signature(text, secret, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  if (!secureGatewayEqual(signature, envelope.signature)) throw Error('INVALID_SIGNATURE');
  var payload = JSON.parse(envelope.payload);
  var actions = ['health','sendConfirmation','cancelBooking','updateNotes','backup',
    'logAdminAction','getAdminLogs','getExistingBookings','lineWebhook'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !uuid.test(payload.requestId || '') || actions.indexOf(payload.action) === -1)
    throw Error('ACTION_NOT_ALLOWED');
  if (payload.action !== 'health') {
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw Error('INVALID_DATA');
    // No default-to-backup routing and no event shortcut in ordinary business requests.
    if (payload.action !== 'lineWebhook' &&
        (Object.prototype.hasOwnProperty.call(payload.data,'events') ||
         (payload.data.action !== undefined && payload.data.action !== payload.action))) throw Error('INVALID_DATA');
    if (payload.action === 'lineWebhook' && !Array.isArray(payload.data.events)) throw Error('INVALID_DATA');
  }
  secureGatewayConsumeNonce(envelope.nonce, envelope.timestamp + 120000, now);
  return payload;
}
function secureGatewayDoPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 262144) throw Error('INVALID_REQUEST');
    var payload = secureGatewayVerify(JSON.parse(raw), Date.now());
    if (payload.action === 'health') return secureGatewayJson({status:'success',environment:'production',mode:'signed-only'});
    var data = payload.data;
    // Only a trusted backend that verified the original LINE signature may sign this action.
    if (payload.action === 'lineWebhook') return handleLineAiWebhook(data);
    data.action = payload.action;
    var validation = validateInput(data);
    if (validation) throw Error('VALIDATION_FAILED');
    switch (payload.action) {
      case 'sendConfirmation': return handleSendConfirmation(data);
      case 'cancelBooking': return handleCancelBooking(data);
      case 'updateNotes': return handleUpdateNotes(data);
      case 'backup': return handleBackup(data);
      case 'logAdminAction': return handleLogAdminAction(data);
      case 'getAdminLogs': return handleGetAdminLogs(data);
      case 'getExistingBookings': return handleGetExistingBookings();
    }
    throw Error('ACTION_NOT_ALLOWED');
  } catch (err) {
    var code = err && err.message;
    var allowed = ['GATEWAY_CONFIGURATION_REQUIRED','GATEWAY_BUSY','NONCE_STORE_INVALID',
      'REPLAY_REJECTED','GATEWAY_RATE_LIMIT','INVALID_ENVELOPE','REQUEST_EXPIRED',
      'INVALID_SIGNATURE','ACTION_NOT_ALLOWED','INVALID_DATA','INVALID_REQUEST','VALIDATION_FAILED'];
    // Do not relay handler exception text, request bodies, keys or personal details.
    return secureGatewayJson({status:'error',error:allowed.indexOf(code) >= 0 ? code : 'REQUEST_REJECTED'});
  }
}
function secureGatewayDoGet(e) {
  if (e && e.parameter && e.parameter.action) return secureGatewayJson({status:'error',error:'SIGNED_POST_REQUIRED'});
  return secureGatewayJson({status:'online'});
}
