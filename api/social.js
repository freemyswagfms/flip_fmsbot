/** FLIP v0.8.5: server-only CP leaderboard + atomic card trades.
 *  Never trusts a client-submitted actor ID, CP number or inventory count.
 */
import {createHash} from 'node:crypto';
import {validateTelegramInitData} from './flip.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
});
const uuid=s=>typeof s==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s);
const numberId=s=>typeof s==='string'&&/^[1-9]\d{0,15}$/.test(s)&&Number.isSafeInteger(Number(s));
const cardId=s=>typeof s==='string'&&s.length<=160&&/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(s);
function config(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw Error('NOT_CONFIGURED');
  const u=new URL(url);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password)
    throw Error('NOT_CONFIGURED');
  return {origin:u.origin,key};
}
async function rpc(name,payload,db){
  const r=await fetch(db.origin+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:db.key,'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)
  });
  const body=await r.text();
  if(!r.ok){
    const known=['ACCOUNT_NOT_FOUND','PLAYER_NOT_FOUND','TRADE_NOT_FOUND','TRADE_CARD_UNAVAILABLE',
      'TRADE_PENDING_LIMIT','TRADE_ALREADY_CLOSED','TRADE_EXPIRED','TRADE_FORBIDDEN',
      'BAD_TRADE','DUPLICATE_TRADE_REQUEST'];
    const code=known.find(e=>body.includes(e));
    const error=Error(code||'DATABASE_REQUEST_FAILED');error.status=code?409:502;
    throw error;
  }
  try{return JSON.parse(body)}catch{throw Error('DATABASE_RESPONSE_FAILED')}
}
function alias(id){
  return 'FLIP#'+createHash('sha256').update('flip-player-v1:'+String(id)).digest('hex').slice(0,10).toUpperCase();
}
function name(p,prefix=''){
  const id=p[prefix+'telegram_id']||p[prefix+'id'];
  const user=p[prefix+'username'];
  if(user)return '@'+user;
  const first=(p[prefix+'first_name']||p[prefix+'name']||'').trim();
  return first?first+' · '+alias(id):alias(id);
}
function serializeLeaderboard(data){
  const leaders=(data.leaders||[]).map(p=>({
    place:p.place,name:name(p),level:p.level,cp:p.cp,
    rankedCards:p.ranked_cards,rankedVariants:p.ranked_variants
  }));
  return {leaders,me:data.me?{place:data.me.place,cp:data.me.cp,level:data.me.level,
    rankedCards:data.me.ranked_cards,rankedVariants:data.me.ranked_variants}:null,
    players:data.players};
}
const validNoteCard=cardId; // strictly constrained to a catalog key, not an external URI.
export async function handleSocialRequest(request){
  const url=new URL(request.url);
  if(url.pathname!=='/api/social')return json({error:'NOT_FOUND'},404);
  if(!['GET','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
  let user;
  try{user=validateTelegramInitData(request.headers.get('x-telegram-init-data'),
    process.env.TELEGRAM_BOT_TOKEN);}catch{return json({error:'INVALID_TELEGRAM_SESSION'},401)}
  try{
    const db=config(), actor=user.telegram_id;
    if(request.method==='GET'){
      const view=url.searchParams.get('view')||'leaderboard';
      if(view==='leaderboard'){
        const data=await rpc('flip_cp_leaderboard',{p_viewer_id:actor,p_limit:50},db);
        return json(serializeLeaderboard(data));
      }
      if(view==='trades'){
        const trades=await rpc('flip_trade_list',{p_actor_id:actor,p_limit:40},db);
        return json({trades:(trades||[]).map(t=>({...t,
          sender_label:name({id:t.sender_id,username:t.sender_username,first_name:t.sender_name}),
          recipient_label:name({id:t.recipient_id,username:t.recipient_username,first_name:t.recipient_name}),
          mine:String(t.sender_id)===String(actor)}))});
      }
      if(view==='players'){
        const q=(url.searchParams.get('q')||'').trim();
        if(!q||q.length>64)return json({players:[]});
        const players=await rpc('flip_trade_find_players',{p_actor_id:actor,p_query:q},db);
        return json({players:(players||[]).map(p=>({
          id:p.telegram_id,name:name(p),level:p.level,cp:p.cp}))});
      }
      if(view==='cards'){
        const id=url.searchParams.get('playerId');
        if(!numberId(id))return json({error:'BAD_REQUEST'},400);
        return json({cards:await rpc('flip_trade_player_cards',{
          p_actor_id:actor,p_player_id:Number(id)
        },db)});
      }
      if(view==='preview'){
        const id=url.searchParams.get('tradeId');
        if(!uuid(id))return json({error:'BAD_REQUEST'},400);
        return json({preview:await rpc('flip_trade_preview',{
          p_actor_id:actor,p_trade_id:id
        },db)});
      }
      return json({error:'BAD_REQUEST'},400);
    }
    if(Number(request.headers.get('content-length')||0)>1200)return json({error:'BAD_REQUEST'},400);
    const raw=await request.text();
    if(raw.length>1200)return json({error:'BAD_REQUEST'},400);
    let body;try{body=JSON.parse(raw)}catch{return json({error:'BAD_REQUEST'},400)}
    if(!body||!uuid(body.requestId))return json({error:'BAD_REQUEST'},400);
    if(body.action==='create'){
      if(!numberId(body.recipientId)||!validNoteCard(body.offerCard)||!validNoteCard(body.wantCard))
        return json({error:'BAD_REQUEST'},400);
      const result=await rpc('flip_trade_create',{
        p_actor_id:actor,p_recipient_id:Number(body.recipientId),
        p_offer_card:body.offerCard,p_want_card:body.wantCard,p_request_id:body.requestId
      },db);
      return json(result);
    }
    if(['accept','decline','cancel'].includes(body.action)&&uuid(body.tradeId)){
      const result=await rpc('flip_trade_reply',{
        p_actor_id:actor,p_trade_id:body.tradeId,
        p_verb:body.action,p_request_id:body.requestId
      },db);
      return json(result);
    }
    return json({error:'BAD_REQUEST'},400);
  }catch(e){
    const known=['ACCOUNT_NOT_FOUND','PLAYER_NOT_FOUND','TRADE_NOT_FOUND','TRADE_CARD_UNAVAILABLE',
      'TRADE_PENDING_LIMIT','TRADE_ALREADY_CLOSED','TRADE_EXPIRED','TRADE_FORBIDDEN',
      'BAD_TRADE','DUPLICATE_TRADE_REQUEST'];
    const code=String(e.message||'');
    return json({error:known.includes(code)?code:'SOCIAL_SERVER_ERROR'},e.status||500);
  }
}
export default {fetch:handleSocialRequest};
