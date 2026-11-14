/** FLIP v0.8 — Vercel Web Function; Telegram initData verified on every request.
 *  Only server has Supabase secret key. There is no public write API for player state.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_INIT_DATA_LENGTH = 8192;
const MAX_BODY_LENGTH = 1024;
const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer'}
});

export function validateTelegramInitData(raw, token, nowSeconds=Math.floor(Date.now()/1000)) {
  if (!token || typeof raw!=='string' || !raw || raw.length > MAX_INIT_DATA_LENGTH) throw new Error('INVALID_TELEGRAM_SESSION');
  const pairs = new URLSearchParams(raw);
  const keys = [...pairs.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('INVALID_TELEGRAM_SESSION');
  const supplied = pairs.get('hash');
  const authDate = Number(pairs.get('auth_date'));
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied) || !Number.isSafeInteger(authDate) ||
      authDate > nowSeconds + 60 || nowSeconds - authDate > MAX_AGE_SECONDS) throw new Error('EXPIRED_TELEGRAM_SESSION');
  const dataCheckString = [...pairs.entries()]
    .filter(([k]) => k !== 'hash' && k !== 'signature')
    .sort(([a],[b]) => a.localeCompare(b,'en'))
    .map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  const expected = createHmac('sha256',secret).update(dataCheckString).digest();
  if (!timingSafeEqual(Buffer.from(supplied,'hex'),expected)) throw new Error('INVALID_TELEGRAM_SESSION');
  let user;
  try{user=JSON.parse(pairs.get('user')||'null');}catch{throw new Error('INVALID_TELEGRAM_SESSION');}
  if (!user || !Number.isSafeInteger(user.id) || user.id<=0) throw new Error('INVALID_TELEGRAM_SESSION');
  return {telegram_id:user.id, username:typeof user.username==='string'?user.username.slice(0,64):'',
    first_name:typeof user.first_name==='string'?user.first_name.slice(0,128):''};
}

function settings(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const origin=new URL(url);
  if(origin.protocol!=='https:' || !origin.hostname.endsWith('.supabase.co')) throw new Error('INVALID_SERVER_CONFIG');
  return {origin:origin.origin,key};
}
async function rpc(name,payload,db){
  const response=await fetch(`${db.origin}/rest/v1/rpc/${name}`,{
    method:'POST', headers:{apikey:db.key,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(payload), cache:'no-store',signal:AbortSignal.timeout(15000)
  });
  const body=await response.text();
  if (!response.ok) {
    // Return known error codes only. Never forward database internals to the client.
    const code=['DROP_COOLDOWN','INSUFFICIENT_FUNDS','DAILY_PACK_LIMIT','ACCOUNT_NOT_FOUND','DUPLICATE_REQUEST_ACTION'].find(s=>body.includes(s));
    const error=new Error(code||'DATABASE_REQUEST_FAILED');error.status=code?409:502;throw error;
  }
  try{return JSON.parse(body);}catch{throw new Error('DATABASE_RESPONSE_FAILED');}
}

export async function handleRequest(request,env=undefined){
  const u=new URL(request.url);
  if (u.pathname !== '/api/flip') return json({error:'NOT_FOUND'},404);
  if (request.method === 'OPTIONS') return json({error:'METHOD_NOT_ALLOWED'},405);
  if (!['GET','POST'].includes(request.method)) return json({error:'METHOD_NOT_ALLOWED'},405);
  const configured=!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);
  if(request.method==='GET' && u.searchParams.get('health')==='1')
    return json({service:'FLIP',version:'0.8.0',configured});
  if(!configured)return json({error:'SERVER_NOT_CONFIGURED'},503);
  try{
    const raw=request.headers.get('x-telegram-init-data');
    const user=validateTelegramInitData(raw,process.env.TELEGRAM_BOT_TOKEN);
    const db=settings();
    if(request.method==='GET'){
      const state=await rpc('flip_bootstrap',user,db);
      return json({state, mode:'server'});
    }
    if(Number(request.headers.get('content-length')||0)>MAX_BODY_LENGTH) return json({error:'BAD_REQUEST'},400);
    const rawBody=await request.text();
    if(rawBody.length>MAX_BODY_LENGTH) return json({error:'BAD_REQUEST'},400);
    let body; try{body=JSON.parse(rawBody)}catch{return json({error:'BAD_REQUEST'},400)}
    if(!body || !['drop','pack'].includes(body.action) ||
      typeof body.requestId!=='string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))
      return json({error:'BAD_REQUEST'},400);
    const func=body.action==='drop'?'flip_open_drop':'flip_buy_pack';
    const result=await rpc(func,{p_telegram_id:user.telegram_id,p_request_id:body.requestId},db);
    return json(result);
  }catch(e){
    const code=String(e.message||'UNKNOWN_ERROR');
    const auth=['INVALID_TELEGRAM_SESSION','EXPIRED_TELEGRAM_SESSION'].includes(code);
    const known=['DROP_COOLDOWN','INSUFFICIENT_FUNDS','DAILY_PACK_LIMIT','ACCOUNT_NOT_FOUND','DUPLICATE_REQUEST_ACTION'].includes(code);
    return json({error:auth||known?code:'SERVER_ERROR'},auth?401:known?409:500);
  }
}
export default {fetch:handleRequest};
