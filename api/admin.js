/** FLIP v0.8.4 — server-only, owner-locked administrative API.
 * A hidden UI is not authorization: each request must pass Telegram HMAC and owner ID.
 */
import { validateTelegramInitData, isFlipAdmin } from './flip.js';
import { createHmac, randomUUID } from 'node:crypto';

const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
});
const validUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validId=value=>typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
function settings(){
  const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!raw||!key)throw new Error('ADMIN_NOT_CONFIGURED');
  const url=new URL(raw);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password)
    throw new Error('ADMIN_NOT_CONFIGURED');
  return {origin:url.origin,key};
}
async function rpc(name,payload,db){
  const response=await fetch(db.origin+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:db.key,'content-type':'application/json','accept':'application/json'},
    cache:'no-store',body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  const body=await response.text();
  if(!response.ok){
    const known=['ACCOUNT_NOT_FOUND','CARD_NOT_FOUND','DUPLICATE_ADMIN_REQUEST','BAD_ADMIN_GRANT','BAD_ADMIN_REWARD','ADMIN_REWARD_LIMIT'];
    const code=known.find(x=>body.includes(x));
    const error=new Error(code||'DATABASE_ERROR');
    error.status=code?409:502;throw error;
  }
  try{return JSON.parse(body)}catch{throw new Error('DATABASE_RESPONSE_FAILED')}
}
export async function handleAdminRequest(request){
  const url=new URL(request.url);
  if(url.pathname!=='/api/admin')return json({error:'NOT_FOUND'},404);
  if(!['GET','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
  let user;
  try{
    user=validateTelegramInitData(request.headers.get('x-telegram-init-data'),process.env.TELEGRAM_BOT_TOKEN);
  }catch{return json({error:'INVALID_TELEGRAM_SESSION'},401)}
  if(!isFlipAdmin(user.telegram_id))return json({error:'FORBIDDEN'},403);
  if(request.method==='GET'&&url.searchParams.get('view')==='me')
    return json({admin:true,permissions:['grant_card','grant_resource','search_players','search_cards','history','ranked_preview']});
  try{
    const db=settings();
    if(request.method==='GET'){
      const view=url.searchParams.get('view')||'players';
      if(view==='studio_ticket'){
        // A short-lived, one-time owner pairing link. Available only after
        // Telegram initData HMAC verification and exact owner Telegram ID.
        const payload={v:1,scope:'studio_owner',n:randomUUID(),
          t:String(user.telegram_id),e:Date.now()+5*60*1000};
        const part=Buffer.from(JSON.stringify(payload)).toString('base64url');
        const mac=createHmac('sha256',db.key).update('flip-studio-v1:'+part).digest('base64url');
        const ticket=part+'.'+mac;
        return json({url:'https://flip-studio.vercel.app/?claim='+encodeURIComponent(ticket)});
      }
      if(view==='players'){
        const q=(url.searchParams.get('q')||'').trim();
        if(q.length>64)return json({error:'BAD_REQUEST'},400);
        return json({players:await rpc('flip_admin_search_players',{p_query:q},db)});
      }
      if(view==='catalog')return json({cards:await rpc('flip_admin_catalog',{},db)});
      if(view==='cards'){
        const q=(url.searchParams.get('q')||'').trim();
        if(q.length>80)return json({error:'BAD_REQUEST'},400);
        return json({cards:await rpc('flip_admin_search_cards',{p_query:q,p_limit:50},db)});
      }
      if(view==='rewards')return json({rewards:await rpc('flip_admin_search_rewards',{p_limit:30},db)});
      if(view==='history')return json({history:await rpc('flip_admin_history',{p_limit:30},db)});
      if(view==='ranked'){const data=await rpc('flip_cp_leaderboard',{p_viewer_id:user.telegram_id,p_limit:20},db);return json({leaders:data.leaders||[]});}
      return json({error:'BAD_REQUEST'},400);
    }
    if(Number(request.headers.get('content-length')||0)>1500)return json({error:'BAD_REQUEST'},400);
    const bodyText=await request.text();
    if(bodyText.length>1500)return json({error:'BAD_REQUEST'},400);
    let body;try{body=JSON.parse(bodyText)}catch{return json({error:'BAD_REQUEST'},400)}
    if(!body||!['grant_card','grant_resource'].includes(body.action)
       ||!validId(body.recipientId)||!validUuid(body.requestId)
       ||typeof body.note!=='string'||body.note.length>200)
      return json({error:'BAD_REQUEST'},400);
    let result;
    if(body.action==='grant_card'){
      if(typeof body.cardId!=='string'||!/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(body.cardId)
         ||body.cardId.length>160||!['test','ranked'].includes(body.mode))
        return json({error:'BAD_REQUEST'},400);
      result=await rpc('flip_admin_grant_card',{
        p_admin_id:user.telegram_id,
        p_recipient_id:Number(body.recipientId),
        p_card_id:body.cardId,
        p_mode:body.mode,
        p_note:body.note.trim(),
        p_request_id:body.requestId
      },db);
    }else{
      if(!['xp','f'].includes(body.kind)||!Number.isSafeInteger(body.amount)
         ||body.amount<1||body.amount>1000000)
        return json({error:'BAD_REQUEST'},400);
      result=await rpc('flip_admin_grant_resource',{
        p_admin_id:user.telegram_id,
        p_recipient_id:Number(body.recipientId),
        p_kind:body.kind,
        p_amount:body.amount,
        p_note:body.note.trim(),
        p_request_id:body.requestId
      },db);
    }
    return json(result);
  }catch(e){
    const known=['ACCOUNT_NOT_FOUND','CARD_NOT_FOUND','DUPLICATE_ADMIN_REQUEST','BAD_ADMIN_GRANT','BAD_ADMIN_REWARD','ADMIN_REWARD_LIMIT'];
    return json({error:known.includes(e.message)?e.message:'ADMIN_SERVER_ERROR'},e.status||500);
  }
}
export default {fetch:handleAdminRequest};
