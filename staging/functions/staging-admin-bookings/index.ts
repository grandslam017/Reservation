import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {createHandler,STAGING_URL} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')??'';
const pub=Deno.env.get('SUPABASE_ANON_KEY')??'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const auth=url===STAGING_URL&&pub?createClient(url,pub,options):null;
const db=url===STAGING_URL&&service?createClient(url,service,options):null;
Deno.serve(createHandler({url,
 async getUser(token){if(!auth)return null;const {data,error}=await auth.auth.getUser(token);return error?null:data.user;},
 async rateLimit(id){if(!db)throw Error('UNCONFIGURED');const {data,error}=await db.rpc('staging_check_rate_limit',{p_actor:id,p_action:'verify-payment',p_limit:12});if(error)throw Error('RATE_FAILED');return data?.allowed===true;},
 async snapshot(admin,id){if(!db)throw Error('UNCONFIGURED');const {data,error}=await db.rpc('staging_admin_booking_snapshot',{p_admin:admin,p_booking_id:id});if(error)throw Error('READ_FAILED');return data;},
 async command(args){if(!db)throw Error('UNCONFIGURED');const {data,error}=await db.rpc('staging_admin_booking_command',args);if(error)throw Error('WRITE_FAILED');return data;},
}));
