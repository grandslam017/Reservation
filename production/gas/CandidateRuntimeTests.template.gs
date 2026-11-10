// STAGING EDITOR TEST ONLY. Not a web entrypoint. Not for Production deployment.
// Candidate code is isolated with in-memory Properties/Lock and stub handlers.
// Uses native Google Utilities HMAC; no keys are read and no business API is called.
function runGatewayCandidateSelfTest() {
  var candidateSource = __CANDIDATE_SOURCE__;
  var expectedHash = '__CANDIDATE_SHA256__';
  var syntheticSecret = 'a1'.repeat(32);
  var requestId = '11111111-1111-4111-8111-111111111111';
  var cases = [];
  function hex(bytes) { return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
  var sourceHash = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,candidateSource,Utilities.Charset.UTF_8));
  function check(name,fn) {
    try { cases.push({name:name,pass:fn()===true}); }
    catch(error) { cases.push({name:name,pass:false,error:'TEST_EXECUTION_FAILED'}); }
  }
  function sign(payload,options) {
    options=options||{};
    var e={version:1,audience:options.audience||'grand-slam-gas-production-v1',
      timestamp:options.timestamp===undefined?Date.now():options.timestamp,
      nonce:Utilities.getUuid(),payload:JSON.stringify(payload)};
    e.signature=hex(Utilities.computeHmacSha256Signature(
      [e.version,e.audience,e.timestamp,e.nonce,e.payload].join('\n'),
      options.secret||syntheticSecret,Utilities.Charset.UTF_8));
    return e;
  }
  function payload(action,data) { return {action:action||'health',requestId:requestId,data:data}; }
  function receiver(options) {
    options=options||{};
    var props=Object.assign({GAS_GATEWAY_SECRET:syntheticSecret,GAS_GATEWAY_ENVIRONMENT:'production',GAS_GATEWAY_MODE:'SIGNED_ONLY'},options.props||{});
    var calls=[];
    var services={getScriptProperties:function(){return {
      getProperty:function(k){return Object.prototype.hasOwnProperty.call(props,k)?props[k]:null;},
      setProperty:function(k,v){props[k]=v;}
    };}};
    var locks={getScriptLock:function(){return {tryLock:function(){return !options.locked;},releaseLock:function(){}};}};
    function handler(name){return function(data){calls.push(name);if(options.throwHandler)throw Error('SYNTHETIC_PRIVATE_DETAILS');return ContentService.createTextOutput(JSON.stringify({status:'success',handler:name})).setMimeType(ContentService.MimeType.JSON);};}
    var names=['PropertiesService','LockService','Utilities','ContentService','validateInput',
      'handleSendConfirmation','handleCancelBooking','handleUpdateNotes','handleBackup',
      'handleLogAdminAction','handleGetAdminLogs','handleGetExistingBookings','handleLineAiWebhook'];
    var factory=Function.apply(null,names.concat([candidateSource+'\nreturn {post:secureGatewayDoPost,get:secureGatewayDoGet};']));
    var gateway=factory(services,locks,Utilities,ContentService,
      function(){return options.invalid?'Synthetic validation failure':null;},
      handler('sendConfirmation'),handler('cancelBooking'),handler('updateNotes'),handler('backup'),
      handler('logAdminAction'),handler('getAdminLogs'),handler('getExistingBookings'),handler('lineWebhook'));
    return {props:props,calls:calls,
      send:function(e){return JSON.parse(gateway.post({postData:{contents:JSON.stringify(e)}}).getContent());},
      get:function(e){return JSON.parse(gateway.get(e).getContent());}};
  }
  check('candidate_source_hash_matches',function(){return sourceHash===expectedHash;});
  check('signed_health_accepted',function(){return receiver().send(sign(payload())).mode==='signed-only';});
  check('raw_unsigned_business_rejected',function(){var g=receiver();return g.send({action:'backup'}).error==='INVALID_ENVELOPE'&&g.calls.length===0;});
  check('raw_line_events_rejected',function(){var g=receiver();return g.send({events:[]}).error==='INVALID_ENVELOPE'&&g.calls.length===0;});
  check('wrong_secret_rejected',function(){return receiver().send(sign(payload(),{secret:'b2'.repeat(32)})).error==='INVALID_SIGNATURE';});
  check('tampered_payload_rejected',function(){var e=sign(payload());e.payload+=' ';return receiver().send(e).error==='INVALID_SIGNATURE';});
  check('staging_audience_rejected',function(){return receiver().send(sign(payload(),{audience:'grand-slam-gas-staging-v1'})).error==='INVALID_ENVELOPE';});
  check('valid_signed_expired_rejected',function(){return receiver().send(sign(payload(),{timestamp:Date.now()-300000})).error==='REQUEST_EXPIRED';});
  check('valid_signed_future_rejected',function(){return receiver().send(sign(payload(),{timestamp:Date.now()+300000})).error==='REQUEST_EXPIRED';});
  check('same_envelope_replay_rejected',function(){var g=receiver(),e=sign(payload());return g.send(e).status==='success'&&g.send(e).error==='REPLAY_REJECTED';});
  check('unknown_action_never_falls_back',function(){var g=receiver();return g.send(sign(payload('unknown',{}))).error==='ACTION_NOT_ALLOWED'&&g.calls.length===0;});
  check('ordinary_action_cannot_dispatch_line_events',function(){return receiver().send(sign(payload('backup',{events:[]}))).error==='INVALID_DATA';});
  check('mismatched_inner_action_rejected',function(){return receiver().send(sign(payload('backup',{action:'cancelBooking'}))).error==='INVALID_DATA';});
  check('known_actions_route_to_stubs_only',function(){return ['sendConfirmation','cancelBooking','updateNotes','backup','logAdminAction','getAdminLogs','getExistingBookings'].every(function(action){var g=receiver(),r=g.send(sign(payload(action,{})));return r.handler===action&&g.calls.length===1;});});
  check('signed_line_route_uses_stub_only',function(){return receiver().send(sign(payload('lineWebhook',{events:[]}))).handler==='lineWebhook';});
  check('validation_failure_is_controlled',function(){return receiver({invalid:true}).send(sign(payload('backup',{}))).error==='VALIDATION_FAILED';});
  check('handler_error_details_not_returned',function(){var r=receiver({throwHandler:true}).send(sign(payload('backup',{})));return r.error==='REQUEST_REJECTED'&&JSON.stringify(r).indexOf('SYNTHETIC_PRIVATE_DETAILS')===-1;});
  check('public_get_does_not_return_booking_data',function(){var g=receiver();return g.get({parameter:{action:'getExistingBookings'}}).error==='SIGNED_POST_REQUIRED'&&g.calls.length===0;});
  check('missing_configuration_fails_closed',function(){return receiver({props:{GAS_GATEWAY_SECRET:''}}).send(sign(payload())).error==='GATEWAY_CONFIGURATION_REQUIRED';});
  check('nonce_capacity_does_not_evict',function(){var entries={};for(var i=0;i<60;i++)entries['n'+i]=Date.now()+120000;return receiver({props:{GAS_PRODUCTION_NONCES:JSON.stringify(entries)}}).send(sign(payload())).error==='GATEWAY_RATE_LIMIT';});
  check('unavailable_lock_fails_closed',function(){return receiver({locked:true}).send(sign(payload())).error==='GATEWAY_BUSY';});
  var result={suite:'production_candidate_google_runtime',candidate_sha256:sourceHash,
    tests:cases.length,passed:cases.filter(function(c){return c.pass;}).length,
    all_pass:cases.every(function(c){return c.pass;}),cases:cases,
    scope:'native Utilities HMAC; in-memory Properties/Lock; stub business handlers',
    production_keys_read:false,external_business_effects:0};
  console.log(JSON.stringify(result));
  if(!result.all_pass)throw Error('CANDIDATE_RUNTIME_TEST_FAILED');
  return result;
}
