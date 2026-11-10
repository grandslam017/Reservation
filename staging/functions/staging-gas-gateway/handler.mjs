import { signEnvelope, UUID } from '../../integrations/gas-envelope.mjs';
export const STAGING_URL = 'https://kssxxizhpoxxlbsehymk.supabase.co';
const ORIGINS = new Set(['https://illustrious-alfajores-364eb8.netlify.app']);
export function createHandler(deps) {
  return async function handler(req) {
    const origin = req.headers.get('Origin');
    const reply = (status, body) => new Response(status === 204 ? null : JSON.stringify(body),
      {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
        ...(ORIGINS.has(origin) ? {'Access-Control-Allow-Origin':origin,
          'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
          'Access-Control-Allow-Methods':'POST,OPTIONS'} : {})}});
    if (origin && !ORIGINS.has(origin)) return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
    if (req.method === 'OPTIONS') return reply(204,null);
    if (req.method !== 'POST') return reply(405,{error:'METHOD_NOT_ALLOWED'});
    const env = deps.env;
    if (env.url !== STAGING_URL) return reply(503,{error:'STAGING_CONFIGURATION_REQUIRED'});
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return reply(401,{error:'AUTH_REQUIRED'});
    try {
      const user = await deps.getUser(token);
      if (!user) return reply(401,{error:'INVALID_SESSION'});
      if (user.is_anonymous || user.app_metadata?.role !== 'admin') return reply(403,{error:'ADMIN_REQUIRED'});
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 4096) return reply(413,{error:'REQUEST_TOO_LARGE'});
      let input; try { input = JSON.parse(raw); } catch { return reply(400,{error:'INVALID_JSON'}); }
      if (!input || !['health','simulate-confirmation'].includes(input.action)) return reply(400,{error:'ACTION_NOT_ALLOWED'});
      if (!UUID.test(input.request_id || '') ||
          (input.action === 'simulate-confirmation' && !UUID.test(input.booking_id || '')))
        return reply(400,{error:'INVALID_REFERENCE'});
      if (!await deps.rateLimit(user.id)) return reply(429,{error:'RATE_LIMIT_REJECTED'});
      if (env.enabled !== 'SIMULATION_ONLY' || !/^[a-f0-9]{64}$/i.test(env.secret || ''))
        return reply(503,{error:'GAS_STAGING_SETUP_REQUIRED'});
      let target; try { target = new URL(env.gasUrl); } catch { return reply(503,{error:'GAS_STAGING_SETUP_REQUIRED'}); }
      if (target.origin !== 'https://script.google.com' || target.search || target.hash ||
          target.username || target.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(target.pathname))
        return reply(503,{error:'INVALID_GAS_TARGET'});
      let payload = {action:'health',requestId:input.request_id};
      if (input.action === 'simulate-confirmation') {
        // Ignore any customer details, fees, URLs or recipient IDs supplied by the browser.
        const row = await deps.loadBooking(input.booking_id);
        if (!row || row.status !== 'confirmed') return reply(404,{error:'BOOKING_NOT_AVAILABLE'});
        const fee = Number(row.fee);
        if (!Number.isFinite(fee) || fee < 0) return reply(409,{error:'INVALID_STORED_BOOKING'});
        payload = {action:'simulateConfirmation',requestId:input.request_id,
          booking:{id:row.id,date:row.booking_date,slot:row.time_slot,fee}};
      }
      const envelope = await signEnvelope(payload, env.secret);
      const result = await deps.forward(target.href, envelope);
      if (result?.status !== 'success' || result.environment !== 'staging' || result.mode !== 'simulation-only')
        return reply(502,{error:'GAS_STAGING_REQUEST_REJECTED'});
      let simulation;
      if (input.action === 'simulate-confirmation') {
        const keys=['sheetsRowsWritten','calendarEventsCreated','lineMessagesSent','emailsSent'];
        if (result.requestId !== input.request_id || result.bookingId !== payload.booking.id ||
            !result.effects || keys.some(key => result.effects[key] !== 0))
          return reply(502,{error:'GAS_SIMULATION_NOT_CONFIRMED'});
        simulation={booking_id:payload.booking.id,date:payload.booking.date,
          slot:payload.booking.slot,fee:payload.booking.fee,gas_confirmed:true,
          effects:Object.fromEntries(keys.map(key=>[key,0]))};
      }
      // Deliberately do not relay arbitrary upstream fields or the signed envelope.
      return reply(200,{success:true,environment:'staging',mode:'simulation-only',
        request_id:input.request_id,gas_reachable:true,business_effects_performed:false,
        ...(simulation ? {simulation} : {})});
    } catch { return reply(503,{error:'GATEWAY_UNAVAILABLE'}); }
  };
}
