/** FLIP v0.9.0 — Vercel Web Function; Telegram initData verified on every request.
 *  Only server has Supabase secret key. There is no public write API for player state.
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {verifySubscription} from './task-bot.js';
import {getPublicAvatarData} from './profile-avatar.js';

const MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_INIT_DATA_LENGTH = 8192;
const MAX_BODY_LENGTH = 1024;
const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer'}
});

function safePhotoUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

// Stable in-game alias for people without a Telegram @username. Not a Telegram link.
function publicPlayerTag(telegramId) {
  const digest = createHash('sha256').update(`flip-player-v1:${telegramId}`).digest('hex');
  return `FLIP#${digest.slice(0, 10).toUpperCase()}`;
}

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
    .filter(([k]) => k !== 'hash')
    .sort(([a],[b]) => a.localeCompare(b,'en'))
    .map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  const expected = createHmac('sha256',secret).update(dataCheckString).digest();
  if (!timingSafeEqual(Buffer.from(supplied,'hex'),expected)) throw new Error('INVALID_TELEGRAM_SESSION');
  let user;
  try{user=JSON.parse(pairs.get('user')||'null');}catch{throw new Error('INVALID_TELEGRAM_SESSION');}
  if (!user || !Number.isSafeInteger(user.id) || user.id<=0) throw new Error('INVALID_TELEGRAM_SESSION');
  return {telegram_id:user.id, username:typeof user.username==='string'?user.username.slice(0,64):'',
    first_name:typeof user.first_name==='string'?user.first_name.slice(0,128):'',
    last_name:typeof user.last_name==='string'?user.last_name.slice(0,128):'',
    photo_url:safePhotoUrl(user.photo_url)};
}

export function isFlipAdmin(telegramId) {
  // Never trust a client-supplied ID. Call this only after validateTelegramInitData().
  const allowed=(process.env.FLIP_ADMIN_TELEGRAM_ID||'').trim();
  return /^[1-9]\d*$/.test(allowed) && String(telegramId)===allowed;
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
    const code=['DROP_COOLDOWN','INSUFFICIENT_FUNDS','DAILY_PACK_LIMIT','ACCOUNT_NOT_FOUND','DUPLICATE_REQUEST_ACTION','TASK_INCOMPLETE','TASK_CHANGED','TASK_ALREADY_CLAIMED','TASK_NOT_VERIFIED','BAD_TASK','TASK_REROLL_USED','TASK_REROLL_FORBIDDEN','TASK_REROLL_UNAVAILABLE','STREAK_NOT_READY','BAD_ACHIEVEMENT','ACHIEVEMENT_ALREADY_CLAIMED','ACHIEVEMENT_STAGE_ORDER','ACHIEVEMENT_NOT_READY','SHOWCASE_BAD_SLOT','SHOWCASE_BAD_CARD','SHOWCASE_NOT_OWNED','PLAYER_NOT_FOUND','UNKNOWN_PACK','THEME_UNAVAILABLE','PACK_GENERATION_FAILED','BAD_DELIVERY_REQUEST','DELIVERY_NOT_FOUND'].find(s=>body.includes(s));
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
    return json({service:'FLIP',version:'0.9.8.1',configured});
  if(!configured)return json({error:'SERVER_NOT_CONFIGURED'},503);
  try{
    const raw=request.headers.get('x-telegram-init-data');
    const user=validateTelegramInitData(raw,process.env.TELEGRAM_BOT_TOKEN);
    const db=settings();
    // Authenticated, read-only database probe. Do not register activity from probes.
    if(request.method==='GET' && u.searchParams.get('probe')==='1'){
      await rpc('flip_snapshot',{p_telegram_id:user.telegram_id},db);
      return json({ok:true});
    }
    if(request.method==='GET' && u.searchParams.get('inventory')==='1'){
      // Refresh only the current signed player's cards after external awards,
      // without restarting the Mini App or touching the daily streak.
      return json(await rpc('flip_snapshot',{p_telegram_id:user.telegram_id},db));
    }
    if(request.method==='GET' && u.searchParams.get('hub')==='1'){
      // Owner-only notification/activity feed (never accept an account ID).
      return json(await rpc('flip_event_snapshot',{p_telegram_id:user.telegram_id},db));
    }
    if(request.method==='GET' && u.searchParams.get('store')==='1'){
      // Server-derived pack prices and private purchase history. Identity
      // comes exclusively from verified Telegram initData, never the query.
      return json(await rpc('flip_shop_snapshot',{p_telegram_id:user.telegram_id},db));
    }
    if(request.method==='GET' && u.searchParams.get('showcase')==='1'){
      return json(await rpc('flip_showcase_own',{p_telegram_id:user.telegram_id},db));
    }
    if(request.method==='GET' && u.searchParams.has('profile')){
      const publicId=u.searchParams.get('profile');
      if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(publicId||''))
        return json({error:'BAD_REQUEST'},400);
      const [profile,stats]=await Promise.all([
        rpc('flip_public_profile',{p_public_id:publicId},db),
        rpc('flip_public_profile_stats',{p_public_id:publicId},db)
      ]);
      let avatar_data=null;
      try{
        // Resolving a numeric Telegram ID is permitted only in this trusted
        // server handler. It must never be included in the JSON response.
        const id=await rpc('flip_public_avatar_target',{p_public_id:publicId},db);
        const targetId=Number(id);
        if(Number.isSafeInteger(targetId)&&targetId>0){
          avatar_data=targetId===user.telegram_id&&user.photo_url?
            user.photo_url:
            await getPublicAvatarData(targetId,process.env.TELEGRAM_BOT_TOKEN);
        }
      }catch{
        // A private or unavailable photo is not a profile loading error.
      }
      return json({...profile,avatar_data,stats});
    }
    if(request.method==='GET' && u.searchParams.get('achievements')==='1'){
      return json(await rpc('flip_achievement_snapshot',{p_telegram_id:user.telegram_id},db));
    }
    if(request.method==='GET'){
      // The database only accepts identity fields. Do not persist optional profile-photo URLs.
      // Bootstrap before assigning quests (new accounts do not yet have a player row).
      // A signed Telegram launch counts once per Moscow day toward the activity streak.
      await rpc('flip_bootstrap',{
        telegram_id:user.telegram_id, username:user.username, first_name:user.first_name
      },db);
      await rpc('flip_streak_touch',{p_telegram_id:user.telegram_id},db);
      const [state,catalog,tasks,achievements,showcase]=await Promise.all([
        rpc('flip_snapshot',{p_telegram_id:user.telegram_id},db),
        rpc('flip_public_catalog',{},db),
        rpc('flip_task_snapshot',{p_telegram_id:user.telegram_id},db),
        rpc('flip_achievement_snapshot',{p_telegram_id:user.telegram_id},db),
        rpc('flip_showcase_own',{p_telegram_id:user.telegram_id},db)
      ]);
      const displayName=[user.first_name,user.last_name].filter(Boolean).join(' ').trim()
        || user.username || 'FLIP PLAYER';
      return json({state,catalog,tasks,achievements,showcase, mode:'server', admin:isFlipAdmin(user.telegram_id), profile:{
        display_name:displayName,
        handle:user.username ? `@${user.username}` : publicPlayerTag(user.telegram_id),
        avatar_url:user.photo_url
      }});
    }
    if(Number(request.headers.get('content-length')||0)>MAX_BODY_LENGTH) return json({error:'BAD_REQUEST'},400);
    const rawBody=await request.text();
    if(rawBody.length>MAX_BODY_LENGTH) return json({error:'BAD_REQUEST'},400);
    let body; try{body=JSON.parse(rawBody)}catch{return json({error:'BAD_REQUEST'},400)}
    if(!body || !['drop','pack','theme_pack','claim_task','reroll_task','claim_streak','claim_achievement','set_showcase','mark_events_read','ack_card_deliveries'].includes(body.action) ||
      typeof body.requestId!=='string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))
      return json({error:'BAD_REQUEST'},400);
    if(body.action==='ack_card_deliveries'){
      const ids=body.deliveryIds;
      const unique=Array.isArray(ids)?new Set(ids):null;
      if(Object.keys(body).some(key=>!['action','requestId','deliveryIds'].includes(key))||
        !Array.isArray(ids)||ids.length<1||ids.length>20||
        unique.size!==ids.length||
        ids.some(id=>!Number.isSafeInteger(id)||id<=0))
        return json({error:'BAD_REQUEST'},400);
      // No client-selected recipient or sender: Telegram HMAC defines ownership.
      return json(await rpc('flip_delivery_ack',{
        p_telegram_id:user.telegram_id,p_delivery_ids:ids
      },db));
    }
    if(body.action==='mark_events_read'){
      const fields=Object.keys(body);
      const all=body.all===true;
      const itemId=body.eventId;
      if(fields.some(key=>!['action','requestId','all','eventId'].includes(key))||
         (all && itemId!=null)||
         (!all && (!Number.isSafeInteger(itemId)||itemId<=0)))
        return json({error:'BAD_REQUEST'},400);
      return json(await rpc('flip_event_mark_read',{
        p_telegram_id:user.telegram_id,p_event_id:all?null:itemId
      },db));
    }
    if(body.action==='theme_pack'){
      const allowed=['action','theme','requestId'];
      if(!['archive','new-era'].includes(body.theme)||
         Object.keys(body).some(key=>!allowed.includes(key)))
        return json({error:'BAD_REQUEST'},400);
      return json(await rpc('flip_buy_theme_pack',{
        p_telegram_id:user.telegram_id,p_request_id:body.requestId,
        p_theme:body.theme
      },db));
    }
    if(body.action==='set_showcase'){
      const slot=body.slot,cardId=body.cardId;
      if(!Number.isInteger(slot)||slot<1||slot>3||
        !(cardId===null||(typeof cardId==='string'&&
          cardId.length<=160&&/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(cardId))))
        return json({error:'BAD_REQUEST'},400);
      return json(await rpc('flip_showcase_set',{
        p_telegram_id:user.telegram_id,p_slot:slot,p_card_id:cardId
      },db));
    }
    if(body.action==='claim_achievement'){
      const code=body.code,stage=body.stage;
      if(typeof code!=='string'||!/^[a-z][a-z0-9_]{2,47}$/.test(code)||
         !Number.isInteger(stage)||stage<1||stage>5)
        return json({error:'BAD_REQUEST'},400);
      return json(await rpc('flip_claim_achievement',{
        p_telegram_id:user.telegram_id,p_code:code,p_stage:stage
      },db));
    }
    if(body.action==='reroll_task'){
      if(!['daily','weekly'].includes(body.scope)||![1,2,3].includes(body.slot))
        return json({error:'BAD_REQUEST'},400);
      return json(await rpc('flip_reroll_task',{
        p_telegram_id:user.telegram_id,p_scope:body.scope,p_slot:body.slot
      },db));
    }
    if(body.action==='claim_streak'){
      return json(await rpc('flip_claim_streak',{p_telegram_id:user.telegram_id},db));
    }
    if(body.action==='claim_task'){
      const scope=body.scope,slot=body.slot,version=body.version;
      if(!['daily','weekly'].includes(scope)||![1,2,3].includes(slot)||
         typeof version!=='string'||!/^[0-9a-f-]{36}$/i.test(version))
        return json({error:'BAD_REQUEST'},400);
      const tasks=await rpc('flip_task_snapshot',{p_telegram_id:user.telegram_id},db);
      const task=tasks[scope]?.find(item=>item.slot===slot);
      if(!task||task.version!==version)return json({error:'TASK_CHANGED'},409);
      if(task.claimed)return json({error:'TASK_ALREADY_CLAIMED'},409);
      let verified=false;
      if(task.type==='subscription'){
        // Never trust a client-provided Telegram channel.
        const res=await fetch(db.origin+'/rest/v1/flip_task_slots?scope=eq.'+scope+
          '&slot=eq.'+slot+'&select=kind,channel_id,version&limit=1',{
          headers:{apikey:db.key,accept:'application/json'},cache:'no-store',
          signal:AbortSignal.timeout(10000)
        });
        if(!res.ok)throw new Error('DATABASE_REQUEST_FAILED');
        const [record]=await res.json();
        if(record?.version!==version||record?.kind!=='subscription'||!record.channel_id)
          return json({error:'TASK_CHANGED'},409);
        verified=await verifySubscription(record.channel_id,user.telegram_id);
        if(!verified)return json({error:'TASK_NOT_SUBSCRIBED'},409);
      }
      return json(await rpc('flip_claim_task',{p_telegram_id:user.telegram_id,
        p_scope:scope,p_slot:slot,p_version:version,p_verified:verified},db));
    }
    const func=body.action==='drop'?'flip_open_drop':'flip_buy_pack';
    return json(await rpc(func,{p_telegram_id:user.telegram_id,p_request_id:body.requestId},db));
  }catch(e){
    const code=String(e.message||'UNKNOWN_ERROR');
    const auth=['INVALID_TELEGRAM_SESSION','EXPIRED_TELEGRAM_SESSION'].includes(code);
    const known=['DROP_COOLDOWN','INSUFFICIENT_FUNDS','DAILY_PACK_LIMIT','ACCOUNT_NOT_FOUND',
      'DUPLICATE_REQUEST_ACTION','TASK_INCOMPLETE','TASK_CHANGED','TASK_ALREADY_CLAIMED',
      'TASK_NOT_VERIFIED','TASK_NOT_SUBSCRIBED','BAD_TASK','TASK_REROLL_USED',
      'TASK_REROLL_FORBIDDEN','TASK_REROLL_UNAVAILABLE','STREAK_NOT_READY',
      'BAD_ACHIEVEMENT','ACHIEVEMENT_ALREADY_CLAIMED','ACHIEVEMENT_STAGE_ORDER',
      'ACHIEVEMENT_NOT_READY','SHOWCASE_BAD_SLOT','SHOWCASE_BAD_CARD',
      'SHOWCASE_NOT_OWNED','PLAYER_NOT_FOUND','UNKNOWN_PACK',
      'THEME_UNAVAILABLE','PACK_GENERATION_FAILED'].includes(code);
    const unavailable=['TELEGRAM_CHECK_FAILED','BOT_NOT_CONFIGURED'].includes(code);
    return json({error:auth||known||unavailable?code:'SERVER_ERROR'},
      auth?401:known?409:unavailable?503:500);
  }
}
export default {fetch:handleRequest};
