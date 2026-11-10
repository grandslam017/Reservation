import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createHandler, STAGING_URL } from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Stay closed when misconfigured, without creating clients against production.
const auth = url === STAGING_URL && publicKey ? createClient(url,publicKey,
  {auth:{persistSession:false,autoRefreshToken:false}}) : null;
const db = url === STAGING_URL && serviceKey ? createClient(url,serviceKey,
  {auth:{persistSession:false,autoRefreshToken:false}}) : null;
Deno.serve(createHandler({
  env:{url,enabled:Deno.env.get('STAGING_GAS_BRIDGE_MODE'),
    secret:Deno.env.get('GAS_GATEWAY_SECRET'),gasUrl:Deno.env.get('STAGING_GAS_WEB_APP_URL')},
  async getUser(token) {
    if (!auth) return null;
    const {data,error} = await auth.auth.getUser(token);
    return error ? null : data.user;
  },
  async rateLimit(id) {
    if (!db) return false;
    // Share the existing admin budget. No schema migration is required.
    const {data,error} = await db.rpc('staging_check_rate_limit',
      {p_actor:id,p_action:'verify-payment',p_limit:12});
    if (error) throw Error('RATE_LIMIT_UNAVAILABLE');
    return data?.allowed === true;
  },
  async loadBooking(id) {
    if (!db) throw Error('DB_NOT_CONFIGURED');
    const {data,error} = await db.from('bookings')
      .select('id,booking_date,time_slot,fee,status').eq('id',id).maybeSingle();
    if (error) throw Error('BOOKING_READ_FAILED');
    return data;
  },
  async forward(target,envelope) {
    const res = await fetch(target,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(envelope),signal:AbortSignal.timeout(15000)});
    if (!res.ok) throw Error('GAS_HTTP_ERROR');
    const raw = await res.text();
    if (raw.length > 4096) throw Error('GAS_RESPONSE_TOO_LARGE');
    return JSON.parse(raw);
  },
}));
